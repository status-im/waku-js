import { generateKeyPair } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import { ENR } from "@waku/enr";
import { EnrCreator } from "@waku/enr";
import type { Waku2 } from "@waku/interfaces";
import { expect } from "chai";

import { fetchNodesUntilCapabilitiesFulfilled } from "./fetch_nodes.js";

async function createEnr(waku2: Waku2): Promise<ENR> {
  const peerId = await generateKeyPair("secp256k1").then(peerIdFromPrivateKey);
  const enr = await EnrCreator.fromPeerId(peerId);
  enr.setLocationMultiaddr(multiaddr("/ip4/18.223.219.100/udp/9000"));
  enr.multiaddrs = [
    multiaddr("/dns4/node-01.do-ams3.waku.test.status.im/tcp/443/wss"),
    multiaddr("/dns6/node-01.ac-cn-hongkong-c.waku.test.status.im/tcp/443/wss"),
    multiaddr(
      "/onion3/vww6ybal4bd7szmgncyruucpgfkqahzddi37ktceo3ah7ngmcopnpyyd:1234/wss"
    )
  ];

  enr.waku2 = waku2;
  return enr;
}

const Waku2None = {
  relay: false,
  store: false,
  filter: false,
  lightPush: false
};

describe("Fetch nodes until capabilities are fulfilled", function () {
  it("1 Relay, 1 fetch", async function () {
    const relayNode = await createEnr({ ...Waku2None, relay: true });

    const getNode = (): Promise<ENR> => Promise.resolve(relayNode);

    const res = await fetchNodesUntilCapabilitiesFulfilled(
      { relay: 1 },
      0,
      getNode
    );

    expect(res.length).to.eq(1);
    expect(res[0].peerId!.toString()).to.eq(relayNode.peerId?.toString());
  });

  it("1 Store, 2 fetches", async function () {
    const relayNode = await createEnr({ ...Waku2None, relay: true });
    const storeNode = await createEnr({ ...Waku2None, store: true });

    const retrievedNodes = [relayNode, storeNode];

    let fetchCount = 0;
    const getNode = (): Promise<ENR> => {
      const node = retrievedNodes[fetchCount];
      fetchCount++;
      return Promise.resolve(node);
    };

    const res = await fetchNodesUntilCapabilitiesFulfilled(
      { store: 1 },
      1,
      getNode
    );

    expect(res.length).to.eq(1);
    expect(res[0].peerId!.toString()).to.eq(storeNode.peerId?.toString());
  });

  it("1 Store, 2 relays, 2 fetches", async function () {
    const relayNode1 = await createEnr({ ...Waku2None, relay: true });
    const relayNode2 = await createEnr({ ...Waku2None, relay: true });
    const relayNode3 = await createEnr({ ...Waku2None, relay: true });
    const relayStoreNode = await createEnr({
      ...Waku2None,
      relay: true,
      store: true
    });

    const retrievedNodes = [relayNode1, relayNode2, relayNode3, relayStoreNode];

    let fetchCount = 0;
    const getNode = (): Promise<ENR> => {
      const node = retrievedNodes[fetchCount];
      fetchCount++;
      return Promise.resolve(node);
    };

    const res = await fetchNodesUntilCapabilitiesFulfilled(
      { store: 1, relay: 2 },
      1,
      getNode
    );

    expect(res.length).to.eq(3);
    expect(res[0].peerId!.toString()).to.eq(relayNode1.peerId?.toString());
    expect(res[1].peerId!.toString()).to.eq(relayNode2.peerId?.toString());
    expect(res[2].peerId!.toString()).to.eq(relayStoreNode.peerId?.toString());
  });

  it("1 Relay, 1 Filter, gives up", async function () {
    const relayNode = await createEnr({ ...Waku2None, relay: true });

    const getNode = (): Promise<ENR> => Promise.resolve(relayNode);

    const res = await fetchNodesUntilCapabilitiesFulfilled(
      { filter: 1, relay: 1 },
      5,
      getNode
    );

    expect(res.length).to.eq(1);
    expect(res[0].peerId!.toString()).to.eq(relayNode.peerId?.toString());
  });
});
