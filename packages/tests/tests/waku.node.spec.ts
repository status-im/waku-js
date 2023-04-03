import { bootstrap } from "@libp2p/bootstrap";
import type { PeerId } from "@libp2p/interface-peer-id";
import {
  DecodedMessage,
  DefaultUserAgent,
  waitForRemotePeer,
} from "@waku/core";
import { createLightNode, createRelayNode } from "@waku/create";
import type { LightNode, RelayNode, Waku } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import {
  createDecoder,
  createEncoder,
  generateSymmetricKey,
} from "@waku/message-encryption/symmetric";
import { bytesToUtf8, utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";

import {
  makeLogFileName,
  NOISE_KEY_1,
  NOISE_KEY_2,
  Nwaku,
} from "../src/index.js";

const TestContentTopic = "/test/1/waku/utf8";

describe("Waku Dial [node only]", function () {
  describe("Interop: nwaku", function () {
    let waku: Waku;
    let nwaku: Nwaku;

    afterEach(async function () {
      !!nwaku &&
        nwaku.stop().catch((e) => console.log("Nwaku failed to stop", e));
      !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
    });

    it("connects to nwaku", async function () {
      this.timeout(20_000);
      nwaku = new Nwaku(makeLogFileName(this));
      await nwaku.start({
        filter: true,
        store: true,
        lightpush: true,
      });
      const multiAddrWithId = await nwaku.getMultiaddrWithId();

      waku = await createLightNode({
        staticNoiseKey: NOISE_KEY_1,
      });
      await waku.start();
      await waku.dial(multiAddrWithId);
      await waitForRemotePeer(waku, [
        Protocols.Store,
        Protocols.Filter,
        Protocols.LightPush,
      ]);

      const nimPeerId = await nwaku.getPeerId();
      expect(await waku.libp2p.peerStore.has(nimPeerId)).to.be.true;
    });
  });

  describe("Bootstrap", function () {
    let waku: LightNode;
    let nwaku: Nwaku;

    afterEach(async function () {
      !!nwaku && nwaku.stop();
      !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
    });

    it("Passing an array", async function () {
      this.timeout(10_000);

      nwaku = new Nwaku(makeLogFileName(this));
      await nwaku.start();
      const multiAddrWithId = await nwaku.getMultiaddrWithId();
      waku = await createLightNode({
        staticNoiseKey: NOISE_KEY_1,
        libp2p: {
          peerDiscovery: [bootstrap({ list: [multiAddrWithId.toString()] })],
        },
      });
      await waku.start();

      const connectedPeerID: PeerId = await new Promise((resolve) => {
        waku.libp2p.addEventListener("peer:connect", (evt) => {
          resolve(evt.detail.remotePeer);
        });
      });

      expect(connectedPeerID.toString()).to.eq(multiAddrWithId.getPeerId());
    });

    it("Using a function", async function () {
      this.timeout(10_000);

      nwaku = new Nwaku(makeLogFileName(this));
      await nwaku.start();

      const nwakuMa = await nwaku.getMultiaddrWithId();

      waku = await createLightNode({
        staticNoiseKey: NOISE_KEY_1,
        libp2p: {
          peerDiscovery: [bootstrap({ list: [nwakuMa.toString()] })],
        },
      });
      await waku.start();

      const connectedPeerID: PeerId = await new Promise((resolve) => {
        waku.libp2p.addEventListener("peer:connect", (evt) => {
          resolve(evt.detail.remotePeer);
        });
      });

      const multiAddrWithId = await nwaku.getMultiaddrWithId();
      expect(connectedPeerID.toString()).to.eq(multiAddrWithId.getPeerId());
    });
  });
});

describe("Decryption Keys", () => {
  afterEach(function () {
    if (this.currentTest?.state === "failed") {
      console.log(`Test failed, log file name is ${makeLogFileName(this)}`);
    }
  });

  let waku1: RelayNode;
  let waku2: RelayNode;
  beforeEach(async function () {
    this.timeout(5000);
    [waku1, waku2] = await Promise.all([
      createRelayNode({ staticNoiseKey: NOISE_KEY_1 }).then((waku) =>
        waku.start().then(() => waku)
      ),
      createRelayNode({
        staticNoiseKey: NOISE_KEY_2,
        libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } },
      }).then((waku) => waku.start().then(() => waku)),
    ]);

    await waku1.libp2p.peerStore.addressBook.set(
      waku2.libp2p.peerId,
      waku2.libp2p.getMultiaddrs()
    );
    await waku1.dial(waku2.libp2p.peerId);

    await Promise.all([
      waitForRemotePeer(waku1, [Protocols.Relay]),
      waitForRemotePeer(waku2, [Protocols.Relay]),
    ]);
  });

  afterEach(async function () {
    !!waku1 && waku1.stop().catch((e) => console.log("Waku failed to stop", e));
    !!waku2 && waku2.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  it("Used by Waku Relay", async function () {
    this.timeout(10000);

    const symKey = generateSymmetricKey();
    const decoder = createDecoder(TestContentTopic, symKey);

    const encoder = createEncoder({
      contentTopic: TestContentTopic,
      symKey,
    });
    const messageText = "Message is encrypted";
    const messageTimestamp = new Date("1995-12-17T03:24:00");
    const message = {
      payload: utf8ToBytes(messageText),
      timestamp: messageTimestamp,
    };

    const receivedMsgPromise: Promise<DecodedMessage> = new Promise(
      (resolve) => {
        waku2.relay.subscribe([decoder], resolve);
      }
    );

    await waku1.relay.send(encoder, message);

    const receivedMsg = await receivedMsgPromise;

    expect(receivedMsg.contentTopic).to.eq(TestContentTopic);
    expect(bytesToUtf8(receivedMsg.payload)).to.eq(messageText);
    expect(receivedMsg.timestamp?.valueOf()).to.eq(messageTimestamp.valueOf());
  });
});

describe("User Agent", () => {
  let waku1: Waku;
  let waku2: Waku;

  afterEach(async function () {
    !!waku1 && waku1.stop().catch((e) => console.log("Waku failed to stop", e));
    !!waku2 && waku2.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  it("Sets default value correctly", async function () {
    this.timeout(20_000);

    const waku1UserAgent = "test-user-agent";

    [waku1, waku2] = await Promise.all([
      createRelayNode({
        staticNoiseKey: NOISE_KEY_1,
        userAgent: waku1UserAgent,
      }).then((waku) => waku.start().then(() => waku)),
      createRelayNode({
        staticNoiseKey: NOISE_KEY_2,
        libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } },
      }).then((waku) => waku.start().then(() => waku)),
    ]);

    await waku1.libp2p.peerStore.addressBook.set(
      waku2.libp2p.peerId,
      waku2.libp2p.getMultiaddrs()
    );
    await waku1.dial(waku2.libp2p.peerId);
    await waitForRemotePeer(waku1);

    const [waku1PeerInfo, waku2PeerInfo] = await Promise.all([
      waku2.libp2p.peerStore.metadataBook.get(waku1.libp2p.peerId),
      waku1.libp2p.peerStore.metadataBook.get(waku2.libp2p.peerId),
    ]);

    expect(bytesToUtf8(waku1PeerInfo.get("AgentVersion")!)).to.eq(
      waku1UserAgent
    );
    expect(bytesToUtf8(waku2PeerInfo.get("AgentVersion")!)).to.eq(
      DefaultUserAgent
    );
  });
});
