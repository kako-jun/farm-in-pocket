// Issue: kako-jun/farm-in-pocket#87
// watering ルータの統合テスト。
// settings 設定 + 水やり記録 + 期日一覧。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makeCell, makeGrid, makePlant, makePlanting, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import { wateringPlantingsRouter, wateringUsersRouter } from "./watering";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/plantings", wateringPlantingsRouter);
app.route("/api/users", wateringUsersRouter);

let handle: MockD1Handle;

function setupPlanting(): {
  pubkey: string;
  gridId: string;
  plantingId: number;
} {
  const a = pubkeyHex("a");
  const gridId = makeGrid(handle.sqlite, a);
  const cellId = makeCell(handle.sqlite, gridId, 0, 0);
  const plantId = makePlant(handle.sqlite, {
    name: "水やり対象",
    family: "ナス科",
    category: "vegetable",
  });
  const pid = makePlanting(handle.sqlite, { cellId, plantId });
  return { pubkey: a, gridId, plantingId: pid };
}

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("watering router", () => {
  it("GET /api/plantings/:id/watering は未設定なら settings:null", async () => {
    const { pubkey, plantingId } = setupPlanting();
    const env = mockEnv(handle.db);
    const res = await request<{ settings: unknown | null }>(
      app,
      "GET",
      `/api/plantings/${plantingId}/watering`,
      { query: { pubkey } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.settings).toBeNull();
  });

  it("PUT /api/plantings/:id/watering で interval を保存できる", async () => {
    const { pubkey, plantingId } = setupPlanting();
    const env = mockEnv(handle.db);
    const res = await request<{ settings: { intervalDays: number; nextDueAt: string | null } }>(
      app,
      "PUT",
      `/api/plantings/${plantingId}/watering`,
      { body: { pubkey, intervalDays: 3 } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.settings.intervalDays).toBe(3);
    expect(res.body.settings.nextDueAt).toBeTruthy();
  });

  it("PUT intervalDays=0 で設定を消す", async () => {
    const { pubkey, plantingId } = setupPlanting();
    const env = mockEnv(handle.db);
    await request(
      app,
      "PUT",
      `/api/plantings/${plantingId}/watering`,
      { body: { pubkey, intervalDays: 3 } },
      env,
    );
    const off = await request<{ settings: unknown | null }>(
      app,
      "PUT",
      `/api/plantings/${plantingId}/watering`,
      { body: { pubkey, intervalDays: 0 } },
      env,
    );
    expect(off.body.settings).toBeNull();
  });

  it("POST /api/plantings/:id/water は記録 + settings の next_due_at を更新", async () => {
    const { pubkey, plantingId } = setupPlanting();
    const env = mockEnv(handle.db);
    await request(
      app,
      "PUT",
      `/api/plantings/${plantingId}/watering`,
      { body: { pubkey, intervalDays: 2 } },
      env,
    );
    const res = await request<{
      ok: boolean;
      wateredAt: string;
      settings: { lastWateredAt: string; nextDueAt: string } | null;
    }>(
      app,
      "POST",
      `/api/plantings/${plantingId}/water`,
      { body: { pubkey, wateredAt: "2026-05-01" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.settings?.lastWateredAt).toBe("2026-05-01");
    expect(res.body.settings?.nextDueAt).toBe("2026-05-03");
  });

  it("GET /api/users/:pubkey/watering-due は期日が来た plantings を返す", async () => {
    const { pubkey, plantingId } = setupPlanting();
    const env = mockEnv(handle.db);
    // settings + 古い next_due_at をセット
    await request(
      app,
      "PUT",
      `/api/plantings/${plantingId}/watering`,
      { body: { pubkey, intervalDays: 3 } },
      env,
    );
    handle.sqlite
      .prepare(
        "UPDATE watering_settings SET last_watered_at = '2026-04-20', next_due_at = '2026-04-23' WHERE planting_id = ?",
      )
      .run(plantingId);

    const res = await request<{
      records: Array<{ plantingId: number; nextDueAt: string; daysOverdue: number }>;
    }>(
      app,
      "GET",
      `/api/users/${pubkey}/watering-due`,
      { query: { pubkey, on: "2026-05-01" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0]?.plantingId).toBe(plantingId);
    expect(res.body.records[0]?.daysOverdue).toBeGreaterThan(0);
  });

  it("GET /api/users/:pubkey/watering-due 他人の pubkey は 403", async () => {
    const { pubkey } = setupPlanting();
    const b = pubkeyHex("b");
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "GET",
      `/api/users/${pubkey}/watering-due`,
      { query: { pubkey: b } },
      env,
    );
    expect(res.status).toBe(403);
  });
});
