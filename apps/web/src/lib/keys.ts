// アカウント鍵（Nostr secret key）のローカル管理。
//
// 現状: localStorage にプレーン hex で保存する MVP 実装。
// TODO(#後続): IndexedDB に移行し、WebCrypto.subtle (AES-GCM + PBKDF2 等) で
//   暗号化したうえで保存する。パスワード未設定時はデバイスバインドの鍵で透過暗号化を予定。
//   現状はユーザーに「リカバリー用に nsec をメモするまで進めない」前提で運用する。

import {
  bytesToHex,
  decodeNsec,
  encodeNpub,
  encodeNsec,
  generateSecretKey,
  getPublicKey,
  hexToBytes,
  isValidSecretKey,
} from "@farm-in-pocket/shared";

export const SECRET_KEY_STORAGE_KEY = "fip:secret-key-v1";

export interface MyKeyPair {
  secretKey: Uint8Array;
  /** hex (64 文字, x-only)。Nostr event の pubkey フィールドに入れる形式。 */
  pubkey: string;
  /** bech32 npub1...（UI 表示用） */
  npub: string;
  /** bech32 nsec1...（リカバリー表示用） */
  nsec: string;
}

/**
 * localStorage に保存されている secret key を取り出す。
 * 存在しない / 形式異常 / バリデーション NG なら null。
 */
export function getStoredSecretKey(): Uint8Array | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(SECRET_KEY_STORAGE_KEY);
  if (raw === null || raw.length === 0) {
    return null;
  }
  try {
    const bytes = hexToBytes(raw);
    if (!isValidSecretKey(bytes)) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * 既存があればそれを返し、なければ新規生成して保存して返す。
 * SSR 時は localStorage が無いので throw。呼び出し側はブラウザ環境でのみ使う。
 */
export function getOrCreateSecretKey(): Uint8Array {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateSecretKey() is browser-only");
  }
  const existing = getStoredSecretKey();
  if (existing !== null) {
    return existing;
  }
  const fresh = generateSecretKey();
  setSecretKey(fresh);
  return fresh;
}

/** secret key を localStorage に保存する。 */
export function setSecretKey(secretKey: Uint8Array): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!isValidSecretKey(secretKey)) {
    throw new Error("invalid secret key");
  }
  window.localStorage.setItem(SECRET_KEY_STORAGE_KEY, bytesToHex(secretKey));
}

/** 保存済み secret key を削除する。 */
export function clearSecretKey(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(SECRET_KEY_STORAGE_KEY);
}

/**
 * `nsec1...` をインポートして保存する。
 * decode 失敗 / バリデーション NG なら throw。
 */
export function importNsec(nsec: string): Uint8Array {
  const bytes = decodeNsec(nsec.trim());
  if (!isValidSecretKey(bytes)) {
    throw new Error("invalid secret key (decoded but out of range)");
  }
  setSecretKey(bytes);
  return bytes;
}

/**
 * 保存済み鍵から MyKeyPair を構築する。未保存なら null。
 */
export function getMyKeyPair(): MyKeyPair | null {
  const sk = getStoredSecretKey();
  if (sk === null) {
    return null;
  }
  const pubBytes = getPublicKey(sk);
  return {
    secretKey: sk,
    pubkey: bytesToHex(pubBytes),
    npub: encodeNpub(pubBytes),
    nsec: encodeNsec(sk),
  };
}
