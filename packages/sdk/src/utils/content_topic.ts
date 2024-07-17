import type { Multiaddr } from "@multiformats/multiaddr";
import { createDecoder, DecodedMessage, waitForRemotePeer } from "@waku/core";
import {
  Callback,
  IDecoder,
  ISubscriptionSDK,
  LightNode,
  Protocols
} from "@waku/interfaces";
import {
  contentTopicToPubsubTopic,
  shardInfoToPubsubTopics
} from "@waku/utils";

import { createLightNode } from "../create/index.js";

interface CreateTopicOptions {
  waku?: LightNode;
  peer: Multiaddr;
}

// Given a Waku node, peer Multiaddr, and content topic, creates a decoder and
// subscription for that content topic.
async function prepareSubscription(
  waku: LightNode,
  contentTopic: string,
  peer: Multiaddr
): Promise<{
  decoder: IDecoder<DecodedMessage>;
  subscription: ISubscriptionSDK;
}> {
  // Validate that the Waku node matches assumptions
  if (!waku.filter) {
    throw new Error("Filter protocol missing from Waku node");
  }
  const { shardInfo } = waku.libp2p.components.metadata;
  if (!shardInfo) {
    throw new Error("Shard info missing from Waku node.");
  }

  // Validate content topic and ensure node is configured for its corresponding pubsub topic
  const pubsubTopics = shardInfoToPubsubTopics(shardInfo);
  const pubsubTopic = contentTopicToPubsubTopic(contentTopic);
  if (!pubsubTopics.includes(pubsubTopic))
    throw new Error(
      "Content topic does not match any pubsub topic in shard info."
    );

  await waku.dial(peer);
  await waitForRemotePeer(waku, [Protocols.Filter]);

  // Create decoder and subscription
  let decoder = createDecoder(contentTopic, pubsubTopic);
  if (decoder) decoder = decoder ?? decoder;
  const { subscription, error } =
    await waku.filter.createSubscription(pubsubTopic);
  if (error)
    throw new Error("Failed to create subscription for content topic.");

  return { decoder, subscription };
}

/**
 * Creates a subscription and streams all new messages for a content topic.
 * Will create a light node configured for the content topic with default settings if a node is not provided in `opts`.
 * Assumes node is using autosharding.
 * @param contentTopic
 * @param opts
 */
export async function streamContentTopic(
  contentTopic: string,
  opts: CreateTopicOptions
): Promise<[ReadableStream<DecodedMessage>, LightNode]> {
  opts.waku =
    opts.waku ??
    (await createLightNode({
      shardInfo: { contentTopics: [contentTopic] }
    }));
  const { decoder, subscription } = await prepareSubscription(
    opts.waku,
    contentTopic,
    opts.peer
  );

  // Create a ReadableStream that receives any messages for the content topic
  const messageStream = new ReadableStream<DecodedMessage>({
    async start(controller) {
      await subscription.subscribe(decoder, (message) => {
        controller.enqueue(message);
      });
    },
    async cancel() {
      await subscription.unsubscribe([contentTopic]);
    }
  });

  return [messageStream, opts.waku];
}

/**
 * Subscribes to new messages for a content topic via callback function.
 * Will create a light node configured for the content topic with default settings if a node is not provided in `opts`.
 * Assumes node is using autosharding.
 * @param contentTopic
 * @param callback Called every time a new message is received on the content topic
 * @param opts
 */
export async function subscribeToContentTopic(
  contentTopic: string,
  callback: Callback<DecodedMessage>,
  opts: CreateTopicOptions
): Promise<{ subscription: ISubscriptionSDK; waku: LightNode }> {
  opts.waku =
    opts.waku ??
    (await createLightNode({
      shardInfo: { contentTopics: [contentTopic] }
    }));
  const { decoder, subscription } = await prepareSubscription(
    opts.waku,
    contentTopic,
    opts.peer
  );
  await subscription.subscribe(decoder, callback);
  return { subscription, waku: opts.waku };
}
