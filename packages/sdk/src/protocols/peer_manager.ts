import { Peer, PeerId } from "@libp2p/interface";
import { ConnectionManager, getHealthManager } from "@waku/core";
import { BaseProtocol } from "@waku/core/lib/base_protocol";
import { IHealthManager } from "@waku/interfaces";
import { Logger } from "@waku/utils";
import { Mutex } from "async-mutex";

export class PeerManager {
  private peers: Map<string, Peer> = new Map();
  private healthManager: IHealthManager;

  private readMutex = new Mutex();
  private writeMutex = new Mutex();
  private writeLockHolder: string | null = null;

  public constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly core: BaseProtocol,
    private readonly log: Logger
  ) {
    this.healthManager = getHealthManager();
    this.healthManager.updateProtocolHealth(this.core.multicodec, 0);
  }

  public getWriteLockHolder(): string | null {
    return this.writeLockHolder;
  }

  public getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  public async addPeer(peer: Peer): Promise<void> {
    return this.writeMutex.runExclusive(async () => {
      this.writeLockHolder = `addPeer: ${peer.id.toString()}`;
      await this.connectionManager.attemptDial(peer.id);
      this.peers.set(peer.id.toString(), peer);
      this.log.info(`Added and dialed peer: ${peer.id.toString()}`);
      this.healthManager.updateProtocolHealth(
        this.core.multicodec,
        this.peers.size
      );
      this.writeLockHolder = null;
    });
  }

  public async removePeer(peerId: PeerId): Promise<void> {
    return this.writeMutex.runExclusive(() => {
      this.writeLockHolder = `removePeer: ${peerId.toString()}`;
      this.peers.delete(peerId.toString());
      this.log.info(`Removed peer: ${peerId.toString()}`);
      this.healthManager.updateProtocolHealth(
        this.core.multicodec,
        this.peers.size
      );
      this.writeLockHolder = null;
    });
  }

  public async getPeerCount(): Promise<number> {
    return this.readMutex.runExclusive(() => this.peers.size);
  }

  public async hasPeers(): Promise<boolean> {
    return this.readMutex.runExclusive(() => this.peers.size > 0);
  }

  public async removeExcessPeers(excessPeers: number): Promise<void> {
    this.log.info(`Removing ${excessPeers} excess peer(s)`);
    const peersToRemove = Array.from(this.peers.values()).slice(0, excessPeers);
    for (const peer of peersToRemove) {
      await this.removePeer(peer.id);
    }
  }

  /**
   * Finds and adds new peers to the peers list.
   * @param numPeers The number of peers to find and add.
   */
  public async findAndAddPeers(numPeers: number): Promise<Peer[]> {
    const additionalPeers = await this.findPeers(numPeers);
    if (additionalPeers.length === 0) {
      this.log.warn("No additional peers found");
      return [];
    }
    return this.addMultiplePeers(additionalPeers);
  }

  /**
   * Finds additional peers.
   * @param numPeers The number of peers to find.
   */
  public async findPeers(numPeers: number): Promise<Peer[]> {
    const connectedPeers = await this.core.getPeers();

    return this.readMutex.runExclusive(async () => {
      const newPeers = connectedPeers
        .filter((peer) => !this.peers.has(peer.id.toString()))
        .slice(0, numPeers);

      return newPeers;
    });
  }

  public async addMultiplePeers(peers: Peer[]): Promise<Peer[]> {
    const addedPeers: Peer[] = [];
    for (const peer of peers) {
      await this.addPeer(peer);
      addedPeers.push(peer);
    }
    return addedPeers;
  }
}
