import { waitForRemotePeer } from "@waku/core";
import { createLightNode, createRelayNode } from "@waku/create";
import type { LightNode, RelayNode } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { expect } from "chai";

import { delay, makeLogFileName, NOISE_KEY_1, Nwaku } from "../src/index.js";

describe("Wait for remote peer", function () {
  let waku1: RelayNode;
  let waku2: LightNode;
  let nwaku: Nwaku | undefined;

  afterEach(async function () {
    if (nwaku) {
      nwaku.stop().catch((e) => console.log("Nwaku failed to stop", e));
      nwaku = undefined;
    }
    waku1?.stop().catch((e) => console.log("Waku failed to stop", e));
    waku2?.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  it("Relay - dialed first", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      relay: true,
      store: false,
      filter: false,
      lightpush: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku1 = await createRelayNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku1.start();
    await waku1.dial(multiAddrWithId);
    await delay(1000);
    await waitForRemotePeer(waku1, [Protocols.Relay]);
    const peers = waku1.relay.getMeshPeers();
    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(peers).to.includes(nimPeerId);
  });

  it("Relay - dialed after", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      relay: true,
      store: false,
      filter: false,
      lightpush: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku1 = await createRelayNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku1.start();

    const waitPromise = waitForRemotePeer(waku1, [Protocols.Relay]);
    await delay(1000);
    await waku1.dial(multiAddrWithId);
    await waitPromise;

    const peers = waku1.relay.getMeshPeers();
    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(peers).includes(nimPeerId);
  });

  it("Relay - times out", function (done) {
    this.timeout(5000);
    createRelayNode({
      staticNoiseKey: NOISE_KEY_1,
    })
      .then((waku1) => waku1.start().then(() => waku1))
      .then((waku1) => {
        waitForRemotePeer(waku1, [Protocols.Relay], 200).then(
          () => {
            throw "Promise expected to reject on time out";
          },
          (reason) => {
            expect(reason).to.eq("Timed out waiting for a remote peer.");
            done();
          }
        );
      });
  });

  it("Store - dialed first", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      store: true,
      relay: false,
      lightpush: false,
      filter: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku2 = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku2.start();
    await waku2.dial(multiAddrWithId);
    await delay(1000);
    await waitForRemotePeer(waku2, [Protocols.Store]);

    const peers = (await waku2.store.peers()).map((peer) => peer.id.toString());
    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(peers.includes(nimPeerId as string)).to.be.true;
  });

  it("Store - dialed after - with timeout", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      store: true,
      relay: false,
      lightpush: false,
      filter: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku2 = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku2.start();
    const waitPromise = waitForRemotePeer(waku2, [Protocols.Store], 2000);
    await delay(1000);
    await waku2.dial(multiAddrWithId);
    await waitPromise;

    const peers = (await waku2.store.peers()).map((peer) => peer.id.toString());

    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(peers.includes(nimPeerId as string)).to.be.true;
  });

  it("LightPush", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      lightpush: true,
      filter: false,
      relay: false,
      store: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku2 = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku2.start();
    await waku2.dial(multiAddrWithId);
    await waitForRemotePeer(waku2, [Protocols.LightPush]);

    const peers = (await waku2.lightPush.peers()).map((peer) =>
      peer.id.toString()
    );

    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(peers.includes(nimPeerId as string)).to.be.true;
  });

  it("Filter", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      filter: true,
      lightpush: false,
      relay: false,
      store: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku2 = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku2.start();
    await waku2.dial(multiAddrWithId);
    await waitForRemotePeer(waku2, [Protocols.Filter]);

    const peers = (await waku2.filter.peers()).map((peer) =>
      peer.id.toString()
    );

    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(peers.includes(nimPeerId as string)).to.be.true;
  });

  it("Light Node - default protocols", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      filter: true,
      lightpush: true,
      relay: false,
      store: true,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku2 = await createLightNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku2.start();
    await waku2.dial(multiAddrWithId);
    await waitForRemotePeer(waku2, [
      Protocols.Filter,
      Protocols.Store,
      Protocols.LightPush,
    ]);

    const filterPeers = (await waku2.filter.peers()).map((peer) =>
      peer.id.toString()
    );
    const storePeers = (await waku2.store.peers()).map((peer) =>
      peer.id.toString()
    );
    const lightPushPeers = (await waku2.lightPush.peers()).map((peer) =>
      peer.id.toString()
    );

    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(filterPeers.includes(nimPeerId as string)).to.be.true;
    expect(storePeers.includes(nimPeerId as string)).to.be.true;
    expect(lightPushPeers.includes(nimPeerId as string)).to.be.true;
  });

  it("Privacy Node - default protocol", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      filter: false,
      lightpush: false,
      relay: true,
      store: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku1 = await createRelayNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku1.start();
    await waku1.dial(multiAddrWithId);
    await waitForRemotePeer(waku1);

    const peers = waku1.relay.getMeshPeers();

    const nimPeerId = multiAddrWithId.getPeerId();

    expect(nimPeerId).to.not.be.undefined;
    expect(peers.includes(nimPeerId as string)).to.be.true;
  });
});
