import type { PeerId } from "@libp2p/interface";
import { createEncoder } from "@waku/core";
import {
  ContentTopicInfo,
  LightNode,
  NetworkConfig,
  Protocols,
  ShardInfo,
  SingleShardInfo
} from "@waku/interfaces";
import {
  contentTopicToPubsubTopic,
  contentTopicToShardIndex,
  pubsubTopicToSingleShardInfo,
  singleShardInfoToPubsubTopic
} from "@waku/utils";
import { utf8ToBytes } from "@waku/utils/bytes";
import { expect } from "chai";
import { Context } from "mocha";

import {
  afterEachCustom,
  beforeEachCustom,
  makeLogFileName,
  MessageCollector,
  ServiceNode,
  tearDownNodes
} from "../../../src/index.js";
import { messageText, runNodes } from "../utils.js";

describe("Waku Light Push : Multiple PubsubTopics", function () {
  this.timeout(30000);
  let waku: LightNode;
  let nwaku: ServiceNode;
  let nwaku2: ServiceNode;
  let messageCollector: MessageCollector;

  const shardInfo: ShardInfo = { clusterId: 3, shards: [1, 2] };
  const singleShardInfo1: SingleShardInfo = { clusterId: 3, shard: 1 };
  const singleShardInfo2: SingleShardInfo = { clusterId: 3, shard: 2 };

  const customPubsubTopic1 = singleShardInfoToPubsubTopic(singleShardInfo1);
  const customPubsubTopic2 = singleShardInfoToPubsubTopic(singleShardInfo2);
  const customContentTopic1 = "/test/2/waku-light-push/utf8";
  const customContentTopic2 = "/test/3/waku-light-push/utf8";
  const customEncoder1 = createEncoder({
    pubsubTopicShardInfo: singleShardInfo1,
    contentTopic: customContentTopic1
  });
  const customEncoder2 = createEncoder({
    pubsubTopicShardInfo: singleShardInfo2,
    contentTopic: customContentTopic2
  });

  let node1PeerId: PeerId;

  beforeEachCustom(this, async () => {
    [nwaku, waku] = await runNodes(this.ctx, shardInfo);
    messageCollector = new MessageCollector(nwaku);
    node1PeerId = await nwaku.getPeerId();
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([nwaku, nwaku2], waku);
  });

  it("Push message on custom pubsubTopic", async function () {
    const pushResponse = await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes(messageText)
    });

    expect(pushResponse.successes[0].toString()).to.eq(node1PeerId.toString());

    expect(
      await messageCollector.waitForMessages(1, {
        pubsubTopic: customPubsubTopic1
      })
    ).to.eq(true);
    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: messageText,
      expectedContentTopic: customContentTopic1
    });
  });

  it("Subscribe and receive messages on 2 different pubsubtopics", async function () {
    const pushResponse1 = await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes("M1")
    });
    const pushResponse2 = await waku.lightPush.send(customEncoder2, {
      payload: utf8ToBytes("M2")
    });
    expect(pushResponse1.successes[0].toString()).to.eq(node1PeerId.toString());
    expect(pushResponse2.successes[0].toString()).to.eq(node1PeerId.toString());

    const messageCollector2 = new MessageCollector(nwaku);

    expect(
      await messageCollector.waitForMessages(1, {
        pubsubTopic: customPubsubTopic1
      })
    ).to.eq(true);

    expect(
      await messageCollector2.waitForMessages(1, {
        pubsubTopic: customPubsubTopic2
      })
    ).to.eq(true);

    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: "M1",
      expectedContentTopic: customContentTopic1,
      expectedPubsubTopic: customPubsubTopic1
    });
    messageCollector2.verifyReceivedMessage(0, {
      expectedMessageText: "M2",
      expectedContentTopic: customContentTopic2,
      expectedPubsubTopic: customPubsubTopic2
    });
  });

  it("Light push messages to 2 nwaku nodes each with different pubsubtopics", async function () {
    // Set up and start a new nwaku node with Default PubsubTopic
    nwaku2 = new ServiceNode(makeLogFileName(this) + "2");
    await nwaku2.start({
      filter: true,
      lightpush: true,
      relay: true,
      pubsubTopic: [singleShardInfoToPubsubTopic(singleShardInfo2)],
      clusterId: singleShardInfo2.clusterId
    });
    await nwaku2.ensureSubscriptions([
      singleShardInfoToPubsubTopic(singleShardInfo2)
    ]);
    await waku.dial(await nwaku2.getMultiaddrWithId());
    await waku.waitForPeers([Protocols.LightPush]);

    const messageCollector2 = new MessageCollector(nwaku2);

    await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes("M1")
    });
    await waku.lightPush.send(customEncoder2, {
      payload: utf8ToBytes("M2")
    });

    await messageCollector.waitForMessages(1, {
      pubsubTopic: customPubsubTopic1
    });

    await messageCollector2.waitForMessages(1, {
      pubsubTopic: singleShardInfoToPubsubTopic(singleShardInfo2)
    });

    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: "M1",
      expectedContentTopic: customContentTopic1,
      expectedPubsubTopic: customPubsubTopic1
    });
    messageCollector2.verifyReceivedMessage(0, {
      expectedMessageText: "M2",
      expectedContentTopic: customContentTopic2,
      expectedPubsubTopic: singleShardInfoToPubsubTopic(singleShardInfo2)
    });
  });
});

describe("Waku Light Push (Autosharding): Multiple PubsubTopics", function () {
  this.timeout(30000);
  let waku: LightNode;
  let nwaku: ServiceNode;
  let nwaku2: ServiceNode;
  let messageCollector: MessageCollector;

  const clusterId = 4;
  const customContentTopic1 = "/waku/2/content/test.js";
  const customContentTopic2 = "/myapp/1/latest/proto";
  const autoshardingPubsubTopic1 = contentTopicToPubsubTopic(
    customContentTopic1,
    clusterId
  );
  const autoshardingPubsubTopic2 = contentTopicToPubsubTopic(
    customContentTopic2,
    clusterId
  );
  const shardInfo: ContentTopicInfo = {
    clusterId,
    contentTopics: [customContentTopic1, customContentTopic2]
  };
  const customEncoder1 = createEncoder({
    contentTopic: customContentTopic1,
    pubsubTopicShardInfo: pubsubTopicToSingleShardInfo(autoshardingPubsubTopic1)
  });
  const customEncoder2 = createEncoder({
    contentTopic: customContentTopic2,
    pubsubTopicShardInfo: pubsubTopicToSingleShardInfo(autoshardingPubsubTopic2)
  });

  let node1PeerId: PeerId;

  beforeEachCustom(this, async () => {
    [nwaku, waku] = await runNodes(this.ctx, shardInfo);
    messageCollector = new MessageCollector(nwaku);
    node1PeerId = await nwaku.getPeerId();
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([nwaku, nwaku2], waku);
  });

  it("Push message on custom pubsubTopic", async function () {
    const pushResponse = await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes(messageText)
    });

    expect(pushResponse.failures).to.be.empty;
    expect(pushResponse.successes[0].toString()).to.eq(node1PeerId.toString());

    expect(
      await messageCollector.waitForMessagesAutosharding(1, {
        contentTopic: customContentTopic1
      })
    ).to.eq(true);
    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: messageText,
      expectedContentTopic: customContentTopic1
    });
  });

  it("Subscribe and receive messages on 2 different pubsubtopics", async function () {
    const pushResponse1 = await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes("M1")
    });
    const pushResponse2 = await waku.lightPush.send(customEncoder2, {
      payload: utf8ToBytes("M2")
    });
    expect(pushResponse1.successes[0].toString()).to.eq(node1PeerId.toString());
    expect(pushResponse2.successes[0].toString()).to.eq(node1PeerId.toString());

    const messageCollector2 = new MessageCollector(nwaku);

    expect(
      await messageCollector.waitForMessagesAutosharding(1, {
        contentTopic: customContentTopic1
      })
    ).to.eq(true);

    expect(
      await messageCollector2.waitForMessagesAutosharding(1, {
        contentTopic: customContentTopic2
      })
    ).to.eq(true);

    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: "M1",
      expectedContentTopic: customContentTopic1,
      expectedPubsubTopic: autoshardingPubsubTopic1
    });
    messageCollector2.verifyReceivedMessage(0, {
      expectedMessageText: "M2",
      expectedContentTopic: customContentTopic2,
      expectedPubsubTopic: autoshardingPubsubTopic2
    });
  });

  it("Light push messages to 2 nwaku nodes each with different pubsubtopics", async function () {
    // Set up and start a new nwaku node with Default PubsubTopic
    nwaku2 = new ServiceNode(makeLogFileName(this) + "2");
    await nwaku2.start({
      filter: true,
      lightpush: true,
      relay: true,
      pubsubTopic: [autoshardingPubsubTopic2],
      clusterId: shardInfo.clusterId
    });
    await nwaku2.ensureSubscriptionsAutosharding([customContentTopic2]);
    await waku.dial(await nwaku2.getMultiaddrWithId());
    await waku.waitForPeers([Protocols.LightPush]);

    const messageCollector2 = new MessageCollector(nwaku2);

    await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes("M1")
    });
    await waku.lightPush.send(customEncoder2, {
      payload: utf8ToBytes("M2")
    });

    await messageCollector.waitForMessagesAutosharding(1, {
      contentTopic: customContentTopic1
    });
    await messageCollector2.waitForMessagesAutosharding(1, {
      contentTopic: customContentTopic2
    });

    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: "M1",
      expectedContentTopic: customContentTopic1,
      expectedPubsubTopic: autoshardingPubsubTopic1
    });
    messageCollector2.verifyReceivedMessage(0, {
      expectedMessageText: "M2",
      expectedContentTopic: customContentTopic2,
      expectedPubsubTopic: autoshardingPubsubTopic2
    });
  });
});

describe("Waku Light Push (named sharding): Multiple PubsubTopics", function () {
  this.timeout(30000);
  let waku: LightNode;
  let waku2: LightNode;
  let nwaku: ServiceNode;
  let nwaku2: ServiceNode;
  let messageCollector: MessageCollector;
  let ctx: Context;

  const clusterId = 3;
  const customContentTopic1 = "/waku/2/content/utf8";
  const customContentTopic2 = "/myapp/1/latest/proto";
  const autoshardingPubsubTopic1 = contentTopicToPubsubTopic(
    customContentTopic1,
    clusterId
  );
  const autoshardingPubsubTopic2 = contentTopicToPubsubTopic(
    customContentTopic2,
    clusterId
  );

  const shardInfo1 = {
    clusterId,
    shards: [contentTopicToShardIndex(customContentTopic1)]
  };
  const customEncoder1 = createEncoder({
    contentTopic: customContentTopic1,
    pubsubTopicShardInfo: shardInfo1
  });

  const shardInfo2 = {
    clusterId,
    shards: [contentTopicToShardIndex(customContentTopic2)]
  };
  const customEncoder2 = createEncoder({
    contentTopic: customContentTopic2,
    pubsubTopicShardInfo: shardInfo2
  });

  const testShardInfo: NetworkConfig = {
    clusterId,
    shards: [
      contentTopicToShardIndex(customContentTopic1),
      contentTopicToShardIndex(customContentTopic2)
    ]
  };

  let node1PeerId: PeerId;

  beforeEachCustom(this, async () => {
    ctx = this.ctx;
    [nwaku, waku] = await runNodes(ctx, testShardInfo);
    messageCollector = new MessageCollector(nwaku);
    node1PeerId = await nwaku.getPeerId();
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([nwaku, nwaku2], [waku, waku2]);
  });

  it("Push message on custom pubsubTopic", async function () {
    const pushResponse = await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes(messageText)
    });

    expect(pushResponse.successes[0].toString()).to.eq(node1PeerId.toString());

    expect(
      await messageCollector.waitForMessages(1, {
        pubsubTopic: autoshardingPubsubTopic1
      })
    ).to.eq(true);
    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: messageText,
      expectedContentTopic: customContentTopic1
    });
  });

  it("Subscribe and receive messages on 2 different pubsubtopics", async function () {
    const pushResponse1 = await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes("M1")
    });
    const pushResponse2 = await waku.lightPush.send(customEncoder2, {
      payload: utf8ToBytes("M2")
    });
    expect(pushResponse1.successes[0].toString()).to.eq(node1PeerId.toString());
    expect(pushResponse2.successes[0].toString()).to.eq(node1PeerId.toString());

    const messageCollector2 = new MessageCollector(nwaku);

    expect(
      await messageCollector.waitForMessages(1, {
        pubsubTopic: autoshardingPubsubTopic1
      })
    ).to.eq(true);

    expect(
      await messageCollector2.waitForMessages(1, {
        pubsubTopic: autoshardingPubsubTopic2
      })
    ).to.eq(true);

    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: "M1",
      expectedContentTopic: customContentTopic1,
      expectedPubsubTopic: autoshardingPubsubTopic1
    });
    messageCollector2.verifyReceivedMessage(0, {
      expectedMessageText: "M2",
      expectedContentTopic: customContentTopic2,
      expectedPubsubTopic: autoshardingPubsubTopic2
    });
  });

  it("Light push messages to 2 nwaku nodes each with different pubsubtopics", async function () {
    // Set up and start a new nwaku node with Default PubsubTopic
    [nwaku2] = await runNodes(ctx, shardInfo2);

    await nwaku2.ensureSubscriptions([autoshardingPubsubTopic2]);
    await waku.dial(await nwaku2.getMultiaddrWithId());
    await waku.waitForPeers([Protocols.LightPush]);

    const messageCollector2 = new MessageCollector(nwaku2);

    const { failures: f1 } = await waku.lightPush.send(customEncoder1, {
      payload: utf8ToBytes("M1")
    });
    const { failures: f2 } = await waku.lightPush.send(customEncoder2, {
      payload: utf8ToBytes("M2")
    });

    expect(f1).to.be.empty;
    expect(f2).to.be.empty;

    await messageCollector.waitForMessages(1, {
      pubsubTopic: autoshardingPubsubTopic1
    });
    await messageCollector2.waitForMessages(1, {
      pubsubTopic: autoshardingPubsubTopic2
    });

    messageCollector.verifyReceivedMessage(0, {
      expectedMessageText: "M1",
      expectedContentTopic: customContentTopic1,
      expectedPubsubTopic: autoshardingPubsubTopic1
    });
    messageCollector2.verifyReceivedMessage(0, {
      expectedMessageText: "M2",
      expectedContentTopic: customContentTopic2,
      expectedPubsubTopic: autoshardingPubsubTopic2
    });
  });
});
