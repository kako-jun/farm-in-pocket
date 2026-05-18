// NIP-01: Nostr イベントの id 計算と Schnorr 署名。
//
// id = sha256(JSON.stringify([
//   0,
//   pubkey (hex),
//   created_at,
//   kind,
//   tags,
//   content,
// ]))
// sig = BIP340 Schnorr signature over id, using secret key.

import "./_hashes";
import { sha256 } from "@noble/hashes/sha2.js";
import { schnorr } from "@noble/secp256k1";
import type { NostrEvent, UnsignedNostrEvent } from "../mypace/types";
import { bytesToHex } from "./bech32";
import { getPublicKey, isValidSecretKey } from "./keys";

export interface SignEventDraft {
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

/**
 * Draft を NIP-01 形式の署名済み NostrEvent に変換する。
 * - pubkey は secretKey から自動導出（呼び出し側で与える必要なし）
 * - id は serialize + sha256
 * - sig は Schnorr(BIP340) で id に対して生成
 */
export function signEvent(draft: SignEventDraft, secretKey: Uint8Array): NostrEvent {
  if (!isValidSecretKey(secretKey)) {
    throw new Error("invalid secret key");
  }
  if (!Number.isFinite(draft.created_at) || !Number.isInteger(draft.created_at)) {
    throw new Error("invalid draft: created_at must be an integer (unix seconds)");
  }
  if (!Number.isInteger(draft.kind) || draft.kind < 0) {
    throw new Error("invalid draft: kind must be a non-negative integer");
  }
  if (!Array.isArray(draft.tags)) {
    throw new Error("invalid draft: tags must be an array");
  }
  if (typeof draft.content !== "string") {
    throw new Error("invalid draft: content must be a string");
  }

  const pubkeyBytes = getPublicKey(secretKey);
  const pubkey = bytesToHex(pubkeyBytes);

  const serialized = serializeEventForId(pubkey, draft);
  const idBytes = sha256(new TextEncoder().encode(serialized));
  const id = bytesToHex(idBytes);

  const sigBytes = schnorr.sign(idBytes, secretKey);
  const sig = bytesToHex(sigBytes);

  return {
    id,
    pubkey,
    created_at: draft.created_at,
    kind: draft.kind,
    tags: draft.tags,
    content: draft.content,
    sig,
  };
}

/**
 * NIP-01 シリアライズ仕様：JSON.stringify(array) を素直に使う。
 * 配列順序は [0, pubkey, created_at, kind, tags, content] で固定。
 * 戻り値型は UnsignedNostrEvent と pubkey を満たすペイロード文字列。
 */
function serializeEventForId(pubkey: string, draft: SignEventDraft): string {
  // JSON.stringify は ECMA-262 で順序が定義された配列要素の連結を生成する。
  // 文字エスケープも仕様準拠（"\\", "\"", "\n" 等）。
  return JSON.stringify([0, pubkey, draft.created_at, draft.kind, draft.tags, draft.content]);
}

/** 既存の (id, sig 付き) event の検証ヘルパー。テストや受信検証用。 */
export function verifyEvent(event: NostrEvent): boolean {
  try {
    const serialized = serializeEventForId(event.pubkey, {
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags,
      content: event.content,
    });
    const idBytes = sha256(new TextEncoder().encode(serialized));
    if (bytesToHex(idBytes) !== event.id) {
      return false;
    }
    const sig = hexToBytesLocal(event.sig);
    const pub = hexToBytesLocal(event.pubkey);
    return schnorr.verify(sig, idBytes, pub);
  } catch {
    return false;
  }
}

// 循環参照を避けるためのローカル hex → bytes（bech32.ts と同等）。
function hexToBytesLocal(hex: string): Uint8Array {
  if (typeof hex !== "string" || hex.length % 2 !== 0) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// re-export してテストから unsigned 型を扱いやすくする
export type { UnsignedNostrEvent };
