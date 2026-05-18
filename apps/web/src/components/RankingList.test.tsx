// Issue: kako-jun/farm-in-pocket#39
// RankingList: 一覧表示・投票ボタン・auto-difficulty 表示を検証する。

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/grid-api", async () => {
  const actual = await vi.importActual<typeof import("../lib/grid-api")>("../lib/grid-api");
  return {
    ...actual,
    fetchRanking: vi.fn(),
    voteRanking: vi.fn(),
  };
});

vi.mock("../lib/keys", () => ({
  getMyKeyPair: vi.fn(),
}));

import { fetchRanking, voteRanking } from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";
import RankingList from "./RankingList";

const mockFetchRanking = fetchRanking as unknown as ReturnType<typeof vi.fn>;
const mockVoteRanking = voteRanking as unknown as ReturnType<typeof vi.fn>;
const mockGetMyKeyPair = getMyKeyPair as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetchRanking.mockReset();
  mockVoteRanking.mockReset();
  mockGetMyKeyPair.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RankingList", () => {
  it("投票テーマの entries を順位付きで描画する", async () => {
    mockGetMyKeyPair.mockReturnValue(null);
    mockFetchRanking.mockResolvedValue({
      slug: "fun-to-grow",
      entries: [
        { rank: 1, plantId: 10, score: 5, plantName: "トマト" },
        { rank: 2, plantId: 20, score: 3, plantName: "バジル" },
      ],
    });
    render(<RankingList slug="fun-to-grow" />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-ranking-fun-to-grow")).toBeInTheDocument();
    });
    expect(screen.getByText("トマト")).toBeInTheDocument();
    expect(screen.getByText("バジル")).toBeInTheDocument();
    expect(screen.getByText("5 票")).toBeInTheDocument();
    // 鍵未保有 → no-key 注意書きが出る
    expect(screen.getByTestId("fip-ranking-fun-to-grow-no-key")).toBeInTheDocument();
  });

  it("鍵がある場合、投票ボタンをクリックすると voteRanking が呼ばれて再取得される", async () => {
    mockGetMyKeyPair.mockReturnValue({
      pubkey: "abc",
      npub: "npub1...",
      nsec: "nsec1...",
      secretKey: new Uint8Array(32),
    });
    mockFetchRanking
      .mockResolvedValueOnce({
        slug: "beginner-friendly",
        entries: [{ rank: 1, plantId: 7, score: 2, plantName: "ミニトマト" }],
      })
      .mockResolvedValueOnce({
        slug: "beginner-friendly",
        entries: [{ rank: 1, plantId: 7, score: 3, plantName: "ミニトマト" }],
      });
    mockVoteRanking.mockResolvedValue({
      ok: true,
      slug: "beginner-friendly",
      plantId: 7,
      alreadyVoted: false,
      score: 3,
    });

    render(<RankingList slug="beginner-friendly" />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-ranking-beginner-friendly-vote-7")).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId("fip-ranking-beginner-friendly-vote-7"));
    await waitFor(() => {
      expect(mockVoteRanking).toHaveBeenCalledWith("beginner-friendly", 7, "abc");
    });
    await waitFor(() => {
      // 2 回目の fetchRanking で score=3 に更新される
      expect(screen.getByText("3 票")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-ranking-beginner-friendly-vote-msg")).toHaveTextContent(
      "投票しました！",
    );
  });

  it("auto-difficulty は failureRate を表示し、投票ボタンを出さない", async () => {
    mockGetMyKeyPair.mockReturnValue(null);
    mockFetchRanking.mockResolvedValue({
      slug: "auto-difficulty",
      entries: [
        { rank: 1, plantId: 99, plantName: "難しい花", total: 10, failed: 7, failureRate: 0.7 },
      ],
    });
    render(<RankingList slug="auto-difficulty" />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-ranking-auto-difficulty")).toBeInTheDocument();
    });
    expect(screen.getByText("難しい花")).toBeInTheDocument();
    expect(screen.getByText(/失敗率 70%/)).toBeInTheDocument();
    expect(screen.queryByTestId("fip-ranking-auto-difficulty-vote-99")).toBeNull();
  });
});
