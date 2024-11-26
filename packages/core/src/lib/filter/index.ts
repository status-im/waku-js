import type { Peer, Stream } from "@libp2p/interface";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import {
  type ContentTopic,
  type CoreProtocolResult,
  type IBaseProtocolCore,
  type Libp2p,
  ProtocolError,
  type PubsubTopic
} from "@waku/interfaces";
import { WakuMessage } from "@waku/proto";
import { Logger } from "@waku/utils";
import all from "it-all";
import * as lp from "it-length-prefixed";
import { pipe } from "it-pipe";
import { Uint8ArrayList } from "uint8arraylist";

import { BaseProtocol } from "../base_protocol.js";

import {
  FilterPushRpc,
  FilterSubscribeResponse,
  FilterSubscribeRpc
} from "./filter_rpc.js";

const log = new Logger("filter:v2");

export const FilterCodecs = {
  SUBSCRIBE: "/vac/waku/filter-subscribe/2.0.0-beta1",
  PUSH: "/vac/waku/filter-push/2.0.0-beta1"
};

export class FilterCore extends BaseProtocol implements IBaseProtocolCore {
  public constructor(
    private handleIncomingMessage: (
      pubsubTopic: PubsubTopic,
      wakuMessage: WakuMessage,
      peerIdStr: string
    ) => Promise<void>,
    public readonly pubsubTopics: PubsubTopic[],
    libp2p: Libp2p
  ) {
    super(FilterCodecs.SUBSCRIBE, libp2p.components, log, pubsubTopics);

    libp2p
      .handle(FilterCodecs.PUSH, this.onRequest.bind(this), {
        maxInboundStreams: 100
      })
      .catch((e) => {
        log.error("Failed to register ", FilterCodecs.PUSH, e);
      });
  }

  public async subscribe(
    pubsubTopic: PubsubTopic,
    peer: Peer,
    contentTopics: ContentTopic[]
  ): Promise<CoreProtocolResult> {
    const stream = await this.getStream(peer);

    const request = FilterSubscribeRpc.createSubscribeRequest(
      pubsubTopic,
      contentTopics
    );

    let res: Uint8ArrayList[] | undefined;
    try {
      res = await pipe(
        [request.encode()],
        lp.encode,
        stream,
        lp.decode,
        async (source) => await all(source)
      );
    } catch (error) {
      log.error("Failed to send subscribe request", error);
      return {
        success: null,
        failure: {
          error: ProtocolError.GENERIC_FAIL,
          peerId: peer.id
        }
      };
    }

    const { statusCode, requestId, statusDesc } =
      FilterSubscribeResponse.decode(res[0].slice());

    if (statusCode < 200 || statusCode >= 300) {
      log.error(
        `Filter subscribe request ${requestId} failed with status code ${statusCode}: ${statusDesc}`
      );
      return {
        failure: {
          error: ProtocolError.REMOTE_PEER_REJECTED,
          peerId: peer.id
        },
        success: null
      };
    }

    return {
      failure: null,
      success: peer.id
    };
  }

  public async unsubscribe(
    pubsubTopic: PubsubTopic,
    peer: Peer,
    contentTopics: ContentTopic[]
  ): Promise<CoreProtocolResult> {
    let stream: Stream | undefined;
    try {
      stream = await this.getStream(peer);
    } catch (error) {
      log.error(
        `Failed to get a stream for remote peer${peer.id.toString()}`,
        error
      );
      return {
        success: null,
        failure: {
          error: ProtocolError.NO_STREAM_AVAILABLE,
          peerId: peer.id
        }
      };
    }

    const unsubscribeRequest = FilterSubscribeRpc.createUnsubscribeRequest(
      pubsubTopic,
      contentTopics
    );

    try {
      await pipe([unsubscribeRequest.encode()], lp.encode, stream.sink);
    } catch (error) {
      log.error("Failed to send unsubscribe request", error);
      return {
        success: null,
        failure: {
          error: ProtocolError.GENERIC_FAIL,
          peerId: peer.id
        }
      };
    }

    return {
      success: peer.id,
      failure: null
    };
  }

  public async unsubscribeAll(
    pubsubTopic: PubsubTopic,
    peer: Peer
  ): Promise<CoreProtocolResult> {
    const stream = await this.getStream(peer);

    const request = FilterSubscribeRpc.createUnsubscribeAllRequest(pubsubTopic);

    const res = await pipe(
      [request.encode()],
      lp.encode,
      stream,
      lp.decode,
      async (source) => await all(source)
    );

    if (!res || !res.length) {
      return {
        failure: {
          error: ProtocolError.NO_RESPONSE,
          peerId: peer.id
        },
        success: null
      };
    }

    const { statusCode, requestId, statusDesc } =
      FilterSubscribeResponse.decode(res[0].slice());

    if (statusCode < 200 || statusCode >= 300) {
      log.error(
        `Filter unsubscribe all request ${requestId} failed with status code ${statusCode}: ${statusDesc}`
      );
      return {
        failure: {
          error: ProtocolError.REMOTE_PEER_REJECTED,
          peerId: peer.id
        },
        success: null
      };
    }

    return {
      failure: null,
      success: peer.id
    };
  }

  public async ping(peer: Peer): Promise<CoreProtocolResult> {
    let stream: Stream | undefined;
    try {
      stream = await this.getStream(peer);
    } catch (error) {
      log.error(
        `Failed to get a stream for remote peer${peer.id.toString()}`,
        error
      );
      return {
        success: null,
        failure: {
          error: ProtocolError.NO_STREAM_AVAILABLE,
          peerId: peer.id
        }
      };
    }

    const request = FilterSubscribeRpc.createSubscriberPingRequest();

    let res: Uint8ArrayList[] | undefined;
    try {
      res = await pipe(
        [request.encode()],
        lp.encode,
        stream,
        lp.decode,
        async (source) => await all(source)
      );
    } catch (error) {
      log.error("Failed to send ping request", error);
      return {
        success: null,
        failure: {
          error: ProtocolError.GENERIC_FAIL,
          peerId: peer.id
        }
      };
    }

    if (!res || !res.length) {
      return {
        success: null,
        failure: {
          error: ProtocolError.NO_RESPONSE,
          peerId: peer.id
        }
      };
    }

    const { statusCode, requestId, statusDesc } =
      FilterSubscribeResponse.decode(res[0].slice());

    if (statusCode < 200 || statusCode >= 300) {
      log.error(
        `Filter ping request ${requestId} failed with status code ${statusCode}: ${statusDesc}`
      );
      return {
        success: null,
        failure: {
          error: ProtocolError.REMOTE_PEER_REJECTED,
          peerId: peer.id
        }
      };
    }
    return {
      success: peer.id,
      failure: null
    };
  }

  private onRequest(streamData: IncomingStreamData): void {
    const { connection, stream } = streamData;
    const { remotePeer } = connection;
    log.info(`Received message from ${remotePeer.toString()}`);
    try {
      pipe(stream, lp.decode, async (source) => {
        for await (const bytes of source) {
          const response = FilterPushRpc.decode(bytes.slice());

          const { pubsubTopic, wakuMessage } = response;

          if (!wakuMessage) {
            log.error("Received empty message");
            return;
          }

          if (!pubsubTopic) {
            log.error("Pubsub topic missing from push message");
            return;
          }

          await this.handleIncomingMessage(
            pubsubTopic,
            wakuMessage,
            connection.remotePeer.toString()
          );
        }
      }).then(
        () => {
          log.info("Receiving pipe closed.");
        },
        async (e) => {
          log.error(
            `Error with receiving pipe on peer:${connection.remotePeer.toString()} -- stream:${stream.id} -- protocol:${stream.protocol}: `,
            e
          );
        }
      );
    } catch (e) {
      log.error("Error decoding message", e);
    }
  }
}
