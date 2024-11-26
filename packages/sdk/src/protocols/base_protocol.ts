import type { Peer, PeerId } from "@libp2p/interface";
import { ConnectionManager } from "@waku/core";
import { BaseProtocol } from "@waku/core/lib/base_protocol";
import { IBaseProtocolSDK, ProtocolUseOptions } from "@waku/interfaces";
import { Logger } from "@waku/utils";

import { PeerManager } from "./peer_manager.js";

interface Options {
  numPeersToUse?: number;
  maintainPeersInterval?: number;
}

export const DEFAULT_NUM_PEERS_TO_USE = 2;
const DEFAULT_MAINTAIN_PEERS_INTERVAL = 30_000;

export class BaseProtocolSDK implements IBaseProtocolSDK {
  private peerManager: PeerManager;
  public readonly numPeersToUse: number;
  private maintainPeersIntervalId: ReturnType<
    typeof window.setInterval
  > | null = null;
  private log: Logger;

  public constructor(
    protected core: BaseProtocol,
    protected connectionManager: ConnectionManager,
    options: Options
  ) {
    this.log = new Logger(`sdk:${core.multicodec}`);

    this.numPeersToUse = options?.numPeersToUse ?? DEFAULT_NUM_PEERS_TO_USE;
    const maintainPeersInterval =
      options?.maintainPeersInterval ?? DEFAULT_MAINTAIN_PEERS_INTERVAL;

    this.peerManager = new PeerManager(connectionManager, core, this.log);

    this.log.info(
      `Initializing BaseProtocolSDK with numPeersToUse: ${this.numPeersToUse}, maintainPeersInterval: ${maintainPeersInterval}ms`
    );
    void this.startMaintainPeersInterval(maintainPeersInterval);
  }

  public get connectedPeers(): Peer[] {
    return this.peerManager.getPeers().slice(0, this.numPeersToUse);
  }

  /**
   * Disconnects from a peer and tries to find a new one to replace it.
   * @param peerToDisconnect The peer to disconnect from.
   * @returns The new peer that was found and connected to.
   */
  public async renewPeer(peerToDisconnect: PeerId): Promise<Peer | undefined> {
    this.log.info(`Attempting to renew peer ${peerToDisconnect}`);

    const newPeer = await this.peerManager.findPeers(1);
    if (newPeer.length === 0) {
      this.log.error(
        "Failed to find a new peer to replace the disconnected one"
      );
      return undefined;
    }

    await this.peerManager.removePeer(peerToDisconnect);
    await this.peerManager.addPeer(newPeer[0]);

    this.log.info(`Successfully renewed peer. New peer: ${newPeer[0].id}`);

    return newPeer[0];
  }

  /**
   * Stops the maintain peers interval.
   */
  public stopMaintainPeersInterval(): void {
    if (this.maintainPeersIntervalId) {
      clearInterval(this.maintainPeersIntervalId);
      this.maintainPeersIntervalId = null;
      this.log.info("Maintain peers interval stopped");
    } else {
      this.log.info("Maintain peers interval was not running");
    }
  }

  /**
   * Checks if there are sufficient peers to send a message to.
   * If `forceUseAllPeers` is `false` (default), returns `true` if there are any connected peers.
   * If `forceUseAllPeers` is `true`, attempts to connect to `numPeersToUse` peers.
   * @param options Optional options object
   * @param options.forceUseAllPeers Optional flag to force connecting to `numPeersToUse` peers (default: false)
   * @param options.maxAttempts Optional maximum number of attempts to reach the required number of peers (default: 3)
   * @returns `true` if the required number of peers are connected, `false` otherwise
   */
  protected async hasPeers(
    options: Partial<ProtocolUseOptions> = {}
  ): Promise<boolean> {
    const { forceUseAllPeers = false, maxAttempts = 3 } = options;

    this.log.info(
      `Checking for peers. forceUseAllPeers: ${forceUseAllPeers}, maxAttempts: ${maxAttempts}`
    );

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      this.log.info(
        `Attempt ${attempts + 1}/${maxAttempts} to reach required number of peers`
      );
      await this.maintainPeers();

      if (!forceUseAllPeers && this.connectedPeers.length > 0) {
        this.log.info(
          `At least one peer connected (${this.connectedPeers.length}), not forcing use of all peers`
        );
        return true;
      }

      if (this.connectedPeers.length >= this.numPeersToUse) {
        this.log.info(
          `Required number of peers (${this.numPeersToUse}) reached`
        );
        return true;
      }

      this.log.warn(
        `Found only ${this.connectedPeers.length}/${this.numPeersToUse} required peers. Retrying...`
      );
    }

    this.log.error(
      `Failed to find required number of peers (${this.numPeersToUse}) after ${maxAttempts} attempts`
    );
    return false;
  }

  /**
   * Starts an interval to maintain the peers list to `numPeersToUse`.
   * @param interval The interval in milliseconds to maintain the peers.
   */
  private async startMaintainPeersInterval(interval: number): Promise<void> {
    this.log.info(
      `Starting maintain peers interval with ${interval}ms interval`
    );
    try {
      this.maintainPeersIntervalId = setInterval(() => {
        this.log.info("Running scheduled peer maintenance");
        this.maintainPeers().catch((error) => {
          this.log.error("Error during scheduled peer maintenance:", error);
        });
      }, interval);
      this.log.info("Maintain peers interval started successfully");
    } catch (error) {
      this.log.error("Error starting maintain peers interval:", error);
      throw error;
    }
  }

  /**
   * Maintains the peers list to `numPeersToUse`.
   */
  private async maintainPeers(): Promise<void> {
    try {
      const currentPeerCount = await this.peerManager.getPeerCount();
      const numPeersToAdd = this.numPeersToUse - currentPeerCount;

      this.log.info(
        `Current peer count: ${currentPeerCount}, target: ${this.numPeersToUse}`
      );

      if (numPeersToAdd === 0) {
        this.log.info("Peer count is at target, no maintenance required");
        return;
      }

      if (numPeersToAdd > 0) {
        this.log.info(`Attempting to add ${numPeersToAdd} peer(s)`);
        await this.peerManager.findAndAddPeers(numPeersToAdd);
      } else {
        this.log.info(
          `Attempting to remove ${Math.abs(numPeersToAdd)} excess peer(s)`
        );
        await this.peerManager.removeExcessPeers(Math.abs(numPeersToAdd));
      }

      const finalPeerCount = await this.peerManager.getPeerCount();
      this.log.info(
        `Peer maintenance completed. Initial count: ${currentPeerCount}, Final count: ${finalPeerCount}`
      );
    } catch (error) {
      this.log.error("Error during peer maintenance", { error });
    }
  }
}
