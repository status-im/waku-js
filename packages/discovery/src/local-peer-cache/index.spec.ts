import { generateKeyPair } from "@libp2p/crypto/keys";
import type { IdentifyResult } from "@libp2p/interface";
import { TypedEventEmitter } from "@libp2p/interface";
import tests from "@libp2p/interface-compliance-tests/peer-discovery";
import { prefixLogger } from "@libp2p/logger";
import { peerIdFromPrivateKey, peerIdFromString } from "@libp2p/peer-id";
import { persistentPeerStore } from "@libp2p/peer-store";
import { multiaddr } from "@multiformats/multiaddr";
import { Libp2pComponents } from "@waku/interfaces";
import { LocalStoragePeerInfo } from "@waku/interfaces";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { MemoryDatastore } from "datastore-core/memory";
import sinon from "sinon";

import { LocalPeerCacheDiscovery } from "./index.js";

chai.use(chaiAsPromised);

// dynamically importing the local storage polyfill for node
if (typeof window === "undefined") {
  try {
    const { LocalStorage } = await import("node-localstorage");
    global.localStorage = new LocalStorage("./scratch");
  } catch (error) {
    console.error("Failed to load localStorage polyfill:", error);
  }
}

const mockPeers = [
  {
    id: "16Uiu2HAm4v86W3bmT1BiH6oSPzcsSr24iDQpSN5Qa992BCjjwgrD",
    address:
      "/ip4/127.0.0.1/tcp/8000/ws/p2p/16Uiu2HAm4v86W3bmT1BiH6oSPzcsSr24iDQpSN5Qa992BCjjwgrD"
  },
  {
    id: "16Uiu2HAm4v86W3bmT1BiH6oSPzcsSr24iDQpSN5Qa992BCjjwgrE",
    address:
      "/ip4/127.0.0.1/tcp/8001/ws/p2p/16Uiu2HAm4v86W3bmT1BiH6oSPzcsSr24iDQpSN5Qa992BCjjwgrE"
  }
];

async function setPeersInLocalStorage(
  peers: LocalStoragePeerInfo[]
): Promise<void> {
  localStorage.setItem("waku:peers", JSON.stringify(peers));
}

describe("Local Storage Discovery", function () {
  this.timeout(25_000);
  let components: Libp2pComponents;

  beforeEach(async function () {
    localStorage.clear();
    components = {
      peerStore: persistentPeerStore({
        events: new TypedEventEmitter(),
        peerId: await generateKeyPair("secp256k1").then(peerIdFromPrivateKey),
        datastore: new MemoryDatastore(),
        logger: prefixLogger("local_discovery.spec.ts")
      }),
      events: new TypedEventEmitter()
    } as unknown as Libp2pComponents;
  });

  describe("Compliance Tests", function () {
    beforeEach(async function () {
      await setPeersInLocalStorage([mockPeers[0]]);
    });

    tests({
      async setup() {
        return new LocalPeerCacheDiscovery(components);
      },
      async teardown() {}
    });
  });

  describe("Unit Tests", function () {
    let discovery: LocalPeerCacheDiscovery;

    beforeEach(async function () {
      discovery = new LocalPeerCacheDiscovery(components);
      await setPeersInLocalStorage(mockPeers);
    });

    it("should load peers from local storage and dispatch events", async () => {
      const dispatchEventSpy = sinon.spy(discovery, "dispatchEvent");

      await discovery.start();

      expect(dispatchEventSpy.calledWith(sinon.match.has("type", "peer"))).to.be
        .true;
      mockPeers.forEach((mockPeer) => {
        expect(
          dispatchEventSpy.calledWith(
            sinon.match.hasNested("detail.id", mockPeer.id)
          )
        ).to.be.true;
      });
    });

    it("should update peers in local storage on 'peer:identify' event", async () => {
      const newPeerIdentifyEvent = {
        detail: {
          peerId: peerIdFromString(mockPeers[1].id.toString()),
          listenAddrs: [multiaddr(mockPeers[1].address)]
        }
      } as CustomEvent<IdentifyResult>;

      // Directly invoke handleNewPeers to simulate receiving an 'identify' event
      discovery.handleNewPeers(newPeerIdentifyEvent);

      const updatedPeers = JSON.parse(
        localStorage.getItem("waku:peers") || "[]"
      );
      expect(updatedPeers).to.deep.include({
        id: newPeerIdentifyEvent.detail.peerId.toString(),
        address: newPeerIdentifyEvent.detail.listenAddrs[0].toString()
      });
    });

    it("should handle corrupted local storage data gracefully", async () => {
      localStorage.setItem("waku:peers", "not-a-valid-json");

      try {
        await discovery.start();
      } catch (error) {
        expect.fail(
          "start() should not have thrown an error for corrupted local storage data"
        );
      }
    });

    it("should add and remove event listeners correctly", async () => {
      const addEventListenerSpy = sinon.spy(
        components.events,
        "addEventListener"
      );
      const removeEventListenerSpy = sinon.spy(
        components.events,
        "removeEventListener"
      );

      await discovery.start();
      expect(addEventListenerSpy.calledWith("peer:identify")).to.be.true;

      await discovery.stop();
      expect(removeEventListenerSpy.calledWith("peer:identify")).to.be.true;
    });
  });
});
