import { multiaddr } from "@multiformats/multiaddr";
import { createLightNode } from "@waku/create";
import type { LightNode, PeerExchangeResponse } from "@waku/interfaces";
import { PeerExchangeCodec, WakuPeerExchange } from "@waku/peer-exchange";
import { expect } from "chai";

describe("Peer Exchange", () => {
  let waku: LightNode;

  afterEach(async function () {
    !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  describe.only("Locally run nodes", () => {
    let waku: LightNode;

    afterEach(async function () {
      !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
    });

    it.only("nwaku interop", async function () {
      this.timeout(25_000);

      waku = await createLightNode();
      await waku.start();
      const alvarotest = multiaddr(
        `/ip4/127.0.0.1/tcp/8000/ws/p2p/16Uiu2HAmRygDEJjs4krDTsyojhrf6BJ8rmUsdN9EjpvEvi79PFCD`
      );
      await waku.libp2p.dialProtocol(alvarotest, PeerExchangeCodec);

      await new Promise<void>((resolve) => {
        waku.libp2p.peerStore.addEventListener("change:protocols", (evt) => {
          if (evt.detail.protocols.includes(PeerExchangeCodec)) {
            resolve();
          }
        });
      });

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
        console.log("response received", response);
        receivedCallback = true;
      };
      console.log("sending query");

      const lol = await peerExchange.query(
        {
          numPeers: numPeersToRequest,
        },
        callback
      );

      console.log("lol", lol);

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 5_000);
      });

      expect(receivedCallback).to.be.equal(true);
    });
  });
});
