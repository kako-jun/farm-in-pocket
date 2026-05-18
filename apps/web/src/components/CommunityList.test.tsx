// Issue: kako-jun/farm-in-pocket#18
// CommunityList のローディング・空状態・エラー状態・バナーあり/なしを検証する。

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/community", async () => {
  const actual = await vi.importActual<typeof import("../lib/community")>("../lib/community");
  return {
    ...actual,
    fetchFarmInPocketUsers: vi.fn(),
  };
});

import { type CommunityUser, fetchFarmInPocketUsers } from "../lib/community";
import CommunityList from "./CommunityList";

const fetchMock = fetchFarmInPocketUsers as unknown as ReturnType<typeof vi.fn>;

function makeUser(overrides: Partial<CommunityUser> = {}): CommunityUser {
  return {
    pubkey: "pk1",
    npub: "npub1aaaaaa",
    profile: { display_name: "Alice" },
    latestEvent: {
      id: "ev1",
      content: "今日も水やり",
      action: "watering",
      crop: "トマト",
      milestone: null,
      created_at: Math.floor(Date.now() / 1000) - 3600,
    },
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CommunityList", () => {
  it("ローディング → ユーザーリストを表示する", async () => {
    fetchMock.mockResolvedValue({ users: [makeUser()], relayErrors: [] });
    render(<CommunityList />);
    expect(screen.getByTestId("community-loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("community-list")).toBeInTheDocument();
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // 作業アイコン + ラベル + crop
    expect(screen.getByText(/水やり/)).toBeInTheDocument();
    expect(screen.getByText(/トマト/)).toBeInTheDocument();
  });

  it("ユーザー 0 件なら空状態を表示する", async () => {
    fetchMock.mockResolvedValue({ users: [], relayErrors: [] });
    render(<CommunityList />);
    await waitFor(() => {
      expect(screen.getByTestId("community-empty")).toBeInTheDocument();
    });
  });

  it("fetch が reject ならエラー状態を表示する", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    render(<CommunityList />);
    await waitFor(() => {
      expect(screen.getByTestId("community-error")).toBeInTheDocument();
    });
  });

  it("banner があるユーザーは data-has-banner=true で描画する", async () => {
    fetchMock.mockResolvedValue({
      users: [
        makeUser({
          profile: { banner: "https://example.com/b.png", display_name: "Bob" },
        }),
      ],
      relayErrors: [],
    });
    render(<CommunityList />);
    await waitFor(() => {
      expect(screen.getByTestId("community-list")).toBeInTheDocument();
    });
    const banner = screen.getByTestId("community-banner");
    expect(banner.getAttribute("data-has-banner")).toBe("true");
    expect(banner.getAttribute("style")).toContain("https://example.com/b.png");
  });

  it("banner が無いユーザーはグラデフォールバックを使う", async () => {
    fetchMock.mockResolvedValue({
      users: [makeUser({ profile: { display_name: "Carol" } })],
      relayErrors: [],
    });
    render(<CommunityList />);
    await waitFor(() => {
      expect(screen.getByTestId("community-list")).toBeInTheDocument();
    });
    const banner = screen.getByTestId("community-banner");
    expect(banner.getAttribute("data-has-banner")).toBe("false");
    // background-image style はセットされない
    expect(banner.getAttribute("style")).toBeFalsy();
  });
});
