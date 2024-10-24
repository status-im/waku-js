import type { PeerId } from "@libp2p/interface";
import type { IRelay, Libp2p, PeerIdStr } from "@waku/interfaces";
import { Logger, pubsubTopicToSingleShardInfo } from "@waku/utils";
import { utf8ToBytes } from "@waku/utils/bytes";

import { createEncoder } from "../message/version_0.js";

const RelayPingContentTopic = "/relay-ping/1/ping/null";
const log = new Logger("keep-alive");

type KeepAliveOptions = {
  pingKeepAlive: number;
  relayKeepAlive: number;
};

type CreateKeepAliveManagerOptions = {
  options: KeepAliveOptions;
  libp2p: Libp2p;
  relay?: IRelay;
};

export class KeepAliveManager {
  private readonly relay?: IRelay;
  private readonly libp2p: Libp2p;

  private readonly options: KeepAliveOptions;

  private pingKeepAliveTimers: Map<string, ReturnType<typeof setInterval>> =
    new Map();
  private relayKeepAliveTimers: Map<PeerId, ReturnType<typeof setInterval>[]> =
    new Map();

  public constructor({
    options,
    relay,
    libp2p
  }: CreateKeepAliveManagerOptions) {
    this.options = options;
    this.relay = relay;
    this.libp2p = libp2p;
  }

  public start(peerId: PeerId): void {
    // Just in case a timer already exists for this peer
    this.stop(peerId);

    const { pingKeepAlive: pingPeriodSecs, relayKeepAlive: relayPeriodSecs } =
      this.options;

    const peerIdStr = peerId.toString();

    // Ping the peer every pingPeriodSecs seconds
    // if pingPeriodSecs is 0, don't ping the peer
    if (pingPeriodSecs !== 0) {
      const interval = setInterval(() => {
        void (async () => {
          let ping: number;
          try {
            // ping the peer for keep alive
            // also update the peer store with the latency
            try {
              ping = await this.libp2p.services.ping.ping(peerId);
              log.info(`Ping succeeded (${peerIdStr})`, ping);
            } catch (error) {
              log.error(`Ping failed for peer (${peerIdStr}).
                Next ping will be attempted in ${pingPeriodSecs} seconds.
              `);
              return;
            }

            try {
              await this.libp2p.peerStore.merge(peerId, {
                metadata: {
                  ping: utf8ToBytes(ping.toString())
                }
              });
            } catch (e) {
              log.error("Failed to update ping", e);
            }
          } catch (e) {
            log.error(`Ping failed (${peerIdStr})`, e);
          }
        })();
      }, pingPeriodSecs * 1000);

      this.pingKeepAliveTimers.set(peerIdStr, interval);
    }

    const relay = this.relay;
    if (relay && relayPeriodSecs !== 0) {
      const intervals = this.scheduleRelayPings(
        relay,
        relayPeriodSecs,
        peerId.toString()
      );
      this.relayKeepAliveTimers.set(peerId, intervals);
    }
  }

  public stop(peerId: PeerId): void {
    const peerIdStr = peerId.toString();

    if (this.pingKeepAliveTimers.has(peerIdStr)) {
      clearInterval(this.pingKeepAliveTimers.get(peerIdStr));
      this.pingKeepAliveTimers.delete(peerIdStr);
    }

    if (this.relayKeepAliveTimers.has(peerId)) {
      this.relayKeepAliveTimers.get(peerId)?.map(clearInterval);
      this.relayKeepAliveTimers.delete(peerId);
    }
  }

  public stopAll(): void {
    for (const timer of [
      ...Object.values(this.pingKeepAliveTimers),
      ...Object.values(this.relayKeepAliveTimers)
    ]) {
      clearInterval(timer);
    }

    this.pingKeepAliveTimers.clear();
    this.relayKeepAliveTimers.clear();
  }

  public connectionsExist(): boolean {
    return (
      this.pingKeepAliveTimers.size > 0 || this.relayKeepAliveTimers.size > 0
    );
  }

  private scheduleRelayPings(
    relay: IRelay,
    relayPeriodSecs: number,
    peerIdStr: PeerIdStr
  ): NodeJS.Timeout[] {
    // send a ping message to each PubsubTopic the peer is part of
    const intervals: NodeJS.Timeout[] = [];
    for (const topic of relay.pubsubTopics) {
      const meshPeers = relay.getMeshPeers(topic);
      if (!meshPeers.includes(peerIdStr)) continue;

      const encoder = createEncoder({
        pubsubTopicShardInfo: pubsubTopicToSingleShardInfo(topic),
        contentTopic: RelayPingContentTopic,
        ephemeral: true
      });
      const interval = setInterval(() => {
        log.info("Sending Waku Relay ping message");
        relay
          .send(encoder, { payload: new Uint8Array([1]) })
          .catch((e) => log.error("Failed to send relay ping", e));
      }, relayPeriodSecs * 1000);
      intervals.push(interval);
    }

    return intervals;
  }
}
