// CellDetail テスト (Issue kako-jun/farm-in-pocket#15)

import type { CellRecord, GridRecord } from "@farm-in-pocket/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CellDetail from "./CellDetail";

interface MockRoute {
  match: (url: string, init?: RequestInit) => boolean;
  response: unknown;
  status?: number;
}

let routes: MockRoute[] = [];
const fetchCalls: { url: string; method: string; body: string | null }[] = [];

function setupFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    fetchCalls.push({ url, method, body });
    for (const r of routes) {
      if (r.match(url, init)) {
        return new Response(JSON.stringify(r.response), {
          status: r.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "no route" }), { status: 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  routes = [];
  fetchCalls.length = 0;
  setupFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const PUBKEY = "a".repeat(64);

function gridFixture(): GridRecord {
  return {
    id: "g1",
    userPubkey: PUBKEY,
    name: "南プランター",
    environment: "outdoor_sunny",
    lighting: null,
    sizeX: 3,
    sizeY: 3,
    sortOrder: 0,
    cells: [],
  };
}

function cellFixture(over: Partial<CellRecord> = {}): CellRecord {
  return {
    id: 11,
    gridId: "g1",
    x: 1,
    y: 2,
    containerType: over.containerType ?? "planter",
    soilType: over.soilType ?? "potting_mix",
    currentPlantingId: over.currentPlantingId ?? 7,
    currentPlantId: over.currentPlantId ?? 1,
    currentPlantName: over.currentPlantName ?? "トマト",
    lastFertilizedAt: over.lastFertilizedAt ?? null,
    lastPesticideAt: over.lastPesticideAt ?? null,
    ...over,
  };
}

function renderDetail(
  overrides: {
    cell?: CellRecord | null;
    onChanged?: () => void;
    onEditContainer?: () => void;
    onEditSoil?: () => void;
    onPlant?: () => void;
    onSetVoid?: () => void;
    onClear?: () => void;
    onClose?: () => void;
  } = {},
): {
  onChanged: ReturnType<typeof vi.fn>;
  onEditContainer: ReturnType<typeof vi.fn>;
} {
  const onChanged = vi.fn();
  const onEditContainer = vi.fn();
  const onEditSoil = vi.fn();
  const onPlant = vi.fn();
  const onSetVoid = vi.fn();
  const onClear = vi.fn();
  const onClose = vi.fn();
  render(
    <CellDetail
      pubkey={PUBKEY}
      grid={gridFixture()}
      cell={overrides.cell === undefined ? cellFixture() : overrides.cell}
      cellX={1}
      cellY={2}
      onClose={overrides.onClose ?? onClose}
      onChanged={overrides.onChanged ?? onChanged}
      onEditContainer={overrides.onEditContainer ?? onEditContainer}
      onEditSoil={overrides.onEditSoil ?? onEditSoil}
      onPlant={overrides.onPlant ?? onPlant}
      onSetVoid={overrides.onSetVoid ?? onSetVoid}
      onClear={overrides.onClear ?? onClear}
    />,
  );
  return { onChanged, onEditContainer };
}

describe("CellDetail", () => {
  it("props で渡したセルの容器/用土/作物が表示される", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    renderDetail();
    // 初回 fetch (records) が解決して loading→render が完了するのを待つ。
    // act() warning を出さないため、ここで「読み込み中…」が消えるのを必ず待ってから assert する。
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-history-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-cell-detail-modal")).toBeInTheDocument();
    expect(screen.getByTestId("fip-cell-detail-container").textContent).toBe("プランター");
    expect(screen.getByTestId("fip-cell-detail-soil").textContent).toBe("培養土");
    // ヘッダーに作物名が出る
    expect(screen.getByTestId("fip-cell-detail-title").textContent).toContain("トマト");
    expect(screen.getByTestId("fip-cell-detail-title").textContent).toContain("(1, 2)");
  });

  it("履歴 fetch で nutrient / pesticide が混合表示される", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: {
        nutrients: [
          {
            id: 1,
            cellId: 11,
            appliedAt: "2026-05-15T03:00:00Z",
            nutrientType: "nitrogen",
            materialId: null,
            amount: 5,
            amountUnit: "g",
            note: null,
          },
        ],
        pesticides: [
          {
            id: 2,
            cellId: 11,
            appliedAt: "2026-05-16T03:00:00Z",
            pesticideType: "insecticide",
            materialId: null,
            targetTags: ["aphid"],
            amount: null,
            amountUnit: null,
            dilutionRatio: 1000,
            note: "アブラムシ対策",
          },
        ],
      },
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-history")).toBeInTheDocument();
    });
    // 両方の record が出ている
    expect(screen.getByTestId("fip-cell-detail-history-nutrient-1")).toBeInTheDocument();
    expect(screen.getByTestId("fip-cell-detail-history-pesticide-2")).toBeInTheDocument();
    // 日付は YYYY-MM-DD で出る
    expect(screen.getByTestId("fip-cell-detail-history-pesticide-2").textContent).toContain(
      "2026-05-16",
    );
    expect(screen.getByTestId("fip-cell-detail-history-pesticide-2").textContent).toContain(
      "1000倍",
    );
  });

  it("施肥ボタン → フォーム表示 → 保存で POST /nutrient が呼ばれる", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u, i) => /\/cells\/1\/2\/nutrient$/.test(u) && i?.method === "POST",
      response: {
        record: {
          id: 9,
          cellId: 11,
          appliedAt: "2026-05-18T00:00:00Z",
          nutrientType: "organic",
          materialId: null,
          amount: 10,
          amountUnit: null,
          note: null,
        },
      },
      status: 201,
    });
    const user = userEvent.setup();
    const { onChanged } = renderDetail();
    // 初回 fetch (records) を待ってから操作する (act() warning 回避)
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-history-empty")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("fip-cell-detail-quick-nutrient"));
    expect(screen.getByTestId("fip-cell-detail-nutrient-form")).toBeInTheDocument();
    const amount = screen.getByTestId("fip-cell-detail-nutrient-amount") as HTMLInputElement;
    await user.type(amount, "10");
    await user.click(screen.getByTestId("fip-cell-detail-nutrient-submit"));
    await waitFor(() => {
      const post = fetchCalls.find(
        (c) => c.method === "POST" && /\/cells\/1\/2\/nutrient$/.test(c.url),
      );
      expect(post).toBeDefined();
      const body = JSON.parse(post?.body ?? "{}");
      expect(body.pubkey).toBe(PUBKEY);
      expect(body.nutrientType).toBe("organic");
      expect(body.amount).toBe(10);
    });
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("農薬ボタン → フォーム表示 → 保存で POST /pesticide が呼ばれる", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u, i) => /\/cells\/1\/2\/pesticide$/.test(u) && i?.method === "POST",
      response: {
        record: {
          id: 12,
          cellId: 11,
          appliedAt: "2026-05-18T00:00:00Z",
          pesticideType: "insecticide",
          materialId: null,
          targetTags: null,
          amount: null,
          amountUnit: null,
          dilutionRatio: null,
          note: "テスト",
        },
      },
      status: 201,
    });
    const user = userEvent.setup();
    renderDetail();
    // 初回 fetch (records) を待ってから操作する (act() warning 回避)
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-history-empty")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("fip-cell-detail-quick-pesticide"));
    expect(screen.getByTestId("fip-cell-detail-pesticide-form")).toBeInTheDocument();
    await user.type(screen.getByTestId("fip-cell-detail-pesticide-note"), "テスト");
    await user.click(screen.getByTestId("fip-cell-detail-pesticide-submit"));
    await waitFor(() => {
      const post = fetchCalls.find(
        (c) => c.method === "POST" && /\/cells\/1\/2\/pesticide$/.test(c.url),
      );
      expect(post).toBeDefined();
      const body = JSON.parse(post?.body ?? "{}");
      expect(body.pubkey).toBe(PUBKEY);
      expect(body.pesticideType).toBe("insecticide");
      expect(body.note).toBe("テスト");
    });
  });

  it("「容器を変える」リンクで onEditContainer が呼ばれる (編集モーダルへの委譲)", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    const onEditContainer = vi.fn();
    const user = userEvent.setup();
    renderDetail({ onEditContainer });
    // 初回 fetch (records) を待ってからクリックする (act() warning 回避)
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-history-empty")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("fip-cell-detail-edit-container"));
    expect(onEditContainer).toHaveBeenCalled();
  });

  it("履歴が空なら「まだ記録がありません」を出す", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    renderDetail({ cell: null });
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-history-empty")).toBeInTheDocument();
    });
    // 容器/用土は「未設定」
    expect(screen.getByTestId("fip-cell-detail-container").textContent).toBe("未設定");
    expect(screen.getByTestId("fip-cell-detail-soil").textContent).toBe("未設定");
  });

  // -------------------------------------------------------------------------
  // Issue #22: 座標ベース連作履歴 (crop_history) セクション
  // -------------------------------------------------------------------------

  it("過去履歴が空なら「このセルでの過去履歴はまだありません」を出す", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-crop-history-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-cell-detail-crop-history-empty").textContent).toContain(
      "過去履歴はまだありません",
    );
  });

  it("過去履歴 fetch で年・季節・作物名・科 が一覧表示される", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: {
        records: [
          {
            id: 101,
            gridId: "g1",
            x: 1,
            y: 2,
            plantId: 10,
            plantName: "トマト",
            plantNameEn: "Tomato",
            plantFamily: "ナス科",
            year: 2026,
            season: "spring",
            plantedAt: "2026-04-01",
            endedAt: "2026-08-01",
          },
          {
            id: 102,
            gridId: "g1",
            x: 1,
            y: 2,
            plantId: 11,
            plantName: "バジル",
            plantNameEn: null,
            plantFamily: "シソ科",
            year: 2025,
            season: "summer",
            plantedAt: "2025-06-15",
            endedAt: null,
          },
        ],
      },
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-crop-history")).toBeInTheDocument();
    });
    const row1 = screen.getByTestId("fip-cell-detail-crop-history-101");
    expect(row1.textContent).toContain("2026年");
    expect(row1.textContent).toContain("春");
    expect(row1.textContent).toContain("トマト");
    expect(row1.textContent).toContain("ナス科");
    expect(row1.textContent).toContain("2026-08-01");
    const row2 = screen.getByTestId("fip-cell-detail-crop-history-102");
    expect(row2.textContent).toContain("2025年");
    expect(row2.textContent).toContain("夏");
    expect(row2.textContent).toContain("バジル");
    expect(row2.textContent).toContain("シソ科");
  });
});
