import { generateKeyPair } from "@libp2p/crypto/keys";
import type { PeerId, PeerInfo } from "@libp2p/interface";
import { TypedEventEmitter } from "@libp2p/interface";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import {
  EConnectionStateEvents,
  EPeersByDiscoveryEvents,
  LightNode,
  Tags
} from "@waku/interfaces";
import { createLightNode } from "@waku/sdk";
import { expect } from "chai";

import { afterEachCustom, beforeEachCustom, delay } from "../../src/index.js";
import { tearDownNodes } from "../../src/index.js";

const TEST_TIMEOUT = 20_000;

describe("Events", function () {
  let waku: LightNode;
  this.timeout(TEST_TIMEOUT);
  beforeEachCustom(this, async () => {
    waku = await createLightNode();
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([], waku);
  });

  describe("peer:discovery", () => {
    it("should emit `peer:discovery:bootstrap` event when a peer is discovered", async function () {
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

      const peerDiscoveryBootstrap = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EPeersByDiscoveryEvents.PEER_DISCOVERY_BOOTSTRAP,
          ({ detail: receivedPeerId }) => {
            resolve(receivedPeerId.toString() === peerIdBootstrap.toString());
          }
        );
      });

      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerInfo>("peer:discovery", {
          detail: {
            id: peerIdBootstrap,
            multiaddrs: []
          }
        })
      );

      expect(await peerDiscoveryBootstrap).to.eq(true);
    });

    it("should emit `peer:discovery:peer-exchange` event when a peer is discovered", async function () {
      const privateKey = await generateKeyPair("secp256k1");
      const peerIdPx = peerIdFromPrivateKey(privateKey);

      await waku.libp2p.peerStore.save(peerIdPx, {
        tags: {
          [Tags.PEER_EXCHANGE]: {
            value: 50,
            ttl: 1200000
          }
        }
      });

      const peerDiscoveryPeerExchange = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EPeersByDiscoveryEvents.PEER_DISCOVERY_PEER_EXCHANGE,
          ({ detail: receivedPeerId }) => {
            resolve(receivedPeerId.toString() === peerIdPx.toString());
          }
        );
      });

      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerInfo>("peer:discovery", {
          detail: {
            id: peerIdPx,
            multiaddrs: []
          }
        })
      );

      expect(await peerDiscoveryPeerExchange).to.eq(true);
    });
  });

  describe("peer:connect", () => {
    it("should emit `peer:connected:bootstrap` event when a peer is connected", async function () {
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
    it("should emit `peer:connected:peer-exchange` event when a peer is connected", async function () {
      const privateKey = await generateKeyPair("secp256k1");
      const peerIdPx = peerIdFromPrivateKey(privateKey);

      await waku.libp2p.peerStore.save(peerIdPx, {
        tags: {
          [Tags.PEER_EXCHANGE]: {
            value: 50,
            ttl: 1200000
          }
        }
      });

      const peerConnectedPeerExchange = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EPeersByDiscoveryEvents.PEER_CONNECT_PEER_EXCHANGE,
          ({ detail: receivedPeerId }) => {
            resolve(receivedPeerId.toString() === peerIdPx.toString());
          }
        );
      });

      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerId>("peer:connect", { detail: peerIdPx })
      );

      expect(await peerConnectedPeerExchange).to.eq(true);
    });
  });

  describe(EConnectionStateEvents.CONNECTION_STATUS, function () {
    let navigatorMock: any;

    this.beforeEach(() => {
      navigatorMock = { onLine: true };
      globalThis.navigator = navigatorMock;

      const eventEmmitter = new TypedEventEmitter();
      globalThis.addEventListener =
        eventEmmitter.addEventListener.bind(eventEmmitter);
      globalThis.removeEventListener =
        eventEmmitter.removeEventListener.bind(eventEmmitter);
      globalThis.dispatchEvent =
        eventEmmitter.dispatchEvent.bind(eventEmmitter);
    });

    this.afterEach(() => {
      // @ts-expect-error: resetting set value
      globalThis.navigator = undefined;
      // @ts-expect-error: resetting set value
      globalThis.addEventListener = undefined;
      // @ts-expect-error: resetting set value
      globalThis.removeEventListener = undefined;
      // @ts-expect-error: resetting set value
      globalThis.dispatchEvent = undefined;
    });

    it(`should emit events and trasition isConnected state when has peers or no peers`, async function () {
      const privateKey1 = await generateKeyPair("secp256k1");
      const privateKey2 = await generateKeyPair("secp256k1");
      const peerIdPx = peerIdFromPrivateKey(privateKey1);
      const peerIdPx2 = peerIdFromPrivateKey(privateKey2);

      await waku.libp2p.peerStore.save(peerIdPx, {
        tags: {
          [Tags.PEER_EXCHANGE]: {
            value: 50,
            ttl: 1200000
          }
        }
      });

      await waku.libp2p.peerStore.save(peerIdPx2, {
        tags: {
          [Tags.PEER_EXCHANGE]: {
            value: 50,
            ttl: 1200000
          }
        }
      });

      let eventCount = 0;
      const connectedStatus = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EConnectionStateEvents.CONNECTION_STATUS,
          ({ detail: status }) => {
            eventCount++;
            resolve(status);
          }
        );
      });

      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerId>("peer:connect", { detail: peerIdPx })
      );
      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerId>("peer:connect", { detail: peerIdPx2 })
      );

      await delay(100);

      expect(waku.isConnected()).to.be.true;
      expect(await connectedStatus).to.eq(true);
      expect(eventCount).to.be.eq(1);

      const disconnectedStatus = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EConnectionStateEvents.CONNECTION_STATUS,
          ({ detail: status }) => {
            resolve(status);
          }
        );
      });

      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerId>("peer:disconnect", { detail: peerIdPx })
      );
      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerId>("peer:disconnect", { detail: peerIdPx2 })
      );

      expect(waku.isConnected()).to.be.false;
      expect(await disconnectedStatus).to.eq(false);
      expect(eventCount).to.be.eq(2);
    });

    it("should be online or offline if network state changed", async function () {
      // have to recreate js-waku for it to pick up new globalThis
      waku = await createLightNode();

      const privateKey = await generateKeyPair("secp256k1");
      const peerIdPx = peerIdFromPrivateKey(privateKey);

      await waku.libp2p.peerStore.save(peerIdPx, {
        tags: {
          [Tags.PEER_EXCHANGE]: {
            value: 50,
            ttl: 1200000
          }
        }
      });

      let eventCount = 0;
      const connectedStatus = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EConnectionStateEvents.CONNECTION_STATUS,
          ({ detail: status }) => {
            eventCount++;
            resolve(status);
          }
        );
      });

      waku.libp2p.dispatchEvent(
        new CustomEvent<PeerId>("peer:connect", { detail: peerIdPx })
      );

      await delay(100);

      expect(waku.isConnected()).to.be.true;
      expect(await connectedStatus).to.eq(true);
      expect(eventCount).to.be.eq(1);

      const disconnectedStatus = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EConnectionStateEvents.CONNECTION_STATUS,
          ({ detail: status }) => {
            resolve(status);
          }
        );
      });

      navigatorMock.onLine = false;
      globalThis.dispatchEvent(new CustomEvent("offline"));

      await delay(100);

      expect(waku.isConnected()).to.be.false;
      expect(await disconnectedStatus).to.eq(false);
      expect(eventCount).to.be.eq(2);

      const connectionRecoveredStatus = new Promise<boolean>((resolve) => {
        waku.connectionManager.addEventListener(
          EConnectionStateEvents.CONNECTION_STATUS,
          ({ detail: status }) => {
            resolve(status);
          }
        );
      });

      navigatorMock.onLine = true;
      globalThis.dispatchEvent(new CustomEvent("online"));

      await delay(100);

      expect(waku.isConnected()).to.be.true;
      expect(await connectionRecoveredStatus).to.eq(true);
      expect(eventCount).to.be.eq(3);
    });
  });
});
