import {
  createDecoder,
  createEncoder,
  DecodedMessage,
  waitForRemotePeer,
} from "@waku/core";
import { createLightNode } from "@waku/create";
import { Protocols } from "@waku/interfaces";
import type { LightNode } from "@waku/interfaces";
import {
  createDecoder as eciesDecoder,
  createEncoder as eciesEncoder,
  generatePrivateKey,
  getPublicKey,
} from "@waku/message-encryption/ecies";
import {
  generateSymmetricKey,
  createDecoder as symDecoder,
  createEncoder as symEncoder,
} from "@waku/message-encryption/symmetric";
import { bytesToUtf8, utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";
import debug from "debug";

import {
  delay,
  makeLogFileName,
  NOISE_KEY_1,
  NOISE_KEY_2,
  Nwaku,
} from "../src/index.js";

const log = debug("waku:test:ephemeral");

const TestContentTopic = "/test/1/ephemeral/utf8";
const TestEncoder = createEncoder({
  contentTopic: TestContentTopic,
});
const TestDecoder = createDecoder(TestContentTopic);

describe("Waku Message Ephemeral field", () => {
  let waku: LightNode;
  let nwaku: Nwaku;

  afterEach(async function () {
    !!nwaku &&
      nwaku.stop().catch((e) => console.log("Nwaku failed to stop", e));
    !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  beforeEach(async function () {
    this.timeout(15_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      filter: true,
      lightpush: true,
      store: true,
      relay: true,
    });
    waku = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
      libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } },
    });
    await waku.start();
    await waku.dial(await nwaku.getMultiaddrWithId());

    await waitForRemotePeer(waku, [
      Protocols.Filter,
      Protocols.LightPush,
      Protocols.Store,
    ]);
  });

  it("Ephemeral messages are not stored", async function () {
    this.timeout(50_000);

    const asymText =
      "This message is encrypted for me using asymmetric encryption";
    const symText =
      "This message is encrypted for me using symmetric encryption";
    const clearText = "This is a clear text message";

    const asymMsg = { payload: utf8ToBytes(asymText) };
    const symMsg = {
      payload: utf8ToBytes(symText),
    };
    const clearMsg = {
      payload: utf8ToBytes(clearText),
    };

    const privateKey = generatePrivateKey();
    const symKey = generateSymmetricKey();
    const publicKey = getPublicKey(privateKey);

    const AsymContentTopic = "/test/1/ephemeral-asym/utf8";
    const SymContentTopic = "/test/1/ephemeral-sym/utf8";

    const asymEncoder = eciesEncoder({
      contentTopic: AsymContentTopic,
      publicKey,
      ephemeral: true,
    });
    const symEncoder = eciesEncoder({
      contentTopic: SymContentTopic,
      publicKey: symKey,
      ephemeral: true,
    });
    const clearEncoder = createEncoder({
      contentTopic: TestContentTopic,
      ephemeral: true,
    });

    const asymDecoder = eciesDecoder(AsymContentTopic, privateKey);
    const symDecoder = eciesDecoder(SymContentTopic, symKey);

    const [waku1, waku2, nimWakuMultiaddr] = await Promise.all([
      createLightNode({
        staticNoiseKey: NOISE_KEY_1,
      }).then((waku) => waku.start().then(() => waku)),
      createLightNode({
        staticNoiseKey: NOISE_KEY_2,
      }).then((waku) => waku.start().then(() => waku)),
      nwaku.getMultiaddrWithId(),
    ]);

    log("Waku nodes created");

    await Promise.all([
      waku1.dial(nimWakuMultiaddr),
      waku2.dial(nimWakuMultiaddr),
    ]);

    log("Waku nodes connected to nwaku");

    await waitForRemotePeer(waku1, [Protocols.LightPush]);

    log("Sending messages using light push");
    await Promise.all([
      waku1.lightPush.send(asymEncoder, asymMsg),
      waku1.lightPush.send(symEncoder, symMsg),
      waku1.lightPush.send(clearEncoder, clearMsg),
    ]);

    await waitForRemotePeer(waku2, [Protocols.Store]);

    const messages: DecodedMessage[] = [];
    log("Retrieve messages from store");

    for await (const msgPromises of waku2.store.queryGenerator([
      asymDecoder,
      symDecoder,
      TestDecoder,
    ])) {
      for (const promise of msgPromises) {
        const msg = await promise;
        if (msg) {
          messages.push(msg);
        }
      }
    }

    expect(messages?.length).eq(0);

    !!waku1 && waku1.stop().catch((e) => console.log("Waku failed to stop", e));
    !!waku2 && waku2.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  it("Ephemeral field is preserved - encoder v0", async function () {
    this.timeout(10000);

    const ephemeralEncoder = createEncoder({
      contentTopic: TestContentTopic,
      ephemeral: true,
    });

    const messages: DecodedMessage[] = [];
    const callback = (msg: DecodedMessage): void => {
      messages.push(msg);
    };
    await waku.filter.subscribe([TestDecoder], callback);

    await delay(200);
    const normalTxt = "Normal message";
    const ephemeralTxt = "Ephemeral Message";
    await waku.lightPush.send(TestEncoder, {
      payload: utf8ToBytes(normalTxt),
    });
    await waku.lightPush.send(ephemeralEncoder, {
      payload: utf8ToBytes(ephemeralTxt),
    });
    while (messages.length < 2) {
      await delay(250);
    }

    const normalMsg = messages.find(
      (msg) => bytesToUtf8(msg.payload) === normalTxt
    );
    const ephemeralMsg = messages.find(
      (msg) => bytesToUtf8(msg.payload) === ephemeralTxt
    );

    expect(normalMsg).to.not.be.undefined;
    expect(ephemeralMsg).to.not.be.undefined;

    expect(normalMsg!.ephemeral).to.be.false;
    expect(ephemeralMsg!.ephemeral).to.be.true;
  });

  it("Ephemeral field is preserved - symmetric encryption", async function () {
    this.timeout(10000);

    const symKey = generateSymmetricKey();

    const ephemeralEncoder = symEncoder({
      contentTopic: TestContentTopic,
      symKey,
      ephemeral: true,
    });
    const encoder = symEncoder({
      contentTopic: TestContentTopic,
      symKey,
    });
    const decoder = symDecoder(TestContentTopic, symKey);

    const messages: DecodedMessage[] = [];
    const callback = (msg: DecodedMessage): void => {
      messages.push(msg);
    };
    await waku.filter.subscribe([decoder], callback);

    await delay(200);
    const normalTxt = "Normal message";
    const ephemeralTxt = "Ephemeral Message";
    await waku.lightPush.send(encoder, {
      payload: utf8ToBytes(normalTxt),
    });
    await waku.lightPush.send(ephemeralEncoder, {
      payload: utf8ToBytes(ephemeralTxt),
    });
    while (messages.length < 2) {
      await delay(250);
    }

    const normalMsg = messages.find(
      (msg) => bytesToUtf8(msg.payload) === normalTxt
    );
    const ephemeralMsg = messages.find(
      (msg) => bytesToUtf8(msg.payload) === ephemeralTxt
    );

    expect(normalMsg).to.not.be.undefined;
    expect(ephemeralMsg).to.not.be.undefined;

    expect(normalMsg!.ephemeral).to.be.false;
    expect(ephemeralMsg!.ephemeral).to.be.true;
  });

  it("Ephemeral field is preserved - asymmetric encryption", async function () {
    this.timeout(10000);

    const privKey = generatePrivateKey();
    const pubKey = getPublicKey(privKey);

    const ephemeralEncoder = eciesEncoder({
      contentTopic: TestContentTopic,
      publicKey: pubKey,
      ephemeral: true,
    });
    const encoder = eciesEncoder({
      contentTopic: TestContentTopic,
      publicKey: pubKey,
    });
    const decoder = eciesDecoder(TestContentTopic, privKey);

    const messages: DecodedMessage[] = [];
    const callback = (msg: DecodedMessage): void => {
      messages.push(msg);
    };
    await waku.filter.subscribe([decoder], callback);

    await delay(200);
    const normalTxt = "Normal message";
    const ephemeralTxt = "Ephemeral Message";
    await waku.lightPush.send(encoder, {
      payload: utf8ToBytes(normalTxt),
    });
    await waku.lightPush.send(ephemeralEncoder, {
      payload: utf8ToBytes(ephemeralTxt),
    });
    while (messages.length < 2) {
      await delay(250);
    }

    const normalMsg = messages.find(
      (msg) => bytesToUtf8(msg.payload) === normalTxt
    );
    const ephemeralMsg = messages.find(
      (msg) => bytesToUtf8(msg.payload) === ephemeralTxt
    );

    expect(normalMsg).to.not.be.undefined;
    expect(ephemeralMsg).to.not.be.undefined;

    expect(normalMsg!.ephemeral).to.be.false;
    expect(ephemeralMsg!.ephemeral).to.be.true;
  });
});
