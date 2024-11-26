import { generateKeyPair } from "@libp2p/crypto/keys";
import { type PeerId } from "@libp2p/interface";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import { PeerExchangeDiscovery } from "@waku/discovery";
import { IEnr, LightNode } from "@waku/interfaces";
import { createLightNode, ShardInfo } from "@waku/sdk";
import { decodeRelayShard, shardInfoToPubsubTopics } from "@waku/utils";
import { expect } from "chai";
import Sinon from "sinon";

describe("Peer Exchange Continuous Discovery", () => {
  let peerExchangeDiscovery: PeerExchangeDiscovery;
  let queryStub: Sinon.SinonStub;
  let peerId: PeerId;
  let randomPeerId: PeerId;
  let waku: LightNode;
  const shardInfo: ShardInfo = {
    clusterId: 1,
    shards: [1, 2]
  };
  const multiaddrs = [multiaddr("/ip4/127.0.0.1/udp/1234")];

  beforeEach(async () => {
    waku = await createLightNode();

    peerExchangeDiscovery = new PeerExchangeDiscovery(
      waku.libp2p.components,
      shardInfoToPubsubTopics(shardInfo)
    );
    queryStub = Sinon.stub(
      (peerExchangeDiscovery as any).peerExchange,
      "query" as any
    );

    await discoverPeerOnce();
  });

  it("Should update multiaddrs", async () => {
    const newMultiaddrs = [multiaddr("/ip4/192.168.1.1/udp/1234")];
    const newPeerInfo = {
      ENR: {
        peerId,
        shardInfo,
        peerInfo: {
          multiaddrs: newMultiaddrs,
          id: peerId
        }
      } as IEnr
    };
    queryStub.resolves({ error: null, peerInfos: [newPeerInfo] });

    const newResult = await (peerExchangeDiscovery as any).query(randomPeerId);
    expect(newResult.error).to.be.null;
    const newPeers = await waku.libp2p.peerStore.all();
    expect(newPeers.length).to.equal(1);
    const newPeer = newPeers[0];
    expect(newPeer.addresses.length).to.equal(1);
    expect(newPeer.addresses[0].multiaddr.toString()).to.equal(
      newMultiaddrs[0].toString()
    );
  });

  it("Should update shard info", async () => {
    const newShardInfo: ShardInfo = {
      clusterId: 2,
      shards: [1, 2, 3]
    };
    const newPeerInfo = {
      ENR: {
        peerId,
        shardInfo: newShardInfo,
        peerInfo: {
          multiaddrs: multiaddrs,
          id: peerId
        }
      } as IEnr
    };
    queryStub.resolves({ error: null, peerInfos: [newPeerInfo] });

    const newResult = await (peerExchangeDiscovery as any).query(randomPeerId);
    expect(newResult.error).to.be.null;
    const newPeers = await waku.libp2p.peerStore.all();
    expect(newPeers.length).to.equal(1);
    const newPeer = newPeers[0];
    expect(newPeer.addresses.length).to.equal(1);
    expect(newPeer.addresses[0].multiaddr.toString()).to.equal(
      multiaddrs[0].toString()
    );

    const _shardInfo = decodeRelayShard(newPeer.metadata.get("shardInfo")!);
    expect(_shardInfo).to.deep.equal(newShardInfo);
  });

  async function discoverPeerOnce(): Promise<void> {
    const privateKey = await generateKeyPair("secp256k1");
    peerId = peerIdFromPrivateKey(privateKey);

    const enr: IEnr = {
      peerId,
      shardInfo,
      peerInfo: {
        multiaddrs: multiaddrs,
        id: peerId
      }
    } as IEnr;

    const peerInfo = {
      ENR: enr
    };

    queryStub.resolves({ error: null, peerInfos: [peerInfo] });

    const privateKeyRandom = await generateKeyPair("secp256k1");
    randomPeerId = peerIdFromPrivateKey(privateKeyRandom);

    const result = await (peerExchangeDiscovery as any).query(randomPeerId);
    expect(result.error).to.be.null;

    const peers = await waku.libp2p.peerStore.all();
    expect(peers.length).to.equal(1);
    const peer = peers[0];
    expect(peer.addresses.length).to.equal(1);
    expect(peer.addresses[0].multiaddr.toString()).to.equal(
      multiaddrs[0].toString()
    );
    const _shardInfo = decodeRelayShard(peer.metadata.get("shardInfo")!);
    expect(_shardInfo).to.deep.equal(shardInfo);
  }
});
