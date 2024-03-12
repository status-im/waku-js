import { Peer } from "@libp2p/interface";
import { Tags } from "@waku/interfaces";

/**
 * Retrieves a list of peers based on the specified criteria:
 * 1. If numPeers is 0, return all peers
 * 2. Bootstrap peers are prioritized
 * 3. Non-bootstrap peers are randomly selected to fill up to numPeers
 *
 * @param peers - The list of peers to filter from.
 * @param numPeers - The total number of peers to retrieve. If 0, all peers are returned, irrespective of `maxBootstrapPeers`.
 * @param maxBootstrapPeers - The maximum number of bootstrap peers to retrieve.
 * @returns An array of peers based on the specified criteria.
 */
export function filterPeersByDiscovery(
  peers: Peer[],
  numPeers: number,
  maxBootstrapPeers: number
): Peer[] {
  // Collect the bootstrap peers up to the specified maximum
  let bootstrapPeers = peers
    .filter((peer) => peer.tags.has(Tags.BOOTSTRAP))
    .slice(0, maxBootstrapPeers);

  // If numPeers is less than the number of bootstrap peers, adjust the bootstrapPeers array
  if (numPeers > 0 && numPeers < bootstrapPeers.length) {
    bootstrapPeers = bootstrapPeers.slice(0, numPeers);
  }

  // Collect non-bootstrap peers
  const nonBootstrapPeers = peers.filter(
    (peer) => !peer.tags.has(Tags.BOOTSTRAP)
  );

  // If numPeers is 0, return all peers
  if (numPeers === 0) {
    return [...bootstrapPeers, ...nonBootstrapPeers];
  }

  // Initialize the list of selected peers with the bootstrap peers
  const selectedPeers: Peer[] = [...bootstrapPeers];

  // Fill up to numPeers with remaining random peers if needed
  while (selectedPeers.length < numPeers && nonBootstrapPeers.length > 0) {
    const randomIndex = Math.floor(Math.random() * nonBootstrapPeers.length);
    const randomPeer = nonBootstrapPeers[randomIndex];
    if (!randomPeer) {
      continue;
    }
    selectedPeers.push(randomPeer);
  }

  return selectedPeers;
}
