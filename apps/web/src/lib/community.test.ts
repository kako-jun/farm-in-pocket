// Issue: kako-jun/farm-in-pocket#18
// fetchFarmInPocketUsers の振る舞いを queryRelays / mypace getProfiles をモックして検証する。

import type { NostrEvent, NostrProfile } from "@farm-in-pocket/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// queryRelays / createMypaceClient を差し替えるための vi.mock。
// ESM の hoist 仕様に揃え、import より上で書く必要があるため top-level mock。
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

import { queryRelays } from "@farm-in-pocket/shared";
import {
  type CommunityUser,
  fetchFarmInPocketUsers,
  getBannerUrl,
  getDisplayName,
  getPictureUrl,
  relativeJa,
} from "./community";
import { createMypaceClient } from "./mypace";

const queryRelaysMock = queryRelays as unknown as ReturnType<typeof vi.fn>;
const createMypaceClientMock = createMypaceClient as unknown as ReturnType<typeof vi.fn>;

// 64 文字 hex の pubkey を作る（mypace.getProfiles は 64 文字以外を弾くため）
function pubkey(seed: string): string {
  // seed を repeat して 64 文字に揃える
  const base = seed.padEnd(64, "0").slice(0, 64);
  return base;
}

function makeEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: "ev",
    pubkey: pubkey("a"),
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

describe("fetchFarmInPocketUsers", () => {
  it("単一ユーザーを返す（プロフィール付き）", async () => {
    const pk = pubkey("aaaa");
    queryRelaysMock.mockResolvedValue({
      events: [makeEvent({ id: "ev1", pubkey: pk, created_at: 100 })],
      errors: [],
    });
    mockGetProfiles({
      [pk]: { display_name: "Tomato Grower", picture: "https://example.com/p.png" },
    });

    const result = await fetchFarmInPocketUsers();
    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.pubkey).toBe(pk);
    expect(result.users[0]?.profile?.display_name).toBe("Tomato Grower");
    expect(result.users[0]?.latestEvent.action).toBe("watering");
    expect(result.users[0]?.npub.startsWith("npub1")).toBe(true);
  });

  it("同一 pubkey で複数イベントなら最新 created_at の event を残す", async () => {
    const pk = pubkey("bbbb");
    queryRelaysMock.mockResolvedValue({
      events: [
        makeEvent({ id: "old", pubkey: pk, created_at: 100, content: "old" }),
        makeEvent({ id: "new", pubkey: pk, created_at: 200, content: "new" }),
      ],
      errors: [],
    });
    mockGetProfiles({});
    const result = await fetchFarmInPocketUsers();
    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.latestEvent.id).toBe("new");
    expect(result.users[0]?.latestEvent.content).toBe("new");
  });

  it("複数ユーザーを created_at 降順で返す", async () => {
    const pa = pubkey("aaaa");
    const pb = pubkey("bbbb");
    queryRelaysMock.mockResolvedValue({
      events: [
        makeEvent({ id: "e1", pubkey: pa, created_at: 100 }),
        makeEvent({ id: "e2", pubkey: pb, created_at: 200 }),
      ],
      errors: [],
    });
    mockGetProfiles({});
    const result = await fetchFarmInPocketUsers();
    expect(result.users.map((u) => u.pubkey)).toEqual([pb, pa]);
  });

  it("プロフィール取得が失敗しても profile=null で続行する", async () => {
    const pk = pubkey("cccc");
    queryRelaysMock.mockResolvedValue({
      events: [makeEvent({ id: "ev1", pubkey: pk, created_at: 100 })],
      errors: [],
    });
    createMypaceClientMock.mockReturnValue({
      getProfiles: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    const result = await fetchFarmInPocketUsers();
    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.profile).toBeNull();
  });

  it("リレーエラーは relayErrors に集約され、ユーザーが居れば返す", async () => {
    const pk = pubkey("dddd");
    queryRelaysMock.mockResolvedValue({
      events: [makeEvent({ id: "ev1", pubkey: pk })],
      errors: [{ relay: "wss://down", error: "timeout" }],
    });
    mockGetProfiles({});
    const result = await fetchFarmInPocketUsers();
    expect(result.users).toHaveLength(1);
    expect(result.relayErrors).toEqual([{ relay: "wss://down", error: "timeout" }]);
  });

  it("event が 0 件なら空配列を返し、mypace は呼ばない", async () => {
    queryRelaysMock.mockResolvedValue({ events: [], errors: [] });
    const result = await fetchFarmInPocketUsers();
    expect(result.users).toEqual([]);
    expect(createMypaceClientMock).not.toHaveBeenCalled();
  });

  it("farm-milestone タグから milestone が抽出される（Issue #27）", async () => {
    const pk = pubkey("eeee");
    queryRelaysMock.mockResolvedValue({
      events: [
        makeEvent({
          id: "milestone-ev",
          pubkey: pk,
          tags: [
            ["t", "farm-in-pocket"],
            ["farm-action", "harvest"],
            ["farm-milestone", "harvest_complete"],
          ],
        }),
      ],
      errors: [],
    });
    mockGetProfiles({});
    const result = await fetchFarmInPocketUsers();
    expect(result.users[0]?.latestEvent.milestone).toBe("harvest_complete");
  });

  it("不明な milestone 値は null に正規化される（Issue #27）", async () => {
    const pk = pubkey("ffff");
    queryRelaysMock.mockResolvedValue({
      events: [
        makeEvent({
          id: "bad-ev",
          pubkey: pk,
          tags: [
            ["t", "farm-in-pocket"],
            ["farm-action", "watering"],
            ["farm-milestone", "totally_made_up_value"],
          ],
        }),
      ],
      errors: [],
    });
    mockGetProfiles({});
    const result = await fetchFarmInPocketUsers();
    expect(result.users[0]?.latestEvent.milestone).toBeNull();
  });
});

describe("UI ヘルパ", () => {
  function user(profile: NostrProfile | null = null, npub = "npub1abcdefg"): CommunityUser {
    return {
      pubkey: "00",
      npub,
      profile,
      latestEvent: {
        id: "x",
        content: "",
        action: null,
        crop: null,
        milestone: null,
        created_at: 0,
      },
    };
  }

  it("getDisplayName は display_name → name → npub の順", () => {
    expect(getDisplayName(user({ display_name: "DN" }))).toBe("DN");
    expect(getDisplayName(user({ name: "n" }))).toBe("n");
    expect(getDisplayName(user(null, "npub1xxxxxxxxxxxxxx"))).toBe("npub1xxx");
  });

  it("getBannerUrl / getPictureUrl は文字列のみ返し、無ければ null", () => {
    expect(getBannerUrl(user(null))).toBeNull();
    expect(getBannerUrl(user({ banner: "" }))).toBeNull();
    expect(getBannerUrl(user({ banner: "https://x/b.png" }))).toBe("https://x/b.png");
    expect(getPictureUrl(user({ picture: "https://x/p.png" }))).toBe("https://x/p.png");
  });

  it("relativeJa は範囲ごとに文言を切り替える", () => {
    const now = 1_000_000;
    expect(relativeJa(now - 10, now)).toBe("たった今");
    expect(relativeJa(now - 120, now)).toBe("2分前");
    expect(relativeJa(now - 3600 * 3, now)).toBe("3時間前");
    expect(relativeJa(now - 86400 * 2, now)).toBe("2日前");
    // 30 日超は YYYY-MM-DD（中身は環境依存しないよう regex で確認）
    const old = relativeJa(now - 86400 * 60, now);
    expect(old).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
