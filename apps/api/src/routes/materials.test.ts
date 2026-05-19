// Issue: kako-jun/farm-in-pocket#87
// materials ルータの統合テスト。seed-products と同パターン。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makeMaterial, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import materialsRouter from "./materials";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/materials", materialsRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("materials router", () => {
  it("GET /api/materials は空状態で空配列", async () => {
    const env = mockEnv(handle.db);
    const res = await request<{ materials: unknown[] }>(app, "GET", "/api/materials", {}, env);
    expect(res.status).toBe(200);
    expect(res.body.materials).toEqual([]);
  });

  it("POST /api/materials は新規登録できる", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request<{ material: { name: string }; duplicated: boolean }>(
      app,
      "POST",
      "/api/materials",
      { body: { pubkey: a, name: "野菜の培養土", brand: "ハイポネックス", category: "soil" } },
      env,
    );
    expect(res.status).toBe(201);
    expect(res.body.material.name).toBe("野菜の培養土");
    expect(res.body.duplicated).toBe(false);
  });

  it("POST 不正な category は 400", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      "/api/materials",
      { body: { pubkey: a, name: "X", category: "unknown-cat" } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("POST 同じ (brand, name, category) は duplicated:true で既存返却", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    await request(
      app,
      "POST",
      "/api/materials",
      { body: { pubkey: a, name: "肥料A", brand: "B", category: "fertilizer_solid" } },
      env,
    );
    const second = await request<{ duplicated: boolean }>(
      app,
      "POST",
      "/api/materials",
      { body: { pubkey: a, name: "肥料A", brand: "B", category: "fertilizer_solid" } },
      env,
    );
    expect(second.body.duplicated).toBe(true);
  });

  it("GET /api/materials?category=tool で絞り込める", async () => {
    makeMaterial(handle.sqlite, { name: "鋏", category: "tool" });
    makeMaterial(handle.sqlite, { name: "赤玉土", category: "soil" });
    const env = mockEnv(handle.db);
    const res = await request<{ materials: Array<{ category: string }> }>(
      app,
      "GET",
      "/api/materials",
      { query: { category: "tool" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.materials).toHaveLength(1);
    expect(res.body.materials[0]?.category).toBe("tool");
  });

  it("GET /api/materials/:id は存在しないと 404", async () => {
    const env = mockEnv(handle.db);
    const res = await request(app, "GET", "/api/materials/9999999", {}, env);
    expect(res.status).toBe(404);
  });

  it("POST /:id/use は use_count を +1", async () => {
    const a = pubkeyHex("a");
    const id = makeMaterial(handle.sqlite, { name: "useテスト", category: "fertilizer_liquid" });
    const env = mockEnv(handle.db);
    const res = await request<{
      product?: unknown;
      material: { useCount: number; userCount: number };
      firstUse: boolean;
    }>(app, "POST", `/api/materials/${id}/use`, { body: { pubkey: a } }, env);
    expect(res.status).toBe(200);
    expect(res.body.material.useCount).toBe(1);
    expect(res.body.material.userCount).toBe(1);
    expect(res.body.firstUse).toBe(true);
  });
});
