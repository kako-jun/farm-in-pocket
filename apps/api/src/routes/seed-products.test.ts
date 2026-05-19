// Issue: kako-jun/farm-in-pocket#87
// seed-products ルータの統合テスト。CRUD + use カウント + dedup。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makePlant, makeSeedProduct, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import seedProductsRouter from "./seed-products";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/seed-products", seedProductsRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("seed-products router", () => {
  it("GET /api/seed-products は空状態で空配列", async () => {
    const env = mockEnv(handle.db);
    const res = await request<{ products: unknown[] }>(app, "GET", "/api/seed-products", {}, env);
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it("POST /api/seed-products は新規登録できる", async () => {
    const a = pubkeyHex("a");
    const plantId = makePlant(handle.sqlite, {
      name: "種袋テスト",
      family: "ナス科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);
    const res = await request<{ product: { id: number; name: string }; duplicated: boolean }>(
      app,
      "POST",
      "/api/seed-products",
      {
        body: { pubkey: a, name: "桃太郎トマト", brand: "サカタ", plantId, type: "seed" },
      },
      env,
    );
    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe("桃太郎トマト");
    expect(res.body.duplicated).toBe(false);
  });

  it("POST 同じ (brand, name, type) は duplicated: true で既存を返す", async () => {
    const a = pubkeyHex("a");
    const plantId = makePlant(handle.sqlite, {
      name: "重複種袋",
      family: "ウリ科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);
    await request(
      app,
      "POST",
      "/api/seed-products",
      { body: { pubkey: a, name: "A", brand: "B", plantId, type: "seed" } },
      env,
    );
    const second = await request<{ duplicated: boolean }>(
      app,
      "POST",
      "/api/seed-products",
      { body: { pubkey: a, name: "A", brand: "B", plantId, type: "seed" } },
      env,
    );
    expect(second.body.duplicated).toBe(true);
  });

  it("POST は不正な type を 400 で弾く", async () => {
    const a = pubkeyHex("a");
    const plantId = makePlant(handle.sqlite, {
      name: "type検証",
      family: "キク科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      "/api/seed-products",
      { body: { pubkey: a, name: "X", plantId, type: "rocket" } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/seed-products/:id は単体取得", async () => {
    const plantId = makePlant(handle.sqlite, {
      name: "単体取得",
      family: "シソ科",
      category: "herb",
    });
    const id = makeSeedProduct(handle.sqlite, { name: "苗A", plantId, type: "seedling" });
    const env = mockEnv(handle.db);
    const res = await request<{ product: { id: number } }>(
      app,
      "GET",
      `/api/seed-products/${id}`,
      {},
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe(id);
  });

  it("POST /api/seed-products/:id/use は初回 user で use_count / user_count 加算", async () => {
    const a = pubkeyHex("a");
    const plantId = makePlant(handle.sqlite, {
      name: "useカウント",
      family: "アブラナ科",
      category: "vegetable",
    });
    const id = makeSeedProduct(handle.sqlite, { name: "useテスト", plantId });
    const env = mockEnv(handle.db);
    const res = await request<{
      product: { useCount: number; userCount: number };
      firstUse: boolean;
    }>(app, "POST", `/api/seed-products/${id}/use`, { body: { pubkey: a } }, env);
    expect(res.status).toBe(200);
    expect(res.body.product.useCount).toBe(1);
    expect(res.body.product.userCount).toBe(1);
    expect(res.body.firstUse).toBe(true);
  });

  // PR #89 retro B1: normalize 後に同一の pubkey（大文字/小文字違い）を 2 回叩いても user_count は 1 のまま。
  // 「DISTINCT users by normalized pubkey」が壊れていないことを保証する。
  it("POST /:id/use は normalize 後同一 pubkey なら user_count が 1 のまま", async () => {
    const aLower = pubkeyHex("a");
    const aUpper = aLower.toUpperCase();
    const plantId = makePlant(handle.sqlite, {
      name: "normalize use",
      family: "シソ科",
      category: "herb",
    });
    const id = makeSeedProduct(handle.sqlite, { name: "normalizeテスト", plantId });
    const env = mockEnv(handle.db);
    await request(app, "POST", `/api/seed-products/${id}/use`, { body: { pubkey: aLower } }, env);
    const second = await request<{
      product: { useCount: number; userCount: number };
      firstUse: boolean;
    }>(app, "POST", `/api/seed-products/${id}/use`, { body: { pubkey: aUpper } }, env);
    expect(second.status).toBe(200);
    expect(second.body.product.useCount).toBe(2);
    expect(second.body.product.userCount).toBe(1);
    expect(second.body.firstUse).toBe(false);
  });

  it("POST /:id/use 同じ pubkey で 2 度叩くと use_count のみ +1", async () => {
    const a = pubkeyHex("a");
    const plantId = makePlant(handle.sqlite, {
      name: "2回use",
      family: "セリ科",
      category: "herb",
    });
    const id = makeSeedProduct(handle.sqlite, { name: "use2回", plantId });
    const env = mockEnv(handle.db);
    await request(app, "POST", `/api/seed-products/${id}/use`, { body: { pubkey: a } }, env);
    const second = await request<{
      product: { useCount: number; userCount: number };
      firstUse: boolean;
    }>(app, "POST", `/api/seed-products/${id}/use`, { body: { pubkey: a } }, env);
    expect(second.body.product.useCount).toBe(2);
    expect(second.body.product.userCount).toBe(1);
    expect(second.body.firstUse).toBe(false);
  });
});
