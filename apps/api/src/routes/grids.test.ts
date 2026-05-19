// Issue: kako-jun/farm-in-pocket#87
// grids ルータの統合テスト。
//
// カバー範囲: GET / POST / PATCH / DELETE / cells PUT / cells DELETE + summary。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makeCell, makeGrid, makePlant, makePlanting, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import gridsRouter from "./grids";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/grids", gridsRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("grids router", () => {
  it("GET /api/grids は pubkey 不正なら 400", async () => {
    const env = mockEnv(handle.db);
    const res = await request(app, "GET", "/api/grids", { query: { pubkey: "nope" } }, env);
    expect(res.status).toBe(400);
  });

  it("GET /api/grids は自分の grids のみ返す", async () => {
    const a = pubkeyHex("a");
    const b = pubkeyHex("b");
    makeGrid(handle.sqlite, a, { name: "A の畑" });
    makeGrid(handle.sqlite, b, { name: "B の畑" });
    const env = mockEnv(handle.db);
    const res = await request<{ grids: Array<{ name: string }> }>(
      app,
      "GET",
      "/api/grids",
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.grids).toHaveLength(1);
    expect(res.body.grids[0]?.name).toBe("A の畑");
  });

  it("POST /api/grids は新規 grid を作って 201 を返す", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request<{ grid: { id: string; name: string; sizeX: number } }>(
      app,
      "POST",
      "/api/grids",
      {
        body: {
          pubkey: a,
          name: "ベランダ",
          environment: "outdoor_partial_shade",
          sizeX: 4,
          sizeY: 5,
        },
      },
      env,
    );
    expect(res.status).toBe(201);
    expect(res.body.grid.name).toBe("ベランダ");
    expect(res.body.grid.sizeX).toBe(4);
  });

  it("POST /api/grids は不正な environment を 400 で弾く", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      "/api/grids",
      {
        body: { pubkey: a, name: "x", environment: "moon", sizeX: 3, sizeY: 3 },
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /api/grids/:id は他人の grid を 403", async () => {
    const a = pubkeyHex("a");
    const b = pubkeyHex("b");
    const id = makeGrid(handle.sqlite, a);
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "PATCH",
      `/api/grids/${id}`,
      { body: { pubkey: b, name: "横取り" } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("PATCH /api/grids/:id は archive: true で archived_at を埋める", async () => {
    const a = pubkeyHex("a");
    const id = makeGrid(handle.sqlite, a);
    const env = mockEnv(handle.db);
    const res = await request<{ grid: { archivedAt: string | null } }>(
      app,
      "PATCH",
      `/api/grids/${id}`,
      { body: { pubkey: a, archive: true } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.grid.archivedAt).toBeTruthy();
  });

  it("DELETE /api/grids/:id は cells / plantings / crop_history も消す", async () => {
    const a = pubkeyHex("a");
    const id = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, id, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "テスト作物",
      family: "ナス科",
      category: "vegetable",
    });
    makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);
    const res = await request(app, "DELETE", `/api/grids/${id}`, { query: { pubkey: a } }, env);
    expect(res.status).toBe(200);
    const cellCount = handle.sqlite
      .prepare("SELECT COUNT(*) c FROM cells WHERE grid_id = ?")
      .get(id) as { c: number };
    expect(cellCount.c).toBe(0);
  });

  it("GET /api/grids?summary=true は集計情報を含む", async () => {
    const a = pubkeyHex("a");
    const id = makeGrid(handle.sqlite, a);
    makeCell(handle.sqlite, id, 0, 0, { containerType: "planter" });
    makeCell(handle.sqlite, id, 1, 0, { containerType: "void" });
    const env = mockEnv(handle.db);
    const res = await request<{
      grids: Array<{ summary?: { cellCount: number; voidCount: number } }>;
    }>(app, "GET", "/api/grids", { query: { pubkey: a, summary: "true" } }, env);
    expect(res.status).toBe(200);
    expect(res.body.grids[0]?.summary?.cellCount).toBe(2);
    expect(res.body.grids[0]?.summary?.voidCount).toBe(1);
  });

  it("PUT /api/grids/:id/cells/:x/:y はセルを upsert する", async () => {
    const a = pubkeyHex("a");
    const id = makeGrid(handle.sqlite, a, { sizeX: 3, sizeY: 3 });
    const env = mockEnv(handle.db);
    const res = await request<{ cell: { containerType: string; soilType: string } }>(
      app,
      "PUT",
      `/api/grids/${id}/cells/1/1`,
      {
        body: { pubkey: a, containerType: "pot", soilType: "potting_mix" },
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.cell.containerType).toBe("pot");
    expect(res.body.cell.soilType).toBe("potting_mix");
  });

  it("DELETE /api/grids/:id/cells/:x/:y はセルとその plantings を消す", async () => {
    const a = pubkeyHex("a");
    const id = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, id, 2, 2);
    const plantId = makePlant(handle.sqlite, {
      name: "セル削除用",
      family: "キク科",
      category: "vegetable",
    });
    makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "DELETE",
      `/api/grids/${id}/cells/2/2`,
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    const remaining = handle.sqlite
      .prepare("SELECT COUNT(*) c FROM cells WHERE id = ?")
      .get(cellId) as { c: number };
    expect(remaining.c).toBe(0);
  });
});
