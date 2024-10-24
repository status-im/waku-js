import type { Peer } from "@libp2p/interface";
import {
  IDecodedMessage,
  IDecoder,
  IStoreCore,
  Libp2p,
  PubsubTopic,
  QueryRequestParams
} from "@waku/interfaces";
import { Logger } from "@waku/utils";
import all from "it-all";
import * as lp from "it-length-prefixed";
import { pipe } from "it-pipe";
import { Uint8ArrayList } from "uint8arraylist";

import { BaseProtocol } from "../base_protocol.js";
import { toProtoMessage } from "../to_proto_message.js";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  StoreQueryRequest,
  StoreQueryResponse
} from "./rpc.js";

const log = new Logger("store");

export const StoreCodec = "/vac/waku/store-query/3.0.0";

export class StoreCore extends BaseProtocol implements IStoreCore {
  public constructor(
    public readonly pubsubTopics: PubsubTopic[],
    libp2p: Libp2p
  ) {
    super(StoreCodec, libp2p.components, pubsubTopics);
  }

  public async *queryPerPage<T extends IDecodedMessage>(
    queryOpts: QueryRequestParams,
    decoders: Map<string, IDecoder<T>>,
    peer: Peer
  ): AsyncGenerator<Promise<T | undefined>[]> {
    if (
      queryOpts.contentTopics.toString() !==
      Array.from(decoders.keys()).toString()
    ) {
      throw new Error(
        "Internal error, the decoders should match the query's content topics"
      );
    }

    let currentCursor = queryOpts.paginationCursor;
    while (true) {
      const storeQueryRequest = StoreQueryRequest.create({
        ...queryOpts,
        paginationCursor: currentCursor
      });

      let stream;
      try {
        stream = await this.getStream(peer);
      } catch (e) {
        log.error("Failed to get stream", e);
        break;
      }

      const res = await pipe(
        [storeQueryRequest.encode()],
        lp.encode,
        stream,
        lp.decode,
        async (source) => await all(source)
      );

      const bytes = new Uint8ArrayList();
      res.forEach((chunk) => {
        bytes.append(chunk);
      });

      const storeQueryResponse = StoreQueryResponse.decode(bytes);

      if (
        !storeQueryResponse.statusCode ||
        storeQueryResponse.statusCode >= 300
      ) {
        const errorMessage = `Store query failed with status code: ${storeQueryResponse.statusCode}, description: ${storeQueryResponse.statusDesc}`;
        log.error(errorMessage);
        throw new Error(errorMessage);
      }

      if (!storeQueryResponse.messages || !storeQueryResponse.messages.length) {
        log.warn("Stopping pagination due to empty messages in response");
        break;
      }

      log.info(
        `${storeQueryResponse.messages.length} messages retrieved from store`
      );

      const decodedMessages = storeQueryResponse.messages.map((protoMsg) => {
        if (!protoMsg.message) {
          return Promise.resolve(undefined);
        }
        const contentTopic = protoMsg.message.contentTopic;
        if (contentTopic) {
          const decoder = decoders.get(contentTopic);
          if (decoder) {
            return decoder.fromProtoObj(
              protoMsg.pubsubTopic || "",
              toProtoMessage(protoMsg.message)
            );
          }
        }
        return Promise.resolve(undefined);
      });

      yield decodedMessages;

      if (queryOpts.paginationForward) {
        currentCursor =
          storeQueryResponse.messages[storeQueryResponse.messages.length - 1]
            .messageHash;
      } else {
        currentCursor = storeQueryResponse.messages[0].messageHash;
      }

      if (
        storeQueryResponse.messages.length > MAX_PAGE_SIZE &&
        storeQueryResponse.messages.length <
          (queryOpts.paginationLimit || DEFAULT_PAGE_SIZE)
      ) {
        break;
      }
    }
  }
}
