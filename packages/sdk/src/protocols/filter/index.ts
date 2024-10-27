import { ConnectionManager, FilterCore } from "@waku/core";
import type {
  Callback,
  CreateSubscriptionResult,
  FilterProtocolOptions,
  IAsyncIterator,
  IDecodedMessage,
  IDecoder,
  IFilter,
  ILightPush,
  IProtoMessage,
  Libp2p,
  PubsubTopic,
  SubscribeResult,
  Unsubscribe
} from "@waku/interfaces";
import { NetworkConfig, ProtocolError } from "@waku/interfaces";
import {
  ensurePubsubTopicIsConfigured,
  groupByContentTopic,
  Logger,
  shardInfoToPubsubTopics,
  toAsyncIterator
} from "@waku/utils";

import { PeerManager } from "../peer_manager.js";

import { MessageCache } from "./message_cache.js";
import { Subscription } from "./subscription.js";
import { buildConfig } from "./utils.js";

const log = new Logger("sdk:filter");

class Filter implements IFilter {
  public readonly protocol: FilterCore;

  private readonly config: FilterProtocolOptions;
  private readonly messageCache: MessageCache;
  private activeSubscriptions = new Map<string, Subscription>();

  public constructor(
    private connectionManager: ConnectionManager,
    private libp2p: Libp2p,
    private peerManager: PeerManager,
    private lightPush?: ILightPush,
    config?: Partial<FilterProtocolOptions>
  ) {
    this.config = buildConfig(config);
    this.messageCache = new MessageCache(libp2p);

    this.protocol = new FilterCore(
      async (pubsubTopic, wakuMessage, peerIdStr) => {
        const subscription = this.getActiveSubscription(pubsubTopic);
        if (!subscription) {
          log.error(
            `No subscription locally registered for topic ${pubsubTopic}`
          );
          return;
        }

        if (this.messageCache.has(pubsubTopic, wakuMessage as IProtoMessage)) {
          log.info(
            `Skipping duplicate message for pubsubTopic:${pubsubTopic} peerId:${peerIdStr}`
          );
          return;
        }

        this.messageCache.set(pubsubTopic, wakuMessage as IProtoMessage);
        await subscription.processIncomingMessage(wakuMessage, peerIdStr);
      },

      connectionManager.pubsubTopics,
      libp2p
    );

    this.activeSubscriptions = new Map();
  }

  /**
   * Opens a subscription with the Filter protocol using the provided decoders and callback.
   * This method combines the functionality of creating a subscription and subscribing to it.
   *
   * @param {IDecoder<T> | IDecoder<T>[]} decoders - A single decoder or an array of decoders to use for decoding messages.
   * @param {Callback<T>} callback - The callback function to be invoked with decoded messages.
   *
   * @returns {Promise<SubscribeResult>} A promise that resolves to an object containing:
   *   - subscription: The created subscription object if successful, or null if failed.
   *   - error: A ProtocolError if the subscription creation failed, or null if successful.
   *   - results: An object containing arrays of failures and successes from the subscription process.
   *     Only present if the subscription was created successfully.
   *
   * @throws {Error} If there's an unexpected error during the subscription process.
   *
   * @remarks
   * This method attempts to create a subscription using the pubsub topic derived from the provided decoders,
   * then tries to subscribe using the created subscription. The return value should be interpreted as follows:
   * - If `subscription` is null and `error` is non-null, a critical error occurred and the subscription failed completely.
   * - If `subscription` is non-null and `error` is null, the subscription was created successfully.
   *   In this case, check the `results` field for detailed information about successes and failures during the subscription process.
   * - Even if the subscription was created successfully, there might be some failures in the results.
   *
   * @example
   * ```typescript
   * const {subscription, error, results} = await waku.filter.subscribe(decoders, callback);
   * if (!subscription || error) {
   *   console.error("Failed to create subscription:", error);
   * }
   * console.log("Subscription created successfully");
   * if (results.failures.length > 0) {
   *   console.warn("Some errors occurred during subscription:", results.failures);
   * }
   * console.log("Successful subscriptions:", results.successes);
   *
   * ```
   */
  public async subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>
  ): Promise<SubscribeResult> {
    const uniquePubsubTopics = this.getUniquePubsubTopics(decoders);

    if (uniquePubsubTopics.length !== 1) {
      return {
        subscription: null,
        error: ProtocolError.INVALID_DECODER_TOPICS,
        results: null
      };
    }

    const pubsubTopic = uniquePubsubTopics[0];

    const { subscription, error } = await this.createSubscription(pubsubTopic);

    if (error) {
      return {
        subscription: null,
        error: error,
        results: null
      };
    }

    const { failures, successes } = await subscription.subscribe(
      decoders,
      callback
    );
    return {
      subscription,
      error: null,
      results: {
        failures: failures,
        successes: successes
      }
    };
  }

  /**
   * Creates a new subscription to the given pubsub topic.
   * The subscription is made to multiple peers for decentralization.
   * @param pubsubTopicShardInfo The pubsub topic to subscribe to.
   * @returns The subscription object.
   */
  private async createSubscription(
    pubsubTopicShardInfo: NetworkConfig | PubsubTopic
  ): Promise<CreateSubscriptionResult> {
    const pubsubTopic =
      typeof pubsubTopicShardInfo == "string"
        ? pubsubTopicShardInfo
        : shardInfoToPubsubTopics(pubsubTopicShardInfo)?.[0];

    ensurePubsubTopicIsConfigured(pubsubTopic, this.protocol.pubsubTopics);

    const peers = await this.peerManager.getPeers();
    if (peers.length === 0) {
      return {
        error: ProtocolError.NO_PEER_AVAILABLE,
        subscription: null
      };
    }

    log.info(
      `Creating filter subscription with ${peers.length} peers: `,
      peers.map((peer) => peer.id.toString())
    );

    const subscription =
      this.getActiveSubscription(pubsubTopic) ??
      this.setActiveSubscription(
        pubsubTopic,
        new Subscription(
          pubsubTopic,
          this.protocol,
          this.connectionManager,
          this.peerManager,
          this.libp2p,
          this.config,
          this.lightPush
        )
      );

    return {
      error: null,
      subscription
    };
  }

  /**
   * This method is used to satisfy the `IReceiver` interface.
   *
   * @hidden
   *
   * @param decoders The decoders to use for the subscription.
   * @param callback The callback function to use for the subscription.
   * @param opts Optional protocol options for the subscription.
   *
   * @returns A Promise that resolves to a function that unsubscribes from the subscription.
   *
   * @remarks
   * This method should not be used directly.
   * Instead, use `createSubscription` to create a new subscription.
   */
  public async subscribeWithUnsubscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>
  ): Promise<Unsubscribe> {
    const uniquePubsubTopics = this.getUniquePubsubTopics<T>(decoders);

    if (uniquePubsubTopics.length === 0) {
      throw Error(
        "Failed to subscribe: no pubsubTopic found on decoders provided."
      );
    }

    if (uniquePubsubTopics.length > 1) {
      throw Error(
        "Failed to subscribe: all decoders should have the same pubsub topic. Use createSubscription to be more agile."
      );
    }

    const { subscription, error } = await this.createSubscription(
      uniquePubsubTopics[0]
    );

    if (error) {
      throw Error(`Failed to create subscription: ${error}`);
    }

    await subscription.subscribe(decoders, callback);

    const contentTopics = Array.from(
      groupByContentTopic(
        Array.isArray(decoders) ? decoders : [decoders]
      ).keys()
    );

    return async () => {
      await subscription.unsubscribe(contentTopics);
    };
  }

  public toSubscriptionIterator<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[]
  ): Promise<IAsyncIterator<T>> {
    return toAsyncIterator(this, decoders);
  }

  private getActiveSubscription(
    pubsubTopic: PubsubTopic
  ): Subscription | undefined {
    return this.activeSubscriptions.get(pubsubTopic);
  }

  private setActiveSubscription(
    pubsubTopic: PubsubTopic,
    subscription: Subscription
  ): Subscription {
    this.activeSubscriptions.set(pubsubTopic, subscription);
    return subscription;
  }

  private getUniquePubsubTopics<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[]
  ): string[] {
    if (!Array.isArray(decoders)) {
      return [decoders.pubsubTopic];
    }

    if (decoders.length === 0) {
      return [];
    }

    const pubsubTopics = new Set(decoders.map((d) => d.pubsubTopic));

    return [...pubsubTopics];
  }
}

export function wakuFilter(
  connectionManager: ConnectionManager,
  peerManager: PeerManager,
  lightPush?: ILightPush,
  config?: Partial<FilterProtocolOptions>
): (libp2p: Libp2p) => IFilter {
  return (libp2p: Libp2p) =>
    new Filter(connectionManager, libp2p, peerManager, lightPush, config);
}
