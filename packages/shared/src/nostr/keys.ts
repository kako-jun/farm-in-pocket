// secp256k1 鍵生成・公開鍵導出・バリデーション。
// @noble/secp256k1 v3 系の API を直接叩く（schnorr / x-only pubkey）。

import "./_hashes";
import { schnorr, utils } from "@noble/secp256k1";
import { hexToBytes } from "./bech32";

/**
 * CSPRNG で 32 バイトの secp256k1 秘密鍵を生成する。
 * `utils.randomSecretKey()` は範囲 (1 <= d < n) を保証してから返す。
 */
export function generateSecretKey(): Uint8Array {
  // @noble/secp256k1 の戻り値は内部バッファの場合があるため、独立した Uint8Array にコピーする。
  return Uint8Array.from(utils.randomSecretKey());
}

/**
 * 秘密鍵から x-only 公開鍵 (32 バイト) を導出する。
 * Nostr の pubkey はこの x-only 形式の hex。
 */
export function getPublicKey(secretKey: Uint8Array): Uint8Array {
  if (!isValidSecretKey(secretKey)) {
    throw new Error("invalid secret key");
  }
  return Uint8Array.from(schnorr.getPublicKey(secretKey));
}

/**
 * 秘密鍵が 32 バイト・範囲 (1 <= d < n) に収まっているか判定する。
 * throw せず boolean を返す。
 */
export function isValidSecretKey(secretKey: unknown): secretKey is Uint8Array {
  if (!(secretKey instanceof Uint8Array)) {
    return false;
  }
  if (secretKey.length !== 32) {
    return false;
  }
  try {
    return utils.isValidSecretKey(secretKey);
  } catch {
    return false;
  }
}

/**
 * pubkey hex (64 文字、x-only) のバリデーション。
 * Nostr イベントの `pubkey` フィールドや `npub` decode 結果をチェックする用途。
 */
export function isValidPubkeyHex(pubkeyHex: unknown): pubkeyHex is string {
  if (typeof pubkeyHex !== "string") {
    return false;
  }
  if (pubkeyHex.length !== 64) {
    return false;
  }
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(pubkeyHex);
  } catch {
    return false;
  }
  // x-only pubkey は 32 バイトかつ secp256k1 曲線上の点である必要があるが、
  // schnorr.getPublicKey の正当性確認は重いので、ここでは長さ + hex 整形のみとする。
  // 厳密に on-curve 確認が必要な箇所では別途 schnorr.verify が落ちる形で検出する。
  return bytes.length === 32;
}
