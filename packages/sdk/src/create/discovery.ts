import type { PeerDiscovery } from "@libp2p/interface";
import {
  enrTree,
  wakuDnsDiscovery,
  wakuLocalPeerCacheDiscovery,
  wakuPeerExchangeDiscovery
} from "@waku/discovery";
import {
  DefaultPubsubTopic,
  type Libp2pComponents,
  PubsubTopic
} from "@waku/interfaces";

const DEFAULT_NODE_REQUIREMENTS = {
  lightPush: 1,
  filter: 1,
  store: 1
};

export function defaultPeerDiscoveries(
  pubsubTopics: PubsubTopic[]
): ((components: Libp2pComponents) => PeerDiscovery)[] {
  const isDefaultPubsubTopic = pubsubTopics.includes(DefaultPubsubTopic);
  const dnsEnrTrees = isDefaultPubsubTopic
    ? [enrTree["DEPRECATED_DEFAULT_PUBSUB"]]
    : [enrTree["SANDBOX"], enrTree["TEST"]];

  const discoveries = [
    wakuDnsDiscovery(dnsEnrTrees, DEFAULT_NODE_REQUIREMENTS),
    wakuLocalPeerCacheDiscovery(),
    wakuPeerExchangeDiscovery(pubsubTopics)
  ];

  return discoveries;
}
