// Issue: kako-jun/farm-in-pocket#87
// retrospective ルータの統合テスト。
// activity / plantings-by-plant / cell-histories / failures。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makeCell, makeGrid, makePlant, makePlanting, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import retrospectiveRouter from "./retrospective";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/users", retrospectiveRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("retrospective router", () => {
  it("/activity は pubkey 不一致で 403", async () => {
    const a = pubkeyHex("a");
    const b = pubkeyHex("b");
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "GET",
      `/api/users/${a}/activity`,
      { query: { pubkey: b, month: "2026-04" } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("/activity は不正な month を 400", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "GET",
      `/api/users/${a}/activity`,
      { query: { pubkey: a, month: "2026/04" } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("/activity は plantings_date / nutrient を日付別に集計する", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "activity",
      family: "ナス科",
      category: "vegetable",
    });
    makePlanting(handle.sqlite, { cellId, plantId, plantingDate: "2026-04-15" });
    handle.sqlite
      .prepare(
        "INSERT INTO nutrient_records (cell_id, applied_at, nutrient_type) VALUES (?, '2026-04-20', 'nitrogen')",
      )
      .run(cellId);
    const env = mockEnv(handle.db);
    const res = await request<{
      days: Record<string, { plantings: number; endings: number; care: number }>;
    }>(app, "GET", `/api/users/${a}/activity`, { query: { pubkey: a, month: "2026-04" } }, env);
    expect(res.status).toBe(200);
    expect(res.body.days["2026-04-15"]?.plantings).toBe(1);
    expect(res.body.days["2026-04-20"]?.care).toBe(1);
  });

  it("/plantings-by-plant は plant_id でグループ化する", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "グループ化",
      family: "シソ科",
      category: "herb",
    });
    makePlanting(handle.sqlite, { cellId, plantId });
    makePlanting(handle.sqlite, { cellId, plantId, state: "ended", endTag: "fruited" });
    const env = mockEnv(handle.db);
    const res = await request<{
      groups: Array<{ plantId: number; plantings: unknown[] }>;
    }>(app, "GET", `/api/users/${a}/plantings-by-plant`, { query: { pubkey: a } }, env);
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0]?.plantings).toHaveLength(2);
  });

  it("/cell-histories は crop_history を planted_at DESC で返す", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    handle.sqlite
      .prepare(
        `INSERT INTO crop_history (grid_id, x, y, plant_id, plant_family, year, season, planted_at)
         VALUES (?, 0, 0, 1, 'ナス科', 2025, 'summer', '2025-06-01'),
                (?, 0, 1, 1, 'ナス科', 2026, 'spring', '2026-03-01')`,
      )
      .run(gridId, gridId);
    const env = mockEnv(handle.db);
    const res = await request<{ records: Array<{ plantedAt: string }> }>(
      app,
      "GET",
      `/api/users/${a}/cell-histories`,
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(2);
    expect(res.body.records[0]?.plantedAt).toBe("2026-03-01");
  });

  it("/failures は end_tag が died/disease/pest/failed のものだけ拾う", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "失敗対象",
      family: "アブラナ科",
      category: "vegetable",
    });
    makePlanting(handle.sqlite, {
      cellId,
      plantId,
      state: "ended",
      endTag: "died",
      endDate: "2026-04-10",
    });
    makePlanting(handle.sqlite, {
      cellId,
      plantId,
      state: "ended",
      endTag: "fruited",
      endDate: "2026-04-15",
    });
    const env = mockEnv(handle.db);
    const res = await request<{ failures: Array<{ endTag: string }> }>(
      app,
      "GET",
      `/api/users/${a}/failures`,
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.failures).toHaveLength(1);
    expect(res.body.failures[0]?.endTag).toBe("died");
  });
});
