import { createDecoder, createEncoder, waitForRemotePeer } from "@waku/core";
import {
  DefaultPubsubTopic,
  ISubscriptionSDK,
  LightNode,
  ProtocolCreateOptions,
  Protocols,
  ShardingParams,
  Waku
} from "@waku/interfaces";
import { createLightNode } from "@waku/sdk";
import {
  contentTopicToPubsubTopic,
  Logger,
  shardInfoToPubsubTopics
} from "@waku/utils";
import { utf8ToBytes } from "@waku/utils/bytes";
import { Context } from "mocha";
import pRetry from "p-retry";

import {
  NOISE_KEY_1,
  ServiceNodesFleet,
  waitForConnections
} from "../../src/index.js";

// Constants for test configuration.
export const log = new Logger("test:filter");
export const TestContentTopic = "/test/1/waku-filter/default";
export const ClusterId = 2;
export const TestShardInfo = {
  contentTopics: [TestContentTopic],
  clusterId: ClusterId
};
export const TestPubsubTopic = contentTopicToPubsubTopic(
  TestContentTopic,
  ClusterId
);
export const TestEncoder = createEncoder({
  contentTopic: TestContentTopic,
  pubsubTopic: TestPubsubTopic
});
export const TestDecoder = createDecoder(TestContentTopic, TestPubsubTopic);
export const messageText = "Filtering works!";
export const messagePayload = { payload: utf8ToBytes(messageText) };

// Utility to validate errors related to pings in the subscription.
export async function validatePingError(
  subscription: ISubscriptionSDK
): Promise<void> {
  try {
    const { failures, successes } = await subscription.ping();
    if (failures.length === 0 || successes.length > 0) {
      throw new Error(
        "Ping was successful but was expected to fail with a specific error."
      );
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("peer has no subscriptions")
    ) {
      return;
    } else {
      throw err;
    }
  }
}

export async function runMultipleNodes(
  context: Context,
  shardInfo?: ShardingParams,
  strictChecking: boolean = false,
  numServiceNodes = 3,
  withoutFilter = false
): Promise<[ServiceNodesFleet, LightNode]> {
  const pubsubTopics = shardInfo
    ? shardInfoToPubsubTopics(shardInfo)
    : [DefaultPubsubTopic];
  // create numServiceNodes nodes
  const serviceNodes = await ServiceNodesFleet.createAndRun(
    context,
    pubsubTopics,
    numServiceNodes,
    strictChecking,
    shardInfo,
    undefined,
    withoutFilter
  );

  const waku_options: ProtocolCreateOptions = {
    staticNoiseKey: NOISE_KEY_1,
    libp2p: {
      addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] }
    }
  };

  if (shardInfo) {
    waku_options.shardInfo = shardInfo;
  } else {
    waku_options.pubsubTopics = pubsubTopics;
  }

  log.info("Starting js waku node with :", JSON.stringify(waku_options));
  let waku: LightNode | undefined;
  try {
    waku = await createLightNode(waku_options);
    await waku.start();
  } catch (error) {
    log.error("jswaku node failed to start:", error);
  }

  if (!waku) {
    throw new Error("Failed to initialize waku");
  }

  for (const node of serviceNodes.nodes) {
    await waku.dial(await node.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.Filter, Protocols.LightPush]);
    await node.ensureSubscriptions(pubsubTopics);

    const wakuConnections = waku.libp2p.getConnections();
    const nodePeers = await node.peers();

    if (wakuConnections.length < 1 || nodePeers.length < 1) {
      throw new Error(
        `Expected at least 1 peer in each node. Got waku connections: ${wakuConnections.length} and service nodes: ${nodePeers.length}`
      );
    }
  }

  await waitForConnections(numServiceNodes, waku);

  return [serviceNodes, waku];
}

export async function teardownNodesWithRedundancy(
  serviceNodes: ServiceNodesFleet,
  wakuNodes: Waku | Waku[]
): Promise<void> {
  const wNodes = Array.isArray(wakuNodes) ? wakuNodes : [wakuNodes];

  const stopNwakuNodes = serviceNodes.nodes.map(async (node) => {
    await pRetry(
      async () => {
        try {
          await node.stop();
        } catch (error) {
          log.error("Service Node failed to stop:", error);
          throw error;
        }
      },
      { retries: 3 }
    );
  });

  const stopWakuNodes = wNodes.map(async (waku) => {
    if (waku) {
      await pRetry(
        async () => {
          try {
            await waku.stop();
          } catch (error) {
            log.error("Waku failed to stop:", error);
            throw error;
          }
        },
        { retries: 3 }
      );
    }
  });

  await Promise.all([...stopNwakuNodes, ...stopWakuNodes]);
}
