import type { LightNode } from "@waku/interfaces";

import { CreateWakuNodeOptions, WakuNode } from "../waku.js";

import { createLibp2pNode } from "./libp2p.js";
import { buildCreateOptions, buildWakuNodeOptions } from "./options.js";

/**
 * Create a Waku node that uses Waku Light Push, Filter and Store to send and
 * receive messages, enabling low resource consumption.
 * Uses Waku Filter V2 by default.
 */
export async function createLightNode(
  options: CreateWakuNodeOptions = {}
): Promise<LightNode> {
  const createOptions = buildCreateOptions(options);
  const libp2p = await createLibp2pNode(createOptions);
  const wakuNodeOptions = buildWakuNodeOptions(createOptions);

  const protocols = {
    store: true,
    lightpush: true,
    filter: true
  };

  return new WakuNode(wakuNodeOptions, libp2p, protocols) as LightNode;
}
