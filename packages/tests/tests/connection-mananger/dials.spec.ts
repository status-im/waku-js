import { generateKeyPair } from "@libp2p/crypto/keys";
import type { PeerInfo } from "@libp2p/interface";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { LightNode, Tags } from "@waku/interfaces";
import { createLightNode } from "@waku/sdk";
import { expect } from "chai";
import sinon, { SinonSpy, SinonStub } from "sinon";

import { afterEachCustom, beforeEachCustom, delay } from "../../src/index.js";
import { tearDownNodes } from "../../src/index.js";

const DELAY_MS = 1_000;
const TEST_TIMEOUT = 20_000;

describe("Dials", function () {
  this.timeout(TEST_TIMEOUT);
  let dialPeerStub: SinonStub;
  let getConnectionsStub: SinonStub;
  let getTagNamesForPeerStub: SinonStub;
  let isPeerTopicConfigured: SinonStub;
  let waku: LightNode;

  beforeEachCustom(this, async () => {
    waku = await createLightNode();
    isPeerTopicConfigured = sinon.stub(
      waku.connectionManager as any,
      "isPeerTopicConfigured"
    );
    isPeerTopicConfigured.resolves(true);
  });

  afterEachCustom(this, async () => {
    await tearDownNodes([], waku);
    isPeerTopicConfigured.restore();
    sinon.restore();
  });

  describe("attemptDial method", function () {
    let attemptDialSpy: SinonSpy;

    beforeEachCustom(this, async () => {
      attemptDialSpy = sinon.spy(waku.connectionManager as any, "attemptDial");
    });

    afterEachCustom(this, async () => {
      attemptDialSpy.restore();
    });

    it("should be called at least once on all `peer:discovery` events", async function () {
      const totalPeerIds = 5;
      for (let i = 1; i <= totalPeerIds; i++) {
        const privateKey = await generateKeyPair("secp256k1");
        const peerId = peerIdFromPrivateKey(privateKey);
        waku.libp2p.dispatchEvent(
          new CustomEvent<PeerInfo>("peer:discovery", {
            detail: {
              id: peerId,
              multiaddrs: []
            }
          })
        );
      }

      await delay(100);

      expect(attemptDialSpy.callCount).to.be.greaterThanOrEqual(
        totalPeerIds,
        "attemptDial should be called at least once for each peer:discovery event"
      );
    });
  });

  describe("dialPeer method", function () {
    let peerStoreHasStub: SinonStub;
    let dialAttemptsForPeerHasStub: SinonStub;
    beforeEachCustom(this, async () => {
      getConnectionsStub = sinon.stub(
        (waku.connectionManager as any).libp2p,
        "getConnections"
      );
      getTagNamesForPeerStub = sinon.stub(
        waku.connectionManager as any,
        "getTagNamesForPeer"
      );
      dialPeerStub = sinon.stub(waku.connectionManager as any, "dialPeer");
      peerStoreHasStub = sinon.stub(waku.libp2p.peerStore, "has");
      dialAttemptsForPeerHasStub = sinon.stub(
        (waku.connectionManager as any).dialAttemptsForPeer,
        "has"
      );

      // simulate that the peer is not connected
      getConnectionsStub.returns([]);

      // simulate that the peer is a bootstrap peer
      getTagNamesForPeerStub.resolves([Tags.BOOTSTRAP]);

      // simulate that the peer is not in the peerStore
      peerStoreHasStub.returns(false);

      // simulate that the peer has not been dialed before
      dialAttemptsForPeerHasStub.returns(false);
    });

    afterEachCustom(this, async () => {
      dialPeerStub.restore();
      getTagNamesForPeerStub.restore();
      getConnectionsStub.restore();
      peerStoreHasStub.restore();
      dialAttemptsForPeerHasStub.restore();
    });

    describe("For bootstrap peers", function () {
      it("should be called for bootstrap peers", async function () {
        const privateKey = await generateKeyPair("secp256k1");
        const bootstrapPeer = peerIdFromPrivateKey(privateKey);

        // emit a peer:discovery event
        waku.libp2p.dispatchEvent(
          new CustomEvent<PeerInfo>("peer:discovery", {
            detail: { id: bootstrapPeer, multiaddrs: [] }
          })
        );

        // wait for the async function calls within attemptDial to finish
        await delay(DELAY_MS);

        // check that dialPeer was called once
        expect(dialPeerStub.callCount).to.equal(
          1,
          "dialPeer should be called for bootstrap peers"
        );
      });

      it("should not be called more than DEFAULT_MAX_BOOTSTRAP_PEERS_ALLOWED times for bootstrap peers", async function () {
        const privateKey = await generateKeyPair("secp256k1");
        const bootstrapPeer = peerIdFromPrivateKey(privateKey);
        // emit first peer:discovery event
        waku.libp2p.dispatchEvent(
          new CustomEvent<PeerInfo>("peer:discovery", {
            detail: {
              id: bootstrapPeer,
              multiaddrs: []
            }
          })
        );
        await delay(500);

        // simulate that the peer is connected
        getConnectionsStub.returns([{ tags: [{ name: Tags.BOOTSTRAP }] }]);

        // emit multiple peer:discovery events
        const totalBootstrapPeers = 5;
        for (let i = 1; i <= totalBootstrapPeers; i++) {
          await delay(500);
          waku.libp2p.dispatchEvent(
            new CustomEvent<PeerInfo>("peer:discovery", {
              detail: {
                id: bootstrapPeer,
                multiaddrs: []
              }
            })
          );
        }

        // check that dialPeer was called only once
        expect(dialPeerStub.callCount).to.equal(
          1,
          "dialPeer should not be called more than once for bootstrap peers"
        );
      });
    });

    describe("For peer-exchange peers", function () {
      it("should be called for peers with PEER_EXCHANGE tags", async function () {
        const privateKey = await generateKeyPair("secp256k1");
        const pxPeer = peerIdFromPrivateKey(privateKey);

        // emit a peer:discovery event
        waku.libp2p.dispatchEvent(
          new CustomEvent<PeerInfo>("peer:discovery", {
            detail: {
              id: pxPeer,
              multiaddrs: []
            }
          })
        );

        // wait for the async function calls within attemptDial to finish
        await delay(DELAY_MS);

        // check that dialPeer was called once
        expect(dialPeerStub.callCount).to.equal(
          1,
          "dialPeer should be called for peers with PEER_EXCHANGE tags"
        );
      });

      it("should be called for every peer with PEER_EXCHANGE tags", async function () {
        // emit multiple peer:discovery events
        const totalPxPeers = 5;
        for (let i = 0; i < totalPxPeers; i++) {
          const privateKey = await generateKeyPair("secp256k1");
          const pxPeer = peerIdFromPrivateKey(privateKey);
          waku.libp2p.dispatchEvent(
            new CustomEvent<PeerInfo>("peer:discovery", {
              detail: {
                id: pxPeer,
                multiaddrs: []
              }
            })
          );
          await delay(500);
        }

        // check that dialPeer was called for each peer with PEER_EXCHANGE tags
        expect(dialPeerStub.callCount).to.equal(totalPxPeers);
      });
    });
  });
});
