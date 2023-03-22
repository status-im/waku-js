import {
  GossipSub,
  GossipSubComponents,
  GossipsubMessage,
  GossipsubOpts,
} from "@chainsafe/libp2p-gossipsub";
import type { PeerIdStr, TopicStr } from "@chainsafe/libp2p-gossipsub/types";
import { SignaturePolicy } from "@chainsafe/libp2p-gossipsub/types";
import type {
  ActiveSubscriptions,
  Callback,
  IDecodedMessage,
  IDecoder,
  IEncoder,
  IMessage,
  IRelay,
  ProtocolCreateOptions,
  SendResult,
} from "@waku/interfaces";
import debug from "debug";

import { DefaultPubSubTopic } from "../constants.js";
import { groupByContentTopic } from "../group_by.js";
import { TopicOnlyDecoder } from "../message/topic_only_message.js";

import * as constants from "./constants.js";
import { messageValidator } from "./message_validator.js";

const log = debug("waku:relay");

export type Observer<T extends IDecodedMessage> = {
  decoder: IDecoder<T>;
  callback: Callback<T>;
};

export type RelayCreateOptions = ProtocolCreateOptions & GossipsubOpts;
export type ContentTopic = string;

/**
 * Implements the [Waku v2 Relay protocol](https://rfc.vac.dev/spec/11/).
 * Must be passed as a `pubsub` module to a `Libp2p` instance.
 *
 * @implements {require('libp2p-interfaces/src/pubsub')}
 */
class Relay implements IRelay {
  private readonly pubSubTopic: string;
  private defaultDecoder: IDecoder<IDecodedMessage>;

  public static multicodec: string = constants.RelayCodecs[0];
  public readonly gossipSub: GossipSub;

  /**
   * observers called when receiving new message.
   * Observers under key `""` are always called.
   */
  private observers: Map<ContentTopic, Set<unknown>>;

  constructor(
    components: GossipSubComponents,
    options?: Partial<RelayCreateOptions>
  ) {
    options = Object.assign(options ?? {}, {
      // Ensure that no signature is included nor expected in the messages.
      globalSignaturePolicy: SignaturePolicy.StrictNoSign,
      fallbackToFloodsub: false,
    });

    this.gossipSub = new GossipSub(components, options);
    this.gossipSub.multicodecs = constants.RelayCodecs;

    this.pubSubTopic = options?.pubSubTopic ?? DefaultPubSubTopic;

    this.observers = new Map();

    // TODO: User might want to decide what decoder should be used (e.g. for RLN)
    this.defaultDecoder = new TopicOnlyDecoder();
  }

  /**
   * Mounts the gossipsub protocol onto the libp2p node
   * and subscribes to the default topic.
   *
   * @override
   * @returns {void}
   */
  public async start(): Promise<void> {
    await this.gossipSub.start();
    this.gossipSubSubscribe(this.pubSubTopic);
  }

  /**
   * Send Waku message.
   */
  public async send(encoder: IEncoder, message: IMessage): Promise<SendResult> {
    const msg = await encoder.toWire(message);
    if (!msg) {
      log("Failed to encode message, aborting publish");
      return { recipients: [] };
    }

    return this.gossipSub.publish(this.pubSubTopic, msg);
  }

  /**
   * Add an observer and associated Decoder to process incoming messages on a given content topic.
   *
   * @returns Function to delete the observer
   */
  public subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T>[],
    callback: Callback<T>
  ): () => void {
    const contentTopicToObservers = toObservers(decoders, callback);

    for (const contentTopic of contentTopicToObservers.keys()) {
      const currObservers = this.observers.get(contentTopic) || new Set();
      const newObservers =
        contentTopicToObservers.get(contentTopic) || new Set();

      this.observers.set(contentTopic, union(currObservers, newObservers));
    }

    return () => {
      for (const contentTopic of contentTopicToObservers.keys()) {
        const currentObservers = this.observers.get(contentTopic) || new Set();
        const observersToRemove =
          contentTopicToObservers.get(contentTopic) || new Set();

        this.observers.set(
          contentTopic,
          leftMinusJoin(currentObservers, observersToRemove)
        );
      }
    };
  }

  public unsubscribe(pubSubTopic: TopicStr): void {
    this.gossipSub.unsubscribe(pubSubTopic);
    this.gossipSub.topicValidators.delete(pubSubTopic);
  }

  public getActiveSubscriptions(): ActiveSubscriptions {
    const map = new Map();
    map.set(this.pubSubTopic, this.observers.keys());
    return map;
  }

  public getMeshPeers(topic?: TopicStr): PeerIdStr[] {
    return this.gossipSub.getMeshPeers(topic ?? this.pubSubTopic);
  }

  private async processIncomingMessage<T extends IDecodedMessage>(
    pubSubTopic: string,
    bytes: Uint8Array
  ): Promise<void> {
    const topicOnlyMsg = await this.defaultDecoder.fromWireToProtoObj(bytes);
    if (!topicOnlyMsg || !topicOnlyMsg.contentTopic) {
      log("Message does not have a content topic, skipping");
      return;
    }

    const observers = this.observers.get(topicOnlyMsg.contentTopic) as Set<
      Observer<T>
    >;
    if (!observers) {
      return;
    }
    await Promise.all(
      Array.from(observers).map(async ({ decoder, callback }) => {
        const protoMsg = await decoder.fromWireToProtoObj(bytes);
        if (!protoMsg) {
          log("Internal error: message previously decoded failed on 2nd pass.");
          return;
        }
        const msg = await decoder.fromProtoObj(pubSubTopic, protoMsg);
        if (msg) {
          callback(msg);
        } else {
          log("Failed to decode messages on", topicOnlyMsg.contentTopic);
        }
      })
    );
  }

  /**
   * Subscribe to a pubsub topic and start emitting Waku messages to observers.
   *
   * @override
   */
  private gossipSubSubscribe(pubSubTopic: string): void {
    this.gossipSub.addEventListener(
      "gossipsub:message",
      async (event: CustomEvent<GossipsubMessage>) => {
        if (event.detail.msg.topic !== pubSubTopic) return;
        log(`Message received on ${pubSubTopic}`);

        this.processIncomingMessage(
          event.detail.msg.topic,
          event.detail.msg.data
        ).catch((e) => log("Failed to process incoming message", e));
      }
    );

    this.gossipSub.topicValidators.set(pubSubTopic, messageValidator);
    this.gossipSub.subscribe(pubSubTopic);
  }
}

Relay.multicodec = constants.RelayCodecs[constants.RelayCodecs.length - 1];

export function wakuRelay(
  init: Partial<RelayCreateOptions> = {}
): (components: GossipSubComponents) => IRelay {
  return (components: GossipSubComponents) => new Relay(components, init);
}

function toObservers<T extends IDecodedMessage>(
  decoders: IDecoder<T>[],
  callback: Callback<T>
): Map<ContentTopic, Set<Observer<T>>> {
  const contentTopicToDecoders = Array.from(
    groupByContentTopic(decoders).entries()
  );

  const contentTopicToObserversEntries = contentTopicToDecoders.map(
    ([contentTopic, decoders]) =>
      [
        contentTopic,
        new Set(
          decoders.map(
            (decoder) =>
              ({
                decoder,
                callback,
              } as Observer<T>)
          )
        ),
      ] as [ContentTopic, Set<Observer<T>>]
  );

  return new Map(contentTopicToObserversEntries);
}

function union(left: Set<unknown>, right: Set<unknown>): Set<unknown> {
  for (const val of right.values()) {
    left.add(val);
  }
  return left;
}

function leftMinusJoin(left: Set<unknown>, right: Set<unknown>): Set<unknown> {
  for (const val of right.values()) {
    if (left.has(val)) {
      left.delete(val);
    }
  }
  return left;
}
