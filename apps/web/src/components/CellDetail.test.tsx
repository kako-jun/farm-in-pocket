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

// Issue #24: /ph はテストごとに明示しなくても reloadPh の catch で空配列に倒れるが、
// 念のため console.warn は黙らせる（fetchCellPh の warn ログだけ）。
let warnSpy: ReturnType<typeof vi.spyOn> | null = null;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
    /* noop */
  });
});
afterEach(() => {
  warnSpy?.mockRestore();
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

  // -------------------------------------------------------------------------
  // Issue #24: 土壌 pH セクション
  // -------------------------------------------------------------------------

  it("pH 取得結果から最新値と直近 10 件のリストが表示される", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/ph(\?|$)/.test(u),
      response: {
        records: [
          { id: 1, cellId: 11, measuredAt: "2026-04-01", value: 5.5, note: null },
          { id: 2, cellId: 11, measuredAt: "2026-04-15", value: 6.0, note: null },
          { id: 3, cellId: 11, measuredAt: "2026-05-17", value: 6.5, note: "雨上がり" },
        ],
      },
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-ph-current")).toBeInTheDocument();
    });
    // 最新値は末尾 (measured_at 昇順なので 6.5)
    expect(screen.getByTestId("fip-cell-detail-ph-current").textContent).toContain("6.5");
    expect(screen.getByTestId("fip-cell-detail-ph-current-date").textContent).toContain(
      "2026-05-17",
    );
    // リストに 3 件出る
    expect(screen.getByTestId("fip-cell-detail-ph-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("fip-cell-detail-ph-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("fip-cell-detail-ph-row-3")).toBeInTheDocument();
    // Issue #26: 最新行（id=3）と最古行（id=1）で opacity が異なる（古いほど薄い）。
    // 実日時依存を避けるため両者の相対関係だけ検証する。
    const newest = screen.getByTestId("fip-cell-detail-ph-row-3");
    const oldest = screen.getByTestId("fip-cell-detail-ph-row-1");
    const newOp = Number(newest.getAttribute("data-fade-opacity"));
    const oldOp = Number(oldest.getAttribute("data-fade-opacity"));
    expect(newOp).toBeGreaterThanOrEqual(oldOp);
    expect(newOp).toBeGreaterThan(0);
    expect(oldOp).toBeGreaterThan(0);
    // グラフが描画されている (3 件)
    expect(screen.getByTestId("fip-ph-chart")).toBeInTheDocument();
  });

  it("「pH 測定を記録」→ フォーム表示 → 保存で POST /ph が呼ばれる", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u, i) => /\/cells\/1\/2\/ph(\?|$)/.test(u) && (i?.method ?? "GET") === "GET",
      response: { records: [] },
    });
    routes.push({
      match: (u, i) => /\/cells\/1\/2\/ph$/.test(u) && i?.method === "POST",
      response: {
        record: {
          id: 100,
          cellId: 11,
          measuredAt: "2026-05-17",
          value: 6.8,
          note: "テスト",
        },
      },
      status: 201,
    });
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-ph-current")).toBeInTheDocument();
    });
    // 未測定の状態
    expect(screen.getByTestId("fip-cell-detail-ph-current").textContent).toContain("未測定");

    await user.click(screen.getByTestId("fip-cell-detail-ph-open"));
    expect(screen.getByTestId("fip-cell-detail-ph-form")).toBeInTheDocument();

    const valueInput = screen.getByTestId("fip-cell-detail-ph-value") as HTMLInputElement;
    // デフォルト "6.5" を消して 6.8 を入れる
    await user.clear(valueInput);
    await user.type(valueInput, "6.8");
    await user.type(screen.getByTestId("fip-cell-detail-ph-note"), "テスト");
    await user.click(screen.getByTestId("fip-cell-detail-ph-submit"));

    await waitFor(() => {
      const post = fetchCalls.find((c) => c.method === "POST" && /\/cells\/1\/2\/ph$/.test(c.url));
      expect(post).toBeDefined();
      const body = JSON.parse(post?.body ?? "{}");
      expect(body.pubkey).toBe(PUBKEY);
      expect(body.value).toBeCloseTo(6.8, 5);
      expect(body.note).toBe("テスト");
      expect(typeof body.measuredAt).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // Issue #25: 養分タイムライン セクション
  // -------------------------------------------------------------------------

  it("養分タイムライン取得結果から N/P/K 最終投入日とチャートが表示される", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/ph(\?|$)/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/nutrients(\?|$)/.test(u),
      response: {
        records: [
          {
            id: 1,
            cellId: 11,
            appliedAt: "2026-04-01",
            nutrientType: "nitrogen",
            materialId: null,
            amount: 30,
            amountUnit: "g",
            note: null,
          },
          {
            id: 2,
            cellId: 11,
            appliedAt: "2026-04-20",
            nutrientType: "phosphorus",
            materialId: null,
            amount: 15,
            amountUnit: "g",
            note: null,
          },
          {
            id: 3,
            cellId: 11,
            appliedAt: "2026-05-10",
            nutrientType: "nitrogen",
            materialId: null,
            amount: 20,
            amountUnit: "g",
            note: null,
          },
        ],
      },
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-nutrient-summary")).toBeInTheDocument();
    });
    // N (nitrogen) の最終投入日は 2026-05-10
    expect(screen.getByTestId("fip-cell-detail-nutrient-summary-nitrogen").textContent).toContain(
      "2026-05-10",
    );
    // P (phosphorus) の最終投入日は 2026-04-20
    expect(screen.getByTestId("fip-cell-detail-nutrient-summary-phosphorus").textContent).toContain(
      "2026-04-20",
    );
    // K (potassium) は投入がないので「未投入」
    expect(screen.getByTestId("fip-cell-detail-nutrient-summary-potassium").textContent).toContain(
      "未投入",
    );
    // チャートが描画される
    expect(screen.getByTestId("fip-nutrient-chart")).toBeInTheDocument();
    // 投入点 3 個
    expect(screen.getByTestId("fip-nutrient-chart-point-0")).toBeInTheDocument();
    expect(screen.getByTestId("fip-nutrient-chart-point-1")).toBeInTheDocument();
    expect(screen.getByTestId("fip-nutrient-chart-point-2")).toBeInTheDocument();
  });

  it("養分タイムラインが 0 件なら N/P/K すべて「未投入」と表示しチャートは placeholder を出す", async () => {
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: { nutrients: [], pesticides: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/ph(\?|$)/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/nutrients(\?|$)/.test(u),
      response: { records: [] },
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-nutrient-summary")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-cell-detail-nutrient-summary-nitrogen").textContent).toContain(
      "未投入",
    );
    expect(screen.getByTestId("fip-cell-detail-nutrient-summary-phosphorus").textContent).toContain(
      "未投入",
    );
    expect(screen.getByTestId("fip-cell-detail-nutrient-summary-potassium").textContent).toContain(
      "未投入",
    );
    // 0 件 placeholder
    expect(screen.getByTestId("fip-nutrient-chart-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("fip-nutrient-chart")).toBeNull();
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

  // -------------------------------------------------------------------------
  // Issue #26: 経過時間フェード
  // -------------------------------------------------------------------------

  it("Issue #26: 古い施肥履歴行ほど opacity が低くフェードする", async () => {
    const oldDate = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const newDate = new Date(Date.now() - 1 * 86_400_000).toISOString();
    routes.push({
      match: (u) => /\/cells\/1\/2\/records/.test(u),
      response: {
        nutrients: [
          {
            id: 200,
            cellId: 11,
            nutrientType: "nitrogen",
            amount: 5,
            amountUnit: "g",
            appliedAt: newDate,
            note: null,
          },
          {
            id: 201,
            cellId: 11,
            nutrientType: "potassium",
            amount: 3,
            amountUnit: "g",
            appliedAt: oldDate,
            note: null,
          },
        ],
        pesticides: [],
      },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/history/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/cells\/1\/2\/ph(\?|$)/.test(u),
      response: { records: [] },
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId("fip-cell-detail-history-nutrient-200")).toBeInTheDocument();
    });
    const newRow = screen.getByTestId("fip-cell-detail-history-nutrient-200");
    const oldRow = screen.getByTestId("fip-cell-detail-history-nutrient-201");
    const newOp = Number(newRow.getAttribute("data-fade-opacity"));
    const oldOp = Number(oldRow.getAttribute("data-fade-opacity"));
    // 新しい行 (1 日前) は plateau 1.0、古い行 (90 日前) は 0.15 付近
    expect(newOp).toBeCloseTo(1.0, 1);
    expect(oldOp).toBeLessThan(0.3);
    expect(oldOp).toBeGreaterThan(0);
  });
});
