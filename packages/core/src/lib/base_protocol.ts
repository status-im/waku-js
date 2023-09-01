import type { Libp2p } from "@libp2p/interface";
import type { Stream } from "@libp2p/interface/connection";
import type { PeerId } from "@libp2p/interface/peer-id";
import { Peer, PeerStore } from "@libp2p/interface/peer-store";
import { IBaseProtocol, Libp2pComponents, Tags } from "@waku/interfaces";
import {
  getPeersForProtocol,
  selectConnection,
  selectPeerForProtocol
} from "@waku/utils/libp2p";

import { KeepAliveManager } from "./keep_alive_manager.js";

/**
 * A class with predefined helpers, to be used as a base to implement Waku
 * Protocols.
 */
export class BaseProtocol implements IBaseProtocol {
  public readonly addLibp2pEventListener: Libp2p["addEventListener"];
  public readonly removeLibp2pEventListener: Libp2p["removeEventListener"];

  constructor(
    public multicodec: string,
    private components: Libp2pComponents
  ) {
    this.addLibp2pEventListener = components.events.addEventListener.bind(
      components.events
    );
    this.removeLibp2pEventListener = components.events.removeEventListener.bind(
      components.events
    );
  }

  public get peerStore(): PeerStore {
    return this.components.peerStore;
  }

  /**
   * Returns known peers from the address book (`libp2p.peerStore`) that support
   * the class protocol. Waku may or may not be currently connected to these
   * peers.
   */
  public async peers(): Promise<Peer[]> {
    return getPeersForProtocol(this.peerStore, [this.multicodec]);
  }

  protected async getPeer(peerId?: PeerId): Promise<Peer> {
    const { peer } = await selectPeerForProtocol(
      this.peerStore,
      KeepAliveManager.getInstance().getPing.bind(
        KeepAliveManager.getInstance()
      ),
      [this.multicodec],
      peerId
    );
    return peer;
  }

  /**
   * Retrieves a list of peers based on the specified criteria.
   *
   * @param numPeers - The number of peers to retrieve. If 0, all peers are returned.
   * @param includeBootstrap - If true, includes a bootstrap peer in the result. Useful for protocols like Filter and Store that require only one peer for now.
   * @returns A Promise that resolves to an array of peers based on the specified criteria.
   */
  protected async getPeers({
    numPeers,
    includeBootstrap
  }: {
    numPeers: number;
    includeBootstrap: boolean;
  }): Promise<Peer[]> {
    // Retrieve all peers that support the protocol
    const allPeersForProtocol = await getPeersForProtocol(this.peerStore, [
      this.multicodec
    ]);

    // Collect the bootstrap peers if required to include
    const bootstrapPeers = includeBootstrap
      ? allPeersForProtocol.filter((peer) => peer.tags.has(Tags.BOOTSTRAP))
      : [];

    // Collect non-bootstrap peers
    const remainingPeers = allPeersForProtocol.filter(
      (peer) => !bootstrapPeers.includes(peer)
    );

    if (numPeers === 0) {
      if (includeBootstrap) {
        return allPeersForProtocol;
      } else {
        return remainingPeers;
      }
    }

    // Initialize the list of selected peers
    const selectedPeers: Peer[] = [];

    // Add the bootstrap peers if available and required
    selectedPeers.push(...bootstrapPeers);

    // Fill up to numPeers with remaining random peers if needed
    while (selectedPeers.length < numPeers && remainingPeers.length > 0) {
      const randomIndex = Math.floor(Math.random() * remainingPeers.length);
      const randomPeer = remainingPeers.splice(randomIndex, 1)[0];
      selectedPeers.push(randomPeer);
    }

    return selectedPeers;
  }

  protected async newStream(peer: Peer): Promise<Stream> {
    const connections = this.components.connectionManager.getConnections(
      peer.id
    );
    const connection = selectConnection(connections);
    if (!connection) {
      throw new Error("Failed to get a connection to the peer");
    }

    return connection.newStream(this.multicodec);
  }
}
