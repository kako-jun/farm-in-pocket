// retrospective-api テスト (Issue: kako-jun/farm-in-pocket#30)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchActivity,
  fetchCellHistories,
  fetchFailures,
  fetchPlantingsByPlant,
} from "./retrospective-api";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retrospective-api", () => {
  it("fetchActivity は GET /api/users/:pubkey/activity?pubkey=&month= を叩いて days を返す", async () => {
    const days = { "2026-05-01": { plantings: 1, endings: 0, care: 2 } };
    mockFetch({ days });
    const result = await fetchActivity("abc", "2026-05");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/users/abc/activity?pubkey=abc&month=2026-05");
    expect(calls[0]?.init?.method ?? "GET").toBe("GET");
    expect(result).toEqual(days);
  });

  it("fetchPlantingsByPlant は GET /api/users/:pubkey/plantings-by-plant を叩いて groups を返す", async () => {
    const groups = [{ plantId: 1, plantName: "トマト", plantFamily: "Solanaceae", plantings: [] }];
    mockFetch({ groups });
    const result = await fetchPlantingsByPlant("pk");
    expect(calls[0]?.url).toBe("/api/users/pk/plantings-by-plant?pubkey=pk");
    expect(result).toEqual(groups);
  });

  it("fetchCellHistories は GET /api/users/:pubkey/cell-histories を叩いて records を返す", async () => {
    const records = [
      {
        id: 1,
        gridId: "g1",
        x: 0,
        y: 0,
        plantId: 2,
        plantName: "ナス",
        plantNameEn: null,
        plantFamily: "Solanaceae",
        year: 2026,
        season: "summer",
        plantedAt: "2026-05-01",
        endedAt: null,
      },
    ];
    mockFetch({ records });
    const result = await fetchCellHistories("pk");
    expect(calls[0]?.url).toBe("/api/users/pk/cell-histories?pubkey=pk");
    expect(result).toEqual(records);
  });

  it("fetchFailures は GET /api/users/:pubkey/failures を叩いて failures を返す", async () => {
    const failures = [
      {
        id: 5,
        cellId: 1,
        plantId: 2,
        seedProductId: null,
        state: "ended",
        seedingDate: null,
        germinationDate: null,
        plantingDate: "2026-04-01",
        endDate: "2026-04-30",
        endTag: "died",
        seedingDepthCm: null,
        plantSpacingCm: null,
        rowSpacingCm: null,
        failureMemo: "水切れ",
        note: null,
        plantName: "ナス",
        plantFamily: "Solanaceae",
      },
    ];
    mockFetch({ failures });
    const result = await fetchFailures("pk");
    expect(calls[0]?.url).toBe("/api/users/pk/failures?pubkey=pk");
    expect(result).toEqual(failures);
  });

  it("API がエラーを返したら Error を throw する", async () => {
    mockFetch({ error: "forbidden" }, 403);
    await expect(fetchActivity("abc", "2026-05")).rejects.toThrow(/403/);
  });
});
