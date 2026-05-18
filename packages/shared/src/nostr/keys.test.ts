import { describe, expect, it } from "vitest";
import { bytesToHex } from "./bech32";
import { generateSecretKey, getPublicKey, isValidPubkeyHex, isValidSecretKey } from "./keys";

describe("generateSecretKey", () => {
  it("32 バイトの Uint8Array を返す", () => {
    const sk = generateSecretKey();
    expect(sk).toBeInstanceOf(Uint8Array);
    expect(sk.length).toBe(32);
  });

  it("複数回呼ぶと毎回異なる値（衝突確率は無視できる）", () => {
    const a = generateSecretKey();
    const b = generateSecretKey();
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it("生成された secret key は isValidSecretKey を満たす", () => {
    expect(isValidSecretKey(generateSecretKey())).toBe(true);
  });
});

describe("getPublicKey", () => {
  it("同じ秘密鍵からは決定論的に同じ公開鍵を導出する", () => {
    const sk = generateSecretKey();
    const a = getPublicKey(sk);
    const b = getPublicKey(sk);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it("32 バイト (x-only) を返す", () => {
    const pk = getPublicKey(generateSecretKey());
    expect(pk.length).toBe(32);
  });

  it("不正な秘密鍵では throw する", () => {
    expect(() => getPublicKey(new Uint8Array(31))).toThrow();
    expect(() => getPublicKey(new Uint8Array(32))).toThrow(); // 全 0 は範囲外
  });
});

describe("isValidSecretKey", () => {
  it("型違いは false", () => {
    expect(isValidSecretKey("hex" as unknown)).toBe(false);
    expect(isValidSecretKey(null as unknown)).toBe(false);
    expect(isValidSecretKey(undefined as unknown)).toBe(false);
  });

  it("長さ違いは false", () => {
    expect(isValidSecretKey(new Uint8Array(31))).toBe(false);
    expect(isValidSecretKey(new Uint8Array(33))).toBe(false);
  });

  it("全 0 / 範囲外は false（secp256k1 のオーダーを超えない範囲かつ非ゼロが必要）", () => {
    expect(isValidSecretKey(new Uint8Array(32))).toBe(false);
  });
});

describe("isValidPubkeyHex", () => {
  it("64 文字 hex は true", () => {
    const pk = bytesToHex(getPublicKey(generateSecretKey()));
    expect(isValidPubkeyHex(pk)).toBe(true);
  });

  it("長さ違いは false", () => {
    expect(isValidPubkeyHex("00")).toBe(false);
    expect(isValidPubkeyHex("0".repeat(63))).toBe(false);
    expect(isValidPubkeyHex("0".repeat(65))).toBe(false);
  });

  it("hex 以外は false", () => {
    expect(isValidPubkeyHex("z".repeat(64))).toBe(false);
  });

  it("型違いは false", () => {
    expect(isValidPubkeyHex(12345 as unknown)).toBe(false);
    expect(isValidPubkeyHex(null as unknown)).toBe(false);
  });
});
