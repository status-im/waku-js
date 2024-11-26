import type { Peer, PeerId } from "@libp2p/interface";
import {
  ConnectionManager,
  getHealthManager,
  LightPushCodec,
  LightPushCore
} from "@waku/core";
import {
  type CoreProtocolResult,
  Failure,
  type IEncoder,
  ILightPush,
  type IMessage,
  type ISenderOptions,
  type Libp2p,
  type ProtocolCreateOptions,
  ProtocolError,
  SDKProtocolResult
} from "@waku/interfaces";
import { ensurePubsubTopicIsConfigured, Logger } from "@waku/utils";

import { DEFAULT_NUM_PEERS_TO_USE } from "../base_protocol.js";

const log = new Logger("sdk:light-push");

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_SEND_OPTIONS: ISenderOptions = {
  autoRetry: false,
  maxAttempts: DEFAULT_MAX_ATTEMPTS
};

type RetryCallback = (peer: Peer) => Promise<CoreProtocolResult>;

export class LightPush implements ILightPush {
  private numPeersToUse: number = DEFAULT_NUM_PEERS_TO_USE;
  public readonly protocol: LightPushCore;

  public constructor(
    connectionManager: ConnectionManager,
    private libp2p: Libp2p,
    options?: ProtocolCreateOptions
  ) {
    this.numPeersToUse = options?.numPeersToUse ?? DEFAULT_NUM_PEERS_TO_USE;
    this.protocol = new LightPushCore(
      connectionManager.configuredPubsubTopics,
      libp2p
    );
  }

  public async send(
    encoder: IEncoder,
    message: IMessage,
    options: ISenderOptions = DEFAULT_SEND_OPTIONS
  ): Promise<SDKProtocolResult> {
    const successes: PeerId[] = [];
    const failures: Failure[] = [];

    const { pubsubTopic } = encoder;
    try {
      ensurePubsubTopicIsConfigured(pubsubTopic, this.protocol.pubsubTopics);
    } catch (error) {
      log.error("Failed to send waku light push: pubsub topic not configured");
      return {
        successes,
        failures: [
          {
            error: ProtocolError.TOPIC_NOT_CONFIGURED
          }
        ]
      };
    }

    const peers = await this.getConnectedPeers();
    if (peers.length === 0) {
      return {
        successes,
        failures: [
          {
            error: ProtocolError.NO_PEER_AVAILABLE
          }
        ]
      };
    }

    const results = await Promise.allSettled(
      peers.map((peer) => this.protocol.send(encoder, message, peer))
    );

    for (const result of results) {
      if (result.status !== "fulfilled") {
        log.error("Failed unexpectedly while sending:", result.reason);
        failures.push({ error: ProtocolError.GENERIC_FAIL });
        continue;
      }

      const { failure, success } = result.value;

      if (success) {
        successes.push(success);
        continue;
      }

      if (failure) {
        failures.push(failure);

        if (options?.autoRetry) {
          void this.attemptRetries(
            (peer: Peer) => this.protocol.send(encoder, message, peer),
            options.maxAttempts
          );
        }
      }
    }

    getHealthManager().updateProtocolHealth(
      this.protocol.multicodec,
      successes.length
    );

    return {
      successes,
      failures
    };
  }

  private async attemptRetries(
    fn: RetryCallback,
    maxAttempts?: number
  ): Promise<void> {
    maxAttempts = maxAttempts || DEFAULT_MAX_ATTEMPTS;
    const connectedPeers = await this.getConnectedPeers();

    if (connectedPeers.length === 0) {
      log.warn("Cannot retry with no connected peers.");
      return;
    }

    for (let i = 0; i < maxAttempts; i++) {
      const peer = connectedPeers[i % connectedPeers.length]; // always present as we checked for the length already
      const response = await fn(peer);

      if (response.success) {
        return;
      }

      log.info(
        `Attempted retry for peer:${peer.id} failed with:${response?.failure?.error}`
      );
    }
  }

  private async getConnectedPeers(): Promise<Peer[]> {
    const peerIDs = this.libp2p.getPeers();

    if (peerIDs.length === 0) {
      return [];
    }

    const peers = await Promise.all(
      peerIDs.map(async (id) => {
        try {
          return await this.libp2p.peerStore.get(id);
        } catch (e) {
          return null;
        }
      })
    );

    return peers
      .filter((p) => !!p)
      .filter((p) => (p as Peer).protocols.includes(LightPushCodec))
      .slice(0, this.numPeersToUse) as Peer[];
  }
}

export function wakuLightPush(
  connectionManager: ConnectionManager,
  init: Partial<ProtocolCreateOptions> = {}
): (libp2p: Libp2p) => ILightPush {
  return (libp2p: Libp2p) => new LightPush(connectionManager, libp2p, init);
}
