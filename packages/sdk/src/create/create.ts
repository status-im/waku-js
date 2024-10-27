import type { LightNode, ProtocolCreateOptions } from "@waku/interfaces";

import { WakuNode } from "../waku/index.js";

import { createLibp2pAndUpdateOptions } from "./libp2p.js";

/**
 * Create a Waku node that uses Waku Light Push, Filter and Store to send and
 * receive messages, enabling low resource consumption.
 * Uses Waku Filter V2 by default.
 */
export async function createLightNode(
  options: ProtocolCreateOptions = {}
): Promise<LightNode> {
  const { libp2p, pubsubTopics } = await createLibp2pAndUpdateOptions(options);

  return new WakuNode(pubsubTopics, options, libp2p, {
    store: true,
    lightpush: true,
    filter: true
  }) as LightNode;
}
