// Issue: kako-jun/farm-in-pocket#19
// follow.ts の動作確認。リレー / publishEvent は deps 注入でモック化する。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type NostrEvent,
  bytesToHex,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
} from "@farm-in-pocket/shared";
import {
  MY_CONTACTS_STORAGE_KEY,
  addContactTag,
  extractContactTags,
  extractContacts,
  followPubkey,
  getMyContacts,
  removeContactTag,
  unfollowPubkey,
} from "./follow";

function makeContactEvent(opts: {
  authorPubkey: string;
  created_at: number;
  contacts: string[];
}): NostrEvent {
  return {
    id: `id-${opts.created_at}`,
    pubkey: opts.authorPubkey,
    created_at: opts.created_at,
    kind: 3,
    tags: opts.contacts.map((p) => ["p", p]),
    content: "",
    sig: "sig",
  };
}

function makeContactEventWithTags(opts: {
  authorPubkey: string;
  created_at: number;
  tags: string[][];
}): NostrEvent {
  return {
    id: `id-${opts.created_at}`,
    pubkey: opts.authorPubkey,
    created_at: opts.created_at,
    kind: 3,
    tags: opts.tags,
    content: "",
    sig: "sig",
  };
}

function targetPubkey(seed: string): string {
  return seed.padEnd(64, "0").slice(0, 64);
}

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("extractContacts", () => {
  it("kind:3 の p タグから 64 文字 pubkey だけ抽出する", () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const valid = targetPubkey("aaaa");
    const event = makeContactEvent({
      authorPubkey: pk,
      created_at: 100,
      contacts: [valid, "tooshort", valid /* dedup */],
    });
    expect(extractContacts(event)).toEqual([valid]);
  });

  it("null なら空配列", () => {
    expect(extractContacts(null)).toEqual([]);
  });
});

describe("getMyContacts", () => {
  it("最新 created_at の kind:3 を採用する", async () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const old = makeContactEvent({
      authorPubkey: pk,
      created_at: 100,
      contacts: [targetPubkey("aaaa")],
    });
    const recent = makeContactEvent({
      authorPubkey: pk,
      created_at: 200,
      contacts: [targetPubkey("bbbb"), targetPubkey("cccc")],
    });
    const queryRelays = vi.fn().mockResolvedValue({ events: [old, recent], errors: [] });

    const result = await getMyContacts(sk, { queryRelays });
    expect(result).toEqual([targetPubkey("bbbb"), targetPubkey("cccc")]);
  });

  it("リレー取得失敗時はローカルキャッシュにフォールバックする", async () => {
    const sk = generateSecretKey();
    window.localStorage.setItem(
      MY_CONTACTS_STORAGE_KEY,
      JSON.stringify({ created_at: 50, pubkeys: [targetPubkey("zzzz")] }),
    );
    const queryRelays = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await getMyContacts(sk, { queryRelays });
    expect(result).toEqual([targetPubkey("zzzz")]);
  });

  it("リレーも空・キャッシュも無い場合は []", async () => {
    const sk = generateSecretKey();
    const queryRelays = vi.fn().mockResolvedValue({ events: [], errors: [] });
    const result = await getMyContacts(sk, { queryRelays });
    expect(result).toEqual([]);
  });

  it("リレーが応答したが kind:3 が無い場合もキャッシュにフォールバックする", async () => {
    const sk = generateSecretKey();
    window.localStorage.setItem(
      MY_CONTACTS_STORAGE_KEY,
      JSON.stringify({ created_at: 77, pubkeys: [targetPubkey("dddd")] }),
    );
    const queryRelays = vi.fn().mockResolvedValue({ events: [], errors: [] });
    const result = await getMyContacts(sk, { queryRelays });
    expect(result).toEqual([targetPubkey("dddd")]);
  });
});

describe("extractContactTags / addContactTag / removeContactTag", () => {
  it("extractContactTags は p タグを 4 要素のまま保持する", () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const a = targetPubkey("aaaa");
    const b = targetPubkey("bbbb");
    const event = makeContactEventWithTags({
      authorPubkey: pk,
      created_at: 100,
      tags: [
        ["p", a, "wss://relay.example", "alice"],
        ["p", b],
        ["e", "noise"],
        ["p", "tooshort"], // tag[1] が 64 文字でなくても string なら保持（NIP-02 自体は長さ制限していない）
      ],
    });
    expect(extractContactTags(event)).toEqual([
      ["p", a, "wss://relay.example", "alice"],
      ["p", b],
      ["p", "tooshort"],
    ]);
  });

  it("addContactTag は新規 pubkey を 2 要素タグで append、既存はそのまま", () => {
    const a = targetPubkey("aaaa");
    const b = targetPubkey("bbbb");
    const tags: string[][] = [["p", a, "wss://relay.example", "alice"]];
    const after = addContactTag(tags, b);
    expect(after).toEqual([
      ["p", a, "wss://relay.example", "alice"],
      ["p", b],
    ]);
    // 既に follow 中なら no-op で同一配列
    expect(addContactTag(after, a)).toBe(after);
  });

  it("removeContactTag は対象 pubkey 行だけ除外して 4 要素は温存する", () => {
    const a = targetPubkey("aaaa");
    const b = targetPubkey("bbbb");
    const tags: string[][] = [
      ["p", a, "wss://relay.example", "alice"],
      ["p", b, "", "bob"],
    ];
    expect(removeContactTag(tags, b)).toEqual([["p", a, "wss://relay.example", "alice"]]);
  });
});

describe("followPubkey", () => {
  it("既に follow 中なら publish しない (no-op)", async () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const target = targetPubkey("aaaa");
    const queryRelays = vi.fn().mockResolvedValue({
      events: [makeContactEvent({ authorPubkey: pk, created_at: 100, contacts: [target] })],
      errors: [],
    });
    const publishEvent = vi.fn().mockResolvedValue({ success: true });

    await followPubkey(sk, target, { queryRelays, publishEvent });
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("未 follow を追加すると kind:3 を署名して publishEvent する", async () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const existing = targetPubkey("aaaa");
    const target = targetPubkey("bbbb");
    const queryRelays = vi.fn().mockResolvedValue({
      events: [makeContactEvent({ authorPubkey: pk, created_at: 100, contacts: [existing] })],
      errors: [],
    });
    const publishEvent = vi.fn().mockResolvedValue({ success: true });

    await followPubkey(sk, target, {
      queryRelays,
      publishEvent,
      now: () => 9999,
    });

    expect(publishEvent).toHaveBeenCalledOnce();
    const event = publishEvent.mock.calls[0]?.[0] as NostrEvent;
    expect(event.kind).toBe(3);
    expect(event.created_at).toBe(9999);
    expect(event.pubkey).toBe(pk);
    expect(event.tags).toEqual([
      ["p", existing],
      ["p", target],
    ]);
    expect(verifyEvent(event)).toBe(true);

    // ローカルキャッシュにも反映されている
    const cached = window.localStorage.getItem(MY_CONTACTS_STORAGE_KEY);
    expect(cached).toBeTruthy();
    if (cached) {
      const parsed = JSON.parse(cached) as { pubkeys: string[]; created_at: number };
      expect(parsed.pubkeys).toEqual([existing, target]);
      expect(parsed.created_at).toBe(9999);
    }
  });

  it("64 文字以外の pubkey は throw する", async () => {
    const sk = generateSecretKey();
    await expect(followPubkey(sk, "short")).rejects.toThrow(/64-char/);
  });

  it("既存 kind:3 に 4 要素タグ (relay/petname) があれば follow 後も保持される", async () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const existing = targetPubkey("aaaa");
    const target = targetPubkey("bbbb");
    const queryRelays = vi.fn().mockResolvedValue({
      events: [
        makeContactEventWithTags({
          authorPubkey: pk,
          created_at: 100,
          tags: [["p", existing, "wss://relay.example", "alice"]],
        }),
      ],
      errors: [],
    });
    const publishEvent = vi.fn().mockResolvedValue({ success: true });

    await followPubkey(sk, target, { queryRelays, publishEvent, now: () => 9999 });

    expect(publishEvent).toHaveBeenCalledOnce();
    const event = publishEvent.mock.calls[0]?.[0] as NostrEvent;
    expect(event.tags).toEqual([
      ["p", existing, "wss://relay.example", "alice"],
      ["p", target],
    ]);
    expect(verifyEvent(event)).toBe(true);
  });
});

describe("unfollowPubkey", () => {
  it("follow していない pubkey を unfollow しても publish しない", async () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const queryRelays = vi.fn().mockResolvedValue({
      events: [makeContactEvent({ authorPubkey: pk, created_at: 100, contacts: [] })],
      errors: [],
    });
    const publishEvent = vi.fn().mockResolvedValue({ success: true });

    await unfollowPubkey(sk, targetPubkey("aaaa"), { queryRelays, publishEvent });
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("follow 中の pubkey を unfollow すると kind:3 を再発行する", async () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const keep = targetPubkey("aaaa");
    const drop = targetPubkey("bbbb");
    const queryRelays = vi.fn().mockResolvedValue({
      events: [makeContactEvent({ authorPubkey: pk, created_at: 100, contacts: [keep, drop] })],
      errors: [],
    });
    const publishEvent = vi.fn().mockResolvedValue({ success: true });

    await unfollowPubkey(sk, drop, { queryRelays, publishEvent, now: () => 12345 });
    expect(publishEvent).toHaveBeenCalledOnce();
    const event = publishEvent.mock.calls[0]?.[0] as NostrEvent;
    expect(event.kind).toBe(3);
    expect(event.tags).toEqual([["p", keep]]);
    expect(verifyEvent(event)).toBe(true);
  });

  it("unfollow しても他者の 4 要素タグ (relay/petname 付き) は保持される", async () => {
    const sk = generateSecretKey();
    const pk = bytesToHex(getPublicKey(sk));
    const keep = targetPubkey("aaaa");
    const drop = targetPubkey("bbbb");
    const queryRelays = vi.fn().mockResolvedValue({
      events: [
        makeContactEventWithTags({
          authorPubkey: pk,
          created_at: 100,
          tags: [
            ["p", keep, "wss://relay.example", "alice"],
            ["p", drop, "wss://relay.example", "bob"],
          ],
        }),
      ],
      errors: [],
    });
    const publishEvent = vi.fn().mockResolvedValue({ success: true });

    await unfollowPubkey(sk, drop, { queryRelays, publishEvent, now: () => 12345 });

    expect(publishEvent).toHaveBeenCalledOnce();
    const event = publishEvent.mock.calls[0]?.[0] as NostrEvent;
    expect(event.tags).toEqual([["p", keep, "wss://relay.example", "alice"]]);
    expect(verifyEvent(event)).toBe(true);
  });
});
