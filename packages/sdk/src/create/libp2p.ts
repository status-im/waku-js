import type { GossipSub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { bootstrap } from "@libp2p/bootstrap";
import { identify } from "@libp2p/identify";
import { mplex } from "@libp2p/mplex";
import { ping } from "@libp2p/ping";
import { webSockets } from "@libp2p/websockets";
import { all as filterAll, wss } from "@libp2p/websockets/filters";
import { wakuMetadata } from "@waku/core";
import {
  type CreateLibp2pOptions,
  DefaultPubsubTopic,
  type IMetadata,
  type Libp2p,
  type Libp2pComponents,
  type ShardInfo
} from "@waku/interfaces";
import { wakuGossipSub } from "@waku/relay";
import { ensureShardingConfigured, Logger } from "@waku/utils";
import { createLibp2p } from "libp2p";

import {
  CreateWakuNodeOptions,
  DefaultPingMaxInboundStreams,
  DefaultUserAgent
} from "../waku.js";

import { defaultPeerDiscoveries } from "./discovery.js";

type PubsubService = {
  pubsub?: (components: Libp2pComponents) => GossipSub;
};

type MetadataService = {
  metadata?: (components: Libp2pComponents) => IMetadata;
};

const logger = new Logger("sdk:create");

export async function defaultLibp2p(
  shardInfo?: ShardInfo,
  wakuGossipSub?: PubsubService["pubsub"],
  options?: Partial<CreateLibp2pOptions>,
  userAgent?: string
): Promise<Libp2p> {
  if (!options?.hideWebSocketInfo && process?.env?.NODE_ENV !== "test") {
    /* eslint-disable no-console */
    console.info(
      "%cIgnore WebSocket connection failures",
      "background: gray; color: white; font-size: x-large"
    );
    console.info(
      "%cWaku tries to discover peers and some of them are expected to fail",
      "background: gray; color: white; font-size: x-large"
    );
    /* eslint-enable no-console */
  }

  const pubsubService: PubsubService = wakuGossipSub
    ? { pubsub: wakuGossipSub }
    : {};

  const metadataService: MetadataService = shardInfo
    ? { metadata: wakuMetadata(shardInfo) }
    : {};

  const filter = process?.env?.NODE_ENV === "test" ? filterAll : wss;

  return createLibp2p({
    connectionManager: {
      minConnections: 1
    },
    transports: [webSockets({ filter })],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()],
    ...options,
    services: {
      identify: identify({
        agentVersion: userAgent ?? DefaultUserAgent
      }),
      ping: ping({
        maxInboundStreams:
          options?.pingMaxInboundStreams ?? DefaultPingMaxInboundStreams
      }),
      ...metadataService,
      ...pubsubService,
      ...options?.services
    }
  }) as any as Libp2p; // TODO: make libp2p include it;
}

export async function createLibp2pAndUpdateOptions(
  options: CreateWakuNodeOptions
): Promise<Libp2p> {
  const shardInfo = configureNetworkOptions(options);

  const libp2pOptions = options?.libp2p ?? {};
  const peerDiscovery = libp2pOptions.peerDiscovery ?? [];

  if (options?.defaultBootstrap) {
    peerDiscovery.push(...defaultPeerDiscoveries(options.pubsubTopics!));
  }

  if (options?.bootstrapPeers) {
    peerDiscovery.push(bootstrap({ list: options.bootstrapPeers }));
  }

  libp2pOptions.peerDiscovery = peerDiscovery;

  const libp2p = await defaultLibp2p(
    shardInfo,
    wakuGossipSub(options),
    libp2pOptions,
    options?.userAgent
  );

  return libp2p;
}

function configureNetworkOptions(
  options: CreateWakuNodeOptions
): ShardInfo | undefined {
  const flags = [
    options.contentTopics,
    options.pubsubTopics,
    options.shardInfo
  ].filter((v) => !!v);

  if (flags.length > 1) {
    throw Error(
      "Too many network configurations provided. Pass only one of: pubsubTopic, contentTopics or shardInfo."
    );
  }

  logWhichShardInfoIsUsed(options);

  if (options.contentTopics) {
    options.shardInfo = { contentTopics: options.contentTopics };
  }

  const shardInfo = options.shardInfo
    ? ensureShardingConfigured(options.shardInfo)
    : undefined;

  options.pubsubTopics = shardInfo?.pubsubTopics ??
    options.pubsubTopics ?? [DefaultPubsubTopic];

  return shardInfo?.shardInfo;
}

function logWhichShardInfoIsUsed(options: CreateWakuNodeOptions): void {
  if (options.pubsubTopics) {
    logger.info("Using pubsubTopics array to bootstrap the node.");
    return;
  }

  if (options.contentTopics) {
    logger.info(
      "Using contentTopics and default cluster ID (1) to bootstrap the node."
    );
    return;
  }

  if (options.shardInfo) {
    logger.info("Using shardInfo parameters to bootstrap the node.");
    return;
  }
}
