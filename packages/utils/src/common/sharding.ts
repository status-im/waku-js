import { sha256 } from "@noble/hashes/sha256";
import {
  DEFAULT_CLUSTER_ID,
  DefaultPubsubTopic,
  PubsubTopic,
  ShardInfo,
  ShardingParams,
  SingleShardInfo
} from "@waku/interfaces";

import { concat, utf8ToBytes } from "../bytes/index.js";

export const singleShardInfoToPubsubTopic = (
  shardInfo: SingleShardInfo
): PubsubTopic => {
  if (shardInfo.clusterId === undefined || shardInfo.shard === undefined)
    throw new Error("Invalid shard");

  return `/waku/2/rs/${shardInfo.clusterId}/${shardInfo.shard}`;
};

export const shardInfoToPubsubTopics = (
  shardInfo: Partial<ShardingParams>
): PubsubTopic[] => {
  if ("contentTopics" in shardInfo && shardInfo.contentTopics) {
    // Autosharding: explicitly defined content topics
    return Array.from(
      new Set(
        shardInfo.contentTopics.map((contentTopic) =>
          contentTopicToPubsubTopic(contentTopic, shardInfo.clusterId)
        )
      )
    );
  } else if ("shards" in shardInfo) {
    // Static sharding
    if (shardInfo.shards === undefined) throw new Error("Invalid shard");
    return Array.from(
      new Set(
        shardInfo.shards.map(
          (index) =>
            `/waku/2/rs/${shardInfo.clusterId ?? DEFAULT_CLUSTER_ID}/${index}`
        )
      )
    );
  } else if ("application" in shardInfo && "version" in shardInfo) {
    // Autosharding: single shard from application and version
    return [
      contentTopicToPubsubTopic(
        `/${shardInfo.application}/${shardInfo.version}/default/default`
      )
    ];
  } else {
    throw new Error("Missing required configuration in shard parameters");
  }
};

export const pubsubTopicToSingleShardInfo = (
  pubsubTopics: PubsubTopic
): SingleShardInfo => {
  const parts = pubsubTopics.split("/");

  if (
    parts.length !== 6 ||
    parts[1] !== "waku" ||
    parts[2] !== "2" ||
    parts[3] !== "rs"
  )
    throw new Error("Invalid pubsub topic");

  const clusterId = parseInt(parts[4] as string);
  const shard = parseInt(parts[5] as string);

  if (isNaN(clusterId) || isNaN(shard))
    throw new Error("Invalid clusterId or shard");

  return {
    clusterId,
    shard
  };
};

//TODO: move part of BaseProtocol instead of utils
// return `SendError.TOPIC_NOT_CONFIGURED` instead of throwing
export function ensurePubsubTopicIsConfigured(
  pubsubTopic: PubsubTopic,
  configuredTopics: PubsubTopic[]
): void {
  if (!configuredTopics.includes(pubsubTopic)) {
    throw new Error(
      `Pubsub topic ${pubsubTopic} has not been configured on this instance. Configured topics are: ${configuredTopics}. Please update your configuration by passing in the topic during Waku node instantiation.`
    );
  }
}

interface ContentTopic {
  generation: number;
  application: string;
  version: string;
  topicName: string;
  encoding: string;
}

/**
 * Given a string, will throw an error if it is not formatted as a valid content topic for autosharding based on https://rfc.vac.dev/spec/51/
 * @param contentTopic String to validate
 * @returns Object with each content topic field as an attribute
 */
export function ensureValidContentTopic(contentTopic: string): ContentTopic {
  const parts = contentTopic.split("/");
  if (parts.length < 5 || parts.length > 6) {
    throw Error("Content topic format is invalid");
  }
  // Validate generation field if present
  let generation = 0;
  if (parts.length == 6) {
    generation = parseInt(parts[1] as string);
    if (isNaN(generation)) {
      throw new Error("Invalid generation field in content topic");
    }
    if (generation > 0) {
      throw new Error("Generation greater than 0 is not supported");
    }
  }
  // Validate remaining fields
  const fields = parts.splice(-4);

  const application = fields[0];
  if (!application || application?.length == 0) {
    throw new Error("Application field cannot be empty");
  }

  const version = fields[1];
  if (!version || version?.length == 0) {
    throw new Error("Version field cannot be empty");
  }

  const topicName = fields[2];
  if (!topicName || topicName?.length == 0) {
    throw new Error("Topic name field cannot be empty");
  }

  const encoding = fields[3];
  if (!encoding || encoding?.length == 0) {
    throw new Error("Encoding field cannot be empty");
  }

  return {
    generation,
    application,
    version,
    topicName,
    encoding
  };
}

/**
 * Given a string, determines which autoshard index to use for its pubsub topic.
 * Based on the algorithm described in the RFC: https://rfc.vac.dev/spec/51//#algorithm
 */
export function contentTopicToShardIndex(
  contentTopic: string,
  networkShards: number = 8
): number {
  const { application, version } = ensureValidContentTopic(contentTopic);
  const digest = sha256(
    concat([utf8ToBytes(application), utf8ToBytes(version)])
  );
  const dataview = new DataView(digest.buffer.slice(-8));
  return Number(dataview.getBigUint64(0, false) % BigInt(networkShards));
}

export function contentTopicToPubsubTopic(
  contentTopic: string,
  clusterId: number = DEFAULT_CLUSTER_ID,
  networkShards: number = 8
): string {
  const shardIndex = contentTopicToShardIndex(contentTopic, networkShards);
  return `/waku/2/rs/${clusterId}/${shardIndex}`;
}

/**
 * Given an array of content topics, groups them together by their Pubsub topic as derived using the algorithm for autosharding.
 * If any of the content topics are not properly formatted, the function will throw an error.
 */
export function contentTopicsByPubsubTopic(
  contentTopics: string[],
  clusterId: number = DEFAULT_CLUSTER_ID,
  networkShards: number = 8
): Map<string, Array<string>> {
  const groupedContentTopics = new Map();
  for (const contentTopic of contentTopics) {
    const pubsubTopic = contentTopicToPubsubTopic(
      contentTopic,
      clusterId,
      networkShards
    );
    let topics = groupedContentTopics.get(pubsubTopic);
    if (!topics) {
      groupedContentTopics.set(pubsubTopic, []);
      topics = groupedContentTopics.get(pubsubTopic);
    }
    topics.push(contentTopic);
  }
  return groupedContentTopics;
}

/**
 * Used when creating encoders/decoders to determine which pubsub topic to use
 */
export function determinePubsubTopic(
  contentTopic: string,
  pubsubTopicShardInfo: SingleShardInfo | PubsubTopic = DefaultPubsubTopic
): string {
  if (typeof pubsubTopicShardInfo == "string") {
    return pubsubTopicShardInfo;
  } else {
    return pubsubTopicShardInfo
      ? pubsubTopicShardInfo.shard
        ? singleShardInfoToPubsubTopic(pubsubTopicShardInfo)
        : contentTopicToPubsubTopic(
            contentTopic,
            pubsubTopicShardInfo.clusterId
          )
      : DefaultPubsubTopic;
  }
}

/**
 * Validates sharding configuration and sets defaults where possible.
 * @returns Validated sharding parameters, with any missing values set to defaults
 */
export const ensureShardingConfigured = (
  shardInfo: Partial<ShardingParams>
): {
  shardingParams: ShardingParams;
  shardInfo: ShardInfo;
  pubsubTopics: PubsubTopic[];
} => {
  const clusterId = shardInfo.clusterId ?? DEFAULT_CLUSTER_ID;
  const shards = "shards" in shardInfo ? shardInfo.shards : [];
  const contentTopics =
    "contentTopics" in shardInfo ? shardInfo.contentTopics : [];
  const [application, version] =
    "application" in shardInfo && "version" in shardInfo
      ? [shardInfo.application, shardInfo.version]
      : [undefined, undefined];

  const isShardsConfigured = shards && shards.length > 0;
  const isContentTopicsConfigured = contentTopics && contentTopics.length > 0;
  const isApplicationVersionConfigured = application && version;

  if (isShardsConfigured) {
    return {
      shardingParams: { clusterId, shards },
      shardInfo: { clusterId, shards },
      pubsubTopics: shardInfoToPubsubTopics({ clusterId, shards })
    };
  }

  if (isContentTopicsConfigured) {
    const pubsubTopics = Array.from(
      new Set(
        contentTopics.map((topic) =>
          contentTopicToPubsubTopic(topic, clusterId)
        )
      )
    );
    const shards = Array.from(
      new Set(contentTopics.map((topic) => contentTopicToShardIndex(topic)))
    );
    return {
      shardingParams: { clusterId, contentTopics },
      shardInfo: { clusterId, shards },
      pubsubTopics
    };
  }

  if (isApplicationVersionConfigured) {
    const pubsubTopic = contentTopicToPubsubTopic(
      `/${application}/${version}/default/default`
    );
    return {
      shardingParams: { clusterId, application, version },
      shardInfo: {
        clusterId,
        shards: [pubsubTopicToSingleShardInfo(pubsubTopic).shard]
      },
      pubsubTopics: [pubsubTopic]
    };
  }

  throw new Error(
    "Missing minimum required configuration options for static sharding or autosharding."
  );
};
