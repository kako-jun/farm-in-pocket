// Issue: kako-jun/farm-in-pocket#19
// fetchOtherFarm の振る舞いを queryRelays / mypace.getProfiles をモックして検証する。

import type { NostrEvent, NostrProfile } from "@farm-in-pocket/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@farm-in-pocket/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@farm-in-pocket/shared")>("@farm-in-pocket/shared");
  return {
    ...actual,
    queryRelays: vi.fn(),
  };
});

vi.mock("./mypace", () => ({
  createMypaceClient: vi.fn(),
}));

import { encodeNpub, hexToBytes, queryRelays } from "@farm-in-pocket/shared";
import { createMypaceClient } from "./mypace";
import { fetchOtherFarm, findImageUrls, findTagValue } from "./other-farm";

const queryRelaysMock = queryRelays as unknown as ReturnType<typeof vi.fn>;
const createMypaceClientMock = createMypaceClient as unknown as ReturnType<typeof vi.fn>;

function pubkeyHex(seed: string): string {
  return seed.padEnd(64, "0").slice(0, 64);
}

function npubFor(seed: string): string {
  return encodeNpub(hexToBytes(pubkeyHex(seed)));
}

function makeEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: "ev",
    pubkey: pubkeyHex("a"),
    created_at: 1000,
    kind: 1,
    tags: [
      ["t", "farm-in-pocket"],
      ["farm-action", "watering"],
    ],
    content: "test",
    sig: "sig",
    ...overrides,
  };
}

function mockGetProfiles(profiles: Record<string, NostrProfile>): void {
  createMypaceClientMock.mockReturnValue({
    getProfiles: vi.fn(async () => profiles),
  });
}

beforeEach(() => {
  queryRelaysMock.mockReset();
  createMypaceClientMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchOtherFarm", () => {
  it("不正な npub は null を返す（リレーを叩かない）", async () => {
    const result = await fetchOtherFarm("not-an-npub");
    expect(result).toBeNull();
    expect(queryRelaysMock).not.toHaveBeenCalled();
  });

  it("成功時は profile + events を created_at 降順で返す", async () => {
    const pk = pubkeyHex("aaaa");
    const npub = encodeNpub(hexToBytes(pk));
    queryRelaysMock.mockResolvedValue({
      events: [
        makeEvent({ id: "old", pubkey: pk, created_at: 100, content: "old" }),
        makeEvent({ id: "new", pubkey: pk, created_at: 200, content: "new" }),
        makeEvent({ id: "mid", pubkey: pk, created_at: 150, content: "mid" }),
      ],
      errors: [],
    });
    mockGetProfiles({
      [pk]: { display_name: "Other Farmer", about: "hi" },
    });

    const result = await fetchOtherFarm(npub);
    expect(result).not.toBeNull();
    expect(result?.pubkey).toBe(pk);
    expect(result?.npub).toBe(npub);
    expect(result?.profile?.display_name).toBe("Other Farmer");
    expect(result?.events.map((e) => e.id)).toEqual(["new", "mid", "old"]);
    expect(result?.relayErrors).toEqual([]);
  });

  it("profile 取得失敗時は profile=null フォールバックで続行", async () => {
    const npub = npubFor("bbbb");
    queryRelaysMock.mockResolvedValue({
      events: [makeEvent({ id: "e1", pubkey: pubkeyHex("bbbb") })],
      errors: [],
    });
    createMypaceClientMock.mockReturnValue({
      getProfiles: vi.fn(async () => {
        throw new Error("network down");
      }),
    });

    const result = await fetchOtherFarm(npub);
    expect(result?.profile).toBeNull();
    expect(result?.events).toHaveLength(1);
  });

  it("全リレー失敗時は events=[] + relayErrors を返す", async () => {
    const npub = npubFor("cccc");
    queryRelaysMock.mockResolvedValue({
      events: [],
      errors: [
        { relay: "wss://a", error: "timeout" },
        { relay: "wss://b", error: "ws closed" },
      ],
    });
    mockGetProfiles({});

    const result = await fetchOtherFarm(npub);
    expect(result?.events).toEqual([]);
    expect(result?.relayErrors).toHaveLength(2);
  });

  it("limit を queryRelays.filter.limit にそのまま渡す", async () => {
    const npub = npubFor("dddd");
    queryRelaysMock.mockResolvedValue({ events: [], errors: [] });
    mockGetProfiles({});

    await fetchOtherFarm(npub, 25);
    const callArg = queryRelaysMock.mock.calls[0]?.[0];
    expect(callArg?.filter?.limit).toBe(25);
    expect(callArg?.filter?.kinds).toEqual([1]);
    expect(callArg?.filter?.["#t"]).toEqual(["farm-in-pocket"]);
    expect(callArg?.filter?.authors).toEqual([pubkeyHex("dddd")]);
  });
});

describe("findTagValue / findImageUrls", () => {
  it("findTagValue: 一致する最初のタグの 2 要素目を返す", () => {
    const tags = [
      ["t", "farm-in-pocket"],
      ["farm-action", "watering"],
      ["farm-crop", "tomato"],
    ];
    expect(findTagValue(tags, "farm-action")).toBe("watering");
    expect(findTagValue(tags, "farm-crop")).toBe("tomato");
    expect(findTagValue(tags, "missing")).toBeNull();
  });

  it("findImageUrls: image タグの URL を順に集める", () => {
    const tags = [
      ["t", "farm-in-pocket"],
      ["image", "https://x/1.png"],
      ["image", "https://x/2.png"],
      ["image", ""], // 空文字は除外
    ];
    expect(findImageUrls(tags)).toEqual(["https://x/1.png", "https://x/2.png"]);
  });
});
