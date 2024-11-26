import { TypedEventEmitter } from "@libp2p/interface";
import { peerDiscoverySymbol as symbol } from "@libp2p/interface";
import type {
  IdentifyResult,
  PeerDiscovery,
  PeerDiscoveryEvents,
  PeerId,
  PeerInfo
} from "@libp2p/interface";
import {
  type Libp2pComponents,
  type PeerExchangeQueryResult,
  PubsubTopic,
  ShardInfo,
  Tags
} from "@waku/interfaces";
import { decodeRelayShard, encodeRelayShard, Logger } from "@waku/utils";

import { PeerExchangeCodec, WakuPeerExchange } from "./waku_peer_exchange.js";

const log = new Logger("peer-exchange-discovery");

const DEFAULT_PEER_EXCHANGE_REQUEST_NODES = 10;
const DEFAULT_PEER_EXCHANGE_QUERY_INTERVAL_MS = 10 * 1000;
const DEFAULT_MAX_RETRIES = 3;

export interface Options {
  /**
   * Tag a bootstrap peer with this name before "discovering" it (default: 'bootstrap')
   */
  tagName?: string;

  /**
   * The bootstrap peer tag will have this value (default: 50)
   */
  tagValue?: number;

  /**
   * Cause the bootstrap peer tag to be removed after this number of ms (default: 2 minutes)
   */
  tagTTL?: number;
  /**
   * The interval between queries to a peer (default: 10 seconds)
   * The interval will increase by a factor of an incrementing number (starting at 1)
   * until it reaches the maximum attempts before backoff
   */
  queryInterval?: number;
  /**
   * The number of attempts before the queries to a peer are aborted (default: 3)
   */
  maxRetries?: number;
}

interface CustomDiscoveryEvent extends PeerDiscoveryEvents {
  "waku:peer-exchange:started": CustomEvent<boolean>;
}

export const DEFAULT_PEER_EXCHANGE_TAG_NAME = Tags.PEER_EXCHANGE;
const DEFAULT_PEER_EXCHANGE_TAG_VALUE = 50;
const DEFAULT_PEER_EXCHANGE_TAG_TTL = 100_000_000;

export class PeerExchangeDiscovery
  extends TypedEventEmitter<CustomDiscoveryEvent>
  implements PeerDiscovery
{
  private readonly components: Libp2pComponents;
  private readonly peerExchange: WakuPeerExchange;
  private readonly options: Options;
  private isStarted: boolean;
  private queryingPeers: Set<string> = new Set();
  private queryAttempts: Map<string, number> = new Map();

  private readonly handleDiscoveredPeer = (
    event: CustomEvent<IdentifyResult>
  ): void => {
    const { protocols, peerId } = event.detail;

    if (
      !protocols.includes(PeerExchangeCodec) ||
      this.queryingPeers.has(peerId.toString())
    )
      return;

    this.queryingPeers.add(peerId.toString());
    this.startRecurringQueries(peerId).catch((error) =>
      log.error(`Error querying peer ${error}`)
    );
  };

  public constructor(
    components: Libp2pComponents,
    pubsubTopics: PubsubTopic[],
    options: Options = {}
  ) {
    super();
    this.components = components;
    this.peerExchange = new WakuPeerExchange(components, pubsubTopics);
    this.options = options;
    this.isStarted = false;
  }

  /**
   * Start emitting events
   */
  public start(): void {
    if (this.isStarted) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("waku:peer-exchange:started", { detail: true })
    );

    log.info("Starting peer exchange node discovery, discovering peers");

    // might be better to use "peer:identify" or "peer:update"
    this.components.events.addEventListener(
      "peer:identify",
      this.handleDiscoveredPeer
    );
  }

  /**
   * Remove event listener
   */
  public stop(): void {
    if (!this.isStarted) return;
    log.info("Stopping peer exchange node discovery");
    this.isStarted = false;
    this.queryingPeers.clear();
    this.components.events.removeEventListener(
      "peer:identify",
      this.handleDiscoveredPeer
    );
  }

  public get [symbol](): true {
    return true;
  }

  public get [Symbol.toStringTag](): string {
    return "@waku/peer-exchange";
  }

  private readonly startRecurringQueries = async (
    peerId: PeerId
  ): Promise<void> => {
    const peerIdStr = peerId.toString();
    const {
      queryInterval = DEFAULT_PEER_EXCHANGE_QUERY_INTERVAL_MS,
      maxRetries = DEFAULT_MAX_RETRIES
    } = this.options;

    log.info(
      `Querying peer: ${peerIdStr} (attempt ${
        this.queryAttempts.get(peerIdStr) ?? 1
      })`
    );

    await this.query(peerId);

    const currentAttempt = this.queryAttempts.get(peerIdStr) ?? 1;

    if (currentAttempt > maxRetries) {
      this.abortQueriesForPeer(peerIdStr);
      return;
    }

    setTimeout(() => {
      this.queryAttempts.set(peerIdStr, currentAttempt + 1);
      this.startRecurringQueries(peerId).catch((error) => {
        log.error(`Error in startRecurringQueries: ${error}`);
      });
    }, queryInterval * currentAttempt);
  };

  private async query(peerId: PeerId): Promise<PeerExchangeQueryResult> {
    const { error, peerInfos } = await this.peerExchange.query({
      numPeers: DEFAULT_PEER_EXCHANGE_REQUEST_NODES,
      peerId
    });

    if (error) {
      log.error("Peer exchange query failed", error);
      return { error, peerInfos: null };
    }

    for (const _peerInfo of peerInfos) {
      const { ENR } = _peerInfo;
      if (!ENR) {
        log.warn("No ENR in peerInfo object, skipping");
        continue;
      }

      const { peerId, peerInfo, shardInfo } = ENR;
      if (!peerId || !peerInfo) {
        continue;
      }

      const hasPeer = await this.components.peerStore.has(peerId);
      if (hasPeer) {
        const { hasMultiaddrDiff, hasShardDiff } = await this.checkPeerInfoDiff(
          peerInfo,
          shardInfo
        );

        if (hasMultiaddrDiff || hasShardDiff) {
          log.info(
            `Peer ${peerId.toString()} has updated multiaddrs or shardInfo, updating`
          );

          if (hasMultiaddrDiff) {
            log.info(
              `Peer ${peerId.toString()} has updated multiaddrs, updating`
            );

            await this.components.peerStore.patch(peerId, {
              multiaddrs: peerInfo.multiaddrs
            });
          }

          if (hasShardDiff && shardInfo) {
            log.info(
              `Peer ${peerId.toString()} has updated shardInfo, updating`
            );
            await this.components.peerStore.merge(peerId, {
              metadata: {
                shardInfo: encodeRelayShard(shardInfo)
              }
            });

            this.dispatchEvent(
              new CustomEvent<PeerInfo>("peer", {
                detail: {
                  id: peerId,
                  multiaddrs: peerInfo.multiaddrs
                }
              })
            );
          }

          continue;
        }
      }

      // update the tags for the peer
      await this.components.peerStore.save(peerId, {
        tags: {
          [DEFAULT_PEER_EXCHANGE_TAG_NAME]: {
            value: this.options.tagValue ?? DEFAULT_PEER_EXCHANGE_TAG_VALUE,
            ttl: this.options.tagTTL ?? DEFAULT_PEER_EXCHANGE_TAG_TTL
          }
        },
        ...(shardInfo && {
          metadata: {
            shardInfo: encodeRelayShard(shardInfo)
          }
        }),
        ...(peerInfo.multiaddrs && {
          multiaddrs: peerInfo.multiaddrs
        })
      });

      log.info(`Discovered peer: ${peerId.toString()}`);

      this.dispatchEvent(
        new CustomEvent<PeerInfo>("peer", {
          detail: {
            id: peerId,
            multiaddrs: peerInfo.multiaddrs
          }
        })
      );
    }

    return { error: null, peerInfos };
  }

  private abortQueriesForPeer(peerIdStr: string): void {
    log.info(`Aborting queries for peer: ${peerIdStr}`);
    this.queryingPeers.delete(peerIdStr);
    this.queryAttempts.delete(peerIdStr);
  }

  private async checkPeerInfoDiff(
    peerInfo: PeerInfo,
    shardInfo?: ShardInfo
  ): Promise<{ hasMultiaddrDiff: boolean; hasShardDiff: boolean }> {
    const { id: peerId } = peerInfo;
    const peer = await this.components.peerStore.get(peerId);

    const existingMultiaddrs = peer.addresses.map((a) =>
      a.multiaddr.toString()
    );
    const newMultiaddrs = peerInfo.multiaddrs.map((ma) => ma.toString());
    const hasMultiaddrDiff = existingMultiaddrs.some(
      (ma) => !newMultiaddrs.includes(ma)
    );

    let hasShardDiff: boolean = false;
    const existingShardInfoBytes = peer.metadata.get("shardInfo");
    if (existingShardInfoBytes) {
      const existingShardInfo = decodeRelayShard(existingShardInfoBytes);
      if (existingShardInfo || shardInfo) {
        hasShardDiff =
          existingShardInfo.clusterId !== shardInfo?.clusterId ||
          existingShardInfo.shards.some(
            (shard) => !shardInfo?.shards.includes(shard)
          );
      }
    }

    return { hasMultiaddrDiff, hasShardDiff };
  }
}

export function wakuPeerExchangeDiscovery(
  pubsubTopics: PubsubTopic[]
): (components: Libp2pComponents) => PeerExchangeDiscovery {
  return (components: Libp2pComponents) =>
    new PeerExchangeDiscovery(components, pubsubTopics);
}
