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

export type SubscribeOptions = {
  keepAlive?: number;
  pingsBeforePeerRenewed?: number;
  enableLightPushFilterCheck?: boolean;
};

export interface ISubscription {
  subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>,
    options?: SubscribeOptions
  ): Promise<SDKProtocolResult>;

  unsubscribe(contentTopics: ContentTopic[]): Promise<SDKProtocolResult>;

  ping(peerId?: PeerId): Promise<SDKProtocolResult>;

  unsubscribeAll(): Promise<SDKProtocolResult>;
}

export type IFilter = IReceiver & { protocol: IBaseProtocolCore } & {
  subscribe<T extends IDecodedMessage>(
    decoders: IDecoder<T> | IDecoder<T>[],
    callback: Callback<T>,
    subscribeOptions?: SubscribeOptions
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
