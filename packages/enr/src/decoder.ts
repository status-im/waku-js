import * as RLP from "@ethersproject/rlp";
import type { ENRKey, ENRValue } from "@waku/interfaces";
import { Logger } from "@waku/utils";
import { bytesToHex, bytesToUtf8, hexToBytes } from "@waku/utils/bytes";
import { fromString } from "uint8arrays/from-string";

import { ENR } from "./enr.js";

const log = new Logger("enr:decoder");

export class EnrDecoder {
  static fromString(encoded: string): Promise<ENR> {
    if (!encoded.startsWith(ENR.RECORD_PREFIX)) {
      throw new Error(
        `"string encoded ENR must start with '${ENR.RECORD_PREFIX}'`
      );
    }
    return EnrDecoder.fromRLP(fromString(encoded.slice(4), "base64url"));
  }

  static fromRLP(encoded: Uint8Array): Promise<ENR> {
    const decoded = RLP.decode(encoded).map(hexToBytes);
    return fromValues(decoded);
  }
}

async function fromValues(values: Uint8Array[]): Promise<ENR> {
  const { signature, seq, kvs } = checkValues(values);

  const obj: Record<ENRKey, ENRValue> = {};
  for (let i = 0; i < kvs.length; i += 2) {
    try {
      obj[bytesToUtf8(kvs[i] as Uint8Array)] = kvs[i + 1] as Uint8Array;
    } catch (e) {
      log.error("Failed to decode ENR key to UTF-8, skipping it", kvs[i], e);
    }
  }
  const _seq = decodeSeq(seq);

  const enr = await ENR.create(obj, _seq, signature);
  checkSignature(seq, kvs, enr, signature);
  return enr;
}

function decodeSeq(seq: Uint8Array): bigint {
  // If seq is an empty array, translate as value 0
  if (!seq.length) return BigInt(0);

  return BigInt("0x" + bytesToHex(seq));
}

function checkValues(values: Uint8Array[]): {
  signature: Uint8Array;
  seq: Uint8Array;
  kvs: Uint8Array[];
} {
  if (!Array.isArray(values)) {
    throw new Error("Decoded ENR must be an array");
  }
  if (values.length % 2 !== 0) {
    throw new Error("Decoded ENR must have an even number of elements");
  }
  const [signature, seq, ...kvs] = values;
  if (!signature || Array.isArray(signature)) {
    throw new Error("Decoded ENR invalid signature: must be a byte array");
  }
  if (!seq || Array.isArray(seq)) {
    throw new Error(
      "Decoded ENR invalid sequence number: must be a byte array"
    );
  }

  return { signature, seq, kvs };
}

function checkSignature(
  seq: Uint8Array,
  kvs: Uint8Array[],
  enr: ENR,
  signature: Uint8Array
): void {
  const rlpEncodedBytes = hexToBytes(RLP.encode([seq, ...kvs]));
  if (!enr.verify(rlpEncodedBytes, signature)) {
    throw new Error("Unable to verify ENR signature");
  }
}
