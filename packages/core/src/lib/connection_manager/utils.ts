import type { Peer } from "@libp2p/interface";
import { bytesToUtf8 } from "@waku/utils/bytes";

/**
 * Reads peer's metadata and retrieves ping value.
 * @param peer Peer or null
 * @returns -1 if no ping attached, otherwise returns ping value
 */
export const getPeerPing = (peer: Peer | null): number => {
  if (!peer) {
    return -1;
  }

  try {
    const bytes = peer.metadata.get("ping");

    if (!bytes) {
      return -1;
    }

    return Number(bytesToUtf8(bytes));
  } catch (e) {
    return -1;
  }
};
