import {
  createDecoder,
  createEncoder,
  DecodedMessage,
  DefaultPubSubTopic,
  waitForRemotePeer
} from "@waku/core";
import { RelayNode, SendError } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import {
  createDecoder as createEciesDecoder,
  createEncoder as createEciesEncoder,
  generatePrivateKey,
  getPublicKey
} from "@waku/message-encryption/ecies";
import {
  createDecoder as createSymDecoder,
  createEncoder as createSymEncoder,
  generateSymmetricKey
} from "@waku/message-encryption/symmetric";
import { createRelayNode } from "@waku/sdk";
import { bytesToUtf8, utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";
import debug from "debug";

import {
  delay,
  NOISE_KEY_1,
  NOISE_KEY_2,
  tearDownNodes
} from "../../src/index.js";
import { generateRandomUint8Array } from "../../src/random_array.js";

import { TestContentTopic, TestDecoder, TestEncoder } from "./utils.js";

const log = debug("waku:test");

describe.only("Waku Relay 2 js nodes", function () {
  this.timeout(15000);
  let waku1: RelayNode;
  let waku2: RelayNode;

  beforeEach(async function () {
    this.timeout(10000);
    log("Starting JS Waku instances");
    [waku1, waku2] = await Promise.all([
      createRelayNode({ staticNoiseKey: NOISE_KEY_1 }).then((waku) =>
        waku.start().then(() => waku)
      ),
      createRelayNode({
        staticNoiseKey: NOISE_KEY_2,
        libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } }
      }).then((waku) => waku.start().then(() => waku))
    ]);
    log("Instances started, adding waku2 to waku1's address book");
    await waku1.libp2p.peerStore.merge(waku2.libp2p.peerId, {
      multiaddrs: waku2.libp2p.getMultiaddrs()
    });
    await waku1.dial(waku2.libp2p.peerId);

    log("Wait for mutual pubsub subscription");
    await Promise.all([
      waitForRemotePeer(waku1, [Protocols.Relay]),
      waitForRemotePeer(waku2, [Protocols.Relay])
    ]);
    log("before each hook done");
  });

  afterEach(async function () {
    this.timeout(15000);
    tearDownNodes([], [waku1, waku2]);
  });

  it("Subscribe", async function () {
    log("Getting subscribers");
    const subscribers1 = waku1.libp2p.services
      .pubsub!.getSubscribers(DefaultPubSubTopic)
      .map((p) => p.toString());
    const subscribers2 = waku2.libp2p.services
      .pubsub!.getSubscribers(DefaultPubSubTopic)
      .map((p) => p.toString());

    log("Asserting mutual subscription");
    expect(subscribers1).to.contain(waku2.libp2p.peerId.toString());
    expect(subscribers2).to.contain(waku1.libp2p.peerId.toString());
  });

  it("Register correct protocols", async function () {
    const protocols = waku1.libp2p.getProtocols();

    expect(protocols).to.contain("/vac/waku/relay/2.0.0");
    expect(protocols.findIndex((value) => value.match(/sub/))).to.eq(-1);
  });

  it("Publish", async function () {
    const messageText = "JS to JS communication works";
    const messageTimestamp = new Date("1995-12-17T03:24:00");
    const message = {
      payload: utf8ToBytes(messageText),
      timestamp: messageTimestamp
    };

    const receivedMsgPromise: Promise<DecodedMessage> = new Promise(
      (resolve) => {
        void waku2.relay.subscribe([TestDecoder], resolve);
      }
    );

    await waku1.relay.send(TestEncoder, message);

    const receivedMsg = await receivedMsgPromise;

    expect(receivedMsg.contentTopic).to.eq(TestContentTopic);
    expect(bytesToUtf8(receivedMsg.payload)).to.eq(messageText);
    expect(receivedMsg.timestamp?.valueOf()).to.eq(messageTimestamp.valueOf());
  });

  it("Filter on content topics", async function () {
    const fooMessageText = "Published on content topic foo";
    const barMessageText = "Published on content topic bar";

    const fooContentTopic = "foo";
    const barContentTopic = "bar";

    const fooEncoder = createEncoder({ contentTopic: fooContentTopic });
    const barEncoder = createEncoder({ contentTopic: barContentTopic });

    const fooDecoder = createDecoder(fooContentTopic);
    const barDecoder = createDecoder(barContentTopic);

    const fooMessages: DecodedMessage[] = [];
    void waku2.relay.subscribe([fooDecoder], (msg) => {
      fooMessages.push(msg);
    });

    const barMessages: DecodedMessage[] = [];
    void waku2.relay.subscribe([barDecoder], (msg) => {
      barMessages.push(msg);
    });

    await waku1.relay.send(barEncoder, {
      payload: utf8ToBytes(barMessageText)
    });
    await waku1.relay.send(fooEncoder, {
      payload: utf8ToBytes(fooMessageText)
    });

    while (!fooMessages.length && !barMessages.length) {
      await delay(100);
    }

    expect(fooMessages[0].contentTopic).to.eq(fooContentTopic);
    expect(bytesToUtf8(fooMessages[0].payload)).to.eq(fooMessageText);

    expect(barMessages[0].contentTopic).to.eq(barContentTopic);
    expect(bytesToUtf8(barMessages[0].payload)).to.eq(barMessageText);

    expect(fooMessages.length).to.eq(1);
    expect(barMessages.length).to.eq(1);
  });

  it("Decrypt messages", async function () {
    const asymText = "This message is encrypted using asymmetric";
    const asymTopic = "/test/1/asymmetric/proto";
    const symText = "This message is encrypted using symmetric encryption";
    const symTopic = "/test/1/symmetric/proto";

    const privateKey = generatePrivateKey();
    const symKey = generateSymmetricKey();
    const publicKey = getPublicKey(privateKey);

    const eciesEncoder = createEciesEncoder({
      contentTopic: asymTopic,
      publicKey
    });
    const symEncoder = createSymEncoder({
      contentTopic: symTopic,
      symKey
    });

    const eciesDecoder = createEciesDecoder(asymTopic, privateKey);
    const symDecoder = createSymDecoder(symTopic, symKey);

    const msgs: DecodedMessage[] = [];
    void waku2.relay.subscribe([eciesDecoder], (wakuMsg) => {
      msgs.push(wakuMsg);
    });
    void waku2.relay.subscribe([symDecoder], (wakuMsg) => {
      msgs.push(wakuMsg);
    });

    await waku1.relay.send(eciesEncoder, { payload: utf8ToBytes(asymText) });
    await delay(200);
    await waku1.relay.send(symEncoder, { payload: utf8ToBytes(symText) });

    while (msgs.length < 2) {
      await delay(200);
    }

    expect(msgs[0].contentTopic).to.eq(asymTopic);
    expect(bytesToUtf8(msgs[0].payload!)).to.eq(asymText);
    expect(msgs[1].contentTopic).to.eq(symTopic);
    expect(bytesToUtf8(msgs[1].payload!)).to.eq(symText);
  });

  it("Delete observer", async function () {
    const messageText =
      "Published on content topic with added then deleted observer";

    const contentTopic = "added-then-deleted-observer";

    // The promise **fails** if we receive a message on this observer.
    const receivedMsgPromise: Promise<DecodedMessage> = new Promise(
      (resolve, reject) => {
        const deleteObserver = waku2.relay.subscribe(
          [createDecoder(contentTopic)],
          reject
        ) as () => void;
        deleteObserver();
        setTimeout(resolve, 500);
      }
    );
    await waku1.relay.send(createEncoder({ contentTopic }), {
      payload: utf8ToBytes(messageText)
    });

    await receivedMsgPromise;
    // If it does not throw then we are good.
  });

  it("Publishes <= 1 MB and rejects others", async function () {
    const MB = 1024 ** 2;

    // 1 and 2 uses a custom pubsub
    [waku1, waku2] = await Promise.all([
      createRelayNode({
        pubSubTopics: [DefaultPubSubTopic],
        staticNoiseKey: NOISE_KEY_1
      }).then((waku) => waku.start().then(() => waku)),
      createRelayNode({
        pubSubTopics: [DefaultPubSubTopic],
        staticNoiseKey: NOISE_KEY_2,
        libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } }
      }).then((waku) => waku.start().then(() => waku))
    ]);

    await waku1.libp2p.peerStore.merge(waku2.libp2p.peerId, {
      multiaddrs: waku2.libp2p.getMultiaddrs()
    });
    await Promise.all([waku1.dial(waku2.libp2p.peerId)]);

    await Promise.all([
      waitForRemotePeer(waku1, [Protocols.Relay]),
      waitForRemotePeer(waku2, [Protocols.Relay])
    ]);

    const waku2ReceivedMsgPromise: Promise<DecodedMessage> = new Promise(
      (resolve) => {
        void waku2.relay.subscribe([TestDecoder], () =>
          resolve({
            payload: new Uint8Array([])
          } as DecodedMessage)
        );
      }
    );

    let sendResult = await waku1.relay.send(TestEncoder, {
      payload: generateRandomUint8Array(1 * MB)
    });
    expect(sendResult.recipients.length).to.eq(1);

    sendResult = await waku1.relay.send(TestEncoder, {
      payload: generateRandomUint8Array(1 * MB + 65536)
    });
    expect(sendResult.recipients.length).to.eq(0);
    expect(sendResult.errors).to.include(SendError.SIZE_TOO_BIG);

    sendResult = await waku1.relay.send(TestEncoder, {
      payload: generateRandomUint8Array(2 * MB)
    });
    expect(sendResult.recipients.length).to.eq(0);
    expect(sendResult.errors).to.include(SendError.SIZE_TOO_BIG);

    const waku2ReceivedMsg = await waku2ReceivedMsgPromise;
    expect(waku2ReceivedMsg?.payload?.length).to.eq(0);
  });
});
