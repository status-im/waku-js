import type { Peer } from "@libp2p/interface";
import type { PeerId } from "@libp2p/interface";
import {
  ConnectionManager,
  createDecoder,
  createEncoder,
  FilterCore,
  LightPushCore
} from "@waku/core";
import {
  type Callback,
  type ContentTopic,
  type CoreProtocolResult,
  EConnectionStateEvents,
  type IDecodedMessage,
  type IDecoder,
  type ILightPush,
  type IProtoMessage,
  type ISubscription,
  type Libp2p,
  type PeerIdStr,
  ProtocolError,
  type PubsubTopic,
  type SDKProtocolResult,
  type SubscribeOptions,
  SubscriptionCallback
} from "@waku/interfaces";
import { WakuMessage } from "@waku/proto";
import { groupByContentTopic, Logger } from "@waku/utils";

import { ReliabilityMonitorManager } from "../../reliability_monitor/index.js";
import { ReceiverReliabilityMonitor } from "../../reliability_monitor/receiver.js";
import { PeerManager } from "../peer_manager.js";

import {
  DEFAULT_KEEP_ALIVE,
  DEFAULT_LIGHT_PUSH_FILTER_CHECK,
  DEFAULT_LIGHT_PUSH_FILTER_CHECK_INTERVAL,
  DEFAULT_SUBSCRIBE_OPTIONS
} from "./constants.js";

const log = new Logger("sdk:filter:subscription_manager");

export class SubscriptionManager implements ISubscription {
  private reliabilityMonitor: ReceiverReliabilityMonitor;

  private keepAliveTimeout: number = DEFAULT_KEEP_ALIVE;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  private enableLightPushFilterCheck = DEFAULT_LIGHT_PUSH_FILTER_CHECK;

  private subscriptionCallbacks: Map<
    ContentTopic,
    SubscriptionCallback<IDecodedMessage>
  >;

  public constructor(
    private readonly pubsubTopic: PubsubTopic,
    private readonly protocol: FilterCore,
    private readonly connectionManager: ConnectionManager,
    private readonly peerManager: PeerManager,
    private readonly libp2p: Libp2p,
    private readonly lightPush?: ILightPush
  ) {
    this.pubsubTopic = pubsubTopic;
    this.subscriptionCallbacks = new Map();

    this.reliabilityMonitor = ReliabilityMonitorManager.createReceiverMonitor(
      this.pubsubTopic,
      this.peerManager,
      () => Array.from(this.subscriptionCallbacks.keys()),
      this.protocol.subscribe.bind(this.protocol),
      this.sendLightPushCheckMessage.bind(this)
    );
  }

  public async subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>,
    options: SubscribeOptions = DEFAULT_SUBSCRIBE_OPTIONS
  ): Promise<SDKProtocolResult> {
    this.reliabilityMonitor.setMaxPingFailures(options.pingsBeforePeerRenewed);
    this.keepAliveTimeout = options.keepAlive || DEFAULT_KEEP_ALIVE;
    this.enableLightPushFilterCheck =
      options?.enableLightPushFilterCheck || DEFAULT_LIGHT_PUSH_FILTER_CHECK;

    const decodersArray = Array.isArray(decoders) ? decoders : [decoders];

    // check that all decoders are configured for the same pubsub topic as this subscription
    for (const decoder of decodersArray) {
      if (decoder.pubsubTopic !== this.pubsubTopic) {
        return {
          failures: [
            {
              error: ProtocolError.TOPIC_DECODER_MISMATCH
            }
          ],
          successes: []
        };
      }
    }

    if (this.enableLightPushFilterCheck) {
      decodersArray.push(
        createDecoder(
          this.buildLightPushContentTopic(),
          this.pubsubTopic
        ) as IDecoder<T>
      );
    }

    const decodersGroupedByCT = groupByContentTopic(decodersArray);
    const contentTopics = Array.from(decodersGroupedByCT.keys());

    const peers = await this.peerManager.getPeers();
    const promises = peers.map(async (peer) =>
      this.subscribeWithPeerVerification(peer, contentTopics)
    );

    const results = await Promise.allSettled(promises);

    const finalResult = this.handleResult(results, "subscribe");

    // Save the callback functions by content topics so they
    // can easily be removed (reciprocally replaced) if `unsubscribe` (reciprocally `subscribe`)
    // is called for those content topics
    decodersGroupedByCT.forEach((decoders, contentTopic) => {
      // Cast the type because a given `subscriptionCallbacks` map may hold
      // Decoder that decode to different implementations of `IDecodedMessage`
      const subscriptionCallback = {
        decoders,
        callback
      } as unknown as SubscriptionCallback<IDecodedMessage>;

      // don't handle case of internal content topic
      if (contentTopic === this.buildLightPushContentTopic()) {
        return;
      }

      // The callback and decoder may override previous values, this is on
      // purpose as the user may call `subscribe` to refresh the subscription
      this.subscriptionCallbacks.set(contentTopic, subscriptionCallback);
    });

    this.startSubscriptionsMaintenance(this.keepAliveTimeout);

    return finalResult;
  }

  public async unsubscribe(
    contentTopics: ContentTopic[]
  ): Promise<SDKProtocolResult> {
    const peers = await this.peerManager.getPeers();
    const promises = peers.map(async (peer) => {
      const response = await this.protocol.unsubscribe(
        this.pubsubTopic,
        peer,
        contentTopics
      );

      contentTopics.forEach((contentTopic: string) => {
        this.subscriptionCallbacks.delete(contentTopic);
      });

      return response;
    });

    const results = await Promise.allSettled(promises);
    const finalResult = this.handleResult(results, "unsubscribe");

    if (this.subscriptionCallbacks.size === 0) {
      this.stopSubscriptionsMaintenance();
    }

    return finalResult;
  }

  public async ping(peerId?: PeerId): Promise<SDKProtocolResult> {
    log.info("Sending keep-alive ping");
    const peers = peerId
      ? [peerId]
      : (await this.peerManager.getPeers()).map((peer) => peer.id);

    const promises = peers.map((peerId) => this.pingSpecificPeer(peerId));
    const results = await Promise.allSettled(promises);

    return this.handleResult(results, "ping");
  }

  public async unsubscribeAll(): Promise<SDKProtocolResult> {
    const peers = await this.peerManager.getPeers();
    const promises = peers.map(async (peer) =>
      this.protocol.unsubscribeAll(this.pubsubTopic, peer)
    );

    const results = await Promise.allSettled(promises);

    this.subscriptionCallbacks.clear();

    const finalResult = this.handleResult(results, "unsubscribeAll");

    this.stopSubscriptionsMaintenance();

    return finalResult;
  }

  public async processIncomingMessage(
    message: WakuMessage,
    peerIdStr: PeerIdStr
  ): Promise<void> {
    const alreadyReceived = this.reliabilityMonitor.notifyMessageReceived(
      peerIdStr,
      message as IProtoMessage
    );

    if (alreadyReceived) {
      log.info("Message already received, skipping");
      return;
    }

    const { contentTopic } = message;
    const subscriptionCallback = this.subscriptionCallbacks.get(contentTopic);
    if (!subscriptionCallback) {
      log.error("No subscription callback available for ", contentTopic);
      return;
    }
    log.info(
      "Processing message with content topic ",
      contentTopic,
      " on pubsub topic ",
      this.pubsubTopic
    );
    await pushMessage(subscriptionCallback, this.pubsubTopic, message);
  }

  private async subscribeWithPeerVerification(
    peer: Peer,
    contentTopics: string[]
  ): Promise<CoreProtocolResult> {
    const result = await this.protocol.subscribe(
      this.pubsubTopic,
      peer,
      contentTopics
    );

    await this.sendLightPushCheckMessage(peer);
    return result;
  }

  private handleResult(
    results: PromiseSettledResult<CoreProtocolResult>[],
    type: "ping" | "subscribe" | "unsubscribe" | "unsubscribeAll"
  ): SDKProtocolResult {
    const result: SDKProtocolResult = { failures: [], successes: [] };

    for (const promiseResult of results) {
      if (promiseResult.status === "rejected") {
        log.error(
          `Failed to resolve ${type} promise successfully: `,
          promiseResult.reason
        );
        result.failures.push({ error: ProtocolError.GENERIC_FAIL });
      } else {
        const coreResult = promiseResult.value;
        if (coreResult.failure) {
          result.failures.push(coreResult.failure);
        } else {
          result.successes.push(coreResult.success);
        }
      }
    }
    return result;
  }

  private async pingSpecificPeer(peerId: PeerId): Promise<CoreProtocolResult> {
    const peers = await this.peerManager.getPeers();
    const peer = peers.find((p) => p.id.equals(peerId));
    if (!peer) {
      return {
        success: null,
        failure: {
          peerId,
          error: ProtocolError.NO_PEER_AVAILABLE
        }
      };
    }

    let result;
    try {
      result = await this.protocol.ping(peer);
    } catch (error) {
      result = {
        success: null,
        failure: {
          peerId,
          error: ProtocolError.GENERIC_FAIL
        }
      };
    }

    log.info(
      `Received result from filter ping peerId:${peerId.toString()}\tsuccess:${result.success?.toString()}\tfailure:${result.failure?.error}`
    );
    await this.reliabilityMonitor.handlePingResult(peerId, result);
    return result;
  }

  private startSubscriptionsMaintenance(timeout: number): void {
    log.info("Starting subscriptions maintenance");
    this.startKeepAlivePings(timeout);
    this.startConnectionListener();
  }

  private stopSubscriptionsMaintenance(): void {
    log.info("Stopping subscriptions maintenance");
    this.stopKeepAlivePings();
    this.stopConnectionListener();
  }

  private startConnectionListener(): void {
    this.connectionManager.addEventListener(
      EConnectionStateEvents.CONNECTION_STATUS,
      this.connectionListener.bind(this) as (v: CustomEvent<boolean>) => void
    );
  }

  private stopConnectionListener(): void {
    this.connectionManager.removeEventListener(
      EConnectionStateEvents.CONNECTION_STATUS,
      this.connectionListener.bind(this) as (v: CustomEvent<boolean>) => void
    );
  }

  private async connectionListener({
    detail: isConnected
  }: CustomEvent<boolean>): Promise<void> {
    if (!isConnected) {
      this.stopKeepAlivePings();
      return;
    }

    try {
      // we do nothing here, as the renewal process is managed internally by `this.ping()`
      await this.ping();
    } catch (err) {
      log.error(`networkStateListener failed to recover: ${err}`);
    }

    this.startKeepAlivePings(this.keepAliveTimeout);
  }

  private startKeepAlivePings(timeout: number): void {
    if (this.keepAliveInterval) {
      log.info("Recurring pings already set up.");
      return;
    }

    this.keepAliveInterval = setInterval(() => {
      void this.ping();
    }, timeout);
  }

  private stopKeepAlivePings(): void {
    if (!this.keepAliveInterval) {
      log.info("Already stopped recurring pings.");
      return;
    }

    log.info("Stopping recurring pings.");
    clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = null;
  }

  private async sendLightPushCheckMessage(peer: Peer): Promise<void> {
    if (
      this.lightPush &&
      this.libp2p &&
      this.reliabilityMonitor.shouldVerifyPeer(peer.id)
    ) {
      const encoder = createEncoder({
        contentTopic: this.buildLightPushContentTopic(),
        pubsubTopic: this.pubsubTopic,
        ephemeral: true
      });

      const message = { payload: new Uint8Array(1) };
      const protoMessage = await encoder.toProtoObj(message);

      // make a delay to be sure message is send when subscription is in place
      setTimeout(
        (async () => {
          const result = await (this.lightPush!.protocol as LightPushCore).send(
            encoder,
            message,
            peer
          );
          this.reliabilityMonitor.notifyMessageSent(peer.id, protoMessage);
          if (result.failure) {
            log.error(
              `failed to send lightPush ping message to peer:${peer.id.toString()}\t${result.failure.error}`
            );
            return;
          }
        }) as () => void,
        DEFAULT_LIGHT_PUSH_FILTER_CHECK_INTERVAL
      );
    }
  }

  private buildLightPushContentTopic(): string {
    return `/js-waku-subscription-ping/1/${this.libp2p.peerId.toString()}/utf8`;
  }
}

async function pushMessage<T extends IDecodedMessage>(
  subscriptionCallback: SubscriptionCallback<T>,
  pubsubTopic: PubsubTopic,
  message: WakuMessage
): Promise<void> {
  const { decoders, callback } = subscriptionCallback;

  const { contentTopic } = message;
  if (!contentTopic) {
    log.warn("Message has no content topic, skipping");
    return;
  }

  try {
    const decodePromises = decoders.map((dec) =>
      dec
        .fromProtoObj(pubsubTopic, message as IProtoMessage)
        .then((decoded) => decoded || Promise.reject("Decoding failed"))
    );

    const decodedMessage = await Promise.any(decodePromises);

    await callback(decodedMessage);
  } catch (e) {
    log.error("Error decoding message", e);
  }
}
