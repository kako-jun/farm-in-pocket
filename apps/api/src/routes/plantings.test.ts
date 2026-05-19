// Issue: kako-jun/farm-in-pocket#87
// plantings ルータの統合テスト。
//
// POST 経路（grids 配下）+ item 経路（plantings/:id の GET/PATCH/DELETE）。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makeCell, makeGrid, makePlant, makePlanting, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import { plantingsCreateRouter, plantingsItemRouter } from "./plantings";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/grids", plantingsCreateRouter);
app.route("/api/plantings", plantingsItemRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("plantings router", () => {
  it("POST /api/grids/:id/cells/:x/:y/plantings は新規 planting を作る", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const plantId = makePlant(handle.sqlite, {
      name: "テスト苗",
      family: "ナス科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);
    const res = await request<{ ok: boolean; planting: { id: number; plantId: number } }>(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/plantings`,
      { body: { pubkey: a, plantId, plantingDate: "2026-04-01" } },
      env,
    );
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.planting.plantId).toBe(plantId);
  });

  it("POST は他人の grid なら 403", async () => {
    const a = pubkeyHex("a");
    const b = pubkeyHex("b");
    const gridId = makeGrid(handle.sqlite, a);
    const plantId = makePlant(handle.sqlite, {
      name: "他人テスト",
      family: "ウリ科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/plantings`,
      { body: { pubkey: b, plantId } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("POST は plantId 不在で 404", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/plantings`,
      { body: { pubkey: a, plantId: 9999999 } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/plantings/:id は所有者なら詳細を返す", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "GET用",
      family: "シソ科",
      category: "herb",
    });
    const pid = makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);
    const res = await request<{ planting: { id: number; state: string } }>(
      app,
      "GET",
      `/api/plantings/${pid}`,
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.planting.id).toBe(pid);
    expect(res.body.planting.state).toBe("planted");
  });

  it("PATCH /api/plantings/:id state=ended は endTag 必須", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "endTag必須テスト",
      family: "アブラナ科",
      category: "vegetable",
    });
    const pid = makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "PATCH",
      `/api/plantings/${pid}`,
      { body: { pubkey: a, state: "ended" } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /api/plantings/:id state=ended + endTag で ended に遷移", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "ended遷移",
      family: "ヒガンバナ科",
      category: "vegetable",
    });
    const pid = makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);
    const res = await request<{ planting: { state: string; endTag: string; endDate: string } }>(
      app,
      "PATCH",
      `/api/plantings/${pid}`,
      { body: { pubkey: a, state: "ended", endTag: "fruited" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.planting.state).toBe("ended");
    expect(res.body.planting.endTag).toBe("fruited");
    expect(res.body.planting.endDate).toBeTruthy();
  });

  it("DELETE /api/plantings/:id は soft delete (state=ended) になる", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "soft delete",
      family: "セリ科",
      category: "herb",
    });
    const pid = makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);
    const res = await request<{ ok: boolean; planting: { state: string; endTag: string } }>(
      app,
      "DELETE",
      `/api/plantings/${pid}`,
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.planting.state).toBe("ended");
    expect(res.body.planting.endTag).toBe("removed");

    // DB 上にも残っている（soft delete）
    const remaining = handle.sqlite
      .prepare("SELECT state FROM plantings WHERE id = ?")
      .get(pid) as { state: string };
    expect(remaining.state).toBe("ended");
  });

  it("DELETE /api/plantings/:id?endTag=died は endTag を上書きできる", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "endTag上書き",
      family: "ヒユ科",
      category: "vegetable",
    });
    const pid = makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);
    const res = await request<{ planting: { endTag: string } }>(
      app,
      "DELETE",
      `/api/plantings/${pid}`,
      { query: { pubkey: a, endTag: "died" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.planting.endTag).toBe("died");
  });
});
