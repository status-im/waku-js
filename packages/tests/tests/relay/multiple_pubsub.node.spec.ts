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
  MessageCollector,
  NOISE_KEY_1,
  NOISE_KEY_2,
  NOISE_KEY_3,
  tearDownNodes
} from "../../src/index.js";

import {
  CustomDecoder,
  CustomEncoder,
  CustomPubSubTopic,
  TestDecoder,
  TestEncoder
} from "./utils.js";

describe("Custom pubsub topic", function () {
  this.timeout(15000);
  let waku1: RelayNode;
  let waku2: RelayNode;
  let waku3: RelayNode;

  afterEach(async function () {
    this.timeout(15000);
    tearDownNodes([], [waku1, waku2, waku3]);
  });

  [
    {
      pubsub: CustomPubSubTopic,
      encoder: CustomEncoder,
      decoder: CustomDecoder
    },
    {
      pubsub: DefaultPubSubTopic,
      encoder: TestEncoder,
      decoder: TestDecoder
    }
  ].forEach((testItem) => {
    it(`3 nodes on ${testItem.pubsub} topic`, async function () {
      const [msgCollector1, msgCollector2, msgCollector3] = Array(3)
        .fill(null)
        .map(() => new MessageCollector());

      [waku1, waku2, waku3] = await Promise.all([
        createRelayNode({
          pubSubTopics: [testItem.pubsub],
          staticNoiseKey: NOISE_KEY_1
        }).then((waku) => waku.start().then(() => waku)),
        createRelayNode({
          pubSubTopics: [testItem.pubsub],
          staticNoiseKey: NOISE_KEY_2,
          libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } }
        }).then((waku) => waku.start().then(() => waku)),
        createRelayNode({
          pubSubTopics: [testItem.pubsub],
          staticNoiseKey: NOISE_KEY_3
        }).then((waku) => waku.start().then(() => waku))
      ]);

      await waku1.libp2p.peerStore.merge(waku2.libp2p.peerId, {
        multiaddrs: waku2.libp2p.getMultiaddrs()
      });
      await waku3.libp2p.peerStore.merge(waku2.libp2p.peerId, {
        multiaddrs: waku2.libp2p.getMultiaddrs()
      });
      await Promise.all([
        waku1.dial(waku2.libp2p.peerId),
        waku3.dial(waku2.libp2p.peerId)
      ]);

      await Promise.all([
        waitForRemotePeer(waku1, [Protocols.Relay]),
        waitForRemotePeer(waku2, [Protocols.Relay]),
        waitForRemotePeer(waku3, [Protocols.Relay])
      ]);

      await waku1.relay.subscribe([testItem.decoder], msgCollector1.callback);
      await waku2.relay.subscribe([testItem.decoder], msgCollector2.callback);
      await waku3.relay.subscribe([testItem.decoder], msgCollector3.callback);

      // The nodes are setup in such a way that all messages send should be relayed to the other nodes in the network
      const relayResponse1 = await waku1.relay.send(testItem.encoder, {
        payload: utf8ToBytes("M1")
      });
      const relayResponse2 = await waku2.relay.send(testItem.encoder, {
        payload: utf8ToBytes("M2")
      });
      const relayResponse3 = await waku3.relay.send(testItem.encoder, {
        payload: utf8ToBytes("M3")
      });

      expect(relayResponse1.recipients[0].toString()).to.eq(
        waku2.libp2p.peerId.toString()
      );
      expect(relayResponse3.recipients[0].toString()).to.eq(
        waku2.libp2p.peerId.toString()
      );
      expect(relayResponse2.recipients.map((r) => r.toString())).to.include(
        waku1.libp2p.peerId.toString()
      );
      expect(relayResponse2.recipients.map((r) => r.toString())).to.include(
        waku3.libp2p.peerId.toString()
      );

      expect(await msgCollector1.waitForMessages(2, { exact: true })).to.eq(
        true
      );
      expect(await msgCollector2.waitForMessages(2, { exact: true })).to.eq(
        true
      );
      expect(await msgCollector3.waitForMessages(2, { exact: true })).to.eq(
        true
      );

      expect(msgCollector1.hasMessage(testItem.pubsub, "M2")).to.be.true;
      expect(msgCollector1.hasMessage(testItem.pubsub, "M3")).to.be.true;
      expect(msgCollector2.hasMessage(testItem.pubsub, "M1")).to.be.true;
      expect(msgCollector2.hasMessage(testItem.pubsub, "M3")).to.be.true;
      expect(msgCollector3.hasMessage(testItem.pubsub, "M1")).to.be.true;
      expect(msgCollector3.hasMessage(testItem.pubsub, "M2")).to.be.true;
    });
  });

  it("Nodes with multiple pubsub topic", async function () {
    const [msgCollector1, msgCollector2, msgCollector3] = Array(3)
      .fill(null)
      .map(() => new MessageCollector());

    // Waku1 and waku2 are using multiple pubsub topis
    [waku1, waku2, waku3] = await Promise.all([
      createRelayNode({
        pubSubTopics: [DefaultPubSubTopic, CustomPubSubTopic],
        staticNoiseKey: NOISE_KEY_1
      }).then((waku) => waku.start().then(() => waku)),
      createRelayNode({
        pubSubTopics: [DefaultPubSubTopic, CustomPubSubTopic],
        staticNoiseKey: NOISE_KEY_2,
        libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } }
      }).then((waku) => waku.start().then(() => waku)),
      createRelayNode({
        pubSubTopics: [DefaultPubSubTopic],
        staticNoiseKey: NOISE_KEY_3
      }).then((waku) => waku.start().then(() => waku))
    ]);

    await waku1.libp2p.peerStore.merge(waku2.libp2p.peerId, {
      multiaddrs: waku2.libp2p.getMultiaddrs()
    });
    await waku3.libp2p.peerStore.merge(waku2.libp2p.peerId, {
      multiaddrs: waku2.libp2p.getMultiaddrs()
    });
    await Promise.all([
      waku1.dial(waku2.libp2p.peerId),
      waku3.dial(waku2.libp2p.peerId)
    ]);

    await Promise.all([
      waitForRemotePeer(waku1, [Protocols.Relay]),
      waitForRemotePeer(waku2, [Protocols.Relay]),
      waitForRemotePeer(waku3, [Protocols.Relay])
    ]);

    await waku1.relay.subscribe(
      [TestDecoder, CustomDecoder],
      msgCollector1.callback
    );
    await waku2.relay.subscribe(
      [TestDecoder, CustomDecoder],
      msgCollector2.callback
    );
    await waku3.relay.subscribe([TestDecoder], msgCollector3.callback);

    // The nodes are setup in such a way that all messages send should be relayed to the other nodes in the network
    // However onlt waku1 and waku2 are receiving messages on the CustomPubSubTopic
    await waku1.relay.send(TestEncoder, { payload: utf8ToBytes("M1") });
    await waku1.relay.send(CustomEncoder, { payload: utf8ToBytes("M2") });
    await waku2.relay.send(TestEncoder, { payload: utf8ToBytes("M3") });
    await waku2.relay.send(CustomEncoder, { payload: utf8ToBytes("M4") });
    await waku3.relay.send(TestEncoder, { payload: utf8ToBytes("M5") });
    await waku3.relay.send(CustomEncoder, { payload: utf8ToBytes("M6") });

    expect(await msgCollector1.waitForMessages(3, { exact: true })).to.eq(true);
    expect(await msgCollector2.waitForMessages(3, { exact: true })).to.eq(true);
    expect(await msgCollector3.waitForMessages(2, { exact: true })).to.eq(true);

    expect(msgCollector1.hasMessage(DefaultPubSubTopic, "M3")).to.be.true;
    expect(msgCollector1.hasMessage(CustomPubSubTopic, "M4")).to.be.true;
    expect(msgCollector1.hasMessage(DefaultPubSubTopic, "M5")).to.be.true;
    expect(msgCollector1.hasMessage(DefaultPubSubTopic, "M1")).to.be.true;
    expect(msgCollector1.hasMessage(CustomPubSubTopic, "M2")).to.be.true;
    expect(msgCollector1.hasMessage(DefaultPubSubTopic, "M5")).to.be.true;
    expect(msgCollector2.hasMessage(CustomPubSubTopic, "M1")).to.be.true;
    expect(msgCollector2.hasMessage(DefaultPubSubTopic, "M3")).to.be.true;
    expect(msgCollector3.hasMessage(DefaultPubSubTopic, "M1")).to.be.true;
  });

  it("n1 and n2 uses a custom pubsub, n3 uses the default pubsub", async function () {
    [waku1, waku2, waku3] = await Promise.all([
      createRelayNode({
        pubSubTopics: [CustomPubSubTopic],
        staticNoiseKey: NOISE_KEY_1
      }).then((waku) => waku.start().then(() => waku)),
      createRelayNode({
        pubSubTopics: [CustomPubSubTopic],
        staticNoiseKey: NOISE_KEY_2,
        libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } }
      }).then((waku) => waku.start().then(() => waku)),
      createRelayNode({
        staticNoiseKey: NOISE_KEY_3
      }).then((waku) => waku.start().then(() => waku))
    ]);

    await waku1.libp2p.peerStore.merge(waku2.libp2p.peerId, {
      multiaddrs: waku2.libp2p.getMultiaddrs()
    });
    await waku3.libp2p.peerStore.merge(waku2.libp2p.peerId, {
      multiaddrs: waku2.libp2p.getMultiaddrs()
    });
    await Promise.all([
      waku1.dial(waku2.libp2p.peerId),
      waku3.dial(waku2.libp2p.peerId)
    ]);

    await Promise.all([
      waitForRemotePeer(waku1, [Protocols.Relay]),
      waitForRemotePeer(waku2, [Protocols.Relay])
    ]);

    const messageText = "Communicating using a custom pubsub topic";

    const waku2ReceivedMsgPromise: Promise<DecodedMessage> = new Promise(
      (resolve) => {
        void waku2.relay.subscribe([CustomDecoder], resolve);
      }
    );

    // The promise **fails** if we receive a message on the default
    // pubsub topic.
    const waku3NoMsgPromise: Promise<DecodedMessage> = new Promise(
      (resolve, reject) => {
        void waku3.relay.subscribe([TestDecoder], reject);
        setTimeout(resolve, 1000);
      }
    );

    await waku1.relay.send(CustomEncoder, {
      payload: utf8ToBytes(messageText)
    });

    const waku2ReceivedMsg = await waku2ReceivedMsgPromise;
    await waku3NoMsgPromise;

    expect(bytesToUtf8(waku2ReceivedMsg.payload!)).to.eq(messageText);
    expect(waku2ReceivedMsg.pubSubTopic).to.eq(CustomPubSubTopic);
  });
});
