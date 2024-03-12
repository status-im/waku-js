import { createDecoder, waitForRemotePeer } from "@waku/core";
import type { ContentTopicInfo, IMessage, LightNode } from "@waku/interfaces";
import { createLightNode, Protocols } from "@waku/sdk";
import {
  contentTopicToPubsubTopic,
  pubsubTopicToSingleShardInfo
} from "@waku/utils";
import { expect } from "chai";

import {
  afterEachCustom,
  beforeEachCustom,
  makeLogFileName,
  NOISE_KEY_1,
  ServiceNode,
  tearDownNodes
} from "../../src/index.js";

import {
  customContentTopic1,
  customContentTopic2,
  customDecoder1,
  customDecoder2,
  customShardedPubsubTopic1,
  customShardedPubsubTopic2,
  customShardInfo1,
  customShardInfo2,
  processQueriedMessages,
  sendMessages,
  sendMessagesAutosharding,
  shardInfo1,
  shardInfoBothShards,
  singleShardInfosToShardInfo,
  startAndConnectLightNode,
  totalMsgs
} from "./utils.js";

describe("Waku Store, custom pubsub topic", function () {
  this.timeout(15000);
  let waku: LightNode;
  let nwaku: ServiceNode;
  let nwaku2: ServiceNode;

  beforeEachCustom(this, async () => {
    nwaku = new ServiceNode(makeLogFileName(this.ctx));
    await nwaku.start({
      store: true,
      pubsubTopic: [customShardedPubsubTopic1, customShardedPubsubTopic2],
      clusterId: customShardInfo1.clusterId,
      relay: true
    });
    await nwaku.ensureSubscriptions([
      customShardedPubsubTopic1,
      customShardedPubsubTopic2
    ]);
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([nwaku, nwaku2], waku);
  });

  it("Generator, custom pubsub topic", async function () {
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic1,
      customShardedPubsubTopic1
    );
    waku = await startAndConnectLightNode(nwaku, [], shardInfo1);
    const messages = await processQueriedMessages(
      waku,
      [customDecoder1],
      customShardedPubsubTopic1
    );

    expect(messages?.length).eq(totalMsgs);
    const result = messages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result).to.not.eq(-1);
  });

  it("Generator, 2 different pubsubtopics", async function () {
    this.timeout(10000);

    const totalMsgs = 10;
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic1,
      customShardedPubsubTopic1
    );
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic2,
      customShardedPubsubTopic2
    );

    waku = await startAndConnectLightNode(nwaku, [], shardInfoBothShards);

    const customMessages = await processQueriedMessages(
      waku,
      [customDecoder1],
      customShardedPubsubTopic1
    );
    expect(customMessages?.length).eq(totalMsgs);
    const result1 = customMessages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result1).to.not.eq(-1);

    const testMessages = await processQueriedMessages(
      waku,
      [customDecoder2],
      customShardedPubsubTopic2
    );
    expect(testMessages?.length).eq(totalMsgs);
    const result2 = testMessages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result2).to.not.eq(-1);
  });

  it("Generator, 2 nwaku nodes each with different pubsubtopics", async function () {
    this.timeout(10000);

    // Set up and start a new nwaku node with Default Pubsubtopic
    nwaku2 = new ServiceNode(makeLogFileName(this) + "2");
    await nwaku2.start({
      store: true,
      pubsubTopic: [customShardedPubsubTopic2],
      clusterId: customShardInfo2.clusterId,
      relay: true
    });
    await nwaku2.ensureSubscriptions([customShardedPubsubTopic2]);

    const totalMsgs = 10;
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic1,
      customShardedPubsubTopic1
    );
    await sendMessages(
      nwaku2,
      totalMsgs,
      customContentTopic2,
      customShardedPubsubTopic2
    );

    waku = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
      shardInfo: shardInfoBothShards
    });
    await waku.start();

    await waku.dial(await nwaku.getMultiaddrWithId());
    await waku.dial(await nwaku2.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.Store]);

    let customMessages: IMessage[] = [];
    let testMessages: IMessage[] = [];

    while (
      customMessages.length != totalMsgs ||
      testMessages.length != totalMsgs
    ) {
      customMessages = await processQueriedMessages(
        waku,
        [customDecoder1],
        customShardedPubsubTopic1
      );
      testMessages = await processQueriedMessages(
        waku,
        [customDecoder2],
        customShardedPubsubTopic2
      );
    }
  });
});

// Skipped until https://github.com/waku-org/js-waku/issues/1845 gets fixed
describe.skip("Waku Store (Autosharding), custom pubsub topic", function () {
  this.timeout(15000);
  let waku: LightNode;
  let nwaku: ServiceNode;
  let nwaku2: ServiceNode;

  const customContentTopic1 = "/waku/2/content/utf8";
  const customContentTopic2 = "/myapp/1/latest/proto";
  const clusterId = 2;
  const autoshardingPubsubTopic1 = contentTopicToPubsubTopic(
    customContentTopic1,
    clusterId
  );
  const autoshardingPubsubTopic2 = contentTopicToPubsubTopic(
    customContentTopic2,
    clusterId
  );
  const contentTopicInfo1: ContentTopicInfo = {
    clusterId,
    contentTopics: [customContentTopic1]
  };
  const customDecoder1 = createDecoder(
    customContentTopic1,
    pubsubTopicToSingleShardInfo(autoshardingPubsubTopic1)
  );
  const customDecoder2 = createDecoder(
    customContentTopic2,
    pubsubTopicToSingleShardInfo(autoshardingPubsubTopic2)
  );
  const contentTopicInfoBothShards: ContentTopicInfo = {
    clusterId,
    contentTopics: [customContentTopic1, customContentTopic2]
  };

  beforeEachCustom(this, async () => {
    nwaku = new ServiceNode(makeLogFileName(this.ctx));
    await nwaku.start({
      store: true,
      pubsubTopic: [autoshardingPubsubTopic1, autoshardingPubsubTopic2],
      relay: true,
      clusterId
    });
    await nwaku.ensureSubscriptionsAutosharding([
      customContentTopic1,
      customContentTopic2
    ]);
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([nwaku, nwaku2], waku);
  });

  it("Generator, custom pubsub topic", async function () {
    await sendMessagesAutosharding(nwaku, totalMsgs, customContentTopic1);
    waku = await startAndConnectLightNode(nwaku, [], contentTopicInfo1);
    const messages = await processQueriedMessages(
      waku,
      [customDecoder1],
      autoshardingPubsubTopic1
    );

    expect(messages?.length).eq(totalMsgs);
    const result = messages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result).to.not.eq(-1);
  });

  it("Generator, 2 different pubsubtopics", async function () {
    this.timeout(10000);

    const totalMsgs = 10;
    await sendMessagesAutosharding(nwaku, totalMsgs, customContentTopic1);
    await sendMessagesAutosharding(nwaku, totalMsgs, customContentTopic2);

    waku = await startAndConnectLightNode(
      nwaku,
      [],
      contentTopicInfoBothShards
    );

    const customMessages = await processQueriedMessages(
      waku,
      [customDecoder1],
      autoshardingPubsubTopic1
    );
    expect(customMessages?.length).eq(totalMsgs);
    const result1 = customMessages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result1).to.not.eq(-1);

    const testMessages = await processQueriedMessages(
      waku,
      [customDecoder2],
      autoshardingPubsubTopic2
    );
    expect(testMessages?.length).eq(totalMsgs);
    const result2 = testMessages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result2).to.not.eq(-1);
  });

  it("Generator, 2 nwaku nodes each with different pubsubtopics", async function () {
    this.timeout(10000);

    // Set up and start a new nwaku node with Default Pubsubtopic
    nwaku2 = new ServiceNode(makeLogFileName(this) + "2");
    await nwaku2.start({
      store: true,
      pubsubTopic: [autoshardingPubsubTopic2],
      relay: true,
      clusterId
    });
    await nwaku2.ensureSubscriptionsAutosharding([customContentTopic2]);

    const totalMsgs = 10;
    await sendMessagesAutosharding(nwaku, totalMsgs, customContentTopic1);
    await sendMessagesAutosharding(nwaku2, totalMsgs, customContentTopic2);

    waku = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
      shardInfo: contentTopicInfoBothShards
    });
    await waku.start();

    await waku.dial(await nwaku.getMultiaddrWithId());
    await waku.dial(await nwaku2.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.Store]);

    let customMessages: IMessage[] = [];
    let testMessages: IMessage[] = [];

    while (
      customMessages.length != totalMsgs ||
      testMessages.length != totalMsgs
    ) {
      customMessages = await processQueriedMessages(
        waku,
        [customDecoder1],
        autoshardingPubsubTopic1
      );
      testMessages = await processQueriedMessages(
        waku,
        [customDecoder2],
        autoshardingPubsubTopic2
      );
    }
  });
});

describe("Waku Store (named sharding), custom pubsub topic", function () {
  this.timeout(15000);
  let waku: LightNode;
  let nwaku: ServiceNode;
  let nwaku2: ServiceNode;

  const customDecoder1 = createDecoder(
    customContentTopic1,
    customShardedPubsubTopic1
  );
  const customDecoder2 = createDecoder(
    customContentTopic2,
    customShardedPubsubTopic2
  );

  beforeEachCustom(this, async () => {
    const shardInfo = singleShardInfosToShardInfo([
      customShardInfo1,
      customShardInfo2
    ]);

    nwaku = new ServiceNode(makeLogFileName(this.ctx));
    await nwaku.start({
      store: true,
      relay: true,
      pubsubTopic: [customShardedPubsubTopic1, customShardedPubsubTopic2],
      clusterId: shardInfo.clusterId
    });
    await nwaku.ensureSubscriptions([
      customShardedPubsubTopic1,
      customShardedPubsubTopic2
    ]);

    waku = await startAndConnectLightNode(
      nwaku,
      [customShardedPubsubTopic1, customShardedPubsubTopic2],
      shardInfo
    );
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([nwaku, nwaku2], waku);
  });

  it("Generator, custom pubsub topic", async function () {
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic1,
      customShardedPubsubTopic1
    );

    const messages = await processQueriedMessages(
      waku,
      [customDecoder1],
      customShardedPubsubTopic1
    );

    expect(messages?.length).eq(totalMsgs);
    const result = messages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result).to.not.eq(-1);
  });

  it("Generator, 2 different pubsubtopics", async function () {
    this.timeout(10000);

    const totalMsgs = 10;
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic1,
      customShardedPubsubTopic1
    );
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic2,
      customShardedPubsubTopic2
    );

    const customMessages = await processQueriedMessages(
      waku,
      [customDecoder1],
      customShardedPubsubTopic1
    );
    expect(customMessages?.length).eq(totalMsgs);
    const result1 = customMessages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result1).to.not.eq(-1);

    const testMessages = await processQueriedMessages(
      waku,
      [customDecoder2],
      customShardedPubsubTopic2
    );
    expect(testMessages?.length).eq(totalMsgs);
    const result2 = testMessages?.findIndex((msg) => {
      return msg.payload![0]! === 0;
    });
    expect(result2).to.not.eq(-1);
  });

  it("Generator, 2 nwaku nodes each with different pubsubtopics", async function () {
    this.timeout(10000);

    // Set up and start a new nwaku node with Default Pubsubtopic
    nwaku2 = new ServiceNode(makeLogFileName(this) + "2");
    await nwaku2.start({
      store: true,
      pubsubTopic: [customShardedPubsubTopic2],
      relay: true,
      clusterId: customShardInfo2.clusterId
    });
    await nwaku2.ensureSubscriptions([customShardedPubsubTopic2]);

    const totalMsgs = 10;
    await sendMessages(
      nwaku,
      totalMsgs,
      customContentTopic1,
      customShardedPubsubTopic1
    );
    await sendMessages(
      nwaku2,
      totalMsgs,
      customContentTopic2,
      customShardedPubsubTopic2
    );

    await waku.dial(await nwaku2.getMultiaddrWithId());
    await waitForRemotePeer(waku, [Protocols.Store]);

    let customMessages: IMessage[] = [];
    let testMessages: IMessage[] = [];

    while (
      customMessages.length != totalMsgs ||
      testMessages.length != totalMsgs
    ) {
      customMessages = await processQueriedMessages(
        waku,
        [customDecoder1],
        customShardedPubsubTopic1
      );
      testMessages = await processQueriedMessages(
        waku,
        [customDecoder2],
        customShardedPubsubTopic2
      );
    }
  });
});
