import { ENR } from "@waku/enr";
import { keccak256, verifySignature } from "@waku/enr";
import { utf8ToBytes } from "@waku/utils/bytes";
import base32 from "hi-base32";
import { fromString } from "uint8arrays/from-string";

export type ENRRootValues = {
  eRoot: string;
  lRoot: string;
  seq: number;
  signature: string;
};

export type ENRTreeValues = {
  publicKey: string;
  domain: string;
};

export class ENRTree {
  public static readonly RECORD_PREFIX = ENR.RECORD_PREFIX;
  public static readonly TREE_PREFIX = "enrtree:";
  public static readonly BRANCH_PREFIX = "enrtree-branch:";
  public static readonly ROOT_PREFIX = "enrtree-root:";

  /**
   * Extracts the branch subdomain referenced by a DNS tree root string after verifying
   * the root record signature with its base32 compressed public key.
   */
  static parseAndVerifyRoot(root: string, publicKey: string): string {
    if (!root.startsWith(this.ROOT_PREFIX))
      throw new Error(
        `ENRTree root entry must start with '${this.ROOT_PREFIX}'`
      );

    const rootValues = ENRTree.parseRootValues(root);
    const decodedPublicKey = base32.decode.asBytes(publicKey);

    // The signature is a 65-byte secp256k1 over the keccak256 hash
    // of the record content, excluding the `sig=` part, encoded as URL-safe base64 string
    // (Trailing recovery bit must be trimmed to pass `ecdsaVerify` method)
    const signedComponent = root.split(" sig")[0];

    if (!signedComponent) {
      throw Error(`Signature component is missing, got: ${signedComponent}`);
    }

    const signedComponentBuffer = utf8ToBytes(signedComponent);
    const signatureBuffer = fromString(rootValues.signature, "base64url").slice(
      0,
      64
    );

    const isVerified = verifySignature(
      signatureBuffer,
      keccak256(signedComponentBuffer),
      new Uint8Array(decodedPublicKey)
    );

    if (!isVerified) throw new Error("Unable to verify ENRTree root signature");

    return rootValues.eRoot;
  }

  static parseRootValues(txt: string): ENRRootValues {
    const matches = txt.match(
      /^enrtree-root:v1 e=([^ ]+) l=([^ ]+) seq=(\d+) sig=([^ ]+)$/
    );

    if (!Array.isArray(matches))
      throw new Error("Could not parse ENRTree root entry");

    matches.shift(); // The first entry is the full match
    const [eRoot, lRoot, seq, signature] = matches;

    if (!eRoot)
      throw new Error("Could not parse 'e' value from ENRTree root entry");
    if (!lRoot)
      throw new Error("Could not parse 'l' value from ENRTree root entry");

    if (!seq)
      throw new Error("Could not parse 'seq' value from ENRTree root entry");
    if (!signature)
      throw new Error("Could not parse 'sig' value from ENRTree root entry");

    return { eRoot, lRoot, seq: Number(seq), signature };
  }

  /**
   * Returns the public key and top level domain of an ENR tree entry.
   * The domain is the starting point for traversing a set of linked DNS TXT records
   * and the public key is used to verify the root entry record
   */
  static parseTree(tree: string): ENRTreeValues {
    if (!tree.startsWith(this.TREE_PREFIX))
      throw new Error(
        `ENRTree tree entry must start with '${this.TREE_PREFIX}'`
      );

    const matches = tree.match(/^enrtree:\/\/([^@]+)@(.+)$/);

    if (!Array.isArray(matches))
      throw new Error("Could not parse ENRTree tree entry");

    matches.shift(); // The first entry is the full match
    const [publicKey, domain] = matches;

    if (!publicKey)
      throw new Error("Could not parse public key from ENRTree tree entry");
    if (!domain)
      throw new Error("Could not parse domain from ENRTree tree entry");

    return { publicKey, domain };
  }

  /**
   * Returns subdomains listed in an ENR branch entry. These in turn lead to
   * either further branch entries or ENR records.
   */
  static parseBranch(branch: string): string[] {
    if (!branch.startsWith(this.BRANCH_PREFIX)) {
      throw Error(
        `ENRTree branch entry must start with '${this.BRANCH_PREFIX}'`
      );
    }

    const enrPart = branch.split(this.BRANCH_PREFIX)[1];

    if (!enrPart) {
      throw Error(`ENRTree branch does not have data`);
    }

    return enrPart.split(",");
  }
}
