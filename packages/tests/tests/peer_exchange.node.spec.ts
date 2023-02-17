import { bootstrap } from "@libp2p/bootstrap";
import tests from "@libp2p/interface-peer-discovery-compliance-tests";
import type { PeerProtocolsChangeData } from "@libp2p/interface-peer-store";
import {
  Fleet,
  getPredefinedBootstrapNodes,
} from "@waku/core/lib/predefined_bootstrap_nodes";
import { createLightNode } from "@waku/create";
import type { LightNode, PeerExchangeResponse } from "@waku/interfaces";
import {
  PeerExchangeCodec,
  PeerExchangeDiscovery,
  WakuPeerExchange,
  wakuPeerExchangeDiscovery,
} from "@waku/peer-exchange";
import { expect } from "chai";

import { makeLogFileName } from "../src/log_file.js";
import { Nwaku } from "../src/nwaku.js";

describe("Peer Exchange", () => {
  let waku: LightNode;

  afterEach(async function () {
    !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  it("Auto discovery", async function () {
    // skipping in CI as this test demonstrates Peer Exchange working with the test fleet
    // but not with locally run nwaku nodes
    if (process.env.CI) {
      this.skip();
    }

    this.timeout(60_000);

    waku = await createLightNode({
      libp2p: {
        peerDiscovery: [
          bootstrap({ list: getPredefinedBootstrapNodes(Fleet.Test, 3) }),
          wakuPeerExchangeDiscovery(),
        ],
      },
    });

    await waku.start();

    const foundPxPeer = await new Promise<boolean>((resolve) => {
      const testNodes = getPredefinedBootstrapNodes(Fleet.Test, 3);
      waku.libp2p.addEventListener("peer:discovery", (evt) => {
        const { multiaddrs } = evt.detail;
        multiaddrs.forEach((ma) => {
          const isBootstrapNode = testNodes.find((n) => n === ma.toString());
          if (!isBootstrapNode) {
            resolve(true);
          }
        });
      });
    });

    expect(foundPxPeer).to.be.true;
  });

  describe.only("Locally run nodes", () => {
    let waku: LightNode;
    let nwaku1: Nwaku;
    let nwaku2: Nwaku;

    beforeEach(async function () {
      nwaku1 = new Nwaku(makeLogFileName(this) + "1");
      nwaku2 = new Nwaku(makeLogFileName(this) + "2");
    });

    afterEach(async function () {
      !!nwaku1 && nwaku1.stop();
      !!nwaku2 && nwaku2.stop();
      !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
    });

    it.only("nwaku interop", async function () {
      this.timeout(25_000);

      await nwaku1.start({
        discv5Discovery: true,
        peerExchange: true,
      });

      const enr = (await nwaku1.info()).enrUri;

      await nwaku2.start({
        discv5Discovery: true,
        peerExchange: true,
        discv5BootstrapNode: enr,
      });

      const nwaku1Ma = await nwaku1.getMultiaddrWithId();
      const nwaku2Ma = await nwaku2.getMultiaddrWithId();

      waku = await createLightNode();
      await waku.start();
      await waku.libp2p.dialProtocol(nwaku2Ma, PeerExchangeCodec);

      await new Promise<void>((resolve) => {
        waku.libp2p.peerStore.addEventListener("change:protocols", (evt) => {
          if (evt.detail.protocols.includes(PeerExchangeCodec)) {
            resolve();
          }
        });
      });

      await nwaku2.waitForLog("Discovered peers", 10_000);

      // the ts-ignores are added ref: https://github.com/libp2p/js-libp2p-interfaces/issues/338#issuecomment-1431643645
      const peerExchange = new WakuPeerExchange({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        connectionManager: waku.libp2p.connectionManager,
        peerStore: waku.libp2p.peerStore,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        registrar: waku.libp2p.registrar,
      });

      let receivedCallback = false;

      const numPeersToRequest = 1;
      const callback = async (
        response: PeerExchangeResponse
      ): Promise<void> => {
        console.log("response received");
        const doesMultiaddrExist = response.peerInfos.find(
          (peerInfo) =>
            peerInfo.ENR?.getFullMultiaddrs()?.find((multiaddr) =>
              multiaddr.equals(nwaku1Ma)
            ) !== undefined
        );

        expect(response.peerInfos.length).to.be.greaterThan(0);
        expect(response.peerInfos.length).to.be.lessThanOrEqual(
          numPeersToRequest
        );
        expect(response.peerInfos[0].ENR).to.not.be.null;

        expect(doesMultiaddrExist).to.be.equal(true);

        expect(waku.libp2p.peerStore.has(await nwaku2.getPeerId())).to.be.true;

        receivedCallback = true;
      };

      await peerExchange.query(
        {
          numPeers: numPeersToRequest,
        },
        callback
      );

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 5_000);
      });

      expect(receivedCallback).to.be.equal(true);
    });
  });
});

describe("compliance test", async function () {
  this.timeout(25_000);

  let waku: LightNode;
  let nwaku1: Nwaku;
  let nwaku2: Nwaku;

  tests({
    async setup() {
      nwaku1 = new Nwaku("1");
      nwaku2 = new Nwaku("2");
      await nwaku1.start({
        discv5Discovery: true,
        peerExchange: true,
      });

      const enr = (await nwaku1.info()).enrUri;

      await nwaku2.start({
        discv5Discovery: true,
        peerExchange: true,
        discv5BootstrapNode: enr,
      });

      const nwaku2Ma = await nwaku2.getMultiaddrWithId();

      waku = await createLightNode();
      await waku.start();
      await waku.libp2p.dialProtocol(nwaku2Ma, PeerExchangeCodec);

      await new Promise<void>((resolve) => {
        const cb = (evt: CustomEvent<PeerProtocolsChangeData>): void => {
          if (evt.detail.protocols.includes(PeerExchangeCodec)) {
            console.log("resolving");
            waku.libp2p.peerStore.removeEventListener("change:protocols", cb);
            resolve();
          }
        };
        waku.libp2p.peerStore.addEventListener("change:protocols", cb);
      });

      // the ts-ignores are added ref: https://github.com/libp2p/js-libp2p-interfaces/issues/338#issuecomment-1431643645
      const components = {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        connectionManager: waku.libp2p.connectionManager,
        peerStore: waku.libp2p.peerStore,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        registrar: waku.libp2p.registrar,
      };

      return new PeerExchangeDiscovery(components);
    },
    teardown: async () => {
      !!nwaku1 && nwaku1.stop();
      !!nwaku2 && nwaku2.stop();
      !!waku && (await waku.stop());
    },
  });
});
