import { generateKeyPair } from "@libp2p/crypto/keys";
import type { PeerId } from "@libp2p/interface";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import {
  EPeersByDiscoveryEvents,
  LightNode,
  PeersByDiscoveryResult,
  Tags
} from "@waku/interfaces";
import { createLightNode } from "@waku/sdk";
import { expect } from "chai";

import { afterEachCustom, beforeEachCustom, delay } from "../../src/index.js";
import { tearDownNodes } from "../../src/index.js";

const TEST_TIMEOUT = 20_000;

describe("Public methods", function () {
  let waku: LightNode;
  this.timeout(TEST_TIMEOUT);
  beforeEachCustom(this, async () => {
    waku = await createLightNode();
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([], waku);
  });
  it("addEventListener with correct event", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: 50,
          ttl: 1200000
        }
      }
    });
    const peerConnectedBootstrap = new Promise<boolean>((resolve) => {
      waku.connectionManager.addEventListener(
        EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
        ({ detail: receivedPeerId }) => {
          resolve(receivedPeerId.toString() === peerIdBootstrap.toString());
        }
      );
    });
    waku.libp2p.dispatchEvent(
      new CustomEvent<PeerId>("peer:connect", { detail: peerIdBootstrap })
    );
    expect(await peerConnectedBootstrap).to.eq(true);
  });

  it("addEventListener with wrong event", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: 50,
          ttl: 1200000
        }
      }
    });
    const peerConnectedBootstrap = new Promise<boolean>((resolve) => {
      waku.connectionManager.addEventListener(
        // setting PEER_CONNECT_PEER_EXCHANGE while the tag is BOOTSTRAP
        EPeersByDiscoveryEvents.PEER_CONNECT_PEER_EXCHANGE,
        ({ detail: receivedPeerId }) => {
          resolve(receivedPeerId.toString() === peerIdBootstrap.toString());
        }
      );
    });
    waku.libp2p.dispatchEvent(
      new CustomEvent<PeerId>("peer:connect", { detail: peerIdBootstrap })
    );
    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), TEST_TIMEOUT - 100)
    );

    const result = await Promise.race([peerConnectedBootstrap, timeoutPromise]);

    // If the timeout promise resolves first, the result will be false, and we expect it to be false (test passes)
    // If the peerConnectedBootstrap resolves first, we expect its result to be true (which will now make the test fail if it's not true)
    expect(result).to.eq(false);
  });

  it("removeEventListener with correct event", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: 50,
          ttl: 1200000
        }
      }
    });

    let wasCalled = false;

    const eventListener = (event: CustomEvent): void => {
      if (event.detail.toString() === peerIdBootstrap.toString()) {
        wasCalled = true;
      }
    };

    waku.connectionManager.addEventListener(
      EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
      eventListener
    );

    waku.libp2p.dispatchEvent(
      new CustomEvent<PeerId>("peer:connect", { detail: peerIdBootstrap })
    );
    await delay(200);
    expect(wasCalled).to.eq(true);

    wasCalled = false; // resetting flag back to false and remove the listener
    waku.connectionManager.removeEventListener(
      EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
      eventListener
    );

    waku.libp2p.dispatchEvent(
      new CustomEvent<PeerId>("peer:connect", { detail: peerIdBootstrap })
    );
    await delay(200);
    expect(wasCalled).to.eq(false);
  });

  it("removeEventListener with wrong event", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: 50,
          ttl: 1200000
        }
      }
    });

    let wasCalled = false;

    waku.connectionManager.addEventListener(
      EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
      ({ detail: receivedPeerId }) => {
        if (receivedPeerId.toString() === peerIdBootstrap.toString()) {
          wasCalled = true;
        }
      }
    );

    waku.connectionManager.removeEventListener(
      EPeersByDiscoveryEvents.PEER_CONNECT_PEER_EXCHANGE,
      ({ detail: receivedPeerId }) => {
        if (receivedPeerId.toString() === peerIdBootstrap.toString()) {
          wasCalled = true;
        }
      }
    );

    waku.libp2p.dispatchEvent(
      new CustomEvent<PeerId>("peer:connect", { detail: peerIdBootstrap })
    );
    await delay(200);
    expect(wasCalled).to.eq(true);
  });

  it("getPeersByDiscovery", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    const peers_before = await waku.connectionManager.getPeersByDiscovery();
    expect(peers_before.DISCOVERED[Tags.BOOTSTRAP]).to.deep.eq([]);

    const ttl = 1200000;
    const tag_value = 50;

    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: tag_value,
          ttl: ttl
        }
      }
    });

    const currentTime = Date.now(); // Get the current time at the point peer connect
    waku.libp2p.dispatchEvent(
      new CustomEvent<PeerId>("peer:connect", { detail: peerIdBootstrap })
    );

    const peers_after = <PeersByDiscoveryResult>(
      await waku.connectionManager.getPeersByDiscovery()
    );
    const bootstrap_peer = peers_after.DISCOVERED[Tags.BOOTSTRAP];

    expect(bootstrap_peer).to.not.deep.eq([]);
    expect(bootstrap_peer[0].id.toString()).to.eq(peerIdBootstrap.toString());
    expect(bootstrap_peer[0].tags.has("bootstrap")).to.be.true;
    expect(bootstrap_peer[0].tags.get("bootstrap")!.value).to.equal(tag_value);
    // Assert that the expiry is within the expected range, considering TTL
    // Note: We allow a small margin for the execution time of the code
    const marginOfError = 1000; // 1 second in milliseconds, adjust as needed
    const expiry = (bootstrap_peer[0].tags.get("bootstrap") as any).expiry;
    expect(Number(expiry)).to.be.closeTo(currentTime + ttl, marginOfError);
  });

  it("listenerCount", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    waku.connectionManager.addEventListener(
      EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
      ({ detail: receivedPeerId }) => {
        receivedPeerId.toString() === peerIdBootstrap.toString();
      }
    );

    expect(
      waku.connectionManager.listenerCount(
        EPeersByDiscoveryEvents.PEER_DISCOVERY_BOOTSTRAP
      )
    ).to.eq(0);
    expect(
      waku.connectionManager.listenerCount(
        EPeersByDiscoveryEvents.PEER_DISCOVERY_PEER_EXCHANGE
      )
    ).to.eq(0);
    expect(
      waku.connectionManager.listenerCount(
        EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP
      )
    ).to.eq(1);
    expect(
      waku.connectionManager.listenerCount(
        EPeersByDiscoveryEvents.PEER_CONNECT_PEER_EXCHANGE
      )
    ).to.eq(0);
  });

  it("dispatchEvent via connectionManager", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: 50,
          ttl: 1200000
        }
      }
    });
    const peerConnectedBootstrap = new Promise<boolean>((resolve) => {
      waku.connectionManager.addEventListener(
        EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
        ({ detail: receivedPeerId }) => {
          resolve(receivedPeerId.toString() === peerIdBootstrap.toString());
        }
      );
    });
    waku.connectionManager.dispatchEvent(
      new CustomEvent<PeerId>(EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP, {
        detail: peerIdBootstrap
      })
    );
    expect(await peerConnectedBootstrap).to.eq(true);
  });

  it("safeDispatchEvent", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: 50,
          ttl: 1200000
        }
      }
    });
    const peerConnectedBootstrap = new Promise<boolean>((resolve) => {
      waku.connectionManager.addEventListener(
        EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
        ({ detail: receivedPeerId }) => {
          resolve(receivedPeerId.toString() === peerIdBootstrap.toString());
        }
      );
    });

    waku.connectionManager.safeDispatchEvent(
      EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
      { detail: peerIdBootstrap }
    );

    expect(await peerConnectedBootstrap).to.eq(true);
  });

  it("stop", async function () {
    const privateKey = await generateKeyPair("secp256k1");
    const peerIdBootstrap = peerIdFromPrivateKey(privateKey);
    await waku.libp2p.peerStore.save(peerIdBootstrap, {
      tags: {
        [Tags.BOOTSTRAP]: {
          value: 50,
          ttl: 1200000
        }
      }
    });

    const peerConnectedBootstrap = new Promise<boolean>((resolve) => {
      waku.connectionManager.addEventListener(
        EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP,
        ({ detail: receivedPeerId }) => {
          resolve(receivedPeerId.toString() === peerIdBootstrap.toString());
        }
      );
    });

    waku.connectionManager.stop();
    waku.libp2p.dispatchEvent(
      new CustomEvent<PeerId>("peer:connect", { detail: peerIdBootstrap })
    );

    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), TEST_TIMEOUT - 100)
    );

    const result = await Promise.race([peerConnectedBootstrap, timeoutPromise]);

    // If the timeout promise resolves first, the result will be false, and we expect it to be false (test passes)
    // If the peerConnectedBootstrap resolves first, we expect its result to be true (which will now make the test fail if it's not true)
    expect(result).to.eq(false);
  });
});
