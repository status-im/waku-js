export {};
import { PeerId } from "@libp2p/interface-peer-id";
import { IRelay } from "@waku/interfaces";
import debug from "debug";
import { Libp2p } from "libp2p";

import { createEncoder } from "../index.js";

import { RelayPingContentTopic } from "./relay/constants.js";

const log = debug("waku:connection-manager");

export interface Options {
  relayKeepAlive: number;
  pingKeepAlive: number;
}

/**
 * ConnectionManager is a singleton class that manages different steps in a libp2p connection lifecycle
 */
export class ConnectionManager {
  private static instance: ConnectionManager;

  private libp2p: Libp2p;
  private relay?: IRelay;
  private pingKeepAliveTimers: {
    [peer: string]: ReturnType<typeof setInterval>;
  };
  private relayKeepAliveTimers: {
    [peer: string]: ReturnType<typeof setInterval>;
  };

  public static get(libp2p: Libp2p, options: Options): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager(libp2p, options);
    }
    return ConnectionManager.instance;
  }

  private constructor(libp2p: Libp2p, options: Options, relay?: IRelay) {
    this.libp2p = libp2p;
    this.pingKeepAliveTimers = {};
    this.relayKeepAliveTimers = {};
    this.relay = relay;

    this.attachEventListeners(options.pingKeepAlive, options.relayKeepAlive);
  }

  stopAllKeepAlives(): void {
    for (const timer of [
      ...Object.values(this.pingKeepAliveTimers),
      ...Object.values(this.relayKeepAliveTimers),
    ]) {
      clearInterval(timer);
    }

    this.pingKeepAliveTimers = {};
    this.relayKeepAliveTimers = {};
  }

  private attachEventListeners(
    pingKeepAlive: number,
    relayKeepAlive: number
  ): void {
    this.libp2p.connectionManager.addEventListener("peer:connect", (evt) => {
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
    this.libp2p.connectionManager.addEventListener("peer:disconnect", (evt) => {
      this.stopKeepAlive(evt.detail.remotePeer);
    });

    // Trivial handling of discovered peers, to be refined.
    this.libp2p.addEventListener("peer:discovery", async (evt) => {
      const peerId = evt.detail.id;
      log(`Found peer ${peerId.toString()}, dialing.`);

      const tags = (await this.libp2p.peerStore.getTags(peerId)).map(
        ({ name }) => name
      );
      // console.log(`Peer ${peerId.toString()} has tags ${JSON.stringify(tags)}`);

      if (tags.includes("dns-discovery" || "bootstrap")) {
        try {
          await this.libp2p.dial(peerId);
          // console.log("Dial successful");
        } catch (error) {
          // console.error(`Failed to dial ${peerId.toString()}`, error);
          log(`Failed to dial ${peerId.toString()}`, error);
        }
      }
    });
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
      const encoder = createEncoder(RelayPingContentTopic);
      this.relayKeepAliveTimers[peerIdStr] = setInterval(() => {
        log("Sending Waku Relay ping message");
        relay
          .send(encoder, { payload: new Uint8Array() })
          .catch((e) => log("Failed to send relay ping", e));
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
}
