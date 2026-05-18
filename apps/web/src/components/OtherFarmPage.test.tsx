// Issue: kako-jun/farm-in-pocket#19
// OtherFarmPage: not-found / プロフィール / タイムライン / follow ボタン状態 / Stella placeholder

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NostrEvent } from "@farm-in-pocket/shared";

vi.mock("../lib/other-farm", async () => {
  const actual = await vi.importActual<typeof import("../lib/other-farm")>("../lib/other-farm");
  return {
    ...actual,
    fetchOtherFarm: vi.fn(),
  };
});

vi.mock("../lib/follow", () => ({
  getMyContacts: vi.fn(),
  followPubkey: vi.fn(),
  unfollowPubkey: vi.fn(),
}));

vi.mock("../lib/keys", () => ({
  getMyKeyPair: vi.fn(),
}));

import { followPubkey, getMyContacts, unfollowPubkey } from "../lib/follow";
import { getMyKeyPair } from "../lib/keys";
import { type OtherFarmData, fetchOtherFarm } from "../lib/other-farm";
import OtherFarmPage from "./OtherFarmPage";

const fetchMock = fetchOtherFarm as unknown as ReturnType<typeof vi.fn>;
const getMyKeyPairMock = getMyKeyPair as unknown as ReturnType<typeof vi.fn>;
const getMyContactsMock = getMyContacts as unknown as ReturnType<typeof vi.fn>;
const followMock = followPubkey as unknown as ReturnType<typeof vi.fn>;
const unfollowMock = unfollowPubkey as unknown as ReturnType<typeof vi.fn>;

function pubkeyHex(seed: string): string {
  return seed.padEnd(64, "0").slice(0, 64);
}

function makeEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: "ev",
    pubkey: pubkeyHex("a"),
    created_at: Math.floor(Date.now() / 1000) - 3600,
    kind: 1,
    tags: [
      ["t", "farm-in-pocket"],
      ["farm-action", "watering"],
      ["farm-crop", "トマト"],
    ],
    content: "今日は水やり",
    sig: "sig",
    ...overrides,
  };
}

function makeData(overrides: Partial<OtherFarmData> = {}): OtherFarmData {
  return {
    pubkey: pubkeyHex("aaaa"),
    npub: "npub1aaaa",
    profile: { display_name: "Alice", about: "ベランダ農家" },
    events: [makeEvent({ id: "ev1" })],
    relayErrors: [],
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  getMyKeyPairMock.mockReset();
  getMyContactsMock.mockReset();
  followMock.mockReset();
  unfollowMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OtherFarmPage", () => {
  it("不正な npub 相当（fetchOtherFarm が null）は not-found を表示", async () => {
    fetchMock.mockResolvedValue(null);
    getMyKeyPairMock.mockReturnValue(null);
    render(<OtherFarmPage npub="not-an-npub" />);
    await waitFor(() => {
      expect(screen.getByTestId("other-not-found")).toBeInTheDocument();
    });
  });

  it("ready 時にプロフィール（表示名・about・npub）を表示する", async () => {
    fetchMock.mockResolvedValue(
      makeData({
        profile: {
          display_name: "Bob",
          about: "プロ農家",
          picture: "https://x/p.png",
          banner: "https://x/b.png",
        },
      }),
    );
    getMyKeyPairMock.mockReturnValue(null);
    render(<OtherFarmPage npub="npub1aaaa" />);
    await waitFor(() => {
      expect(screen.getByTestId("other-farm-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("other-display-name").textContent).toBe("Bob");
    expect(screen.getByTestId("other-about").textContent).toBe("プロ農家");
    const banner = screen.getByTestId("other-banner");
    expect(banner.getAttribute("data-has-banner")).toBe("true");
    expect(screen.getByTestId("other-picture")).toBeInTheDocument();
  });

  it("タイムラインに複数の event を新しい順で表示する", async () => {
    const now = Math.floor(Date.now() / 1000);
    fetchMock.mockResolvedValue(
      makeData({
        events: [
          makeEvent({ id: "e3", created_at: now - 100, content: "三番目" }),
          makeEvent({ id: "e2", created_at: now - 200, content: "二番目" }),
          makeEvent({ id: "e1", created_at: now - 300, content: "一番目" }),
        ],
      }),
    );
    getMyKeyPairMock.mockReturnValue(null);
    render(<OtherFarmPage npub="npub1aaaa" />);
    await waitFor(() => {
      expect(screen.getByTestId("other-timeline")).toBeInTheDocument();
    });
    const items = screen.getAllByTestId("other-timeline-item");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("三番目");
    expect(items[2]?.textContent).toContain("一番目");
  });

  it("鍵未保存時は Follow ボタンが disabled / data-state=no-key", async () => {
    fetchMock.mockResolvedValue(makeData());
    getMyKeyPairMock.mockReturnValue(null);
    render(<OtherFarmPage npub="npub1aaaa" />);
    await waitFor(() => {
      expect(screen.getByTestId("other-follow-btn")).toBeInTheDocument();
    });
    const btn = screen.getByTestId("other-follow-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("data-state")).toBe("no-key");
  });

  it("鍵保存時は follow toggle で followPubkey / unfollowPubkey を呼ぶ", async () => {
    fetchMock.mockResolvedValue(makeData());
    const myPubkey = pubkeyHex("self");
    getMyKeyPairMock.mockReturnValue({
      secretKey: new Uint8Array(32),
      pubkey: myPubkey,
      npub: "npub1self",
      nsec: "nsec1self",
    });
    // 初期は未 follow
    getMyContactsMock.mockResolvedValue([]);
    followMock.mockResolvedValue(undefined);
    unfollowMock.mockResolvedValue(undefined);

    render(<OtherFarmPage npub="npub1aaaa" />);
    // ready & not-following まで待つ
    await waitFor(() => {
      const btn = screen.getByTestId("other-follow-btn");
      expect(btn.getAttribute("data-state")).toBe("not-following");
    });

    // Follow クリック
    fireEvent.click(screen.getByTestId("other-follow-btn"));
    await waitFor(() => {
      expect(followMock).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(screen.getByTestId("other-follow-btn").getAttribute("data-state")).toBe("following");
    });

    // もう一度クリック → unfollow
    fireEvent.click(screen.getByTestId("other-follow-btn"));
    await waitFor(() => {
      expect(unfollowMock).toHaveBeenCalledOnce();
    });
  });

  it("farm-milestone タグ付き event は強調枠 + バッジで表示される (Issue #27)", async () => {
    const now = Math.floor(Date.now() / 1000);
    fetchMock.mockResolvedValue(
      makeData({
        events: [
          makeEvent({
            id: "milestone",
            created_at: now - 100,
            content: "今年初収穫！",
            tags: [
              ["t", "farm-in-pocket"],
              ["farm-action", "harvest"],
              ["farm-crop", "トマト"],
              ["farm-milestone", "harvest_complete"],
            ],
          }),
          makeEvent({ id: "normal", created_at: now - 200, content: "通常の水やり" }),
        ],
      }),
    );
    getMyKeyPairMock.mockReturnValue(null);
    render(<OtherFarmPage npub="npub1aaaa" />);
    await waitFor(() => {
      expect(screen.getByTestId("other-timeline")).toBeInTheDocument();
    });
    const items = screen.getAllByTestId("other-timeline-item");
    // 1 件目 (milestone) は data-milestone 属性付き
    expect(items[0]?.getAttribute("data-milestone")).toBe("harvest_complete");
    // 2 件目 (normal) は data-milestone なし
    expect(items[1]?.getAttribute("data-milestone")).toBeNull();
    // バッジは1個だけ
    const badges = screen.getAllByTestId("other-timeline-milestone-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toContain("収穫完了");
  });

  it("Stella placeholder が 5 個並び、全て disabled で tooltip 用 title が付く", async () => {
    fetchMock.mockResolvedValue(makeData());
    getMyKeyPairMock.mockReturnValue(null);
    render(<OtherFarmPage npub="npub1aaaa" />);
    await waitFor(() => {
      expect(screen.getByTestId("other-timeline")).toBeInTheDocument();
    });
    const placeholder = screen.getByTestId("other-stella-placeholder");
    expect(placeholder.getAttribute("title")).toContain("#27");
    const buttons = placeholder.querySelectorAll("button");
    expect(buttons).toHaveLength(5);
    for (const b of Array.from(buttons)) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
