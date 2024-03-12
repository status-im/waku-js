import type { IdentifyResult } from "@libp2p/interface";
import type {
  IBaseProtocolCore,
  IMetadata,
  IRelay,
  Waku
} from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { Logger } from "@waku/utils";
import { pEvent } from "p-event";
const log = new Logger("wait-for-remote-peer");

//TODO: move this function within the Waku class: https://github.com/waku-org/js-waku/issues/1761
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
  waku: Waku,
  protocols?: Protocols[],
  timeoutMs?: number
): Promise<void> {
  protocols = protocols ?? getEnabledProtocols(waku);

  if (!waku.isStarted()) return Promise.reject("Waku node is not started");

  const promises = [];

  if (protocols.includes(Protocols.Relay)) {
    if (!waku.relay)
      throw new Error("Cannot wait for Relay peer: protocol not mounted");
    promises.push(waitForGossipSubPeerInMesh(waku.relay));
  }

  if (protocols.includes(Protocols.Store)) {
    if (!waku.store)
      throw new Error("Cannot wait for Store peer: protocol not mounted");
    promises.push(
      waitForConnectedPeer(waku.store, waku.libp2p.services.metadata)
    );
  }

  if (protocols.includes(Protocols.LightPush)) {
    if (!waku.lightPush)
      throw new Error("Cannot wait for LightPush peer: protocol not mounted");
    promises.push(
      waitForConnectedPeer(
        waku.lightPush.protocol,
        waku.libp2p.services.metadata
      )
    );
  }

  if (protocols.includes(Protocols.Filter)) {
    if (!waku.filter)
      throw new Error("Cannot wait for Filter peer: protocol not mounted");
    promises.push(
      waitForConnectedPeer(waku.filter, waku.libp2p.services.metadata)
    );
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

//TODO: move this function within protocol SDK class: https://github.com/waku-org/js-waku/issues/1761
/**
 * Wait for a peer with the given protocol to be connected.
 * If sharding is enabled on the node, it will also wait for the peer to be confirmed by the metadata service.
 */
async function waitForConnectedPeer(
  protocol: IBaseProtocolCore,
  metadataService?: IMetadata
): Promise<void> {
  const codec = protocol.multicodec;
  const peers = await protocol.connectedPeers();

  if (peers.length) {
    if (!metadataService) {
      log.info(`${codec} peer found: `, peers[0]?.id.toString());
      return;
    }

    // once a peer is connected, we need to confirm the metadata handshake with at least one of those peers if sharding is enabled
    try {
      await Promise.any(
        peers.map((peer) => metadataService.confirmOrAttemptHandshake(peer.id))
      );
      return;
    } catch (e) {
      if ((e as any).code === "ERR_CONNECTION_BEING_CLOSED")
        log.error(
          `Connection with the peer was closed and possibly because it's on a different shard. Error: ${e}`
        );

      log.error(`Error waiting for handshake confirmation: ${e}`);
    }
  }

  log.info(`Waiting for ${codec} peer`);

  // else we'll just wait for the next peer to connect
  await new Promise<void>((resolve) => {
    const cb = (evt: CustomEvent<IdentifyResult>): void => {
      if (evt.detail?.protocols?.includes(codec)) {
        if (metadataService) {
          metadataService
            .confirmOrAttemptHandshake(evt.detail.peerId)
            .then(() => {
              protocol.removeLibp2pEventListener("peer:identify", cb);
              resolve();
            })
            .catch((e) => {
              if (e.code === "ERR_CONNECTION_BEING_CLOSED")
                log.error(
                  `Connection with the peer was closed and possibly because it's on a different shard. Error: ${e}`
                );

              log.error(`Error waiting for handshake confirmation: ${e}`);
            });
        } else {
          protocol.removeLibp2pEventListener("peer:identify", cb);
          resolve();
        }
      }
    };
    protocol.addLibp2pEventListener("peer:identify", cb);
  });
}

/**
 * Wait for at least one peer with the given protocol to be connected and in the gossipsub
 * mesh for all pubsubTopics.
 */
async function waitForGossipSubPeerInMesh(waku: IRelay): Promise<void> {
  let peers = waku.getMeshPeers();
  const pubsubTopics = waku.pubsubTopics;

  for (const topic of pubsubTopics) {
    while (peers.length == 0) {
      await pEvent(waku.gossipSub, "gossipsub:heartbeat");
      peers = waku.getMeshPeers(topic);
    }
  }
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

function getEnabledProtocols(waku: Waku): Protocols[] {
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
