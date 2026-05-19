// Issue: kako-jun/farm-in-pocket#87
// weather ルータの統合テスト。Open-Meteo を fetch モックで差し替える。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { mockEnv } from "../test/factory";
import { request } from "../test/helpers";
import weatherRouter from "./weather";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/weather", weatherRouter);

let handle: MockD1Handle;

// PR #89 retro B4: 「今日」の挙動が CI 実行日に依存しないよう fake timers で固定する。
// weather ルータは `today === date` のときだけ cache を refresh するため、テストが
// 走る暦上の日付に依存して挙動が変わるとフレーキーになる。
const FIXED_NOW = new Date("2026-05-19T00:00:00Z");
// 上の日付から計算した `today (YYYY-MM-DD)` 文字列。テスト内で日付を組み立てる際に使う。
const TODAY_YMD = FIXED_NOW.toISOString().slice(0, 10);

beforeEach(() => {
  handle = createMockD1();
  vi.useFakeTimers({ now: FIXED_NOW });
});

afterEach(() => {
  handle.close();
  // PR #89 retro B4: fake timers と stubGlobal('fetch') の両方を確実に元に戻す。
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface FetchCall {
  url: string;
}

function installFetchMock(): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      calls.push({ url });
      if (url.includes("geocoding-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            results: [{ latitude: 35.6895, longitude: 139.6917, name: "Tokyo" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("api.open-meteo.com")) {
        const match = url.match(/start_date=([\d-]+)/);
        const date = match?.[1] ?? "2026-05-01";
        return new Response(
          JSON.stringify({
            daily: {
              time: [date],
              temperature_2m_max: [22.5],
              temperature_2m_min: [12.3],
              weather_code: [3],
              sunshine_duration: [3600 * 5],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }),
  );
  return { calls };
}

describe("weather router", () => {
  it("GET /api/weather は region 無しで 400", async () => {
    const env = mockEnv(handle.db);
    const res = await request(app, "GET", "/api/weather", { query: { date: "2026-05-01" } }, env);
    expect(res.status).toBe(400);
  });

  it("GET /api/weather は不正な date を 400", async () => {
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "GET",
      "/api/weather",
      { query: { region: "東京", date: "2026/05/01" } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/weather はキャッシュミス時 Open-Meteo を叩いてキャッシュする", async () => {
    const { calls } = installFetchMock();
    const env = mockEnv(handle.db);
    // PR #89 retro B4: 日付ハードコードを止めて FIXED_NOW 由来の today を使う。
    // 「今日」を渡してもキャッシュが空なら geocoding + forecast の 2 回フェッチして保存されることを確認。
    const res = await request<{ record: { tempMax: number; tempMin: number } | null }>(
      app,
      "GET",
      "/api/weather",
      { query: { region: "東京", date: TODAY_YMD } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.record).not.toBeNull();
    expect(res.body.record?.tempMax).toBe(22.5);
    // geocoding + forecast の 2 回叩いている
    expect(calls.length).toBe(2);
    // キャッシュが書かれている
    const cached = handle.sqlite.prepare("SELECT COUNT(*) c FROM weather_cache").get() as {
      c: number;
    };
    expect(cached.c).toBe(1);
  });

  it("GET /api/weather は 2 回目を cache hit で返す（過去日）", async () => {
    const { calls } = installFetchMock();
    const env = mockEnv(handle.db);
    await request(
      app,
      "GET",
      "/api/weather",
      { query: { region: "東京", date: "2020-01-01" } },
      env,
    );
    const callsAfterFirst = calls.length;
    await request(
      app,
      "GET",
      "/api/weather",
      { query: { region: "東京", date: "2020-01-01" } },
      env,
    );
    // 2 回目は外部に叩きに行かない
    expect(calls.length).toBe(callsAfterFirst);
  });

  it("GET /api/weather は geocoding 失敗時 record:null を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })),
    );
    const env = mockEnv(handle.db);
    const res = await request<{ record: unknown | null; error?: string }>(
      app,
      "GET",
      "/api/weather",
      { query: { region: "未知の地名", date: TODAY_YMD } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.record).toBeNull();
    expect(res.body.error).toBe("geocoding_failed");
  });
});
