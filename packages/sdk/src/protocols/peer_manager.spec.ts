import { Peer, PeerId } from "@libp2p/interface";
import { ConnectionManager, LightPushCodec } from "@waku/core";
import { BaseProtocol } from "@waku/core/lib/base_protocol";
import { Logger } from "@waku/utils";
import { expect } from "chai";
import sinon from "sinon";

import { PeerManager } from "./peer_manager.js";

describe("PeerManager", () => {
  let peerManager: PeerManager;
  let mockConnectionManager: sinon.SinonStubbedInstance<ConnectionManager>;
  let mockCore: sinon.SinonStubbedInstance<BaseProtocol>;
  let mockLogger: any;

  beforeEach(() => {
    mockConnectionManager = sinon.createStubInstance(ConnectionManager);
    mockCore = sinon.createStubInstance(BaseProtocol);
    mockLogger = {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      extend: sinon.stub().returns({
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        debug: sinon.stub()
      })
    };

    mockCore.multicodec = LightPushCodec;

    peerManager = new PeerManager(
      mockConnectionManager as any,
      mockCore as any,
      mockLogger as Logger
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  const createMockPeer = (id: string): Peer =>
    ({
      id: {
        toString: () => id
      } as PeerId
    }) as Peer;

  describe("addPeer", () => {
    it("should add a peer", async () => {
      const peer = createMockPeer("peer1");
      await peerManager.addPeer(peer);

      expect(mockConnectionManager.attemptDial.calledWith(peer.id)).to.be.true;
      expect(
        mockLogger.info.calledWith(sinon.match(/Added and dialed peer: peer1/))
      ).to.be.true;
      expect(await peerManager.getPeerCount()).to.equal(1);
    });
  });

  describe("removePeer", () => {
    it("should remove a peer", async () => {
      const peer = createMockPeer("peer1");
      await peerManager.addPeer(peer);
      await peerManager.removePeer(peer.id);

      expect(mockLogger.info.calledWith(sinon.match(/Removed peer: peer1/))).to
        .be.true;
      expect(await peerManager.getPeerCount()).to.equal(0);
    });
  });

  describe("getPeerCount", () => {
    it("should return the correct number of peers", async () => {
      await peerManager.addPeer(createMockPeer("peer1"));
      await peerManager.addPeer(createMockPeer("peer2"));

      const count = await peerManager.getPeerCount();
      expect(count).to.equal(2);
    });
  });

  describe("hasPeers", () => {
    it("should return true when peers exist", async () => {
      await peerManager.addPeer(createMockPeer("peer1"));
      const result = await peerManager.hasPeers();
      expect(result).to.be.true;
    });

    it("should return false when no peers exist", async () => {
      const result = await peerManager.hasPeers();
      expect(result).to.be.false;
    });
  });

  describe("removeExcessPeers", () => {
    it("should remove the specified number of excess peers", async () => {
      await peerManager.addPeer(createMockPeer("peer1"));
      await peerManager.addPeer(createMockPeer("peer2"));
      await peerManager.addPeer(createMockPeer("peer3"));

      await peerManager.removeExcessPeers(2);

      const count = await peerManager.getPeerCount();
      expect(count).to.equal(1);
      expect(mockLogger.info.calledWith(`Removing 2 excess peer(s)`)).to.be
        .true;
    });
  });

  describe("findAndAddPeers", () => {
    it("should find and add new peers", async () => {
      const newPeers = [createMockPeer("peer1"), createMockPeer("peer2")];
      mockCore.getPeers.resolves(newPeers);

      const addedPeers = await peerManager.findAndAddPeers(2);

      expect(addedPeers).to.have.lengthOf(2);
      expect(mockConnectionManager.attemptDial.callCount).to.equal(2);
    });

    it("should not add existing peers", async () => {
      const existingPeer = createMockPeer("existing");
      await peerManager.addPeer(existingPeer);

      const newPeers = [existingPeer, createMockPeer("new")];
      mockCore.getPeers.resolves(newPeers);

      const addedPeers = await peerManager.findAndAddPeers(2);

      expect(addedPeers).to.have.lengthOf(1);
      expect(mockConnectionManager.attemptDial.callCount).to.equal(2); // Once for existing, once for new
    });

    it("should log when no additional peers are found", async () => {
      mockCore.getPeers.resolves([]);

      await peerManager.findAndAddPeers(2);

      expect(mockLogger.warn.calledWith("No additional peers found")).to.be
        .true;
    });
  });
});
