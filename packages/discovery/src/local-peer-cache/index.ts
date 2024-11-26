import { TypedEventEmitter } from "@libp2p/interface";
import {
  IdentifyResult,
  PeerDiscovery,
  PeerDiscoveryEvents,
  PeerInfo,
  Startable
} from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import {
  type Libp2pComponents,
  type LocalStoragePeerInfo,
  Tags
} from "@waku/interfaces";
import { getWsMultiaddrFromMultiaddrs, Logger } from "@waku/utils";

const log = new Logger("peer-exchange-discovery");

type LocalPeerCacheDiscoveryOptions = {
  tagName?: string;
  tagValue?: number;
  tagTTL?: number;
};

export const DEFAULT_LOCAL_TAG_NAME = Tags.LOCAL;
const DEFAULT_LOCAL_TAG_VALUE = 50;
const DEFAULT_LOCAL_TAG_TTL = 100_000_000;

export class LocalPeerCacheDiscovery
  extends TypedEventEmitter<PeerDiscoveryEvents>
  implements PeerDiscovery, Startable
{
  private isStarted: boolean;
  private peers: LocalStoragePeerInfo[] = [];

  public constructor(
    private readonly components: Libp2pComponents,
    private readonly options?: LocalPeerCacheDiscoveryOptions
  ) {
    super();
    this.isStarted = false;
    this.peers = this.getPeersFromLocalStorage();
  }

  public get [Symbol.toStringTag](): string {
    return "@waku/local-peer-cache-discovery";
  }

  public async start(): Promise<void> {
    if (this.isStarted) return;

    log.info("Starting Local Storage Discovery");
    this.components.events.addEventListener(
      "peer:identify",
      this.handleNewPeers
    );

    for (const { id: idStr, address } of this.peers) {
      const peerId = peerIdFromString(idStr);
      if (await this.components.peerStore.has(peerId)) continue;

      await this.components.peerStore.save(peerId, {
        multiaddrs: [multiaddr(address)],
        tags: {
          [this.options?.tagName ?? DEFAULT_LOCAL_TAG_NAME]: {
            value: this.options?.tagValue ?? DEFAULT_LOCAL_TAG_VALUE,
            ttl: this.options?.tagTTL ?? DEFAULT_LOCAL_TAG_TTL
          }
        }
      });

      this.dispatchEvent(
        new CustomEvent<PeerInfo>("peer", {
          detail: {
            id: peerId,
            multiaddrs: [multiaddr(address)]
          }
        })
      );
    }

    log.info(`Discovered ${this.peers.length} peers`);

    this.isStarted = true;
  }

  public stop(): void | Promise<void> {
    if (!this.isStarted) return;
    log.info("Stopping Local Storage Discovery");
    this.components.events.removeEventListener(
      "peer:identify",
      this.handleNewPeers
    );
    this.isStarted = false;

    this.savePeersToLocalStorage();
  }

  public handleNewPeers = (event: CustomEvent<IdentifyResult>): void => {
    const { peerId, listenAddrs } = event.detail;

    const websocketMultiaddr = getWsMultiaddrFromMultiaddrs(listenAddrs);

    const localStoragePeers = this.getPeersFromLocalStorage();

    const existingPeerIndex = localStoragePeers.findIndex(
      (_peer) => _peer.id === peerId.toString()
    );

    if (existingPeerIndex >= 0) {
      localStoragePeers[existingPeerIndex].address =
        websocketMultiaddr.toString();
    } else {
      localStoragePeers.push({
        id: peerId.toString(),
        address: websocketMultiaddr.toString()
      });
    }

    this.peers = localStoragePeers;
    this.savePeersToLocalStorage();
  };

  private getPeersFromLocalStorage(): LocalStoragePeerInfo[] {
    try {
      const storedPeersData = localStorage.getItem("waku:peers");
      if (!storedPeersData) return [];
      const peers = JSON.parse(storedPeersData);
      return peers.filter(isValidStoredPeer);
    } catch (error) {
      log.error("Error parsing peers from local storage:", error);
      return [];
    }
  }

  private savePeersToLocalStorage(): void {
    try {
      localStorage.setItem("waku:peers", JSON.stringify(this.peers));
    } catch (error) {
      log.error("Error saving peers to local storage:", error);
    }
  }
}

function isValidStoredPeer(peer: any): peer is LocalStoragePeerInfo {
  return (
    peer &&
    typeof peer === "object" &&
    typeof peer.id === "string" &&
    typeof peer.address === "string"
  );
}

export function wakuLocalPeerCacheDiscovery(): (
  components: Libp2pComponents,
  options?: LocalPeerCacheDiscoveryOptions
) => LocalPeerCacheDiscovery {
  return (
    components: Libp2pComponents,
    options?: LocalPeerCacheDiscoveryOptions
  ) => new LocalPeerCacheDiscovery(components, options);
}
