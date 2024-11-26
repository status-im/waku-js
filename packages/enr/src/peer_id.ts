import { publicKeyFromRaw } from "@libp2p/crypto/keys";
import { type PeerId } from "@libp2p/interface";
import { peerIdFromPublicKey } from "@libp2p/peer-id";

export const ERR_TYPE_NOT_IMPLEMENTED = "Keypair type not implemented";

export function createPeerIdFromPublicKey(publicKey: Uint8Array): PeerId {
  const pubKey = publicKeyFromRaw(publicKey);
  if (pubKey.type !== "secp256k1") {
    throw new Error(ERR_TYPE_NOT_IMPLEMENTED);
  }
  return peerIdFromPublicKey(pubKey);
}
