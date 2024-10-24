import type { IDecodedMessage, IDecoder } from "./message.js";
import type { IBaseProtocolCore } from "./protocols.js";

export type StoreCursor = Uint8Array;

/**
 * Parameters for a store query request, as specified in the Waku Store v3 RFC.
 */
export type QueryRequestParams = {
  /**
   * Whether to include the full message data in the response.
   * - `true`: The response will include the message content and associated pubsub topic for each matching message.
   * - `false`: The response will only include the message hashes for each matching message.
   * @default true
   */
  includeData: boolean;

  /**
   * The pubsub topic to query. This field is mandatory.
   * The query will only return messages that were published on this specific pubsub topic.
   */
  pubsubTopic: string;

  /**
   * The content topics to filter the messages.
   * The query will only return messages that have a content topic included in this array.
   * This field MUST be populated together with the `pubsubTopic` field for content topic filtering to be applied.
   * If either `contentTopics` or `pubsubTopic` is not provided or empty, no content topic filtering will be applied.
   */
  contentTopics: string[];

  /**
   * The start time for the time range filter.
   * The query will only return messages with a timestamp greater than or equal to `timeStart`.
   * If not provided, no start time filtering will be applied.
   */
  timeStart?: Date;

  /**
   * The end time for the time range filter.
   * The query will only return messages with a timestamp strictly less than `timeEnd`.
   * If not provided, no end time filtering will be applied.
   */
  timeEnd?: Date;

  /**
   * The message hashes to lookup.
   * If provided, the query will be a message hash lookup query and will only return messages that match the specified hashes.
   * If not provided or empty, the query will be a content filtered query based on the other filter parameters.
   * @default undefined
   */
  messageHashes?: Uint8Array[];

  /**
   * The cursor to start the query from.
   * The cursor represents the message hash of the last message returned in the previous query.
   * The query will start from the message immediately following the cursor, excluding the message at the cursor itself.
   * If not provided, the query will start from the beginning or end of the store, depending on the `paginationForward` option.
   * @default undefined
   */
  paginationCursor?: Uint8Array;

  /**
   * The direction of pagination.
   * - `true`: Forward pagination, starting from the oldest message and moving towards the newest.
   * - `false`: Backward pagination, starting from the newest message and moving towards the oldest.
   * @default false
   */
  paginationForward: boolean;

  /**
   * The maximum number of messages to retrieve per page.
   * If not provided, the store's default pagination limit will be used.
   * @default undefined
   */
  paginationLimit?: number;
};

export type IStoreCore = IBaseProtocolCore;

export type IStore = {
  protocol: IBaseProtocolCore;
  createCursor(message: IDecodedMessage): StoreCursor;
  queryGenerator: <T extends IDecodedMessage>(
    decoders: IDecoder<T>[],
    options?: Partial<QueryRequestParams>
  ) => AsyncGenerator<Promise<T | undefined>[]>;

  queryWithOrderedCallback: <T extends IDecodedMessage>(
    decoders: IDecoder<T>[],
    callback: (message: T) => Promise<void | boolean> | boolean | void,
    options?: Partial<QueryRequestParams>
  ) => Promise<void>;
  queryWithPromiseCallback: <T extends IDecodedMessage>(
    decoders: IDecoder<T>[],
    callback: (
      message: Promise<T | undefined>
    ) => Promise<void | boolean> | boolean | void,
    options?: Partial<QueryRequestParams>
  ) => Promise<void>;
};
