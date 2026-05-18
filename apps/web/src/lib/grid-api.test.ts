import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGrid,
  createPlanting,
  deleteCell,
  deleteGrid,
  deletePlanting,
  listGrids,
  putCell,
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

  it("updateGrid は PATCH /api/grids/:id を叩いて warning フラグを返す", async () => {
    mockFetch({ grid: { id: "g3", cells: [] }, cropHistoryResetWarning: true });
    const r = await updateGrid("g3", { sizeX: 6 });
    expect(first().url).toBe("/api/grids/g3");
    expect(first().init?.method).toBe("PATCH");
    expect(r.cropHistoryResetWarning).toBe(true);
  });

  it("deleteGrid は DELETE /api/grids/:id を叩く", async () => {
    mockFetch({ ok: true });
    await deleteGrid("g4");
    expect(first().url).toBe("/api/grids/g4");
    expect(first().init?.method).toBe("DELETE");
  });

  it("putCell は PUT /api/grids/:id/cells/:x/:y に body を投げる", async () => {
    mockFetch({ cell: { id: 1, gridId: "g5", x: 1, y: 2 } });
    await putCell("g5", 1, 2, { containerType: "pot", soilType: "potting_mix" });
    expect(first().url).toBe("/api/grids/g5/cells/1/2");
    expect(first().init?.method).toBe("PUT");
    const body = JSON.parse(String(first().init?.body));
    expect(body).toEqual({ containerType: "pot", soilType: "potting_mix" });
  });

  it("deleteCell は DELETE /api/grids/:id/cells/:x/:y を叩く", async () => {
    mockFetch({ ok: true });
    await deleteCell("g6", 0, 0);
    expect(first().url).toBe("/api/grids/g6/cells/0/0");
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
      planting: {
        id: 7,
        cellId: 11,
        plantId: 1,
        seedingDate: "2026-05-17",
        plantingDate: null,
        note: null,
      },
    });
    const p = await createPlanting("g7", 2, 3, { plantId: 1, seedingDate: "2026-05-17" });
    expect(first().url).toBe("/api/grids/g7/cells/2/3/plantings");
    expect(first().init?.method).toBe("POST");
    expect(p.id).toBe(7);
  });

  it("deletePlanting は DELETE /api/plantings/:id を叩く", async () => {
    mockFetch({ ok: true });
    await deletePlanting(42);
    expect(first().url).toBe("/api/plantings/42");
    expect(first().init?.method).toBe("DELETE");
  });

  it("API エラー時は Error を throw する", async () => {
    mockFetch({ error: "invalid pubkey" }, 400);
    await expect(listGrids("nope")).rejects.toThrow(/invalid pubkey/);
  });
});
