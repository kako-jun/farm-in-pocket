import { describe, expect, it } from "vitest";
import { bytesToHex, decodeNpub, decodeNsec, encodeNpub, encodeNsec, hexToBytes } from "./bech32";

// NIP-19 仕様の参考ベクトル。
// secret = 67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa
// nsec   = nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5
const KNOWN_SECRET_HEX = "67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa";
const KNOWN_NSEC = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";

describe("bech32 hex helpers", () => {
  it("bytesToHex / hexToBytes は往復で復元できる", () => {
    const hex = "01020a0b1234ff";
    const bytes = hexToBytes(hex);
    expect(bytesToHex(bytes)).toBe(hex);
  });

  it("hexToBytes は不正文字を弾く", () => {
    expect(() => hexToBytes("zzz")).toThrow();
  });

  it("hexToBytes は奇数長を弾く", () => {
    expect(() => hexToBytes("abc")).toThrow();
  });
});

describe("encodeNsec / decodeNsec", () => {
  it("既知ベクトルが NIP-19 と一致する", () => {
    const bytes = hexToBytes(KNOWN_SECRET_HEX);
    expect(encodeNsec(bytes)).toBe(KNOWN_NSEC);
    expect(bytesToHex(decodeNsec(KNOWN_NSEC))).toBe(KNOWN_SECRET_HEX);
  });

  it("ランダム 32 バイトを往復してもバイト一致する", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = (i * 7 + 3) & 0xff;
    }
    const encoded = encodeNsec(bytes);
    expect(encoded.startsWith("nsec1")).toBe(true);
    expect(decodeNsec(encoded)).toEqual(bytes);
  });

  it("32 バイト以外は encode で throw", () => {
    expect(() => encodeNsec(new Uint8Array(31))).toThrow();
    expect(() => encodeNsec(new Uint8Array(33))).toThrow();
  });

  it("npub を decodeNsec すると prefix エラー", () => {
    // 有効な npub を作って渡す
    const bytes = new Uint8Array(32).fill(1);
    const npub = encodeNpub(bytes);
    expect(() => decodeNsec(npub)).toThrow(/prefix/);
  });

  it("空文字 / 不正文字列は throw", () => {
    expect(() => decodeNsec("")).toThrow();
    expect(() => decodeNsec("not-a-bech32-string")).toThrow();
  });
});

describe("encodeNpub / decodeNpub", () => {
  it("32 バイト pubkey を往復できる", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = i & 0xff;
    }
    const npub = encodeNpub(bytes);
    expect(npub.startsWith("npub1")).toBe(true);
    expect(decodeNpub(npub)).toEqual(bytes);
  });

  it("nsec を decodeNpub すると prefix エラー", () => {
    const bytes = hexToBytes(KNOWN_SECRET_HEX);
    const nsec = encodeNsec(bytes);
    expect(() => decodeNpub(nsec)).toThrow(/prefix/);
  });
});
