import type { Peer, PeerId } from "@libp2p/interface";
import {
  ContentTopic,
  CoreProtocolResult,
  Libp2p,
  PubsubTopic
} from "@waku/interfaces";

import { ReceiverReliabilityMonitor } from "./receiver.js";

export class ReliabilityMonitorManager {
  private static receiverMonitors: Map<
    PubsubTopic,
    ReceiverReliabilityMonitor
  > = new Map();

  public static createReceiverMonitor(
    pubsubTopic: PubsubTopic,
    getPeers: () => Peer[],
    renewPeer: (peerId: PeerId) => Promise<Peer | undefined>,
    getContentTopics: () => ContentTopic[],
    protocolSubscribe: (
      pubsubTopic: PubsubTopic,
      peer: Peer,
      contentTopics: ContentTopic[]
    ) => Promise<CoreProtocolResult>,
    addLibp2pEventListener: Libp2p["addEventListener"],
    sendLightPushMessage: (peer: Peer) => Promise<void>
  ): ReceiverReliabilityMonitor {
    if (ReliabilityMonitorManager.receiverMonitors.has(pubsubTopic)) {
      return ReliabilityMonitorManager.receiverMonitors.get(pubsubTopic)!;
    }

    const monitor = new ReceiverReliabilityMonitor(
      pubsubTopic,
      getPeers,
      renewPeer,
      getContentTopics,
      protocolSubscribe,
      addLibp2pEventListener,
      sendLightPushMessage
    );
    ReliabilityMonitorManager.receiverMonitors.set(pubsubTopic, monitor);
    return monitor;
  }

  private constructor() {}

  public static stop(pubsubTopic: PubsubTopic): void {
    this.receiverMonitors.delete(pubsubTopic);
  }

  public static stopAll(): void {
    for (const [pubsubTopic, monitor] of this.receiverMonitors) {
      monitor.setMaxPingFailures(undefined);
      this.receiverMonitors.delete(pubsubTopic);
    }
  }
}
