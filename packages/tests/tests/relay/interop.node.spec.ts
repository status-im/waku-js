import type { PeerId } from "@libp2p/interface/peer-id";
import {
  DecodedMessage,
  DefaultPubSubTopic,
  waitForRemotePeer
} from "@waku/core";
import { RelayNode } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { createRelayNode } from "@waku/sdk";
import { bytesToUtf8, utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";

import {
  delay,
  makeLogFileName,
  NOISE_KEY_1,
  NOISE_KEY_2,
  tearDownNodes
} from "../../src/index.js";
import { MessageRpcResponse } from "../../src/node/interfaces.js";
import { base64ToUtf8, NimGoNode } from "../../src/node/node.js";

import { TestContentTopic, TestDecoder, TestEncoder } from "./utils.js";

describe("Waku Relay, Interop", function () {
  this.timeout(15000);
  let waku: RelayNode;
  let nwaku: NimGoNode;

  beforeEach(async function () {
    this.timeout(30000);
    waku = await createRelayNode({
      staticNoiseKey: NOISE_KEY_1
    });
    await waku.start();

    nwaku = new NimGoNode(this.test?.ctx?.currentTest?.title + "");
    await nwaku.start({ relay: true });

    await waku.dial(await nwaku.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.Relay]);

    // Nwaku subscribe to the default pubsub topic
    await nwaku.ensureSubscriptions();
  });

  afterEach(async function () {
    this.timeout(15000);
    await tearDownNodes(nwaku, waku);
  });

  it("nwaku subscribes", async function () {
    let subscribers: PeerId[] = [];

    while (subscribers.length === 0) {
      await delay(200);
      subscribers =
        waku.libp2p.services.pubsub!.getSubscribers(DefaultPubSubTopic);
    }

    const nimPeerId = await nwaku.getPeerId();
    expect(subscribers.map((p) => p.toString())).to.contain(
      nimPeerId.toString()
    );
  });

  it("Publishes to nwaku", async function () {
    const messageText = "This is a message";
    await waku.relay.send(TestEncoder, { payload: utf8ToBytes(messageText) });

    let msgs: MessageRpcResponse[] = [];

    while (msgs.length === 0) {
      console.log("Waiting for messages");
      await delay(200);
      msgs = await nwaku.messages();
    }

    expect(msgs[0].contentTopic).to.equal(TestContentTopic);
    expect(msgs[0].version).to.equal(0);
    expect(base64ToUtf8(msgs[0].payload)).to.equal(messageText);
  });

  it("Nwaku publishes", async function () {
    await delay(200);

    const messageText = "Here is another message.";

    const receivedMsgPromise: Promise<DecodedMessage> = new Promise(
      (resolve) => {
        void waku.relay.subscribe<DecodedMessage>(TestDecoder, (msg) =>
          resolve(msg)
        );
      }
    );

    await nwaku.sendMessage(
      NimGoNode.toMessageRpcQuery({
        contentTopic: TestContentTopic,
        payload: utf8ToBytes(messageText)
      })
    );

    const receivedMsg = await receivedMsgPromise;

    expect(receivedMsg.contentTopic).to.eq(TestContentTopic);
    expect(receivedMsg.version!).to.eq(0);
    expect(bytesToUtf8(receivedMsg.payload!)).to.eq(messageText);
  });

  describe.skip("Two nodes connected to nwaku", function () {
    let waku1: RelayNode;
    let waku2: RelayNode;
    let nwaku: NimGoNode;

    afterEach(async function () {
      !!nwaku &&
        nwaku.stop().catch((e) => console.log("Nwaku failed to stop", e));
      !!waku1 &&
        waku1.stop().catch((e) => console.log("Waku failed to stop", e));
      !!waku2 &&
        waku2.stop().catch((e) => console.log("Waku failed to stop", e));
    });

    it("Js publishes, other Js receives", async function () {
      [waku1, waku2] = await Promise.all([
        createRelayNode({
          staticNoiseKey: NOISE_KEY_1,
          emitSelf: true
        }).then((waku) => waku.start().then(() => waku)),
        createRelayNode({
          staticNoiseKey: NOISE_KEY_2
        }).then((waku) => waku.start().then(() => waku))
      ]);

      nwaku = new NimGoNode(makeLogFileName(this));
      await nwaku.start();

      const nwakuMultiaddr = await nwaku.getMultiaddrWithId();
      await Promise.all([
        waku1.dial(nwakuMultiaddr),
        waku2.dial(nwakuMultiaddr)
      ]);

      // Wait for identify protocol to finish
      await Promise.all([
        waitForRemotePeer(waku1, [Protocols.Relay]),
        waitForRemotePeer(waku2, [Protocols.Relay])
      ]);

      await delay(2000);
      // Check that the two JS peers are NOT directly connected
      expect(await waku1.libp2p.peerStore.has(waku2.libp2p.peerId)).to.be.false;
      expect(waku2.libp2p.peerStore.has(waku1.libp2p.peerId)).to.be.false;

      const msgStr = "Hello there!";
      const message = { payload: utf8ToBytes(msgStr) };

      const waku2ReceivedMsgPromise: Promise<DecodedMessage> = new Promise(
        (resolve) => {
          void waku2.relay.subscribe(TestDecoder, resolve);
        }
      );

      await waku1.relay.send(TestEncoder, message);
      console.log("Waiting for message");
      const waku2ReceivedMsg = await waku2ReceivedMsgPromise;

      expect(waku2ReceivedMsg.payload).to.eq(msgStr);
    });
  });
});
