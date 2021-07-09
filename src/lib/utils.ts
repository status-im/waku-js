export function hexToBuf(str: string): Buffer {
  return Buffer.from(str.replace(/^0x/i, ''), 'hex');
}

export function bufToHex(buf: Uint8Array | Buffer): string {
  const _buf = Buffer.from(buf);
  return _buf.toString('hex');
}

export function equalByteArrays(
  a: Uint8Array | Buffer | string,
  b: Uint8Array | Buffer | string
): boolean {
  let aBuf: Buffer;
  let bBuf: Buffer;
  if (typeof a === 'string') {
    aBuf = hexToBuf(a);
  } else {
    aBuf = Buffer.from(a);
  }

  if (typeof b === 'string') {
    bBuf = hexToBuf(b);
  } else {
    bBuf = Buffer.from(b);
  }

  return aBuf.compare(bBuf) === 0;
}
