import type { Peer, PeerStore } from "@libp2p/interface";

import { bytesToUtf8 } from "../bytes/index.js";

/**
 * Returns a pseudo-random peer that supports the given protocol.
 * Useful for protocols such as store and light push
 */
export function selectRandomPeer(peers: Peer[]): Peer | undefined {
  if (peers.length === 0) return;

  const index = Math.round(Math.random() * (peers.length - 1));
  return peers[index];
}

/**
 * Function to sort peers by latency from lowest to highest
 * @param peerStore - The Libp2p PeerStore
 * @param peers - The list of peers to choose from
 * @returns Sorted array of peers by latency
 */
export async function sortPeersByLatency(
  peerStore: PeerStore,
  peers: Peer[]
): Promise<Peer[]> {
  if (peers.length === 0) return [];

  const results = await Promise.all(
    peers.map(async (peer) => {
      try {
        const pingBytes = (await peerStore.get(peer.id)).metadata.get("ping");
        if (!pingBytes) return { peer, ping: Infinity };

        const ping = Number(bytesToUtf8(pingBytes));
        return { peer, ping };
      } catch (error) {
        return { peer, ping: Infinity };
      }
    })
  );

  // filter out null values
  const validResults = results.filter(
    (result): result is { peer: Peer; ping: number } => result !== null
  );

  return validResults
    .sort((a, b) => a.ping - b.ping)
    .map((result) => result.peer);
}

/**
 * Returns the list of peers that supports the given protocol.
 */
export async function getPeersForProtocol(
  peerStore: PeerStore,
  protocols: string[]
): Promise<Peer[]> {
  const peers: Peer[] = [];
  await peerStore.forEach((peer) => {
    for (let i = 0; i < protocols.length; i++) {
      if (peer.protocols.includes(protocols[i])) {
        peers.push(peer);
        break;
      }
    }
  });
  return peers;
}
