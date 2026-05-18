// bech32 (NIP-19) ヘルパー。
// nostr-tools には依存せず、@scure/base の bech32 で nsec / npub を扱う。

import { bech32 } from "@scure/base";

const NSEC_PREFIX = "nsec";
const NPUB_PREFIX = "npub";
// secp256k1 secret key / x-only public key はどちらも 32 バイト。
const KEY_BYTES = 32;
// bech32 標準 90 文字制限ではエンコード結果が収まらないため、Nostr では制限を撤廃。
const BECH32_LIMIT = 1000;

/**
 * 32 バイトの秘密鍵を `nsec1...` 形式にエンコードする。
 * 入力が 32 バイトでなければ throw する。
 */
export function encodeNsec(secretKey: Uint8Array): string {
  assertKeyBytes(secretKey, "secretKey");
  return bech32.encode(NSEC_PREFIX, bech32.toWords(secretKey), BECH32_LIMIT);
}

/**
 * 32 バイトの公開鍵 (x-only) を `npub1...` 形式にエンコードする。
 */
export function encodeNpub(pubkey: Uint8Array): string {
  assertKeyBytes(pubkey, "pubkey");
  return bech32.encode(NPUB_PREFIX, bech32.toWords(pubkey), BECH32_LIMIT);
}

/**
 * `nsec1...` を 32 バイトの秘密鍵にデコードする。
 * prefix 違い・長さ不正・チェックサム不正は throw する。
 */
export function decodeNsec(nsec: string): Uint8Array {
  return decodeKey(nsec, NSEC_PREFIX, "nsec");
}

/**
 * `npub1...` を 32 バイトの公開鍵にデコードする。
 */
export function decodeNpub(npub: string): Uint8Array {
  return decodeKey(npub, NPUB_PREFIX, "npub");
}

function decodeKey(input: string, expectedPrefix: string, label: string): Uint8Array {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error(`invalid ${label}: empty input`);
  }
  // bech32 は小文字 / 大文字混在を許さない（混在検出のため自前で trim はしない）。
  const decoded = bech32.decode(input as `${typeof expectedPrefix}1${string}`, BECH32_LIMIT);
  if (decoded.prefix !== expectedPrefix) {
    throw new Error(
      `invalid ${label}: expected prefix "${expectedPrefix}", got "${decoded.prefix}"`,
    );
  }
  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length !== KEY_BYTES) {
    throw new Error(`invalid ${label}: expected ${KEY_BYTES} bytes, got ${bytes.length}`);
  }
  return Uint8Array.from(bytes);
}

function assertKeyBytes(bytes: Uint8Array, label: string): void {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`invalid ${label}: not a Uint8Array`);
  }
  if (bytes.length !== KEY_BYTES) {
    throw new Error(`invalid ${label}: expected ${KEY_BYTES} bytes, got ${bytes.length}`);
  }
}

const HEX_RE = /^[0-9a-fA-F]+$/;

/** Uint8Array → 小文字 hex 文字列。 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

/** hex 文字列 → Uint8Array。長さ奇数 / hex 以外は throw。 */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== "string") {
    throw new Error("invalid hex: not a string");
  }
  if (hex.length === 0 || hex.length % 2 !== 0) {
    throw new Error(`invalid hex: odd length (${hex.length})`);
  }
  if (!HEX_RE.test(hex)) {
    throw new Error("invalid hex: non-hex character");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
