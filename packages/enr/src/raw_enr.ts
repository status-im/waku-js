import type { Multiaddr } from "@multiformats/multiaddr";
import {
  convertToBytes,
  convertToString
} from "@multiformats/multiaddr/convert";
import type {
  ENRKey,
  ENRValue,
  SequenceNumber,
  ShardInfo,
  Waku2
} from "@waku/interfaces";
import { decodeRelayShard } from "@waku/utils";
import { bytesToUtf8 } from "@waku/utils/bytes";

import { ERR_INVALID_ID } from "./constants.js";
import { decodeMultiaddrs, encodeMultiaddrs } from "./multiaddrs_codec.js";
import { decodeWaku2, encodeWaku2 } from "./waku2_codec.js";

export class RawEnr extends Map<ENRKey, ENRValue> {
  public seq: SequenceNumber;
  public signature?: Uint8Array;

  protected constructor(
    kvs: Record<ENRKey, ENRValue> = {},
    seq: SequenceNumber = BigInt(1),
    signature?: Uint8Array
  ) {
    super(Object.entries(kvs));
    this.seq = seq;
    this.signature = signature;
  }

  set(k: ENRKey, v: ENRValue): this {
    this.signature = undefined;
    this.seq++;
    return super.set(k, v);
  }

  get id(): string {
    const id = this.get("id");
    if (!id) throw new Error("id not found.");
    return bytesToUtf8(id);
  }

  get publicKey(): Uint8Array | undefined {
    switch (this.id) {
      case "v4":
        return this.get("secp256k1");
      default:
        throw new Error(ERR_INVALID_ID);
    }
  }

  get rs(): ShardInfo | undefined {
    const rs = this.get("rs");
    if (!rs) return undefined;
    return decodeRelayShard(rs);
  }

  get rsv(): ShardInfo | undefined {
    const rsv = this.get("rsv");
    if (!rsv) return undefined;
    return decodeRelayShard(rsv);
  }

  get ip(): string | undefined {
    return getStringValue(this, "ip", "ip4");
  }

  set ip(ip: string | undefined) {
    setStringValue(this, "ip", "ip4", ip);
  }

  get tcp(): number | undefined {
    return getNumberAsStringValue(this, "tcp", "tcp");
  }

  set tcp(port: number | undefined) {
    setNumberAsStringValue(this, "tcp", "tcp", port);
  }

  get udp(): number | undefined {
    return getNumberAsStringValue(this, "udp", "udp");
  }

  set udp(port: number | undefined) {
    setNumberAsStringValue(this, "udp", "udp", port);
  }

  get ip6(): string | undefined {
    return getStringValue(this, "ip6", "ip6");
  }

  set ip6(ip: string | undefined) {
    setStringValue(this, "ip6", "ip6", ip);
  }

  get tcp6(): number | undefined {
    return getNumberAsStringValue(this, "tcp6", "tcp");
  }

  set tcp6(port: number | undefined) {
    setNumberAsStringValue(this, "tcp6", "tcp", port);
  }

  get udp6(): number | undefined {
    return getNumberAsStringValue(this, "udp6", "udp");
  }

  set udp6(port: number | undefined) {
    setNumberAsStringValue(this, "udp6", "udp", port);
  }

  /**
   * Get the `multiaddrs` field from ENR.
   *
   * This field is used to store multiaddresses that cannot be stored with the current ENR pre-defined keys.
   * These can be a multiaddresses that include encapsulation (e.g. wss) or do not use `ip4` nor `ip6` for the host
   * address (e.g. `dns4`, `dnsaddr`, etc)..
   *
   * If the peer information only contains information that can be represented with the ENR pre-defined keys
   * (ip, tcp, etc) then the usage of { @link ENR.getLocationMultiaddr } should be preferred.
   *
   * The multiaddresses stored in this field are expected to be location multiaddresses, ie, peer id less.
   */
  get multiaddrs(): Multiaddr[] | undefined {
    const raw = this.get("multiaddrs");

    if (raw) return decodeMultiaddrs(raw);

    return;
  }

  /**
   * Set the `multiaddrs` field on the ENR.
   *
   * This field is used to store multiaddresses that cannot be stored with the current ENR pre-defined keys.
   * These can be a multiaddresses that include encapsulation (e.g. wss) or do not use `ip4` nor `ip6` for the host
   * address (e.g. `dns4`, `dnsaddr`, etc)..
   *
   * If the peer information only contains information that can be represented with the ENR pre-defined keys
   * (ip, tcp, etc) then the usage of { @link ENR.setLocationMultiaddr } should be preferred.
   * The multiaddresses stored in this field must be location multiaddresses,
   * ie, without a peer id.
   */
  set multiaddrs(multiaddrs: Multiaddr[] | undefined) {
    deleteUndefined(this, "multiaddrs", multiaddrs, encodeMultiaddrs);
  }

  /**
   * Get the `waku2` field from ENR.
   */
  get waku2(): Waku2 | undefined {
    const raw = this.get("waku2");
    if (raw) return decodeWaku2(raw[0] as number);

    return;
  }

  /**
   * Set the `waku2` field on the ENR.
   */
  set waku2(waku2: Waku2 | undefined) {
    deleteUndefined(
      this,
      "waku2",
      waku2,
      (w) => new Uint8Array([encodeWaku2(w)])
    );
  }
}

function getStringValue(
  map: Map<ENRKey, ENRValue>,
  key: ENRKey,
  proto: string
): string | undefined {
  const raw = map.get(key);
  if (!raw) return;
  return convertToString(proto, raw);
}

function getNumberAsStringValue(
  map: Map<ENRKey, ENRValue>,
  key: ENRKey,
  proto: string
): number | undefined {
  const raw = map.get(key);
  if (!raw) return;
  return Number(convertToString(proto, raw));
}

function setStringValue(
  map: Map<ENRKey, ENRValue>,
  key: ENRKey,
  proto: string,
  value: string | undefined
): void {
  deleteUndefined(map, key, value, convertToBytes.bind({}, proto));
}

function setNumberAsStringValue(
  map: Map<ENRKey, ENRValue>,
  key: ENRKey,
  proto: string,
  value: number | undefined
): void {
  setStringValue(map, key, proto, value?.toString(10));
}

function deleteUndefined<K, V, W>(
  map: Map<K, W>,
  key: K,
  value: V | undefined,
  transform: (v: V) => W
): void {
  if (value !== undefined) {
    map.set(key, transform(value));
  } else {
    map.delete(key);
  }
}
