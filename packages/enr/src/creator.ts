import type { PeerId } from "@libp2p/interface";
import type { ENRKey, ENRValue } from "@waku/interfaces";
import { utf8ToBytes } from "@waku/utils/bytes";

import { compressPublicKey } from "./crypto.js";
import { ENR } from "./enr.js";

export class EnrCreator {
  public static fromPublicKey(
    publicKey: Uint8Array,
    kvs: Record<ENRKey, ENRValue> = {}
  ): ENR {
    // EIP-778 specifies that the key must be in compressed format, 33 bytes
    if (publicKey.length !== 33) {
      publicKey = compressPublicKey(publicKey);
    }
    return ENR.create({
      ...kvs,
      id: utf8ToBytes("v4"),
      secp256k1: publicKey
    });
  }

  public static async fromPeerId(
    peerId: PeerId,
    kvs: Record<ENRKey, ENRValue> = {}
  ): Promise<ENR> {
    switch (peerId.type) {
      case "secp256k1":
        return EnrCreator.fromPublicKey(peerId.publicKey.raw, kvs);
      default:
        throw new Error();
    }
  }
}
