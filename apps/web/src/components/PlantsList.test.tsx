// Issue: kako-jun/farm-in-pocket#38
// PlantsList: 一覧の表示・検索クエリ反映・カテゴリ/科フィルタの引き渡しを検証する。

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/grid-api", async () => {
  const actual = await vi.importActual<typeof import("../lib/grid-api")>("../lib/grid-api");
  return {
    ...actual,
    searchPlantsAdvanced: vi.fn(),
  };
});

import { searchPlantsAdvanced } from "../lib/grid-api";
import PlantsList from "./PlantsList";

const mockSearch = searchPlantsAdvanced as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSearch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PlantsList", () => {
  it("初回マウントで searchPlantsAdvanced を呼んでカードを描画する", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "トマト", nameEn: "Tomato", family: "ナス科", category: "vegetable" },
      { id: 2, name: "バジル", nameEn: "Basil", family: "シソ科", category: "herb" },
    ]);
    render(<PlantsList />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-plants-list-grid")).toBeInTheDocument();
    });
    expect(screen.getByText("トマト")).toBeInTheDocument();
    expect(screen.getByText("バジル")).toBeInTheDocument();
    expect(screen.getByTestId("fip-plants-list-card-1")).toHaveAttribute("href", "/plants/1");
  });

  it("検索 input に文字を入れると q 付きで再検索される（デバウンス後）", async () => {
    mockSearch.mockResolvedValue([]);
    render(<PlantsList />);
    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalled();
    });

    const input = screen.getByTestId("fip-plants-list-q") as HTMLInputElement;
    // React テスト: input.value 変更 → onChange 発火
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "トマト" } });

    await waitFor(
      () => {
        const lastCall = mockSearch.mock.calls.at(-1)?.[0];
        expect(lastCall?.q).toBe("トマト");
      },
      { timeout: 1000 },
    );
  });

  it("カテゴリと科の select を変えると params に反映される", async () => {
    mockSearch.mockResolvedValue([]);
    render(<PlantsList />);
    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalled();
    });

    const { fireEvent } = await import("@testing-library/react");
    const categorySelect = screen.getByTestId("fip-plants-list-category") as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: "herb" } });
    const familySelect = screen.getByTestId("fip-plants-list-family") as HTMLSelectElement;
    fireEvent.change(familySelect, { target: { value: "シソ科" } });

    await waitFor(
      () => {
        const lastCall = mockSearch.mock.calls.at(-1)?.[0];
        expect(lastCall?.category).toBe("herb");
        expect(lastCall?.family).toBe("シソ科");
      },
      { timeout: 1000 },
    );
  });
});
