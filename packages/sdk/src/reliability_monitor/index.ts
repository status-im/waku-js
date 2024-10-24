import type { Peer } from "@libp2p/interface";
import {
  ContentTopic,
  CoreProtocolResult,
  PubsubTopic
} from "@waku/interfaces";

import { PeerManager } from "../protocols/peer_manager.js";

import { ReceiverReliabilityMonitor } from "./receiver.js";

export class ReliabilityMonitorManager {
  private static receiverMonitors: Map<
    PubsubTopic,
    ReceiverReliabilityMonitor
  > = new Map();

  public static createReceiverMonitor(
    pubsubTopic: PubsubTopic,
    peerManager: PeerManager,
    getContentTopics: () => ContentTopic[],
    protocolSubscribe: (
      pubsubTopic: PubsubTopic,
      peer: Peer,
      contentTopics: ContentTopic[]
    ) => Promise<CoreProtocolResult>,
    sendLightPushMessage: (peer: Peer) => Promise<void>
  ): ReceiverReliabilityMonitor {
    if (ReliabilityMonitorManager.receiverMonitors.has(pubsubTopic)) {
      return ReliabilityMonitorManager.receiverMonitors.get(pubsubTopic)!;
    }

    const monitor = new ReceiverReliabilityMonitor(
      pubsubTopic,
      peerManager,
      getContentTopics,
      protocolSubscribe,
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
