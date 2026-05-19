// Issue: kako-jun/farm-in-pocket#87
// profiles ルータの統合テスト。

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockD1Handle, createMockD1 } from "../test/d1-mock";
import { mockEnv } from "../test/factory";
import { pubkeyHex, request } from "../test/helpers";
import profilesRouter from "./profiles";

const app = new Hono<{ Bindings: { DB: D1Database } }>();
app.route("/api/profiles", profilesRouter);

let handle: MockD1Handle;

beforeEach(() => {
  handle = createMockD1();
});

afterEach(() => {
  handle.close();
});

describe("profiles router", () => {
  it("GET /api/profiles/me は不正な pubkey を 400", async () => {
    const env = mockEnv(handle.db);
    const res = await request(app, "GET", "/api/profiles/me", { query: { pubkey: "x" } }, env);
    expect(res.status).toBe(400);
  });

  it("GET /api/profiles/me は未登録なら profile:null", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request<{ profile: unknown | null }>(
      app,
      "GET",
      "/api/profiles/me",
      { query: { pubkey: a } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
  });

  it("PUT /api/profiles/me は upsert する", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    const res = await request<{
      profile: { displayName: string; region: string; locale: string };
    }>(
      app,
      "PUT",
      "/api/profiles/me",
      { body: { pubkey: a, displayName: "テスト太郎", region: "kanto", locale: "ja" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.body.profile.displayName).toBe("テスト太郎");
    expect(res.body.profile.region).toBe("kanto");
  });

  it("PUT /api/profiles/me は指定したフィールドだけ更新する（既存値保持）", async () => {
    const a = pubkeyHex("a");
    const env = mockEnv(handle.db);
    await request(
      app,
      "PUT",
      "/api/profiles/me",
      { body: { pubkey: a, displayName: "初期名", region: "kanto" } },
      env,
    );
    const second = await request<{ profile: { displayName: string; region: string } }>(
      app,
      "PUT",
      "/api/profiles/me",
      { body: { pubkey: a, region: "kansai" } },
      env,
    );
    expect(second.body.profile.displayName).toBe("初期名");
    expect(second.body.profile.region).toBe("kansai");
  });

  it("PUT 不正な pubkey は 400", async () => {
    const env = mockEnv(handle.db);
    const res = await request(
      app,
      "PUT",
      "/api/profiles/me",
      { body: { pubkey: "short", displayName: "x" } },
      env,
    );
    expect(res.status).toBe(400);
  });
});
