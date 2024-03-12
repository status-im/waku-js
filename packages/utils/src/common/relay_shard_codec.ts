import type { ShardInfo } from "@waku/interfaces";

export const decodeRelayShard = (bytes: Uint8Array): ShardInfo => {
  // explicitly converting to Uint8Array to avoid Buffer
  // https://github.com/libp2p/js-libp2p/issues/2146
  bytes = new Uint8Array(bytes);

  if (bytes.length < 3) throw new Error("Insufficient data");

  const view = new DataView(bytes.buffer);
  const clusterId = view.getUint16(0);

  const shards = [];

  if (bytes.length === 130) {
    // rsv format (Bit Vector)
    for (let i = 0; i < 1024; i++) {
      const byteIndex = Math.floor(i / 8) + 2; // Adjusted for the 2-byte cluster field
      const bitIndex = 7 - (i % 8);
      if (view.getUint8(byteIndex) & (1 << bitIndex)) {
        shards.push(i);
      }
    }
  } else {
    // rs format (Index List)
    const numIndices = view.getUint8(2);
    for (let i = 0, offset = 3; i < numIndices; i++, offset += 2) {
      if (offset + 1 >= bytes.length) throw new Error("Unexpected end of data");
      shards.push(view.getUint16(offset));
    }
  }

  return { clusterId, shards };
};

export const encodeRelayShard = (shardInfo: ShardInfo): Uint8Array => {
  const { clusterId, shards } = shardInfo;
  const totalLength = shards.length >= 64 ? 130 : 3 + 2 * shards.length;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  view.setUint16(0, clusterId);

  if (shards.length >= 64) {
    // rsv format (Bit Vector)
    for (const index of shards) {
      const byteIndex = Math.floor(index / 8) + 2; // Adjusted for the 2-byte cluster field
      const bitIndex = 7 - (index % 8);
      view.setUint8(byteIndex, view.getUint8(byteIndex) | (1 << bitIndex));
    }
  } else {
    // rs format (Index List)
    view.setUint8(2, shards.length);
    for (let i = 0, offset = 3; i < shards.length; i++, offset += 2) {
      view.setUint16(offset, shards[i] as number);
    }
  }

  return new Uint8Array(buffer);
};
