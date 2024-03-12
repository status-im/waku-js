import { Stream } from "@libp2p/interface";
import type { Peer } from "@libp2p/interface";
import type { IncomingStreamData } from "@libp2p/interface-internal";
import type {
  Callback,
  ContentTopic,
  IAsyncIterator,
  IDecodedMessage,
  IDecoder,
  IFilter,
  IProtoMessage,
  IReceiver,
  Libp2p,
  ProtocolCreateOptions,
  PubsubTopic,
  SingleShardInfo,
  Unsubscribe
} from "@waku/interfaces";
import { DefaultPubsubTopic } from "@waku/interfaces";
import { messageHashStr } from "@waku/message-hash";
import { WakuMessage } from "@waku/proto";
import {
  ensurePubsubTopicIsConfigured,
  groupByContentTopic,
  singleShardInfoToPubsubTopic,
  toAsyncIterator
} from "@waku/utils";
import { Logger } from "@waku/utils";
import all from "it-all";
import * as lp from "it-length-prefixed";
import { pipe } from "it-pipe";

import { BaseProtocol } from "../base_protocol.js";

import {
  FilterPushRpc,
  FilterSubscribeResponse,
  FilterSubscribeRpc
} from "./filter_rpc.js";

const log = new Logger("filter:v2");

type SubscriptionCallback<T extends IDecodedMessage> = {
  decoders: IDecoder<T>[];
  callback: Callback<T>;
};

export const FilterCodecs = {
  SUBSCRIBE: "/vac/waku/filter-subscribe/2.0.0-beta1",
  PUSH: "/vac/waku/filter-push/2.0.0-beta1"
};

/**
 * A subscription object refers to a subscription to a given pubsub topic.
 */
class Subscription {
  readonly peers: Peer[];
  private readonly pubsubTopic: PubsubTopic;
  private newStream: (peer: Peer) => Promise<Stream>;
  readonly receivedMessagesHashStr: string[] = [];

  private subscriptionCallbacks: Map<
    ContentTopic,
    SubscriptionCallback<IDecodedMessage>
  >;

  constructor(
    pubsubTopic: PubsubTopic,
    remotePeers: Peer[],
    newStream: (peer: Peer) => Promise<Stream>
  ) {
    this.peers = remotePeers;
    this.pubsubTopic = pubsubTopic;
    this.newStream = newStream;
    this.subscriptionCallbacks = new Map();
  }

  async subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>
  ): Promise<void> {
    const decodersArray = Array.isArray(decoders) ? decoders : [decoders];

    // check that all decoders are configured for the same pubsub topic as this subscription
    decodersArray.forEach((decoder) => {
      if (decoder.pubsubTopic !== this.pubsubTopic) {
        throw new Error(
          `Pubsub topic not configured: decoder is configured for pubsub topic ${decoder.pubsubTopic} but this subscription is for pubsub topic ${this.pubsubTopic}. Please create a new Subscription for the different pubsub topic.`
        );
      }
    });

    const decodersGroupedByCT = groupByContentTopic(decodersArray);
    const contentTopics = Array.from(decodersGroupedByCT.keys());

    const promises = this.peers.map(async (peer) => {
      const stream = await this.newStream(peer);

      const request = FilterSubscribeRpc.createSubscribeRequest(
        this.pubsubTopic,
        contentTopics
      );

      try {
        const res = await pipe(
          [request.encode()],
          lp.encode,
          stream,
          lp.decode,
          async (source) => await all(source)
        );

        if (!res?.[0]) {
          throw Error(
            `No response received for request ${request.requestId}: ${res}`
          );
        }

        const { statusCode, requestId, statusDesc } =
          FilterSubscribeResponse.decode(res[0].slice());

        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(
            `Filter subscribe request ${requestId} failed with status code ${statusCode}: ${statusDesc}`
          );
        }

        log.info(
          "Subscribed to peer ",
          peer.id.toString(),
          "for content topics",
          contentTopics
        );
      } catch (e) {
        throw new Error(
          "Error subscribing to peer: " +
            peer.id.toString() +
            " for content topics: " +
            contentTopics +
            ": " +
            e
        );
      }
    });

    const results = await Promise.allSettled(promises);

    this.handleErrors(results, "subscribe");

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

      // The callback and decoder may override previous values, this is on
      // purpose as the user may call `subscribe` to refresh the subscription
      this.subscriptionCallbacks.set(contentTopic, subscriptionCallback);
    });
  }

  async unsubscribe(contentTopics: ContentTopic[]): Promise<void> {
    const promises = this.peers.map(async (peer) => {
      const stream = await this.newStream(peer);
      const unsubscribeRequest = FilterSubscribeRpc.createUnsubscribeRequest(
        this.pubsubTopic,
        contentTopics
      );

      try {
        await pipe([unsubscribeRequest.encode()], lp.encode, stream.sink);
      } catch (error) {
        throw new Error("Error unsubscribing: " + error);
      }

      contentTopics.forEach((contentTopic: string) => {
        this.subscriptionCallbacks.delete(contentTopic);
      });
    });

    const results = await Promise.allSettled(promises);

    this.handleErrors(results, "unsubscribe");
  }

  async ping(): Promise<void> {
    const promises = this.peers.map(async (peer) => {
      const stream = await this.newStream(peer);

      const request = FilterSubscribeRpc.createSubscriberPingRequest();

      try {
        const res = await pipe(
          [request.encode()],
          lp.encode,
          stream,
          lp.decode,
          async (source) => await all(source)
        );

        if (!res?.[0]) {
          throw Error(
            `No response received for request ${request.requestId}: ${res}`
          );
        }

        const { statusCode, requestId, statusDesc } =
          FilterSubscribeResponse.decode(res[0].slice());

        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(
            `Filter ping request ${requestId} failed with status code ${statusCode}: ${statusDesc}`
          );
        }
        log.info(`Ping successful for peer ${peer.id.toString()}`);
      } catch (error) {
        log.error("Error pinging: ", error);
        throw error; // Rethrow the actual error instead of wrapping it
      }
    });

    const results = await Promise.allSettled(promises);

    this.handleErrors(results, "ping");
  }

  async unsubscribeAll(): Promise<void> {
    const promises = this.peers.map(async (peer) => {
      const stream = await this.newStream(peer);

      const request = FilterSubscribeRpc.createUnsubscribeAllRequest(
        this.pubsubTopic
      );

      try {
        const res = await pipe(
          [request.encode()],
          lp.encode,
          stream,
          lp.decode,
          async (source) => await all(source)
        );

        if (!res?.[0]) {
          throw Error(
            `No response received for request ${request.requestId}: ${res}`
          );
        }

        const { statusCode, requestId, statusDesc } =
          FilterSubscribeResponse.decode(res[0].slice());

        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(
            `Filter unsubscribe all request ${requestId} failed with status code ${statusCode}: ${statusDesc}`
          );
        }

        this.subscriptionCallbacks.clear();
        log.info(
          `Unsubscribed from all content topics for pubsub topic ${this.pubsubTopic}`
        );
      } catch (error) {
        throw new Error(
          "Error unsubscribing from all content topics: " + error
        );
      }
    });

    const results = await Promise.allSettled(promises);

    this.handleErrors(results, "unsubscribeAll");
  }

  async processMessage(message: WakuMessage): Promise<void> {
    const hashedMessageStr = messageHashStr(
      this.pubsubTopic,
      message as IProtoMessage
    );
    if (this.receivedMessagesHashStr.includes(hashedMessageStr)) {
      log.info("Message already received, skipping");
      return;
    }
    this.receivedMessagesHashStr.push(hashedMessageStr);

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

  // Filter out only the rejected promises and extract & handle their reasons
  private handleErrors(
    results: PromiseSettledResult<void>[],
    type: "ping" | "subscribe" | "unsubscribe" | "unsubscribeAll"
  ): void {
    const errors = results
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      )
      .map((rejectedResult) => rejectedResult.reason);

    if (errors.length === this.peers.length) {
      const errorCounts = new Map<string, number>();
      // TODO: streamline error logging with https://github.com/orgs/waku-org/projects/2/views/1?pane=issue&itemId=42849952
      errors.forEach((error) => {
        const message = error instanceof Error ? error.message : String(error);
        errorCounts.set(message, (errorCounts.get(message) || 0) + 1);
      });

      const uniqueErrorMessages = Array.from(
        errorCounts,
        ([message, count]) => `${message} (occurred ${count} times)`
      ).join(", ");
      throw new Error(`Error ${type} all peers: ${uniqueErrorMessages}`);
    } else if (errors.length > 0) {
      // TODO: handle renewing faulty peers with new peers (https://github.com/waku-org/js-waku/issues/1463)
      log.warn(
        `Some ${type} failed. These will be refreshed with new peers`,
        errors
      );
    } else {
      log.info(`${type} successful for all peers`);
    }
  }
}

const DEFAULT_NUM_PEERS = 3;

class Filter extends BaseProtocol implements IReceiver {
  private activeSubscriptions = new Map<string, Subscription>();

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

  //TODO: Remove when FilterCore and FilterSDK are introduced
  private readonly numPeersToUse: number;

  constructor(libp2p: Libp2p, options?: ProtocolCreateOptions) {
    super(
      FilterCodecs.SUBSCRIBE,
      libp2p.components,
      log,
      options!.pubsubTopics!,
      options
    );

    this.numPeersToUse = options?.numPeersToUse ?? DEFAULT_NUM_PEERS;

    libp2p.handle(FilterCodecs.PUSH, this.onRequest.bind(this)).catch((e) => {
      log.error("Failed to register ", FilterCodecs.PUSH, e);
    });

    this.activeSubscriptions = new Map();
  }

  /**
   * Creates a new subscription to the given pubsub topic.
   * The subscription is made to multiple peers for decentralization.
   * @param pubsubTopicShardInfo The pubsub topic to subscribe to.
   * @returns The subscription object.
   */
  async createSubscription(
    pubsubTopicShardInfo: SingleShardInfo | PubsubTopic = DefaultPubsubTopic
  ): Promise<Subscription> {
    const pubsubTopic =
      typeof pubsubTopicShardInfo == "string"
        ? pubsubTopicShardInfo
        : singleShardInfoToPubsubTopic(pubsubTopicShardInfo);

    ensurePubsubTopicIsConfigured(pubsubTopic, this.pubsubTopics);

    const peers = await this.getPeers({
      maxBootstrapPeers: 1,
      numPeers: this.numPeersToUse
    });
    if (peers.length === 0) {
      throw new Error("No peer found to initiate subscription.");
    }

    log.info(
      `Creating filter subscription with ${peers.length} peers: `,
      peers.map((peer) => peer.id.toString())
    );

    const subscription =
      this.getActiveSubscription(pubsubTopic) ??
      this.setActiveSubscription(
        pubsubTopic,
        new Subscription(pubsubTopic, peers, this.getStream.bind(this))
      );

    return subscription;
  }

  public toSubscriptionIterator<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[]
  ): Promise<IAsyncIterator<T>> {
    return toAsyncIterator(this, decoders);
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
  async subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>
  ): Promise<Unsubscribe> {
    const subscription = await this.createSubscription();

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

  private onRequest(streamData: IncomingStreamData): void {
    const { connection, stream } = streamData;
    const { remotePeer } = connection;
    log.info(`Received message from ${remotePeer.toString()}`);
    try {
      pipe(stream, lp.decode, async (source) => {
        for await (const bytes of source) {
          const response = FilterPushRpc.decode(bytes.slice());

          const { pubsubTopic, wakuMessage } = response;

          if (!wakuMessage) {
            log.error("Received empty message");
            return;
          }

          if (!pubsubTopic) {
            log.error("Pubsub topic missing from push message");
            return;
          }

          const subscription = this.getActiveSubscription(pubsubTopic);

          if (!subscription) {
            log.error(
              `No subscription locally registered for topic ${pubsubTopic}`
            );
            return;
          }

          await subscription.processMessage(wakuMessage);
        }
      }).then(
        () => {
          log.info("Receiving pipe closed.");
        },
        (e) => {
          log.error("Error with receiving pipe", e);
        }
      );
    } catch (e) {
      log.error("Error decoding message", e);
    }
  }
}

export function wakuFilter(
  init: ProtocolCreateOptions = { pubsubTopics: [] }
): (libp2p: Libp2p) => IFilter {
  return (libp2p: Libp2p) => new Filter(libp2p, init);
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
