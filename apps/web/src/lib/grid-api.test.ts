import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGrid,
  createMaterial,
  createPlanting,
  createSeedProduct,
  deleteCell,
  deleteGrid,
  deletePlanting,
  fetchCellHistory,
  fetchCellNutrients,
  fetchCellPh,
  fetchCellRecords,
  fetchMaterial,
  fetchPlant,
  fetchPlantSeedProducts,
  fetchPlantUsers,
  fetchPlanting,
  fetchProfile,
  fetchSeedProduct,
  fetchWateringDue,
  fetchWateringSettings,
  fetchWeather,
  listGrids,
  putCell,
  recordMaterialUsage,
  recordNutrient,
  recordPesticide,
  recordPh,
  recordSeedProductUsage,
  recordWatering,
  searchMaterials,
  searchPlants,
  searchPlantsAdvanced,
  searchSeedProducts,
  setWateringInterval,
  updateGrid,
  updatePlanting,
  updateProfile,
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

  // -------------------------------------------------------------------------
  // Issue #29: 作物ライフサイクル状態管理
  // -------------------------------------------------------------------------

  it("fetchPlanting は GET /api/plantings/:id?pubkey= を叩く", async () => {
    mockFetch({
      planting: {
        id: 7,
        cellId: 11,
        plantId: 1,
        seedProductId: null,
        state: "planted",
        seedingDate: "2026-05-01",
        germinationDate: null,
        plantingDate: null,
        endDate: null,
        endTag: null,
        seedingDepthCm: null,
        plantSpacingCm: null,
        rowSpacingCm: null,
        failureMemo: null,
        note: null,
      },
    });
    const p = await fetchPlanting(7, "pk");
    expect(first().url).toBe("/api/plantings/7?pubkey=pk");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(p.id).toBe(7);
    expect(p.state).toBe("planted");
  });

  it("updatePlanting は PATCH /api/plantings/:id に body を JSON で投げる（pubkey 添付）", async () => {
    mockFetch({
      ok: true,
      planting: {
        id: 7,
        cellId: 11,
        plantId: 1,
        seedProductId: null,
        state: "growing",
        seedingDate: "2026-05-01",
        germinationDate: null,
        plantingDate: null,
        endDate: null,
        endTag: null,
        seedingDepthCm: null,
        plantSpacingCm: null,
        rowSpacingCm: null,
        failureMemo: null,
        note: null,
      },
    });
    const result = await updatePlanting(7, "pk", { state: "growing" });
    expect(first().url).toBe("/api/plantings/7");
    expect(first().init?.method).toBe("PATCH");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ state: "growing", pubkey: "pk" });
    expect(result.state).toBe("growing");
  });

  it("updatePlanting は state=ended + endTag + failureMemo を送れる", async () => {
    mockFetch({
      ok: true,
      planting: {
        id: 7,
        cellId: 11,
        plantId: 1,
        seedProductId: null,
        state: "ended",
        seedingDate: "2026-05-01",
        germinationDate: null,
        plantingDate: null,
        endDate: "2026-08-15",
        endTag: "fruited",
        seedingDepthCm: null,
        plantSpacingCm: null,
        rowSpacingCm: null,
        failureMemo: "豊作",
        note: null,
      },
    });
    const result = await updatePlanting(7, "pk", {
      state: "ended",
      endTag: "fruited",
      endDate: "2026-08-15",
      failureMemo: "豊作",
    });
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({
      state: "ended",
      endTag: "fruited",
      endDate: "2026-08-15",
      failureMemo: "豊作",
      pubkey: "pk",
    });
    expect(result.state).toBe("ended");
    expect(result.endTag).toBe("fruited");
    expect(result.endDate).toBe("2026-08-15");
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

  // -------------------------------------------------------------------------
  // Issue #31: 水やりリマインダー
  // -------------------------------------------------------------------------

  it("fetchWateringSettings は GET /api/plantings/:id/watering?pubkey= を叩く", async () => {
    mockFetch({
      settings: {
        plantingId: 7,
        intervalDays: 2,
        lastWateredAt: "2026-05-16",
        nextDueAt: "2026-05-18",
      },
    });
    const s = await fetchWateringSettings(7, "pk");
    expect(first().url).toBe("/api/plantings/7/watering?pubkey=pk");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(s?.intervalDays).toBe(2);
    expect(s?.nextDueAt).toBe("2026-05-18");
  });

  it("setWateringInterval は PUT /api/plantings/:id/watering に intervalDays を投げる", async () => {
    mockFetch({
      settings: {
        plantingId: 7,
        intervalDays: 3,
        lastWateredAt: null,
        nextDueAt: "2026-05-21",
      },
    });
    const s = await setWateringInterval(7, 3, "pk");
    expect(first().url).toBe("/api/plantings/7/watering");
    expect(first().init?.method).toBe("PUT");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({ pubkey: "pk", intervalDays: 3 });
    expect(s?.intervalDays).toBe(3);
  });

  it("setWateringInterval(null) は intervalDays: null で送り settings=null を返す", async () => {
    mockFetch({ settings: null });
    const s = await setWateringInterval(7, null, "pk");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({ pubkey: "pk", intervalDays: null });
    expect(s).toBeNull();
  });

  it("recordWatering は POST /api/plantings/:id/water に pubkey と任意 wateredAt/note を投げる", async () => {
    mockFetch({
      ok: true,
      wateredAt: "2026-05-18",
      settings: {
        plantingId: 7,
        intervalDays: 2,
        lastWateredAt: "2026-05-18",
        nextDueAt: "2026-05-20",
      },
    });
    const r = await recordWatering(7, "pk", "2026-05-18", "朝");
    expect(first().url).toBe("/api/plantings/7/water");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({ pubkey: "pk", wateredAt: "2026-05-18", note: "朝" });
    expect(r.wateredAt).toBe("2026-05-18");
    expect(r.settings?.nextDueAt).toBe("2026-05-20");
  });

  it("fetchWateringDue は GET /api/users/:pubkey/watering-due?pubkey=&on= を叩く", async () => {
    mockFetch({
      records: [
        {
          plantingId: 7,
          cellId: 11,
          gridId: "g1",
          gridName: "南プランター",
          x: 1,
          y: 2,
          plantId: 1,
          plantName: "トマト",
          intervalDays: 2,
          lastWateredAt: "2026-05-16",
          nextDueAt: "2026-05-18",
          daysOverdue: 0,
        },
      ],
    });
    const records = await fetchWateringDue("pk", "2026-05-18");
    // URLSearchParams のキー順は実装に依存しないので、両キーが含まれることを検証する
    const calledUrl = first().url;
    expect(calledUrl.startsWith("/api/users/pk/watering-due?")).toBe(true);
    expect(calledUrl).toContain("pubkey=pk");
    expect(calledUrl).toContain("on=2026-05-18");
    expect(records).toHaveLength(1);
    expect(records[0]?.plantName).toBe("トマト");
  });

  // ---- Issue #32: profile / weather ----------------------------------------

  it("fetchProfile は GET /api/profiles/me?pubkey= を叩いて null を許容する", async () => {
    mockFetch({ profile: null });
    const p = await fetchProfile("pk");
    expect(first().url).toBe("/api/profiles/me?pubkey=pk");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(p).toBeNull();
  });

  it("updateProfile は PUT /api/profiles/me に pubkey + patch を body で投げる", async () => {
    mockFetch({
      ok: true,
      profile: { pubkey: "pk", displayName: null, region: "石川県金沢市", locale: "ja" },
    });
    const r = await updateProfile("pk", { region: "石川県金沢市" });
    expect(first().url).toBe("/api/profiles/me");
    expect(first().init?.method).toBe("PUT");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({ pubkey: "pk", region: "石川県金沢市" });
    expect(r.region).toBe("石川県金沢市");
  });

  it("fetchWeather は GET /api/weather?region=&date= を叩いて record を返す", async () => {
    mockFetch({
      record: {
        region: "石川県金沢市",
        date: "2026-05-18",
        tempMax: 22,
        tempMin: 13,
        tempAvg: 17.5,
        weatherCode: "61",
        sunshineHours: 4.5,
        fetchedAt: "2026-05-18 03:00:00",
      },
    });
    const r = await fetchWeather("石川県金沢市", "2026-05-18");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(first().url.startsWith("/api/weather?")).toBe(true);
    expect(first().url).toContain(`region=${encodeURIComponent("石川県金沢市")}`);
    expect(first().url).toContain("date=2026-05-18");
    expect(r.record?.weatherCode).toBe("61");
    expect(r.record?.tempMax).toBe(22);
  });

  it("fetchWeather は { record: null, error } をそのまま返す（throw しない）", async () => {
    mockFetch({ record: null, error: "geocoding_failed" });
    const r = await fetchWeather("存在しない地名", "2026-05-18");
    expect(r.record).toBeNull();
    expect(r.error).toBe("geocoding_failed");
  });

  // ---- seed products (Issue #34) ----

  it("searchSeedProducts は GET /api/seed-products?q=&plantId=&type= を叩く", async () => {
    mockFetch({ products: [{ id: 1, name: "トマト 桃太郎", brand: "タキイ" }] });
    const res = await searchSeedProducts({ q: "桃太郎", plantId: 5, type: "seed" });
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(first().url.startsWith("/api/seed-products?")).toBe(true);
    expect(first().url).toContain(`q=${encodeURIComponent("桃太郎")}`);
    expect(first().url).toContain("plantId=5");
    expect(first().url).toContain("type=seed");
    expect(res).toHaveLength(1);
  });

  it("fetchSeedProduct は GET /api/seed-products/:id を叩く", async () => {
    mockFetch({ product: { id: 42, name: "種袋", type: "seed" } });
    const p = await fetchSeedProduct(42);
    expect(first().url).toBe("/api/seed-products/42");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(p.id).toBe(42);
  });

  it("createSeedProduct は POST /api/seed-products に body を JSON で投げる", async () => {
    mockFetch({
      product: { id: 99, name: "ミニトマト", brand: "サカタ", plantId: 1, type: "seed" },
      duplicated: false,
    });
    const r = await createSeedProduct({
      pubkey: "p".repeat(64),
      name: "ミニトマト",
      brand: "サカタ",
      plantId: 1,
      type: "seed",
      affiliateLinks: [{ shop: "Amazon", url: "https://example.com/a" }],
    });
    expect(first().url).toBe("/api/seed-products");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({
      pubkey: "p".repeat(64),
      name: "ミニトマト",
      plantId: 1,
      type: "seed",
    });
    expect(body.affiliateLinks).toEqual([{ shop: "Amazon", url: "https://example.com/a" }]);
    expect(r.duplicated).toBe(false);
    expect(r.product.id).toBe(99);
  });

  it("recordSeedProductUsage は POST /api/seed-products/:id/use を叩く", async () => {
    mockFetch({
      ok: true,
      firstUse: true,
      product: { id: 99, name: "ミニトマト", useCount: 1, userCount: 1 },
    });
    const r = await recordSeedProductUsage(99, "p".repeat(64));
    expect(first().url).toBe("/api/seed-products/99/use");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({ pubkey: "p".repeat(64) });
    expect(r.firstUse).toBe(true);
    expect(r.product.useCount).toBe(1);
  });

  // ---- materials (Issue #35) ----

  it("searchMaterials は GET /api/materials?q=&category=&subcategory= を叩く", async () => {
    mockFetch({
      materials: [{ id: 1, name: "ハイポネックス", brand: "ハイポネックスジャパン" }],
    });
    const res = await searchMaterials({
      q: "ハイポ",
      category: "fertilizer_liquid",
      subcategory: "",
    });
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(first().url.startsWith("/api/materials?")).toBe(true);
    expect(first().url).toContain(`q=${encodeURIComponent("ハイポ")}`);
    expect(first().url).toContain("category=fertilizer_liquid");
    // 空 subcategory はクエリに乗らない
    expect(first().url).not.toContain("subcategory=");
    expect(res).toHaveLength(1);
  });

  it("fetchMaterial は GET /api/materials/:id を叩く", async () => {
    mockFetch({ material: { id: 7, name: "培養土", category: "soil" } });
    const m = await fetchMaterial(7);
    expect(first().url).toBe("/api/materials/7");
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(m.id).toBe(7);
  });

  it("createMaterial は POST /api/materials に body を JSON で投げる", async () => {
    mockFetch({
      material: {
        id: 55,
        name: "オルトラン",
        brand: "住友化学園芸",
        category: "pesticide",
        subcategory: "insecticide",
      },
      duplicated: false,
    });
    const r = await createMaterial({
      pubkey: "p".repeat(64),
      name: "オルトラン",
      brand: "住友化学園芸",
      category: "pesticide",
      subcategory: "insecticide",
      description: "粒剤",
      affiliateLinks: [{ shop: "Amazon", url: "https://example.com/a" }],
    });
    expect(first().url).toBe("/api/materials");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toMatchObject({
      pubkey: "p".repeat(64),
      name: "オルトラン",
      category: "pesticide",
      subcategory: "insecticide",
      description: "粒剤",
    });
    expect(body.affiliateLinks).toEqual([{ shop: "Amazon", url: "https://example.com/a" }]);
    expect(r.duplicated).toBe(false);
    expect(r.material.id).toBe(55);
  });

  it("recordMaterialUsage は POST /api/materials/:id/use を叩く", async () => {
    mockFetch({
      ok: true,
      firstUse: false,
      material: { id: 55, name: "オルトラン", useCount: 3, userCount: 1 },
    });
    const r = await recordMaterialUsage(55, "p".repeat(64));
    expect(first().url).toBe("/api/materials/55/use");
    expect(first().init?.method).toBe("POST");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({ pubkey: "p".repeat(64) });
    expect(r.firstUse).toBe(false);
    expect(r.material.useCount).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Issue #38: 植物マスターページ
  // -------------------------------------------------------------------------

  it("searchPlantsAdvanced は GET /api/plants?<filters> を組み立てる", async () => {
    mockFetch({
      plants: [
        { id: 1, name: "トマト", nameEn: "Tomato", family: "ナス科", category: "vegetable" },
      ],
    });
    const res = await searchPlantsAdvanced({
      q: "tomato",
      category: "vegetable",
      family: "ナス科",
      tag: "夏野菜",
      sort: "name",
      limit: 50,
    });
    expect(first().url).toBe(
      `/api/plants?q=tomato&family=${encodeURIComponent("ナス科")}&category=vegetable&tag=${encodeURIComponent("夏野菜")}&sort=name&limit=50`,
    );
    expect(first().init?.method ?? "GET").toBe("GET");
    expect(res).toHaveLength(1);
  });

  it("fetchPlant は GET /api/plants/:id を叩いて PlantDetail を返す", async () => {
    mockFetch({
      plant: {
        id: 7,
        name: "バジル",
        nameEn: "Basil",
        family: "シソ科",
        category: "herb",
        genus: "Ocimum",
        tags: ["ハーブ", "夏"],
        description: "イタリア料理に欠かせないハーブ。",
        thumbnailUrl: null,
      },
    });
    const res = await fetchPlant(7);
    expect(first().url).toBe("/api/plants/7");
    expect(res.tags).toEqual(["ハーブ", "夏"]);
    expect(res.genus).toBe("Ocimum");
  });

  it("fetchPlantSeedProducts は GET /api/plants/:id/seed-products を叩く", async () => {
    mockFetch({
      products: [
        {
          id: 10,
          name: "甘いトマトの種",
          brand: "サカタ",
          plantId: 1,
          plantName: "トマト",
          type: "seed",
          thumbnailUrl: null,
          affiliateLinks: null,
          useCount: 5,
          userCount: 3,
        },
      ],
    });
    const res = await fetchPlantSeedProducts(1);
    expect(first().url).toBe("/api/plants/1/seed-products");
    expect(res).toHaveLength(1);
    expect(res[0]?.plantId).toBe(1);
  });

  it("fetchPlantUsers は GET /api/plants/:id/users を叩いてユーザー一覧を返す", async () => {
    mockFetch({
      users: [
        { pubkey: "a".repeat(64), plantingCount: 3, lastPlantedAt: "2026-04-01" },
        { pubkey: "b".repeat(64), plantingCount: 1, lastPlantedAt: "2026-03-15" },
      ],
    });
    const res = await fetchPlantUsers(1);
    expect(first().url).toBe("/api/plants/1/users");
    expect(res).toHaveLength(2);
    expect(res[0]?.plantingCount).toBe(3);
  });
});
