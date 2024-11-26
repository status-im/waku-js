import { ISubscription, LightNode, SDKProtocolResult } from "@waku/interfaces";
import {
  createDecoder,
  createEncoder,
  DecodedMessage,
  utf8ToBytes
} from "@waku/sdk";
import { delay } from "@waku/utils";
import { expect } from "chai";
import { describe } from "mocha";

import {
  afterEachCustom,
  beforeEachCustom,
  DefaultTestPubsubTopic,
  DefaultTestShardInfo,
  runMultipleNodes,
  ServiceNode,
  ServiceNodesFleet,
  teardownNodesWithRedundancy
} from "../../src/index.js";

describe("Waku Filter: Peer Management: E2E", function () {
  this.timeout(15000);
  let waku: LightNode;
  let serviceNodes: ServiceNodesFleet;

  const contentTopic = "/test";

  const encoder = createEncoder({
    pubsubTopic: DefaultTestPubsubTopic,
    contentTopic
  });

  const decoder = createDecoder(contentTopic, DefaultTestPubsubTopic);

  beforeEachCustom(this, async () => {
    [serviceNodes, waku] = await runMultipleNodes(
      this.ctx,
      DefaultTestShardInfo,
      { lightpush: true, filter: true },
      undefined,
      5
    );
  });

  afterEachCustom(this, async () => {
    await teardownNodesWithRedundancy(serviceNodes, waku);
  });

  it("Number of peers are maintained correctly", async function () {
    const messages: DecodedMessage[] = [];
    const { error, results } = await waku.filter.subscribe([decoder], (msg) => {
      messages.push(msg);
    });

    if (error) {
      throw error;
    }

    const { successes, failures } = results;

    await waku.lightPush.send(encoder, {
      payload: utf8ToBytes("Hello_World")
    });

    expect(successes.length).to.be.greaterThan(0);
    expect(successes.length).to.be.equal(waku.filter.numPeersToUse);

    if (failures) {
      expect(failures.length).to.equal(0);
    }
  });

  it("Ping succeeds for all connected peers", async function () {
    const { error, subscription } = await waku.filter.subscribe(
      [decoder],
      () => {}
    );
    if (error) {
      throw error;
    }
    const pingResult = await subscription.ping();
    expect(pingResult.successes.length).to.equal(waku.filter.numPeersToUse);
    expect(pingResult.failures.length).to.equal(0);
  });

  it("Ping fails for unsubscribed peers", async function () {
    const { error, subscription } = await waku.filter.subscribe(
      [decoder],
      () => {}
    );
    if (error) {
      throw error;
    }
    await subscription.unsubscribe([contentTopic]);
    const pingResult = await subscription.ping();
    expect(pingResult.successes.length).to.equal(0);
    expect(pingResult.failures.length).to.be.greaterThan(0);
  });

  it("Keep-alive pings maintain the connection", async function () {
    const { error, subscription } = await waku.filter.subscribe(
      [decoder],
      () => {},
      undefined,
      { keepAlive: 100 }
    );
    if (error) {
      throw error;
    }

    await delay(1000);

    const pingResult = await subscription.ping();
    expect(pingResult.successes.length).to.equal(waku.filter.numPeersToUse);
    expect(pingResult.failures.length).to.equal(0);
  });

  it("Renews peer on consistent ping failures", async function () {
    const maxPingFailures = 3;
    const { error, subscription } = await waku.filter.subscribe(
      [decoder],
      () => {},
      undefined,
      {
        pingsBeforePeerRenewed: maxPingFailures
      }
    );
    if (error) {
      throw error;
    }

    const disconnectedNodePeerId = waku.filter.connectedPeers[0].id;
    await waku.connectionManager.dropConnection(disconnectedNodePeerId);

    // Ping multiple times to exceed max failures
    for (let i = 0; i <= maxPingFailures; i++) {
      await subscription.ping();
      await delay(100);
    }

    const pingResult = await subscription.ping();
    expect(pingResult.successes.length).to.equal(waku.filter.numPeersToUse);
    expect(pingResult.failures.length).to.equal(0);

    expect(waku.filter.connectedPeers.length).to.equal(
      waku.filter.numPeersToUse
    );
    expect(
      waku.filter.connectedPeers.some((peer) =>
        peer.id.equals(disconnectedNodePeerId)
      )
    ).to.eq(false);
  });

  it("Tracks peer failures correctly", async function () {
    const maxPingFailures = 3;
    const { error, subscription } = await waku.filter.subscribe(
      [decoder],
      () => {},
      undefined,
      {
        pingsBeforePeerRenewed: maxPingFailures
      }
    );
    if (error) {
      throw error;
    }

    const targetPeer = waku.filter.connectedPeers[0];
    await waku.connectionManager.dropConnection(targetPeer.id);

    for (let i = 0; i < maxPingFailures; i++) {
      await subscription.ping(targetPeer.id);
    }

    // At this point, the peer should not be renewed yet
    expect(
      waku.filter.connectedPeers.some((peer) => peer.id.equals(targetPeer.id))
    ).to.be.true;

    // One more failure should trigger renewal
    await subscription.ping(targetPeer.id);

    // adds delay as renewal happens as an async operation in the bg
    await delay(300);

    expect(
      waku.filter.connectedPeers.some((peer) => peer.id.equals(targetPeer.id))
    ).to.eq(false);
    expect(waku.filter.connectedPeers.length).to.equal(
      waku.filter.numPeersToUse
    );
  });

  it("Maintains correct number of peers after multiple subscribe/unsubscribe cycles", async function () {
    let subscription: ISubscription;
    for (let i = 0; i < 3; i++) {
      const { error, subscription: _subscription } =
        await waku.filter.subscribe([decoder], () => {});
      if (error) {
        throw error;
      }
      subscription = _subscription;
      let pingResult = await subscription.ping();
      expect(pingResult.successes.length).to.equal(waku.filter.numPeersToUse);

      await subscription.unsubscribe([contentTopic]);
      pingResult = await subscription.ping();
      expect(pingResult.failures.length).to.be.greaterThan(0);
      await subscription.subscribe([decoder], () => {});
    }

    const finalPingResult = await subscription!.ping();
    expect(finalPingResult.successes.length).to.equal(
      waku.filter.numPeersToUse
    );
  });

  it("Renews peer on consistent missed messages", async function () {
    const [serviceNodes, waku] = await runMultipleNodes(
      this.ctx,
      DefaultTestShardInfo,
      { lightpush: true, filter: true },
      undefined,
      2
    );
    const serviceNodesPeerIdStr = await Promise.all(
      serviceNodes.nodes.map(async (node) =>
        (await node.getPeerId()).toString()
      )
    );
    const nodeWithoutDiscovery = new ServiceNode("WithoutDiscovery");
    await nodeWithoutDiscovery.start({ lightpush: true, filter: true });
    const nodeWithouDiscoveryPeerIdStr = (
      await nodeWithoutDiscovery.getPeerId()
    ).toString();
    await waku.dial(await nodeWithoutDiscovery.getMultiaddrWithId());

    const messages: DecodedMessage[] = [];
    const { error, results } = await waku.filter.subscribe([decoder], (msg) => {
      messages.push(msg);
    });
    if (error) {
      throw error;
    }

    const { successes } = results;

    expect(successes.length).to.be.greaterThan(0);
    expect(successes.length).to.be.equal(waku.filter.numPeersToUse);

    const sendMessage: () => Promise<SDKProtocolResult> = async () =>
      waku.lightPush.send(encoder, {
        payload: utf8ToBytes("Hello_World")
      });

    await sendMessage();

    successes
      .map((peerId) =>
        [nodeWithouDiscoveryPeerIdStr, ...serviceNodesPeerIdStr].includes(
          peerId.toString()
        )
      )
      .forEach((isConnected) => expect(isConnected).to.eq(true));

    // send 2 more messages
    await sendMessage();
    await sendMessage();

    expect(waku.filter.connectedPeers.length).to.equal(2);
  });

  it("Renews peer for Filter on peer:disconnect event", async function () {
    this.timeout(30000);

    const messages: DecodedMessage[] = [];
    const { error, subscription } = await waku.filter.subscribe(
      [decoder],
      (msg) => {
        messages.push(msg);
      }
    );

    if (error) {
      throw error;
    }

    const initialPeers = waku.filter.connectedPeers;
    expect(initialPeers.length).to.equal(waku.filter.numPeersToUse);

    const peerToDisconnect = initialPeers[0];
    await waku.connectionManager.dropConnection(peerToDisconnect.id);

    await delay(5000);

    expect(waku.filter.connectedPeers.length).to.equal(
      waku.filter.numPeersToUse
    );

    const stillConnected = waku.filter.connectedPeers.some((peer) =>
      peer.id.equals(peerToDisconnect.id)
    );
    expect(stillConnected).to.be.false;

    await waku.lightPush.send(encoder, {
      payload: utf8ToBytes("Hello after disconnect")
    });

    await delay(2000);

    expect(messages.length).to.equal(1);
    expect(new TextDecoder().decode(messages[0].payload)).to.equal(
      "Hello after disconnect"
    );

    const pingResult = await subscription.ping();
    expect(pingResult.successes.length).to.equal(waku.filter.numPeersToUse);
    expect(pingResult.failures.length).to.equal(0);
  });
});
