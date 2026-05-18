import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGrid,
  createPlanting,
  deleteCell,
  deleteGrid,
  deletePlanting,
  fetchCellHistory,
  fetchCellNutrients,
  fetchCellPh,
  fetchCellRecords,
  listGrids,
  putCell,
  recordNutrient,
  recordPesticide,
  recordPh,
  searchPlants,
  updateGrid,
} from "./grid-api";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

const calls: FetchCall[] = [];

function mockFetch(json: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(json), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  calls.length = 0;
});

function first(): FetchCall {
  const c = calls[0];
  if (!c) throw new Error("no fetch call recorded");
  return c;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("grid-api", () => {
  it("listGrids は GET /api/grids?pubkey= を叩いて配列を返す", async () => {
    mockFetch({ grids: [{ id: "g1", cells: [] }] });
    const result = await listGrids("abc");
    expect(calls).toHaveLength(1);
    expect(first().url).toBe("/api/grids?pubkey=abc");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(result).toEqual([{ id: "g1", cells: [] }]);
  });

  it("createGrid は POST /api/grids に body を JSON で投げる", async () => {
    mockFetch({ grid: { id: "g2", cells: [] } });
    await createGrid({
      pubkey: "pk",
      name: "畑",
      environment: "outdoor_sunny",
      sizeX: 5,
      sizeY: 5,
    });
    expect(first().url).toBe("/api/grids");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ pubkey: "pk", environment: "outdoor_sunny", sizeX: 5 });
  });

  it("updateGrid は PATCH /api/grids/:id を叩いて warning フラグを返す（body に pubkey 添付）", async () => {
    mockFetch({ grid: { id: "g3", cells: [] }, cropHistoryResetWarning: true });
    const r = await updateGrid("g3", "pk", { sizeX: 6 });
    expect(first().url).toBe("/api/grids/g3");
    expect(first().init?.method).toBe("PATCH");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ sizeX: 6, pubkey: "pk" });
    expect(r.cropHistoryResetWarning).toBe(true);
  });

  it("deleteGrid は DELETE /api/grids/:id?pubkey= を叩く", async () => {
    mockFetch({ ok: true });
    await deleteGrid("g4", "pk");
    expect(first().url).toBe("/api/grids/g4?pubkey=pk");
    expect(first().init?.method).toBe("DELETE");
  });

  it("putCell は PUT /api/grids/:id/cells/:x/:y に body を投げる（pubkey 添付）", async () => {
    mockFetch({ cell: { id: 1, gridId: "g5", x: 1, y: 2 } });
    await putCell("g5", "pk", 1, 2, { containerType: "pot", soilType: "potting_mix" });
    expect(first().url).toBe("/api/grids/g5/cells/1/2");
    expect(first().init?.method).toBe("PUT");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({ containerType: "pot", soilType: "potting_mix", pubkey: "pk" });
  });

  it("deleteCell は DELETE /api/grids/:id/cells/:x/:y?pubkey= を叩く", async () => {
    mockFetch({ ok: true });
    await deleteCell("g6", "pk", 0, 0);
    expect(first().url).toBe("/api/grids/g6/cells/0/0?pubkey=pk");
    expect(first().init?.method).toBe("DELETE");
  });

  it("searchPlants は GET /api/plants?q= を叩く", async () => {
    mockFetch({
      plants: [
        { id: 1, name: "トマト", nameEn: "Tomato", family: "ナス科", category: "vegetable" },
      ],
    });
    const res = await searchPlants("トマト");
    expect(first().url).toBe(`/api/plants?q=${encodeURIComponent("トマト")}`);
    expect(res).toHaveLength(1);
  });

  it("createPlanting は POST /api/grids/:id/cells/:x/:y/plantings に投げる", async () => {
    mockFetch({
      ok: true,
      planting: {
        id: 7,
        cellId: 11,
        plantId: 1,
        seedingDate: "2026-05-17",
        plantingDate: null,
        note: null,
      },
    });
    const result = await createPlanting("g7", "pk", 2, 3, {
      plantId: 1,
      seedingDate: "2026-05-17",
    });
    expect(first().url).toBe("/api/grids/g7/cells/2/3/plantings");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ plantId: 1, pubkey: "pk" });
    if (!result.planted) throw new Error("expected planted=true");
    expect(result.planting.id).toBe(7);
  });

  // -------------------------------------------------------------------------
  // Issue #23: 連作障害警告
  // -------------------------------------------------------------------------

  it("createPlanting は API が rotation_warning を返すと planted=false で結果を返す", async () => {
    mockFetch({
      ok: false,
      error: "rotation_warning",
      rotationWarning: {
        family: "ナス科",
        lastPlantedAt: "2024-04-01",
        lastPlantName: "トマト",
        recommendedWaitYears: 4,
        yearsElapsed: 2.1,
      },
    });
    const result = await createPlanting("g7", "pk", 2, 3, {
      plantId: 1,
      confirmRotation: false,
    });
    // body に confirmRotation: false が乗っているか確認
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ plantId: 1, pubkey: "pk", confirmRotation: false });
    expect(result.planted).toBe(false);
    if (result.planted) throw new Error("expected planted=false");
    expect(result.rotationWarning.family).toBe("ナス科");
    expect(result.rotationWarning.recommendedWaitYears).toBe(4);
    expect(result.rotationWarning.lastPlantName).toBe("トマト");
  });

  it("createPlanting は警告が出ても confirmRotation: true なら planted=true + rotationWarning を返す", async () => {
    mockFetch({
      ok: true,
      planting: {
        id: 21,
        cellId: 11,
        plantId: 1,
        seedingDate: "2026-05-17",
        plantingDate: null,
        note: null,
      },
      rotationWarning: {
        family: "ナス科",
        lastPlantedAt: "2024-04-01",
        lastPlantName: "トマト",
        recommendedWaitYears: 4,
        yearsElapsed: 2.1,
      },
    });
    const result = await createPlanting("g7", "pk", 2, 3, {
      plantId: 1,
      confirmRotation: true,
    });
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ confirmRotation: true });
    if (!result.planted) throw new Error("expected planted=true");
    expect(result.planting.id).toBe(21);
    expect(result.rotationWarning?.family).toBe("ナス科");
  });

  it("deletePlanting は DELETE /api/plantings/:id?pubkey= を叩く", async () => {
    mockFetch({ ok: true });
    await deletePlanting(42, "pk");
    expect(first().url).toBe("/api/plantings/42?pubkey=pk");
    expect(first().init?.method).toBe("DELETE");
  });

  it("API エラー時は Error を throw する", async () => {
    mockFetch({ error: "invalid pubkey" }, 400);
    await expect(listGrids("nope")).rejects.toThrow(/invalid pubkey/);
  });

  // -------------------------------------------------------------------------
  // Issue #15: cell-actions ラッパー
  // -------------------------------------------------------------------------

  it("recordNutrient は POST /api/grids/:id/cells/:x/:y/nutrient に投げる", async () => {
    mockFetch({
      record: {
        id: 1,
        cellId: 11,
        appliedAt: "2026-05-18T00:00:00Z",
        nutrientType: "organic",
        materialId: null,
        amount: 5,
        amountUnit: "g",
        note: null,
      },
    });
    const rec = await recordNutrient("g1", "pk", 1, 2, {
      nutrientType: "organic",
      amount: 5,
      amountUnit: "g",
    });
    expect(first().url).toBe("/api/grids/g1/cells/1/2/nutrient");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ pubkey: "pk", nutrientType: "organic", amount: 5 });
    expect(rec.id).toBe(1);
  });

  it("recordPesticide は POST /api/grids/:id/cells/:x/:y/pesticide に投げる", async () => {
    mockFetch({
      record: {
        id: 2,
        cellId: 11,
        appliedAt: "2026-05-18T00:00:00Z",
        pesticideType: "insecticide",
        materialId: null,
        targetTags: null,
        amount: null,
        amountUnit: null,
        dilutionRatio: 1000,
        note: null,
      },
    });
    const rec = await recordPesticide("g1", "pk", 0, 1, {
      pesticideType: "insecticide",
      dilutionRatio: 1000,
      targetTags: ["aphid"],
    });
    expect(first().url).toBe("/api/grids/g1/cells/0/1/pesticide");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({
      pubkey: "pk",
      pesticideType: "insecticide",
      dilutionRatio: 1000,
    });
    expect(body.targetTags).toEqual(["aphid"]);
    expect(rec.dilutionRatio).toBe(1000);
  });

  it("fetchCellRecords は GET /api/grids/:id/cells/:x/:y/records?pubkey= を叩く", async () => {
    mockFetch({
      nutrients: [],
      pesticides: [],
    });
    const r = await fetchCellRecords("g1", "pk", 2, 3);
    expect(first().url).toBe("/api/grids/g1/cells/2/3/records?pubkey=pk");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(r.nutrients).toEqual([]);
    expect(r.pesticides).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Issue #22: 座標ベース連作履歴 (crop_history)
  // -------------------------------------------------------------------------

  it("fetchCellHistory は GET /api/grids/:id/cells/:x/:y/history?pubkey= を叩く", async () => {
    mockFetch({ records: [] });
    const r = await fetchCellHistory("g1", 2, 3, "pk");
    expect(first().url).toBe("/api/grids/g1/cells/2/3/history?pubkey=pk");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(r.records).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Issue #24: pH 測定記録
  // -------------------------------------------------------------------------

  it("recordPh は POST /api/grids/:id/cells/:x/:y/ph に value/measuredAt/note + pubkey を投げる", async () => {
    mockFetch({
      record: {
        id: 1,
        cellId: 11,
        measuredAt: "2026-05-17",
        value: 6.5,
        note: "雨上がり",
      },
    });
    const rec = await recordPh("g1", 2, 3, {
      pubkey: "pk",
      value: 6.5,
      measuredAt: "2026-05-17",
      note: "雨上がり",
    });
    expect(first().url).toBe("/api/grids/g1/cells/2/3/ph");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({
      pubkey: "pk",
      value: 6.5,
      measuredAt: "2026-05-17",
      note: "雨上がり",
    });
    expect(rec.value).toBe(6.5);
    expect(rec.measuredAt).toBe("2026-05-17");
  });

  it("fetchCellPh は GET /api/grids/:id/cells/:x/:y/ph?pubkey= を叩いて records 配列を返す", async () => {
    mockFetch({
      records: [
        { id: 1, cellId: 11, measuredAt: "2026-04-01", value: 5.5, note: null },
        { id: 2, cellId: 11, measuredAt: "2026-05-17", value: 6.5, note: null },
      ],
    });
    const records = await fetchCellPh("g1", 2, 3, "pk");
    expect(first().url).toBe("/api/grids/g1/cells/2/3/ph?pubkey=pk");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(records).toHaveLength(2);
    expect(records[0]?.value).toBe(5.5);
    expect(records[1]?.measuredAt).toBe("2026-05-17");
  });

  // -------------------------------------------------------------------------
  // Issue #25: 養分投入の全件時系列取得
  // -------------------------------------------------------------------------

  it("fetchCellNutrients は GET /api/grids/:id/cells/:x/:y/nutrients?pubkey= を叩いて records 配列を返す", async () => {
    mockFetch({
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
          appliedAt: "2026-05-01",
          nutrientType: "potassium",
          materialId: null,
          amount: 10,
          amountUnit: "g",
          note: null,
        },
      ],
    });
    const records = await fetchCellNutrients("g1", 2, 3, "pk");
    expect(first().url).toBe("/api/grids/g1/cells/2/3/nutrients?pubkey=pk");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(records).toHaveLength(2);
    expect(records[0]?.nutrientType).toBe("nitrogen");
    expect(records[1]?.appliedAt).toBe("2026-05-01");
  });

  it("fetchCellHistory は records 配列をそのまま返す", async () => {
    mockFetch({
      records: [
        {
          id: 1,
          gridId: "g1",
          x: 2,
          y: 3,
          plantId: 10,
          plantName: "トマト",
          plantNameEn: "Tomato",
          plantFamily: "ナス科",
          year: 2026,
          season: "spring",
          plantedAt: "2026-04-01",
          endedAt: null,
        },
      ],
    });
    const r = await fetchCellHistory("g1", 2, 3, "pk");
    expect(r.records).toHaveLength(1);
    expect(r.records[0]?.plantFamily).toBe("ナス科");
    expect(r.records[0]?.season).toBe("spring");
  });
});
