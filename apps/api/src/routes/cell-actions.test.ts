// Issue: kako-jun/farm-in-pocket#87
// cell-actions ルータの統合テスト。施肥 / 農薬 / pH / records / history。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makeCell, makeGrid, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import cellActionsRouter from "./cell-actions";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/grids", cellActionsRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("cell-actions router", () => {
  it("POST .../nutrient は cell 未作成だと 404", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/nutrient`,
      { body: { pubkey: a, nutrientType: "nitrogen", appliedAt: "2026-04-01" } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("POST .../nutrient は cell 設定済みなら 201 で記録される", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    makeCell(handle.sqlite, gridId, 0, 0, { containerType: "planter" });
    const env = mockEnv(handle.db);
    const res = await request<{ record: { nutrientType: string; appliedAt: string } }>(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/nutrient`,
      {
        body: { pubkey: a, nutrientType: "phosphorus", appliedAt: "2026-04-01", amount: 5 },
      },
      env,
    );
    expect(res.status).toBe(201);
    expect(res.body.record.nutrientType).toBe("phosphorus");
  });

  it("POST .../pesticide は不正な type を 400 で弾く", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    makeCell(handle.sqlite, gridId, 0, 0, { containerType: "planter" });
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/pesticide`,
      { body: { pubkey: a, pesticideType: "ray-gun" } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("POST .../pesticide は targetTags を JSON に保存する", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    makeCell(handle.sqlite, gridId, 0, 0, { containerType: "planter" });
    const env = mockEnv(handle.db);
    const res = await request<{ record: { targetTags: string[] | null } }>(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/pesticide`,
      {
        body: {
          pubkey: a,
          pesticideType: "insecticide",
          appliedAt: "2026-04-02",
          targetTags: ["aphid", "powdery_mildew"],
        },
      },
      env,
    );
    expect(res.status).toBe(201);
    expect(res.body.record.targetTags).toEqual(["aphid", "powdery_mildew"]);
  });

  it("POST .../ph は value 範囲外を 400 で弾く", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    makeCell(handle.sqlite, gridId, 0, 0, { containerType: "planter" });
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/ph`,
      { body: { pubkey: a, value: 99 } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("POST .../ph 正常 + GET .../ph で取り出せる", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    makeCell(handle.sqlite, gridId, 0, 0, { containerType: "planter" });
    const env = mockEnv(handle.db);
    const post = await request(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/ph`,
      { body: { pubkey: a, value: 6.5, measuredAt: "2026-04-03" } },
      env,
    );
    expect(post.status).toBe(201);
    const list = await request<{ records: Array<{ value: number }> }>(
      app,
      "GET",
      `/api/grids/${gridId}/cells/0/0/ph`,
      { query: { pubkey: a } },
      env,
    );
    expect(list.status).toBe(200);
    expect(list.body.records).toHaveLength(1);
    expect(list.body.records[0]?.value).toBe(6.5);
  });

  it("GET .../records はセル無しでも空配列で 200", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const env = mockEnv(handle.db);
    const res = await request<{ nutrients: unknown[]; pesticides: unknown[] }>(
      app,
      "GET",
      `/api/grids/${gridId}/cells/0/0/records`,
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.nutrients).toEqual([]);
    expect(res.body.pesticides).toEqual([]);
  });

  it("GET .../records は直近 10 件を applied_at DESC で返す", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0, { containerType: "planter" });
    handle.sqlite
      .prepare(
        "INSERT INTO nutrient_records (cell_id, applied_at, nutrient_type) VALUES (?, ?, 'nitrogen')",
      )
      .run(cellId, "2026-04-01");
    handle.sqlite
      .prepare(
        "INSERT INTO nutrient_records (cell_id, applied_at, nutrient_type) VALUES (?, ?, 'nitrogen')",
      )
      .run(cellId, "2026-04-10");
    const env = mockEnv(handle.db);
    const res = await request<{ nutrients: Array<{ appliedAt: string }> }>(
      app,
      "GET",
      `/api/grids/${gridId}/cells/0/0/records`,
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.nutrients).toHaveLength(2);
    expect(res.body.nutrients[0]?.appliedAt).toBe("2026-04-10");
  });
});
