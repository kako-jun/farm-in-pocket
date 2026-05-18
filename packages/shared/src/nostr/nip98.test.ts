import { base64 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { generateSecretKey } from "./keys";
import { NIP98_KIND, buildNip98Header, createNip98Signer } from "./nip98";
import { verifyEvent } from "./sign";

describe("buildNip98Header", () => {
  it("`Nostr <base64>` 形式のヘッダ値を返す", () => {
    const sk = generateSecretKey();
    const header = buildNip98Header("GET", "https://example.test/api/posts", sk);
    expect(header).toMatch(/^Nostr [A-Za-z0-9+/=]+$/);
  });

  it("base64 デコードした event は kind 27235 で u/method タグを持つ", () => {
    const sk = generateSecretKey();
    const url = "https://mypace.llll-ll.com/api/posts";
    const header = buildNip98Header("POST", url, sk);
    const b64 = header.slice("Nostr ".length);
    const json = new TextDecoder().decode(base64.decode(b64));
    const event = JSON.parse(json);

    expect(event.kind).toBe(NIP98_KIND);
    expect(event.kind).toBe(27235);
    expect(event.content).toBe("");
    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["u", url],
        ["method", "POST"],
      ]),
    );
  });

  it("method は大文字に正規化される", () => {
    const sk = generateSecretKey();
    const header = buildNip98Header("get", "https://example.test/x", sk);
    const json = new TextDecoder().decode(base64.decode(header.slice("Nostr ".length)));
    const event = JSON.parse(json);
    const methodTag = event.tags.find((t: string[]) => t[0] === "method");
    expect(methodTag).toEqual(["method", "GET"]);
  });

  it("デコードした event は schnorr 検証に成功する", () => {
    const sk = generateSecretKey();
    const header = buildNip98Header("GET", "https://example.test/", sk);
    const json = new TextDecoder().decode(base64.decode(header.slice("Nostr ".length)));
    const event = JSON.parse(json);
    expect(verifyEvent(event)).toBe(true);
  });

  it("`now` を inject すると created_at が固定される", () => {
    const sk = generateSecretKey();
    const header = buildNip98Header("GET", "https://example.test/", sk, { now: () => 1234567890 });
    const json = new TextDecoder().decode(base64.decode(header.slice("Nostr ".length)));
    const event = JSON.parse(json);
    expect(event.created_at).toBe(1234567890);
  });

  it("空 method / 空 url は throw", () => {
    const sk = generateSecretKey();
    expect(() => buildNip98Header("", "https://example.test/", sk)).toThrow();
    expect(() => buildNip98Header("GET", "", sk)).toThrow();
  });
});

describe("createNip98Signer", () => {
  it("MypaceSigner.buildNip98Header() が同等の出力を返す", async () => {
    const sk = generateSecretKey();
    const signer = createNip98Signer(sk, { now: () => 1700000000 });
    const header = await signer.buildNip98Header("GET", "https://example.test/x");
    expect(header).toMatch(/^Nostr /);
    const json = new TextDecoder().decode(base64.decode(header.slice("Nostr ".length)));
    const event = JSON.parse(json);
    expect(event.kind).toBe(NIP98_KIND);
    expect(event.created_at).toBe(1700000000);
    expect(verifyEvent(event)).toBe(true);
  });
});
