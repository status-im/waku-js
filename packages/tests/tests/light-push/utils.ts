import { createEncoder, waitForRemotePeer } from "@waku/core";
import { LightNode, Protocols } from "@waku/interfaces";
import { createLightNode, utf8ToBytes } from "@waku/sdk";
import debug from "debug";

import { makeLogFileName, NimGoNode, NOISE_KEY_1 } from "../../src/index";

// Constants for test configuration.
export const log = debug("waku:test:lightpush");
export const TestContentTopic = "/test/1/waku-light-push/utf8";
export const TestEncoder = createEncoder({ contentTopic: TestContentTopic });
export const messageText = "Light Push works!";
export const messagePayload = { payload: utf8ToBytes(messageText) };

export async function runNodes(
  context: Mocha.Context,
  pubSubTopic?: string
): Promise<[NimGoNode, LightNode]> {
  const nwakuOptional = pubSubTopic ? { topic: pubSubTopic } : {};
  const nwaku = new NimGoNode(makeLogFileName(context));
  await nwaku.startWithRetries(
    {
      lightpush: true,
      relay: true,
      ...nwakuOptional
    },
    { retries: 3 }
  );

  let waku: LightNode | undefined;
  try {
    waku = await createLightNode({
      pubSubTopic,
      staticNoiseKey: NOISE_KEY_1
    });
    await waku.start();
  } catch (error) {
    log("jswaku node failed to start:", error);
  }

  if (waku) {
    await waku.dial(await nwaku.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.LightPush]);
    return [nwaku, waku];
  } else {
    throw new Error("Failed to initialize waku");
  }
}
