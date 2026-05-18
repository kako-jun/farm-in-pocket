// Issue: kako-jun/farm-in-pocket#38
// PlantDetail: 植物情報 / 関連 seed_products / 育てているユーザーの表示を検証する。

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/grid-api", async () => {
  const actual = await vi.importActual<typeof import("../lib/grid-api")>("../lib/grid-api");
  return {
    ...actual,
    fetchPlant: vi.fn(),
    fetchPlantSeedProducts: vi.fn(),
    fetchPlantUsers: vi.fn(),
    // Issue #39: PlantDetail 下部に RankingList が並ぶ。テストでは空配列で安定させる。
    fetchRanking: vi.fn(async (slug: string) => ({ slug, entries: [] })),
    voteRanking: vi.fn(),
  };
});

vi.mock("../lib/mypace", () => ({
  createMypaceClient: vi.fn(() => ({
    getProfiles: vi.fn(async () => ({})),
  })),
}));

vi.mock("../lib/keys", () => ({
  getMyKeyPair: vi.fn(() => null),
}));

import { fetchPlant, fetchPlantSeedProducts, fetchPlantUsers } from "../lib/grid-api";
import { createMypaceClient } from "../lib/mypace";
import PlantDetail from "./PlantDetail";

const mockFetchPlant = fetchPlant as unknown as ReturnType<typeof vi.fn>;
const mockFetchProducts = fetchPlantSeedProducts as unknown as ReturnType<typeof vi.fn>;
const mockFetchUsers = fetchPlantUsers as unknown as ReturnType<typeof vi.fn>;
const mockCreateClient = createMypaceClient as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetchPlant.mockReset();
  mockFetchProducts.mockReset();
  mockFetchUsers.mockReset();
  mockCreateClient.mockReturnValue({
    getProfiles: vi.fn(async () => ({})),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PlantDetail", () => {
  it("植物情報（名前・科・タグ・説明）を描画する", async () => {
    mockFetchPlant.mockResolvedValue({
      id: 1,
      name: "トマト",
      nameEn: "Tomato",
      family: "ナス科",
      category: "vegetable",
      genus: "Solanum",
      tags: ["夏野菜", "定番"],
      description: "南米原産のナス科。",
      thumbnailUrl: null,
    });
    mockFetchProducts.mockResolvedValue([]);
    mockFetchUsers.mockResolvedValue([]);

    render(<PlantDetail plantId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("fip-plant-detail")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-plant-detail-name").textContent).toBe("トマト");
    expect(screen.getByTestId("fip-plant-detail-family").textContent).toBe("ナス科");
    expect(screen.getByTestId("fip-plant-detail-genus").textContent).toBe("Solanum");
    expect(screen.getByTestId("fip-plant-detail-tags").textContent).toContain("夏野菜");
    expect(screen.getByTestId("fip-plant-detail-description").textContent).toContain("南米原産");
    // 「マイ畑に植える」リンクが /grid?plantId=1 を指す
    expect(screen.getByTestId("fip-plant-detail-plant-to-my-grid")).toHaveAttribute(
      "href",
      "/grid?plantId=1",
    );
  });

  it("育てているユーザー一覧を描画する（mypace プロフィールは空でも pubkey 短縮表示）", async () => {
    mockFetchPlant.mockResolvedValue({
      id: 2,
      name: "バジル",
      nameEn: "Basil",
      family: "シソ科",
      category: "herb",
      genus: null,
      tags: [],
      description: null,
      thumbnailUrl: null,
    });
    mockFetchProducts.mockResolvedValue([]);
    mockFetchUsers.mockResolvedValue([
      { pubkey: "a".repeat(64), plantingCount: 3, lastPlantedAt: "2026-04-01" },
      { pubkey: "b".repeat(64), plantingCount: 1, lastPlantedAt: null },
    ]);

    render(<PlantDetail plantId={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("fip-plant-detail-users")).toBeInTheDocument();
    });
    expect(screen.getByTestId(`fip-plant-detail-user-${"a".repeat(64)}`)).toBeInTheDocument();
    expect(screen.getByTestId(`fip-plant-detail-user-${"b".repeat(64)}`)).toBeInTheDocument();
    // 件数バッジ
    expect(screen.getByText(/3件/)).toBeInTheDocument();
  });

  it("関連する種・苗を描画する（0 件のときは空状態を出す）", async () => {
    mockFetchPlant.mockResolvedValue({
      id: 3,
      name: "きゅうり",
      nameEn: "Cucumber",
      family: "ウリ科",
      category: "vegetable",
      genus: null,
      tags: [],
      description: null,
      thumbnailUrl: null,
    });
    mockFetchProducts.mockResolvedValue([
      {
        id: 100,
        name: "夏すずみ種",
        brand: "タキイ",
        plantId: 3,
        plantName: "きゅうり",
        type: "seed",
        thumbnailUrl: null,
        affiliateLinks: null,
        useCount: 5,
        userCount: 2,
      },
    ]);
    mockFetchUsers.mockResolvedValue([]);

    render(<PlantDetail plantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId("fip-plant-detail-products")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-plant-detail-product-100").textContent).toContain("夏すずみ種");
    expect(screen.getByTestId("fip-plant-detail-users-empty")).toBeInTheDocument();
  });
});
