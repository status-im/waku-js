import type { PeerId } from "@libp2p/interface";

import type { IDecodedMessage, IDecoder } from "./message.js";
import type { ContentTopic, ThisOrThat } from "./misc.js";
import type {
  Callback,
  IBaseProtocolCore,
  ProtocolError,
  SDKProtocolResult
} from "./protocols.js";
import type { IReceiver } from "./receiver.js";

export type SubscriptionCallback<T extends IDecodedMessage> = {
  decoders: IDecoder<T>[];
  callback: Callback<T>;
};

export type FilterProtocolOptions = {
  /**
   * Interval with which Filter subscription will attempt to send ping requests to subscribed peers.
   *
   * @default 60_000
   */
  keepAliveIntervalMs: number;

  /**
   * Number of failed pings allowed to make to a remote peer before attempting to subscribe to a new one.
   *
   * @default 3
   */
  pingsBeforePeerRenewed: number;

  /**
   * Enables js-waku to send probe LightPush message over subscribed pubsubTopics on created subscription.
   * In case message won't be received back through Filter - js-waku will attempt to subscribe to another peer.
   *
   * @default false
   */
  enableLightPushFilterCheck: boolean;
};

export interface ISubscription {
  subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>
  ): Promise<SDKProtocolResult>;

  unsubscribe(contentTopics: ContentTopic[]): Promise<SDKProtocolResult>;

  ping(peerId?: PeerId): Promise<SDKProtocolResult>;

  unsubscribeAll(): Promise<SDKProtocolResult>;
}

export type IFilter = IReceiver & { protocol: IBaseProtocolCore } & {
  subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>
  ): Promise<SubscribeResult>;
};

export type SubscribeResult = SubscriptionSuccess | SubscriptionError;

type SubscriptionSuccess = {
  subscription: ISubscription;
  error: null;
  results: SDKProtocolResult;
};

type SubscriptionError = {
  subscription: null;
  error: ProtocolError;
  results: null;
};

export type CreateSubscriptionResult = ThisOrThat<
  "subscription",
  ISubscription,
  "error",
  ProtocolError
>;
