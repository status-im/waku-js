import { ConnectionManager, createDecoder, FilterCore } from "@waku/core";
import {
  type Callback,
  type ContentTopic,
  type CoreProtocolResult,
  FilterProtocolOptions,
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
  SubscriptionCallback
} from "@waku/interfaces";
import { WakuMessage } from "@waku/proto";
import { groupByContentTopic, Logger } from "@waku/utils";

import { PeerManager } from "../peer_manager.js";

import { SubscriptionMonitor } from "./subscription_monitor.js";

const log = new Logger("sdk:filter:subscription");

export class Subscription implements ISubscription {
  private readonly monitor: SubscriptionMonitor;

  private subscriptionCallbacks: Map<
    ContentTopic,
    SubscriptionCallback<IDecodedMessage>
  > = new Map();

  public constructor(
    private readonly pubsubTopic: PubsubTopic,
    private readonly protocol: FilterCore,
    connectionManager: ConnectionManager,
    peerManager: PeerManager,
    libp2p: Libp2p,
    private readonly config: FilterProtocolOptions,
    lightPush?: ILightPush
  ) {
    this.pubsubTopic = pubsubTopic;

    this.monitor = new SubscriptionMonitor({
      pubsubTopic,
      config,
      libp2p,
      connectionManager,
      filter: protocol,
      peerManager,
      lightPush,
      activeSubscriptions: this.subscriptionCallbacks
    });
  }

  public async subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>
  ): Promise<SDKProtocolResult> {
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

    if (this.config.enableLightPushFilterCheck) {
      decodersArray.push(
        createDecoder(
          this.monitor.reservedContentTopic,
          this.pubsubTopic
        ) as IDecoder<T>
      );
    }

    const decodersGroupedByCT = groupByContentTopic(decodersArray);
    const contentTopics = Array.from(decodersGroupedByCT.keys());

    const peers = await this.monitor.getPeers();
    const promises = peers.map(async (peer) => {
      return this.protocol.subscribe(this.pubsubTopic, peer, contentTopics);
    });

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
      if (contentTopic === this.monitor.reservedContentTopic) {
        return;
      }

      // The callback and decoder may override previous values, this is on
      // purpose as the user may call `subscribe` to refresh the subscription
      this.subscriptionCallbacks.set(contentTopic, subscriptionCallback);
    });

    this.monitor.start();

    return finalResult;
  }

  public async unsubscribe(
    contentTopics: ContentTopic[]
  ): Promise<SDKProtocolResult> {
    const peers = await this.monitor.getPeers();
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
      this.monitor.stop();
    }

    return finalResult;
  }

  public async ping(): Promise<SDKProtocolResult> {
    const peers = await this.monitor.getPeers();
    const promises = peers.map((peer) => this.protocol.ping(peer));

    const results = await Promise.allSettled(promises);
    return this.handleResult(results, "ping");
  }

  public async unsubscribeAll(): Promise<SDKProtocolResult> {
    const peers = await this.monitor.getPeers();
    const promises = peers.map(async (peer) =>
      this.protocol.unsubscribeAll(this.pubsubTopic, peer)
    );

    const results = await Promise.allSettled(promises);

    this.subscriptionCallbacks.clear();

    const finalResult = this.handleResult(results, "unsubscribeAll");

    this.monitor.stop();

    return finalResult;
  }

  public async processIncomingMessage(
    message: WakuMessage,
    peerIdStr: PeerIdStr
  ): Promise<void> {
    const received = this.monitor.notifyMessageReceived(
      peerIdStr,
      message as IProtoMessage
    );

    if (received) {
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
