import { BaseProtocol } from "@waku/core/lib/base_protocol";
import { EnrDecoder } from "@waku/enr";
import {
  IPeerExchange,
  Libp2pComponents,
  PeerExchangeQueryParams,
  PeerExchangeQueryResult,
  ProtocolError,
  PubsubTopic
} from "@waku/interfaces";
import { isDefined } from "@waku/utils";
import { Logger } from "@waku/utils";
import all from "it-all";
import * as lp from "it-length-prefixed";
import { pipe } from "it-pipe";
import { Uint8ArrayList } from "uint8arraylist";

import { PeerExchangeRPC } from "./rpc.js";

export const PeerExchangeCodec = "/vac/waku/peer-exchange/2.0.0-alpha1";

const log = new Logger("peer-exchange");

/**
 * Implementation of the Peer Exchange protocol (https://rfc.vac.dev/spec/34/)
 */
export class WakuPeerExchange extends BaseProtocol implements IPeerExchange {
  /**
   * @param components - libp2p components
   */
  public constructor(
    components: Libp2pComponents,
    pubsubTopics: PubsubTopic[]
  ) {
    super(PeerExchangeCodec, components, pubsubTopics);
  }

  /**
   * Make a peer exchange query to a peer
   */
  public async query(
    params: PeerExchangeQueryParams
  ): Promise<PeerExchangeQueryResult> {
    const { numPeers, peerId } = params;

    const rpcQuery = PeerExchangeRPC.createRequest({
      numPeers: BigInt(numPeers)
    });

    const peer = await this.components.peerStore.get(peerId);
    if (!peer) {
      return {
        peerInfos: null,
        error: ProtocolError.NO_PEER_AVAILABLE
      };
    }

    let stream;
    try {
      stream = await this.getStream(peer);
    } catch (err) {
      log.error("Failed to get stream", err);
      return {
        peerInfos: null,
        error: ProtocolError.NO_STREAM_AVAILABLE
      };
    }

    const res = await pipe(
      [rpcQuery.encode()],
      lp.encode,
      stream,
      lp.decode,
      async (source) => await all(source)
    );

    try {
      const bytes = new Uint8ArrayList();
      res.forEach((chunk) => {
        bytes.append(chunk);
      });

      const { response } = PeerExchangeRPC.decode(bytes);
      if (!response) {
        log.error(
          "PeerExchangeRPC message did not contains a `response` field"
        );
        return {
          peerInfos: null,
          error: ProtocolError.EMPTY_PAYLOAD
        };
      }

      const peerInfos = await Promise.all(
        response.peerInfos
          .map((peerInfo) => peerInfo.enr)
          .filter(isDefined)
          .map(async (enr) => {
            return { ENR: await EnrDecoder.fromRLP(enr) };
          })
      );

      return {
        peerInfos,
        error: null
      };
    } catch (err) {
      log.error("Failed to decode push reply", err);
      return {
        peerInfos: null,
        error: ProtocolError.DECODE_FAILED
      };
    }
  }
}

/**
 *
 * @returns A function that creates a new peer exchange protocol
 */
export function wakuPeerExchange(
  pubsubTopics: PubsubTopic[]
): (components: Libp2pComponents) => WakuPeerExchange {
  return (components: Libp2pComponents) =>
    new WakuPeerExchange(components, pubsubTopics);
}
