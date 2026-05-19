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

  // PR #88 retro A1: 再 DELETE の冪等性。
  // 一度 endTag=died で DELETE した後、再度 endTag=removed で DELETE しても
  // エラーにならず、end_tag が removed に上書きされる（「上書き仕様」を保証）。
  it("DELETE /api/plantings/:id を 2 回叩くと end_tag が上書きされる（冪等）", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "再DELETE冪等",
      family: "マメ科",
      category: "vegetable",
    });
    const pid = makePlanting(handle.sqlite, { cellId, plantId });
    const env = mockEnv(handle.db);

    const first = await request<{ planting: { endTag: string } }>(
      app,
      "DELETE",
      `/api/plantings/${pid}`,
      { query: { pubkey: a, endTag: "died" } },
      env,
    );
    expect(first.status).toBe(200);
    expect(first.body.planting.endTag).toBe("died");

    const second = await request<{ planting: { state: string; endTag: string } }>(
      app,
      "DELETE",
      `/api/plantings/${pid}`,
      { query: { pubkey: a, endTag: "removed" } },
      env,
    );
    expect(second.status).toBe(200);
    expect(second.body.planting.state).toBe("ended");
    expect(second.body.planting.endTag).toBe("removed");

    // DB 上も上書きされていることを直接確認
    const row = handle.sqlite
      .prepare("SELECT state, end_tag FROM plantings WHERE id = ?")
      .get(pid) as { state: string; end_tag: string };
    expect(row.state).toBe("ended");
    expect(row.end_tag).toBe("removed");
  });

  // PR #88 retro A2: cells.current_planting_id の NULL 化。
  // POST plantings で current_planting_id が seed されていて、DELETE 後に NULL に戻ることを SELECT で確認。
  it("DELETE /api/plantings/:id は cells.current_planting_id を NULL に戻す", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const plantId = makePlant(handle.sqlite, {
      name: "current_planting NULL化",
      family: "ナス科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);

    // POST plantings で current_planting_id が埋まる
    const post = await request<{ planting: { id: number; cellId: number } }>(
      app,
      "POST",
      `/api/grids/${gridId}/cells/0/0/plantings`,
      { body: { pubkey: a, plantId, plantingDate: "2026-04-01" } },
      env,
    );
    expect(post.status).toBe(201);
    const plantingId = post.body.planting.id;
    const cellId = post.body.planting.cellId;

    const beforeRow = handle.sqlite
      .prepare("SELECT current_planting_id FROM cells WHERE id = ?")
      .get(cellId) as { current_planting_id: number | null };
    expect(beforeRow.current_planting_id).toBe(plantingId);

    // DELETE 後に NULL に戻る
    const del = await request(
      app,
      "DELETE",
      `/api/plantings/${plantingId}`,
      { query: { pubkey: a } },
      env,
    );
    expect(del.status).toBe(200);

    const afterRow = handle.sqlite
      .prepare("SELECT current_planting_id FROM cells WHERE id = ?")
      .get(cellId) as { current_planting_id: number | null };
    expect(afterRow.current_planting_id).toBeNull();
  });

  // PR #88 retro A3: crop_history.ended_at 連動更新。
  // POST plantings で crop_history が作られる → DELETE で ended_at が date('now') に更新されることを確認。
  it("DELETE /api/plantings/:id は crop_history.ended_at を date('now') に更新する", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const plantId = makePlant(handle.sqlite, {
      name: "crop_history連動",
      family: "ウリ科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);

    const post = await request<{ planting: { id: number } }>(
      app,
      "POST",
      `/api/grids/${gridId}/cells/1/2/plantings`,
      { body: { pubkey: a, plantId, plantingDate: "2026-04-01" } },
      env,
    );
    expect(post.status).toBe(201);
    const plantingId = post.body.planting.id;

    const beforeHistory = handle.sqlite
      .prepare(
        "SELECT ended_at FROM crop_history WHERE grid_id = ? AND x = 1 AND y = 2 ORDER BY id DESC LIMIT 1",
      )
      .get(gridId) as { ended_at: string | null };
    expect(beforeHistory.ended_at).toBeNull();

    const del = await request(
      app,
      "DELETE",
      `/api/plantings/${plantingId}`,
      { query: { pubkey: a } },
      env,
    );
    expect(del.status).toBe(200);

    const afterHistory = handle.sqlite
      .prepare(
        "SELECT ended_at FROM crop_history WHERE grid_id = ? AND x = 1 AND y = 2 ORDER BY id DESC LIMIT 1",
      )
      .get(gridId) as { ended_at: string | null };
    expect(afterHistory.ended_at).toBeTruthy();
    // date('now') 形式 = YYYY-MM-DD
    expect(afterHistory.ended_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // PR #89 retro B2: rotation 警告クエリの正常系。
  // 同セル同 family を再植え付け → confirmRotation:false で rotationWarning が返り、
  // JOIN で plant.name が lastPlantName に入る（Issue #87 で p.japanese_name → p.name に直した回帰テスト）。
  it("POST plantings 再植え付けで rotationWarning.lastPlantName が plants.name から取れる", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const plantId = makePlant(handle.sqlite, {
      name: "桃太郎トマト",
      family: "ナス科",
      category: "vegetable",
    });
    const env = mockEnv(handle.db);

    // 1 回目: 同セルに植える
    const first = await request<{ planting: { id: number } }>(
      app,
      "POST",
      `/api/grids/${gridId}/cells/2/2/plantings`,
      { body: { pubkey: a, plantId, plantingDate: "2026-04-01" } },
      env,
    );
    expect(first.status).toBe(201);

    // 2 回目: 同じ家族 (ナス科) を同セルへ。confirmRotation: false で警告だけ取得。
    const second = await request<{
      ok: boolean;
      error?: string;
      rotationWarning?: {
        family: string;
        lastPlantName: string;
        recommendedWaitYears: number;
      };
    }>(
      app,
      "POST",
      `/api/grids/${gridId}/cells/2/2/plantings`,
      {
        body: {
          pubkey: a,
          plantId,
          plantingDate: "2026-05-01",
          confirmRotation: false,
        },
      },
      env,
    );
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(false);
    expect(second.body.error).toBe("rotation_warning");
    expect(second.body.rotationWarning?.family).toBe("ナス科");
    // JOIN で plant.name が取れていることを保証（回帰テスト）
    expect(second.body.rotationWarning?.lastPlantName).toBe("桃太郎トマト");
    expect(second.body.rotationWarning?.recommendedWaitYears).toBeGreaterThan(0);
  });
});
