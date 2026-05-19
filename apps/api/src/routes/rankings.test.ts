// Issue: kako-jun/farm-in-pocket#87
// rankings ルータの統合テスト。
//
// Nostalgic API は fetch モックで差し替える（NOSTALGIC_API_BASE はテスト用ベースに上書き）。
// auto-difficulty は Nostalgic を叩かないので D1 集計だけ確認する。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { makeCell, makeGrid, makePlant, makePlanting, mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import rankingsRouter from "./rankings";

const app = new Hono<{
  Bindings: {
    DB: D1Database;
    NOSTALGIC_TOKEN: string;
    NOSTALGIC_API_BASE?: string;
  };
}>();
app.route("/api/rankings", rankingsRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
  // PR #89 retro B3: vi.stubGlobal('fetch', ...) は restoreAllMocks では戻らないため、
  // unstubAllGlobals を併用して fetch のグローバル差し替えを次テストに残さない。
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rankings router", () => {
  it("GET /api/rankings/:slug は不正な slug を 400", async () => {
    const env = mockEnv(handle.db);
    const res = await request(app, "GET", "/api/rankings/not-a-slug", {}, env);
    expect(res.status).toBe(400);
  });

  it("GET /api/rankings/auto-difficulty は D1 集計を返す", async () => {
    const a = pubkeyHex("a");
    const gridId = makeGrid(handle.sqlite, a);
    const cellId = makeCell(handle.sqlite, gridId, 0, 0);
    const plantId = makePlant(handle.sqlite, {
      name: "失敗テスト",
      family: "ナス科",
      category: "vegetable",
    });
    makePlanting(handle.sqlite, {
      cellId,
      plantId,
      state: "ended",
      endTag: "died",
    });
    const env = mockEnv(handle.db);
    const res = await request<{
      entries: Array<{ plantId: number; total: number; failed: number; failureRate: number }>;
    }>(app, "GET", "/api/rankings/auto-difficulty", {}, env);
    expect(res.status).toBe(200);
    const entry = res.body.entries.find((e) => e.plantId === plantId);
    expect(entry?.failed).toBe(1);
    expect(entry?.failureRate).toBe(1);
  });

  it("GET /api/rankings/fun-to-grow は token 未設定なら warning + 空配列", async () => {
    const env = mockEnv(handle.db); // token は空文字
    const res = await request<{ entries: unknown[]; warning?: string }>(
      app,
      "GET",
      "/api/rankings/fun-to-grow",
      {},
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.warning).toBeDefined();
  });

  it("POST /:slug/vote は plantId 不在で 404", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      "/api/rankings/fun-to-grow/vote",
      { body: { pubkey: a, plantId: 9999999 } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("POST /:slug/vote は auto-difficulty を 400", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "POST",
      "/api/rankings/auto-difficulty/vote",
      { body: { pubkey: a, plantId: 1 } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("POST /:slug/vote は Nostalgic モックを通して 1 票入る", async () => {
    const a = pubkeyHex("a");
    const plantId = makePlant(handle.sqlite, {
      name: "票テスト",
      family: "ナデシコ科",
      category: "flower",
    });
    // Nostalgic API モック
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : (input as URL).toString();
        if (url.includes("action=get")) {
          return new Response(JSON.stringify({ success: true, data: { entries: [] } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("action=submit")) {
          return new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("ok", { status: 200 });
      }),
    );
    const env = mockEnv(handle.db, {
      NOSTALGIC_TOKEN: "test-token",
      NOSTALGIC_API_BASE: "https://nostalgic.test.invalid",
    });
    const res = await request<{
      ok: boolean;
      alreadyVoted: boolean;
      score: number | null;
    }>(app, "POST", "/api/rankings/fun-to-grow/vote", { body: { pubkey: a, plantId } }, env);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyVoted).toBe(false);
    expect(res.body.score).toBe(1);
  });

  it("POST /:slug/vote 2 回目は alreadyVoted:true", async () => {
    const a = pubkeyHex("a");
    const plantId = makePlant(handle.sqlite, {
      name: "二重投票",
      family: "バラ科",
      category: "flower",
    });
    handle.sqlite
      .prepare("INSERT INTO ranking_votes (slug, pubkey, plant_id) VALUES ('fun-to-grow', ?, ?)")
      .run(a, plantId);
    const env = mockEnv(handle.db);
    const res = await request<{ alreadyVoted: boolean }>(
      app,
      "POST",
      "/api/rankings/fun-to-grow/vote",
      { body: { pubkey: a, plantId } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.alreadyVoted).toBe(true);
  });
});
