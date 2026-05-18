import { schnorr } from "@noble/secp256k1";
import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "./bech32";
import { generateSecretKey, getPublicKey } from "./keys";
import { signEvent, verifyEvent } from "./sign";

describe("signEvent", () => {
  it("id (sha256) と sig (schnorr) を持つ完全な NostrEvent を返す", () => {
    const sk = generateSecretKey();
    const event = signEvent(
      {
        created_at: 1700000000,
        kind: 1,
        tags: [],
        content: "hello world",
      },
      sk,
    );
    expect(event.id).toMatch(/^[0-9a-f]{64}$/);
    expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(event.pubkey).toBe(bytesToHex(getPublicKey(sk)));
    expect(event.kind).toBe(1);
    expect(event.content).toBe("hello world");
    expect(event.created_at).toBe(1700000000);
  });

  it("schnorr.verify が成功する", () => {
    const sk = generateSecretKey();
    const event = signEvent(
      { created_at: 1700000000, kind: 1, tags: [], content: "verify me" },
      sk,
    );
    const ok = schnorr.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey),
    );
    expect(ok).toBe(true);
  });

  it("同じ draft + 同じ secret key なら id は決定論的（created_at 固定）", () => {
    const sk = generateSecretKey();
    const draft = {
      created_at: 1700000000,
      kind: 1,
      tags: [["t", "fip"]],
      content: "deterministic",
    };
    const a = signEvent(draft, sk);
    const b = signEvent(draft, sk);
    expect(a.id).toBe(b.id);
    expect(a.pubkey).toBe(b.pubkey);
    // sig は schnorr の auxRand があるため一般に non-deterministic だが、id 一致と verify 成功を確認
    expect(verifyEvent(a)).toBe(true);
    expect(verifyEvent(b)).toBe(true);
  });

  it("content の差で id が変わる", () => {
    const sk = generateSecretKey();
    const base = { created_at: 1700000000, kind: 1, tags: [] };
    const a = signEvent({ ...base, content: "a" }, sk);
    const b = signEvent({ ...base, content: "b" }, sk);
    expect(a.id).not.toBe(b.id);
  });

  it("verifyEvent は改ざんを検出する（content 書き換え）", () => {
    const sk = generateSecretKey();
    const event = signEvent({ created_at: 1700000000, kind: 1, tags: [], content: "original" }, sk);
    const tampered = { ...event, content: "tampered" };
    expect(verifyEvent(tampered)).toBe(false);
  });

  it("不正な秘密鍵だと throw", () => {
    expect(() =>
      signEvent({ created_at: 1, kind: 1, tags: [], content: "" }, new Uint8Array(32)),
    ).toThrow();
  });

  it("不正な draft (created_at が小数) は throw", () => {
    const sk = generateSecretKey();
    expect(() => signEvent({ created_at: 1.5, kind: 1, tags: [], content: "" }, sk)).toThrow();
  });
});
