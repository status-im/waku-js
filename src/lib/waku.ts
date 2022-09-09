import type { Stream } from "@libp2p/interface-connection";
import type { PeerId } from "@libp2p/interface-peer-id";
import type { PubSub } from "@libp2p/interface-pubsub";
import { peerIdFromString } from "@libp2p/peer-id";
import type { Multiaddr } from "@multiformats/multiaddr";
import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import type { Libp2p } from "libp2p";

import { Waku } from "./interfaces";
import { FilterCodec, WakuFilter } from "./waku_filter";
import { LightPushCodec, WakuLightPush } from "./waku_light_push";
import { DecryptionMethod, WakuMessage } from "./waku_message";
import { WakuRelay } from "./waku_relay";
import { RelayCodecs, RelayPingContentTopic } from "./waku_relay/constants";
import * as relayConstants from "./waku_relay/constants";
import { StoreCodecs, WakuStore } from "./waku_store";

export const DefaultPingKeepAliveValueSecs = 0;
export const DefaultRelayKeepAliveValueSecs = 5 * 60;

const log = debug("waku:waku");

export enum Protocols {
  Relay = "relay",
  Store = "store",
  LightPush = "lightpush",
  Filter = "filter",
}

export interface WakuOptions {
  /**
   * Set keep alive frequency in seconds: Waku will send a `/ipfs/ping/1.0.0`
   * request to each peer after the set number of seconds. Set to 0 to disable.
   *
   * @default {@link DefaultPingKeepAliveValueSecs}
   */
  pingKeepAlive?: number;
  /**
   * Set keep alive frequency in seconds: Waku will send a ping message over
   * relay to each peer after the set number of seconds. Set to 0 to disable.
   *
   * @default {@link DefaultRelayKeepAliveValueSecs}
   */
  relayKeepAlive?: number;
  decryptionKeys?: Array<Uint8Array | string>;
}

export class WakuNode implements Waku {
  public libp2p: Libp2p;
  public relay?: WakuRelay;
  public store?: WakuStore;
  public filter?: WakuFilter;
  public lightPush?: WakuLightPush;

  private pingKeepAliveTimers: {
    [peer: string]: ReturnType<typeof setInterval>;
  };
  private relayKeepAliveTimers: {
    [peer: string]: ReturnType<typeof setInterval>;
  };

  constructor(
    options: WakuOptions,
    libp2p: Libp2p,
    store?: WakuStore,
    lightPush?: WakuLightPush,
    filter?: WakuFilter
  ) {
    this.libp2p = libp2p;
    this.store = store;
    this.filter = filter;
    this.lightPush = lightPush;

    if (isWakuRelay(libp2p.pubsub)) {
      this.relay = libp2p.pubsub;
    }

    this.pingKeepAliveTimers = {};
    this.relayKeepAliveTimers = {};

    const pingKeepAlive =
      options.pingKeepAlive || DefaultPingKeepAliveValueSecs;
    const relayKeepAlive = this.relay
      ? options.relayKeepAlive || DefaultRelayKeepAliveValueSecs
      : 0;

    libp2p.connectionManager.addEventListener("peer:connect", (evt) => {
      this.startKeepAlive(evt.detail.remotePeer, pingKeepAlive, relayKeepAlive);
    });

    /**
     * NOTE: Event is not being emitted on closing nor losing a connection.
     * @see https://github.com/libp2p/js-libp2p/issues/939
     * @see https://github.com/status-im/js-waku/issues/252
     *
     * >This event will be triggered anytime we are disconnected from another peer,
     * >regardless of the circumstances of that disconnection.
     * >If we happen to have multiple connections to a peer,
     * >this event will **only** be triggered when the last connection is closed.
     * @see https://github.com/libp2p/js-libp2p/blob/bad9e8c0ff58d60a78314077720c82ae331cc55b/doc/API.md?plain=1#L2100
     */
    libp2p.connectionManager.addEventListener("peer:disconnect", (evt) => {
      this.stopKeepAlive(evt.detail.remotePeer);
    });

    options?.decryptionKeys?.forEach((key) => {
      this.addDecryptionKey(key);
    });
  }

  /**
   * Dials to the provided peer.
   *
   * @param peer The peer to dial
   * @param protocols Waku protocols we expect from the peer; Default to Relay
   */
  async dial(
    peer: PeerId | Multiaddr,
    protocols?: Protocols[]
  ): Promise<Stream> {
    const _protocols = protocols ?? [Protocols.Relay];

    const codecs: string[] = [];
    if (_protocols.includes(Protocols.Relay)) {
      RelayCodecs.forEach((codec) => codecs.push(codec));
    }
    if (_protocols.includes(Protocols.Store)) {
      for (const codec of Object.values(StoreCodecs)) {
        codecs.push(codec);
      }
    }
    if (_protocols.includes(Protocols.LightPush)) {
      codecs.push(LightPushCodec);
    }
    if (_protocols.includes(Protocols.Filter)) {
      codecs.push(FilterCodec);
    }

    return this.libp2p.dialProtocol(peer, codecs);
  }

  /**
   * Add peer to address book, it will be auto-dialed in the background.
   */
  async addPeerToAddressBook(
    peerId: PeerId | string,
    multiaddrs: Multiaddr[] | string[]
  ): Promise<void> {
    let peer;
    if (typeof peerId === "string") {
      peer = peerIdFromString(peerId);
    } else {
      peer = peerId;
    }
    const addresses = multiaddrs.map((addr: Multiaddr | string) => {
      if (typeof addr === "string") {
        return multiaddr(addr);
      } else {
        return addr;
      }
    });
    await this.libp2p.peerStore.addressBook.set(peer, addresses);
  }

  async start(): Promise<void> {
    await this.libp2p.start();
  }

  async stop(): Promise<void> {
    this.stopAllKeepAlives();
    await this.libp2p.stop();
  }

  isStarted(): boolean {
    return this.libp2p.isStarted();
  }

  /**
   * Register a decryption key to attempt decryption of messages received via
   * { @link WakuRelay } and { @link WakuStore }. This can either be a private key for
   * asymmetric encryption or a symmetric key.
   *
   * Strings must be in hex format.
   */
  addDecryptionKey(
    key: Uint8Array | string,
    options?: { method?: DecryptionMethod; contentTopics?: string[] }
  ): void {
    if (this.relay) this.relay.addDecryptionKey(key, options);
    if (this.store) this.store.addDecryptionKey(key, options);
    if (this.filter) this.filter.addDecryptionKey(key, options);
  }

  /**
   * Delete a decryption key that was used to attempt decryption of messages
   * received via { @link WakuRelay } or { @link WakuStore }.
   *
   * Strings must be in hex format.
   */
  deleteDecryptionKey(key: Uint8Array | string): void {
    if (this.relay) this.relay.deleteDecryptionKey(key);
    if (this.store) this.store.deleteDecryptionKey(key);
    if (this.filter) this.filter.deleteDecryptionKey(key);
  }

  /**
   * Return the local multiaddr with peer id on which libp2p is listening.
   *
   * @throws if libp2p is not listening on localhost.
   */
  getLocalMultiaddrWithID(): string {
    const localMultiaddr = this.libp2p
      .getMultiaddrs()
      .find((addr) => addr.toString().match(/127\.0\.0\.1/));
    if (!localMultiaddr || localMultiaddr.toString() === "") {
      throw "Not listening on localhost";
    }
    return localMultiaddr + "/p2p/" + this.libp2p.peerId.toString();
  }

  private startKeepAlive(
    peerId: PeerId,
    pingPeriodSecs: number,
    relayPeriodSecs: number
  ): void {
    // Just in case a timer already exist for this peer
    this.stopKeepAlive(peerId);

    const peerIdStr = peerId.toString();

    if (pingPeriodSecs !== 0) {
      this.pingKeepAliveTimers[peerIdStr] = setInterval(() => {
        this.libp2p.ping(peerId).catch((e) => {
          log(`Ping failed (${peerIdStr})`, e);
        });
      }, pingPeriodSecs * 1000);
    }

    const relay = this.relay;
    if (relay && relayPeriodSecs !== 0) {
      this.relayKeepAliveTimers[peerIdStr] = setInterval(() => {
        log("Sending Waku Relay ping message");
        WakuMessage.fromBytes(new Uint8Array(), RelayPingContentTopic).then(
          (wakuMsg) => relay.send(wakuMsg)
        );
      }, relayPeriodSecs * 1000);
    }
  }

  private stopKeepAlive(peerId: PeerId): void {
    const peerIdStr = peerId.toString();

    if (this.pingKeepAliveTimers[peerIdStr]) {
      clearInterval(this.pingKeepAliveTimers[peerIdStr]);
      delete this.pingKeepAliveTimers[peerIdStr];
    }

    if (this.relayKeepAliveTimers[peerIdStr]) {
      clearInterval(this.relayKeepAliveTimers[peerIdStr]);
      delete this.relayKeepAliveTimers[peerIdStr];
    }
  }

  private stopAllKeepAlives(): void {
    for (const timer of [
      ...Object.values(this.pingKeepAliveTimers),
      ...Object.values(this.relayKeepAliveTimers),
    ]) {
      clearInterval(timer);
    }

    this.pingKeepAliveTimers = {};
    this.relayKeepAliveTimers = {};
  }
}

function isWakuRelay(pubsub: PubSub): pubsub is WakuRelay {
  if (pubsub) {
    try {
      return pubsub.multicodecs.includes(
        relayConstants.RelayCodecs[relayConstants.RelayCodecs.length - 1]
      );
      // Exception is expected if `libp2p` was not instantiated with pubsub
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
  return false;
}
