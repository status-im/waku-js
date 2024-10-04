import type { IdentifyResult } from "@libp2p/interface";
import { FilterCodecs, LightPushCodec, StoreCodec } from "@waku/core";
import type { IWaku, Libp2p } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { Logger } from "@waku/utils";

const log = new Logger("wait-for-remote-peer");

/**
 * Wait for a remote peer to be ready given the passed protocols.
 * Must be used after attempting to connect to nodes, using
 * {@link @waku/sdk!WakuNode.dial} or a bootstrap method with
 * {@link @waku/sdk!createLightNode}.
 *
 * If the passed protocols is a GossipSub protocol, then it resolves only once
 * a peer is in a mesh, to help ensure that other peers will send and receive
 * message to us.
 *
 * @param waku The Waku Node
 * @param protocols The protocols that need to be enabled by remote peers.
 * @param timeoutMs A timeout value in milliseconds..
 *
 * @returns A promise that **resolves** if all desired protocols are fulfilled by
 * remote nodes, **rejects** if the timeoutMs is reached.
 * @throws If passing a protocol that is not mounted
 * @default Wait for remote peers with protocols enabled locally and no time out is applied.
 */
export async function waitForRemotePeer(
  waku: IWaku,
  protocols?: Protocols[],
  timeoutMs?: number
): Promise<void> {
  // if no protocols or empty array passed - try to derive from mounted
  protocols = protocols?.length ? protocols : getEnabledProtocols(waku);
  const connections = waku.libp2p.getConnections();

  if (!waku.isStarted()) {
    throw Error("Waku node is not started");
  }

  if (connections.length > 0 && !protocols.includes(Protocols.Relay)) {
    const success = await waitForMetadata(waku, protocols);

    if (success) {
      return;
    }
  }

  const promises = [];

  if (protocols.includes(Protocols.Relay)) {
    if (!waku.relay) {
      throw Error("Cannot wait for Relay peer: protocol not mounted");
    }
    promises.push(waku.relay.connect());
  }

  if (protocols.includes(Protocols.Store)) {
    if (!waku.store) {
      throw Error("Cannot wait for Store peer: protocol not mounted");
    }
    promises.push(waitForConnectedPeer(StoreCodec, waku.libp2p));
  }

  if (protocols.includes(Protocols.LightPush)) {
    if (!waku.lightPush) {
      throw Error("Cannot wait for LightPush peer: protocol not mounted");
    }
    promises.push(waitForConnectedPeer(LightPushCodec, waku.libp2p));
  }

  if (protocols.includes(Protocols.Filter)) {
    if (!waku.filter) {
      throw new Error("Cannot wait for Filter peer: protocol not mounted");
    }
    promises.push(waitForConnectedPeer(FilterCodecs.SUBSCRIBE, waku.libp2p));
  }

  if (timeoutMs) {
    await rejectOnTimeout(
      Promise.all(promises),
      timeoutMs,
      "Timed out waiting for a remote peer."
    );
  } else {
    await Promise.all(promises);
  }
}

type EventListener = (_: CustomEvent<IdentifyResult>) => void;

/**
 * Wait for a peer with the given protocol to be connected.
 * If sharding is enabled on the node, it will also wait for the peer to be confirmed by the metadata service.
 */
async function waitForConnectedPeer(
  codec: string,
  libp2p: Libp2p
): Promise<void> {
  log.info(`Waiting for ${codec} peer.`);

  await new Promise<void>((resolve) => {
    const cb = (async (evt: CustomEvent<IdentifyResult>): Promise<void> => {
      if (evt.detail?.protocols?.includes(codec)) {
        const metadataService = libp2p.services.metadata;

        if (!metadataService) {
          libp2p.removeEventListener("peer:identify", cb);
          resolve();
          return;
        }

        try {
          await metadataService.confirmOrAttemptHandshake(evt.detail.peerId);

          libp2p.removeEventListener("peer:identify", cb);
          resolve();
        } catch (e) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((e as any).code === "ERR_CONNECTION_BEING_CLOSED") {
            log.error(
              "Connection closed. Some peers can be on different shard."
            );
          }

          log.error(`Error waiting for metadata: ${e}`);
        }
      }
    }) as EventListener;

    libp2p.addEventListener("peer:identify", cb);
  });
}

/**
 * Waits for the metadata from the remote peer.
 */
async function waitForMetadata(
  waku: IWaku,
  protocols: Protocols[]
): Promise<boolean> {
  const connectedPeers = waku.libp2p.getPeers();
  const metadataService = waku.libp2p.services.metadata;
  const enabledCodes = mapProtocolsToCodecs(protocols);

  if (!connectedPeers.length || !metadataService) {
    log.info(
      `Skipping waitForMetadata due to missing connections:${connectedPeers.length} or metadataService:${!!metadataService}`
    );
    return false;
  }

  for (const peerId of connectedPeers) {
    const confirmedAllCodecs = Array.from(enabledCodes.values()).every(
      (v) => v
    );

    if (confirmedAllCodecs) {
      return true;
    }

    try {
      const peer = await waku.libp2p.peerStore.get(peerId);
      const hasSomeCodes = peer.protocols.some((c) => enabledCodes.has(c));

      if (hasSomeCodes) {
        const response =
          await metadataService.confirmOrAttemptHandshake(peerId);

        if (!response.error) {
          peer.protocols.forEach((c) => {
            if (enabledCodes.has(c)) {
              enabledCodes.set(c, true);
            }
          });
        }
      }
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any).code === "ERR_CONNECTION_BEING_CLOSED") {
        log.error("Connection closed. Some peers can be on different shard.");
      }

      log.error(`Error while iterating through peers: ${e}`);
      continue;
    }
  }

  return false;
}

const awaitTimeout = (ms: number, rejectReason: string): Promise<void> =>
  new Promise((_resolve, reject) => setTimeout(() => reject(rejectReason), ms));

async function rejectOnTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  rejectReason: string
): Promise<void> {
  await Promise.race([promise, awaitTimeout(timeoutMs, rejectReason)]);
}

function getEnabledProtocols(waku: IWaku): Protocols[] {
  const protocols = [];

  if (waku.relay) {
    protocols.push(Protocols.Relay);
  }

  if (waku.filter) {
    protocols.push(Protocols.Filter);
  }

  if (waku.store) {
    protocols.push(Protocols.Store);
  }

  if (waku.lightPush) {
    protocols.push(Protocols.LightPush);
  }

  return protocols;
}

function mapProtocolsToCodecs(protocols: Protocols[]): Map<string, boolean> {
  const codecs: Map<string, boolean> = new Map();

  const protocolToCodec: Record<string, string> = {
    [Protocols.Filter]: FilterCodecs.SUBSCRIBE,
    [Protocols.LightPush]: LightPushCodec,
    [Protocols.Store]: StoreCodec
  };

  for (const protocol of protocols) {
    if (protocolToCodec[protocol]) {
      codecs.set(protocolToCodec[protocol], false);
    }
  }

  return codecs;
}
