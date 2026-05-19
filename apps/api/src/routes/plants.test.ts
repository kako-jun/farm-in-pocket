// Issue: kako-jun/farm-in-pocket#87
// plants ルータの統合テスト。検索 / 単体取得 / seed-products / users。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import {
  makeCell,
  makeGrid,
  makePlant,
  makePlanting,
  makeSeedProduct,
  mockEnv,
} from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import plantsRouter from "./plants";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/plants", plantsRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("plants router", () => {
  it("GET /api/plants は seed migration 由来の作物を返す (>= 100)", async () => {
    const env = mockEnv(handle.db);
    const res = await request<{ plants: Array<{ name: string }> }>(
      app,
      "GET",
      "/api/plants",
      { query: { limit: 200 } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.plants.length).toBeGreaterThanOrEqual(100);
  });

  it("GET /api/plants?q=トマト は name LIKE で絞れる", async () => {
    const env = mockEnv(handle.db);
    const res = await request<{ plants: Array<{ name: string }> }>(
      app,
      "GET",
      "/api/plants",
      { query: { q: "トマト" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.plants.length).toBeGreaterThan(0);
    expect(res.body.plants.every((p) => p.name.includes("トマト"))).toBe(true);
  });

  it("GET /api/plants?family=ナス科 で family 絞り込み", async () => {
    const env = mockEnv(handle.db);
    const res = await request<{ plants: Array<{ family: string }> }>(
      app,
      "GET",
      "/api/plants",
      { query: { family: "ナス科" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.plants.every((p) => p.family === "ナス科")).toBe(true);
  });

  it("GET /api/plants/:id は詳細を返す", async () => {
    const env = mockEnv(handle.db);
    const res = await request<{ plant: { id: number; name: string } }>(
      app,
      "GET",
      "/api/plants/1",
      {},
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.plant.id).toBe(1);
  });

  it("GET /api/plants/:id は存在しないと 404", async () => {
    const env = mockEnv(handle.db);
    const res = await request(app, "GET", "/api/plants/9999999", {}, env);
    expect(res.status).toBe(404);
  });

  it("GET /api/plants/:id/seed-products は関連 seed_products を返す", async () => {
    const plantId = makePlant(handle.sqlite, {
      name: "テスト植物SP",
      family: "ナス科",
      category: "vegetable",
    });
    makeSeedProduct(handle.sqlite, { name: "種A", plantId });
    makeSeedProduct(handle.sqlite, { name: "種B", plantId });
    const env = mockEnv(handle.db);
    const res = await request<{ products: Array<{ name: string }> }>(
      app,
      "GET",
      `/api/plants/${plantId}/seed-products`,
      {},
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
  });

  it("GET /api/plants/:id/users は育てているユーザーを返す", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "ユーザー集計用",
      family: "キク科",
      category: "vegetable",
    });
    makePlanting(handle.sqlite, {
      cellId,
      plantId,
      plantingDate: "2026-04-01",
    });
    const env = mockEnv(handle.db);
    const res = await request<{
      users: Array<{ pubkey: string; plantingCount: number }>;
    }>(app, "GET", `/api/plants/${plantId}/users`, {}, env);
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]?.pubkey).toBe(a);
    expect(res.body.users[0]?.plantingCount).toBe(1);
  });
});
