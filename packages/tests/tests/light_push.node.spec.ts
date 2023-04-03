import { createEncoder, waitForRemotePeer } from "@waku/core";
import { createLightNode } from "@waku/create";
import type { LightNode } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";
import debug from "debug";

import {
  base64ToUtf8,
  delay,
  makeLogFileName,
  MessageRpcResponse,
  NOISE_KEY_1,
  Nwaku,
} from "../src/index.js";

const log = debug("waku:test:lightpush");

const TestContentTopic = "/test/1/waku-light-push/utf8";
const TestEncoder = createEncoder({
  contentTopic: TestContentTopic,
});

describe("Waku Light Push [node only]", () => {
  let waku: LightNode;
  let nwaku: Nwaku;

  afterEach(async function () {
    !!nwaku &&
      nwaku.stop().catch((e) => console.log("Nwaku failed to stop", e));
    !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  it("Push successfully", async function () {
    this.timeout(15_000);

    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({ lightpush: true, relay: true });

    waku = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku.start();
    await waku.dial(await nwaku.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.LightPush]);

    const messageText = "Light Push works!";

    const pushResponse = await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes(messageText),
    });
    expect(pushResponse.recipients.length).to.eq(1);

    let msgs: MessageRpcResponse[] = [];

    while (msgs.length === 0) {
      await delay(200);
      msgs = await nwaku.messages();
    }

    expect(msgs[0].contentTopic).to.equal(TestContentTopic);
    expect(base64ToUtf8(msgs[0].payload)).to.equal(messageText);
  });

  it("Push on custom pubsub topic", async function () {
    this.timeout(15_000);

    const customPubSubTopic = "/waku/2/custom-dapp/proto";

    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      lightpush: true,
      topics: customPubSubTopic,
      relay: true,
    });

    waku = await createLightNode({
      pubSubTopic: customPubSubTopic,
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku.start();
    await waku.dial(await nwaku.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.LightPush]);

    const nimPeerId = await nwaku.getPeerId();

    const messageText = "Light Push works!";

    log("Send message via lightpush");
    const pushResponse = await waku.lightPush.send(
      TestEncoder,
      { payload: utf8ToBytes(messageText) },
      {
        peerId: nimPeerId,
      }
    );
    log("Ack received", pushResponse);
    expect(pushResponse.recipients[0].toString()).to.eq(nimPeerId.toString());

    let msgs: MessageRpcResponse[] = [];

    log("Waiting for message to show in nwaku");
    while (msgs.length === 0) {
      await delay(200);
      msgs = await nwaku.messages(customPubSubTopic);
    }

    expect(msgs[0].contentTopic).to.equal(TestContentTopic);
    expect(base64ToUtf8(msgs[0].payload)).to.equal(messageText);
  });
});
