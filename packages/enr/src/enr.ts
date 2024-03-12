import type { PeerId, PeerInfo } from "@libp2p/interface";
import type { Multiaddr } from "@multiformats/multiaddr";
import type {
  ENRKey,
  ENRValue,
  IEnr,
  NodeId,
  SequenceNumber,
  ShardInfo
} from "@waku/interfaces";
import { Logger } from "@waku/utils";

import { ERR_INVALID_ID } from "./constants.js";
import { keccak256, verifySignature } from "./crypto.js";
import { locationMultiaddrFromEnrFields } from "./get_multiaddr.js";
import { createPeerIdFromPublicKey } from "./peer_id.js";
import { RawEnr } from "./raw_enr.js";
import * as v4 from "./v4.js";

const log = new Logger("enr");

export enum TransportProtocol {
  TCP = "tcp",
  UDP = "udp"
}
export enum TransportProtocolPerIpVersion {
  TCP4 = "tcp4",
  UDP4 = "udp4",
  TCP6 = "tcp6",
  UDP6 = "udp6"
}

export class ENR extends RawEnr implements IEnr {
  public static readonly RECORD_PREFIX = "enr:";
  public peerId?: PeerId;

  static async create(
    kvs: Record<ENRKey, ENRValue> = {},
    seq: SequenceNumber = BigInt(1),
    signature?: Uint8Array
  ): Promise<ENR> {
    const enr = new ENR(kvs, seq, signature);
    try {
      const publicKey = enr.publicKey;
      if (publicKey) {
        enr.peerId = await createPeerIdFromPublicKey(publicKey);
      }
    } catch (e) {
      log.error("Could not calculate peer id for ENR", e);
    }

    return enr;
  }

  get nodeId(): NodeId | undefined {
    switch (this.id) {
      case "v4":
        return this.publicKey ? v4.nodeId(this.publicKey) : undefined;
      default:
        throw new Error(ERR_INVALID_ID);
    }
  }
  getLocationMultiaddr: (
    protocol: TransportProtocol | TransportProtocolPerIpVersion
  ) => Multiaddr | undefined = locationMultiaddrFromEnrFields.bind({}, this);

  get shardInfo(): ShardInfo | undefined {
    if (this.rs && this.rsv) {
      log.warn("ENR contains both `rs` and `rsv` fields.");
    }
    return this.rs || this.rsv;
  }

  setLocationMultiaddr(multiaddr: Multiaddr): void {
    const protoNames = multiaddr.protoNames();
    const protocol = protoNames[1];
    if (protoNames.length !== 2 && protocol !== "udp" && protocol !== "tcp") {
      throw new Error("Invalid multiaddr");
    }

    const tuples = multiaddr.tuples();
    if (!tuples[0]?.[1] || !tuples[1]?.[1] || !protocol) {
      throw new Error("Invalid multiaddr");
    }

    // IPv4
    if (tuples[0][0] === 4) {
      this.set("ip", tuples[0][1]);
      this.set(protocol, tuples[1][1]);
    } else {
      this.set("ip6", tuples[0][1]);
      this.set(protocol + "6", tuples[1][1]);
    }
  }

  getAllLocationMultiaddrs(): Multiaddr[] {
    const multiaddrs = [];

    for (const protocol of Object.values(TransportProtocolPerIpVersion)) {
      const ma = this.getLocationMultiaddr(
        protocol as TransportProtocolPerIpVersion
      );
      if (ma) multiaddrs.push(ma);
    }

    const _multiaddrs = this.multiaddrs ?? [];

    return multiaddrs.concat(_multiaddrs).map((ma) => {
      if (this.peerId) {
        return ma.encapsulate(`/p2p/${this.peerId.toString()}`);
      }
      return ma;
    });
  }

  get peerInfo(): PeerInfo | undefined {
    const id = this.peerId;
    if (!id) return;
    return {
      id,
      multiaddrs: this.getAllLocationMultiaddrs()
    };
  }

  /**
   * Returns the full multiaddr from the ENR fields matching the provided
   * `protocol` parameter.
   * To return full multiaddrs from the `multiaddrs` ENR field,
   * use { @link ENR.getFullMultiaddrs }.
   *
   * @param protocol
   */
  getFullMultiaddr(
    protocol: TransportProtocol | TransportProtocolPerIpVersion
  ): Multiaddr | undefined {
    if (this.peerId) {
      const locationMultiaddr = this.getLocationMultiaddr(protocol);
      if (locationMultiaddr) {
        return locationMultiaddr.encapsulate(`/p2p/${this.peerId.toString()}`);
      }
    }
    return;
  }

  /**
   * Returns the full multiaddrs from the `multiaddrs` ENR field.
   */
  getFullMultiaddrs(): Multiaddr[] {
    if (this.peerId && this.multiaddrs) {
      const peerId = this.peerId;
      return this.multiaddrs.map((ma) => {
        return ma.encapsulate(`/p2p/${peerId.toString()}`);
      });
    }
    return [];
  }

  verify(data: Uint8Array, signature: Uint8Array): boolean {
    if (!this.get("id") || this.id !== "v4") {
      throw new Error(ERR_INVALID_ID);
    }
    if (!this.publicKey) {
      throw new Error("Failed to verify ENR: No public key");
    }
    return verifySignature(signature, keccak256(data), this.publicKey);
  }

  async sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    switch (this.id) {
      case "v4":
        this.signature = await v4.sign(privateKey, data);
        break;
      default:
        throw new Error(ERR_INVALID_ID);
    }
    return this.signature;
  }
}
