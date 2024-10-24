import type { Peer, PeerId } from "@libp2p/interface";
import {
  ContentTopic,
  CoreProtocolResult,
  IProtoMessage,
  PeerIdStr,
  PubsubTopic
} from "@waku/interfaces";
import { messageHashStr } from "@waku/message-hash";
import { Logger } from "@waku/utils";
import { bytesToUtf8 } from "@waku/utils/bytes";

import { PeerManager } from "../protocols/peer_manager.js";

const log = new Logger("sdk:receiver:reliability_monitor");

const DEFAULT_MAX_PINGS = 3;
const MESSAGE_VERIFICATION_DELAY = 5_000;

export class ReceiverReliabilityMonitor {
  private receivedMessagesFormPeer = new Set<string>();
  private receivedMessages = new Set<string>();
  private scheduledVerification = new Map<string, number>();
  private verifiedPeers = new Set<string>();

  private peerFailures: Map<string, number> = new Map();
  private maxPingFailures: number = DEFAULT_MAX_PINGS;
  private peerRenewalLocks: Set<PeerIdStr> = new Set();

  public constructor(
    private readonly pubsubTopic: PubsubTopic,
    private readonly peerManager: PeerManager,
    private getContentTopics: () => ContentTopic[],
    private protocolSubscribe: (
      pubsubTopic: PubsubTopic,
      peer: Peer,
      contentTopics: ContentTopic[]
    ) => Promise<CoreProtocolResult>,
    private sendLightPushMessage: (peer: Peer) => Promise<void>
  ) {}

  public setMaxPingFailures(value: number | undefined): void {
    if (value === undefined) {
      return;
    }
    this.maxPingFailures = value;
  }

  public async handlePingResult(
    peerId: PeerId,
    result?: CoreProtocolResult
  ): Promise<void> {
    if (result?.success) {
      this.peerFailures.delete(peerId.toString());
      return;
    }

    const failures = (this.peerFailures.get(peerId.toString()) || 0) + 1;
    this.peerFailures.set(peerId.toString(), failures);

    if (failures >= this.maxPingFailures) {
      try {
        log.info(
          `Attempting to renew ${peerId.toString()} due to ping failures.`
        );
        await this.renewAndSubscribePeer(peerId);
        this.peerFailures.delete(peerId.toString());
      } catch (error) {
        log.error(`Failed to renew peer ${peerId.toString()}: ${error}.`);
      }
    }
  }

  public notifyMessageReceived(
    peerIdStr: string,
    message: IProtoMessage
  ): boolean {
    const hash = this.buildMessageHash(message);

    this.verifiedPeers.add(peerIdStr);
    this.receivedMessagesFormPeer.add(`${peerIdStr}-${hash}`);

    log.info(
      `notifyMessage received debug: ephemeral:${message.ephemeral}\t${bytesToUtf8(message.payload)}`
    );
    log.info(`notifyMessage received: peer:${peerIdStr}\tmessage:${hash}`);

    if (this.receivedMessages.has(hash)) {
      return true;
    }

    this.receivedMessages.add(hash);

    return false;
  }

  public notifyMessageSent(peerId: PeerId, message: IProtoMessage): void {
    const peerIdStr = peerId.toString();
    const hash = this.buildMessageHash(message);

    log.info(`notifyMessage sent debug: ${bytesToUtf8(message.payload)}`);

    if (this.scheduledVerification.has(peerIdStr)) {
      log.warn(
        `notifyMessage sent: attempting to schedule verification for pending peer:${peerIdStr}\tmessage:${hash}`
      );
      return;
    }

    const timeout = window.setTimeout(
      (async () => {
        const receivedAnyMessage = this.verifiedPeers.has(peerIdStr);
        const receivedTestMessage = this.receivedMessagesFormPeer.has(
          `${peerIdStr}-${hash}`
        );

        if (receivedAnyMessage || receivedTestMessage) {
          log.info(
            `notifyMessage sent setTimeout: verified that peer pushes filter messages, peer:${peerIdStr}\tmessage:${hash}`
          );
          return;
        }

        log.warn(
          `notifyMessage sent setTimeout: peer didn't return probe message, attempting renewAndSubscribe, peer:${peerIdStr}\tmessage:${hash}`
        );
        this.scheduledVerification.delete(peerIdStr);
        await this.renewAndSubscribePeer(peerId);
      }) as () => void,
      MESSAGE_VERIFICATION_DELAY
    );

    this.scheduledVerification.set(peerIdStr, timeout);
  }

  public shouldVerifyPeer(peerId: PeerId): boolean {
    const peerIdStr = peerId.toString();

    const isPeerVerified = this.verifiedPeers.has(peerIdStr);
    const isVerificationPending = this.scheduledVerification.has(peerIdStr);

    return !(isPeerVerified || isVerificationPending);
  }

  private buildMessageHash(message: IProtoMessage): string {
    return messageHashStr(this.pubsubTopic, message);
  }

  private async renewAndSubscribePeer(
    peerId: PeerId
  ): Promise<Peer | undefined> {
    const peerIdStr = peerId.toString();
    try {
      if (this.peerRenewalLocks.has(peerIdStr)) {
        log.info(`Peer ${peerIdStr} is already being renewed.`);
        return;
      }

      this.peerRenewalLocks.add(peerIdStr);

      const newPeer = await this.peerManager.requestRenew(peerId);
      if (!newPeer) {
        log.warn(`Failed to renew peer ${peerIdStr}: No new peer found.`);
        return;
      }

      await this.protocolSubscribe(
        this.pubsubTopic,
        newPeer,
        this.getContentTopics()
      );

      await this.sendLightPushMessage(newPeer);

      this.peerFailures.delete(peerIdStr);

      return newPeer;
    } catch (error) {
      log.error(`Failed to renew peer ${peerIdStr}: ${error}.`);
      return;
    } finally {
      this.peerRenewalLocks.delete(peerIdStr);
    }
  }
}
