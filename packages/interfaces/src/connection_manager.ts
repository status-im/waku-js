import type { Peer, PeerId, TypedEventEmitter } from "@libp2p/interface";

import { PubsubTopic } from "./misc.js";

export enum Tags {
  BOOTSTRAP = "bootstrap",
  PEER_EXCHANGE = "peer-exchange",
  LOCAL = "local-peer-cache"
}

export type ConnectionManagerOptions = {
  /**
   * Number of attempts before a peer is considered non-dialable.
   * This is used to not spam a peer with dial attempts when it is not dialable.
   *
   * @default 3
   */
  maxDialAttemptsForPeer: number;

  /**
   * Max number of bootstrap peers allowed to be connected to initially.
   * This is used to increase intention of dialing non-bootstrap peers, found using other discovery mechanisms (like Peer Exchange).
   *
   * @default 1
   */
  maxBootstrapPeersAllowed: number;

  /**
   * Max number of parallel dials allowed.
   *
   * @default 3
   */
  maxParallelDials: number;

  /**
   * Keep alive libp2p pings interval in seconds.
   *
   * @default 300 seconds
   */
  pingKeepAlive: number;

  /**
   * Gossip sub specific keep alive interval in seconds.
   *
   * @default 300 seconds
   */
  relayKeepAlive: number;
};

export enum EPeersByDiscoveryEvents {
  PEER_DISCOVERY_BOOTSTRAP = "peer:discovery:bootstrap",
  PEER_DISCOVERY_PEER_EXCHANGE = "peer:discovery:peer-exchange",
  PEER_CONNECT_BOOTSTRAP = "peer:connected:bootstrap",
  PEER_CONNECT_PEER_EXCHANGE = "peer:connected:peer-exchange"
}

export interface IPeersByDiscoveryEvents {
  [EPeersByDiscoveryEvents.PEER_DISCOVERY_BOOTSTRAP]: CustomEvent<PeerId>;
  [EPeersByDiscoveryEvents.PEER_DISCOVERY_PEER_EXCHANGE]: CustomEvent<PeerId>;
  [EPeersByDiscoveryEvents.PEER_CONNECT_BOOTSTRAP]: CustomEvent<PeerId>;
  [EPeersByDiscoveryEvents.PEER_CONNECT_PEER_EXCHANGE]: CustomEvent<PeerId>;
}

export interface PeersByDiscoveryResult {
  DISCOVERED: {
    [Tags.BOOTSTRAP]: Peer[];
    [Tags.PEER_EXCHANGE]: Peer[];
    [Tags.LOCAL]: Peer[];
  };
  CONNECTED: {
    [Tags.BOOTSTRAP]: Peer[];
    [Tags.PEER_EXCHANGE]: Peer[];
    [Tags.LOCAL]: Peer[];
  };
}

export enum EConnectionStateEvents {
  CONNECTION_STATUS = "waku:connection"
}

export interface IConnectionStateEvents {
  // true when online, false when offline
  [EConnectionStateEvents.CONNECTION_STATUS]: CustomEvent<boolean>;
}

export interface IConnectionManager
  extends TypedEventEmitter<IPeersByDiscoveryEvents & IConnectionStateEvents> {
  pubsubTopics: PubsubTopic[];
  getConnectedPeers(codec?: string): Promise<Peer[]>;
  dropConnection(peerId: PeerId): Promise<void>;
  getPeersByDiscovery(): Promise<PeersByDiscoveryResult>;
  stop(): void;
}
