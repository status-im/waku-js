import type { PeerId } from "@libp2p/interface";
import type { PeerInfo } from "@libp2p/interface";
import { multiaddr } from "@multiformats/multiaddr";
import type { Multiaddr } from "@multiformats/multiaddr";
import type { IWaku } from "@waku/interfaces";
import { createLightNode } from "@waku/sdk";
import { expect } from "chai";
import Sinon, { SinonSpy, SinonStub } from "sinon";

import {
  afterEachCustom,
  beforeEachCustom,
  delay,
  makeLogFileName,
  ServiceNode,
  tearDownNodes
} from "../src/index.js";

describe("multiaddr: dialing", function () {
  let waku: IWaku;
  let nwaku: ServiceNode;
  let dialPeerSpy: SinonSpy;
  let isPeerTopicConfigured: SinonStub;

  afterEachCustom(this, async () => {
    await tearDownNodes(nwaku, waku);
  });

  it("can dial TLS multiaddrs", async function () {
    this.timeout(20_000);

    let tlsWorks = true;

    waku = await createLightNode();
    await waku.start();
    try {
      // dummy multiaddr, doesn't have to be valid
      await waku.dial(multiaddr(`/ip4/127.0.0.1/tcp/30303/tls/ws`));
    } catch (error) {
      if (error instanceof Error) {
        // if the error is of tls unsupported, the test should fail
        // for any other dial errors, the test should pass
        if (error.message === "Unsupported protocol tls") {
          tlsWorks = false;
        }
      }
    }

    expect(tlsWorks).to.eq(true);
  });

  describe("does not attempt the same peer discovered multiple times more than once", function () {
    const PEER_DISCOVERY_COUNT = 3;
    let peerId: PeerId;
    let multiaddr: Multiaddr;

    beforeEachCustom(this, async () => {
      nwaku = new ServiceNode(makeLogFileName(this.ctx));
      await nwaku.start();

      waku = await createLightNode();

      peerId = await nwaku.getPeerId();
      multiaddr = await nwaku.getMultiaddrWithId();

      isPeerTopicConfigured = Sinon.stub(
        waku.connectionManager as any,
        "isPeerTopicConfigured"
      );
      isPeerTopicConfigured.resolves(true);
      dialPeerSpy = Sinon.spy(waku.connectionManager as any, "dialPeer");
    });

    afterEachCustom(this, async () => {
      dialPeerSpy.restore();
    });

    it("through manual discovery", async function () {
      this.timeout(20_000);

      const discoverPeer = (): void => {
        waku.libp2p.dispatchEvent(
          new CustomEvent<PeerInfo>("peer:discovery", {
            detail: {
              id: peerId,
              multiaddrs: [multiaddr]
            }
          })
        );
      };

      for (let i = 0; i < PEER_DISCOVERY_COUNT; i++) {
        discoverPeer();
        await delay(100);
      }

      expect(dialPeerSpy.callCount).to.eq(1);
    });
  });
});
