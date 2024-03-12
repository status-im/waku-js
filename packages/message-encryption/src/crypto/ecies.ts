import * as secp from "@noble/secp256k1";
import { concat, hexToBytes } from "@waku/utils/bytes";

import { getSubtle, randomBytes, sha256 } from "./utils.js";
/**
 * HKDF as implemented in go-ethereum.
 */
function kdf(secret: Uint8Array, outputLength: number): Promise<Uint8Array> {
  let ctr = 1;
  let written = 0;
  let willBeResult = Promise.resolve(new Uint8Array());
  while (written < outputLength) {
    const counters = new Uint8Array([ctr >> 24, ctr >> 16, ctr >> 8, ctr]);
    const countersSecret = concat(
      [counters, secret],
      counters.length + secret.length
    );
    const willBeHashResult = sha256(countersSecret);
    willBeResult = willBeResult.then((result) =>
      willBeHashResult.then((hashResult) => {
        const _hashResult = new Uint8Array(hashResult);
        return concat(
          [result, _hashResult],
          result.length + _hashResult.length
        );
      })
    );
    written += 32;
    ctr += 1;
  }
  return willBeResult;
}

function aesCtrEncrypt(
  counter: Uint8Array,
  key: ArrayBufferLike,
  data: ArrayBufferLike
): Promise<Uint8Array> {
  return getSubtle()
    .importKey("raw", key, "AES-CTR", false, ["encrypt"])
    .then((cryptoKey) =>
      getSubtle().encrypt(
        { name: "AES-CTR", counter: counter, length: 128 },
        cryptoKey,
        data
      )
    )
    .then((bytes) => new Uint8Array(bytes));
}

function aesCtrDecrypt(
  counter: Uint8Array,
  key: ArrayBufferLike,
  data: ArrayBufferLike
): Promise<Uint8Array> {
  return getSubtle()
    .importKey("raw", key, "AES-CTR", false, ["decrypt"])
    .then((cryptoKey) =>
      getSubtle().decrypt(
        { name: "AES-CTR", counter: counter, length: 128 },
        cryptoKey,
        data
      )
    )
    .then((bytes) => new Uint8Array(bytes));
}

function hmacSha256Sign(
  key: ArrayBufferLike,
  msg: ArrayBufferLike
): PromiseLike<Uint8Array> {
  const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };
  return getSubtle()
    .importKey("raw", key, algorithm, false, ["sign"])
    .then((cryptoKey) => getSubtle().sign(algorithm, cryptoKey, msg))
    .then((bytes) => new Uint8Array(bytes));
}

function hmacSha256Verify(
  key: ArrayBufferLike,
  msg: ArrayBufferLike,
  sig: ArrayBufferLike
): Promise<boolean> {
  const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };
  const _key = getSubtle().importKey("raw", key, algorithm, false, ["verify"]);
  return _key.then((cryptoKey) =>
    getSubtle().verify(algorithm, cryptoKey, sig, msg)
  );
}

/**
 * Derive shared secret for given private and public keys.
 *
 * @param  privateKeyA Sender's private key (32 bytes)
 * @param  publicKeyB Recipient's public key (65 bytes)
 * @returns  A promise that resolves with the derived shared secret (Px, 32 bytes)
 * @throws Error If arguments are invalid
 */
function derive(privateKeyA: Uint8Array, publicKeyB: Uint8Array): Uint8Array {
  if (privateKeyA.length !== 32) {
    throw new Error(
      `Bad private key, it should be 32 bytes but it's actually ${privateKeyA.length} bytes long`
    );
  } else if (publicKeyB.length !== 65) {
    throw new Error(
      `Bad public key, it should be 65 bytes but it's actually ${publicKeyB.length} bytes long`
    );
  } else if (publicKeyB[0] !== 4) {
    throw new Error("Bad public key, a valid public key would begin with 4");
  } else {
    const px = secp.getSharedSecret(privateKeyA, publicKeyB, true);
    // Remove the compression prefix
    return new Uint8Array(hexToBytes(px).slice(1));
  }
}

/**
 * Encrypt message for given recipient's public key.
 *
 * @param  publicKeyTo Recipient's public key (65 bytes)
 * @param  msg The message being encrypted
 * @return A promise that resolves with the ECIES structure serialized
 */
export async function encrypt(
  publicKeyTo: Uint8Array,
  msg: Uint8Array
): Promise<Uint8Array> {
  const ephemPrivateKey = randomBytes(32);

  const sharedPx = derive(ephemPrivateKey, publicKeyTo);

  const hash = await kdf(sharedPx, 32);

  const iv = randomBytes(16);
  const encryptionKey = hash.slice(0, 16);
  const cipherText = await aesCtrEncrypt(iv, encryptionKey, msg);

  const ivCipherText = concat([iv, cipherText], iv.length + cipherText.length);

  const macKey = await sha256(hash.slice(16));
  const hmac = await hmacSha256Sign(macKey, ivCipherText);
  const ephemPublicKey = secp.getPublicKey(ephemPrivateKey, false);

  return concat(
    [ephemPublicKey, ivCipherText, hmac],
    ephemPublicKey.length + ivCipherText.length + hmac.length
  );
}

const metaLength = 1 + 64 + 16 + 32;

/**
 * Decrypt message using given private key.
 *
 * @param privateKey A 32-byte private key of recipient of the message
 * @param encrypted ECIES serialized structure (result of ECIES encryption)
 * @returns The clear text
 * @throws Error If decryption fails
 */
export async function decrypt(
  privateKey: Uint8Array,
  encrypted: Uint8Array
): Promise<Uint8Array> {
  if (encrypted.length <= metaLength) {
    throw new Error(
      `Invalid Ciphertext. Data is too small. It should ba at least ${metaLength} bytes`
    );
  } else if (encrypted[0] !== 4) {
    throw new Error(
      `Not a valid ciphertext. It should begin with 4 but actually begin with ${encrypted[0]}`
    );
  } else {
    // deserialize
    const ephemPublicKey = encrypted.slice(0, 65);
    const cipherTextLength = encrypted.length - metaLength;
    const iv = encrypted.slice(65, 65 + 16);
    const cipherAndIv = encrypted.slice(65, 65 + 16 + cipherTextLength);
    const ciphertext = cipherAndIv.slice(16);
    const msgMac = encrypted.slice(65 + 16 + cipherTextLength);

    // check HMAC
    const px = derive(privateKey, ephemPublicKey);
    const hash = await kdf(px, 32);
    const [encryptionKey, macKey] = await sha256(hash.slice(16)).then(
      (macKey) => [hash.slice(0, 16), macKey]
    );

    if (!encryptionKey || !macKey) {
      throw Error("Failed to get parameters from the hash.");
    }

    if (!(await hmacSha256Verify(macKey, cipherAndIv, msgMac))) {
      throw Error("Incorrect MAC");
    }

    return aesCtrDecrypt(iv, encryptionKey, ciphertext);
  }
}
