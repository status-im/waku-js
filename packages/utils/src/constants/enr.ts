// Maximum encoded size of an ENR
export const MAX_RECORD_SIZE = 300;

export const ERR_INVALID_ID = "Invalid record id";

export const ERR_NO_SIGNATURE = "No valid signature found";

// The maximum length of byte size of a multiaddr to encode in the `multiaddr` field
// The size is a big endian 16-bit unsigned integer
export const MULTIADDR_LENGTH_SIZE = 2;
