// プロフィール API (Issue: kako-jun/farm-in-pocket#32)
//
// - GET /api/profiles/me?pubkey=<hex64>
// - PUT /api/profiles/me  { pubkey, displayName?, region?, locale? }
//
// プロフィール行は他のテーブル（grids 等）から FK 参照されるため、PUT は upsert で扱う。
// Phase 1 範囲では NIP-98 未導入のため、pubkey は body/query で受けて
// 自分の行のみ更新可能（path/query/body の pubkey 一致を前提とする）。

import type { ProfileRecord } from "@farm-in-pocket/shared";
import { isValidPubkeyHex } from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

interface ProfileRow {
  pubkey: string;
  display_name: string | null;
  region: string | null;
  locale: string;
}

function toProfile(row: ProfileRow): ProfileRecord {
  return {
    pubkey: row.pubkey,
    displayName: row.display_name,
    region: row.region,
    locale: row.locale,
  };
}

// ----------------------------------------------------------------------------
// GET /api/profiles/me?pubkey=<hex64>
// ----------------------------------------------------------------------------
app.get("/me", async (c) => {
  const rawPubkey = c.req.query("pubkey");
  if (!rawPubkey || !isValidPubkeyHex(rawPubkey)) {
    return c.json({ error: "invalid pubkey" }, 400);
  }
  const pubkey = rawPubkey.toLowerCase();
  const row = await c.env.DB.prepare(
    "SELECT pubkey, display_name, region, locale FROM profiles WHERE pubkey = ?",
  )
    .bind(pubkey)
    .first<ProfileRow>();
  return c.json({ profile: row ? toProfile(row) : null });
});

// ----------------------------------------------------------------------------
// PUT /api/profiles/me
// body: { pubkey, displayName?, region?, locale? }
//   - upsert。指定されたフィールドだけ更新（既存値を保ったまま）。
//   - 文字列はそのまま、null は明示的に NULL クリア、undefined は据え置き。
// ----------------------------------------------------------------------------
app.put("/me", async (c) => {
  const body = await c.req.json<{
    pubkey?: unknown;
    displayName?: unknown;
    region?: unknown;
    locale?: unknown;
  }>();
  if (typeof body.pubkey !== "string" || !isValidPubkeyHex(body.pubkey)) {
    return c.json({ error: "invalid pubkey" }, 400);
  }
  const pubkey = body.pubkey.toLowerCase();

  // 検証: 任意フィールドは string | null | undefined のみ
  function parseOpt(v: unknown, name: string): string | null | undefined | Response {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v === "string") return v;
    return c.json({ error: `invalid ${name}` }, 400);
  }
  const displayName = parseOpt(body.displayName, "displayName");
  if (displayName instanceof Response) return displayName;
  const region = parseOpt(body.region, "region");
  if (region instanceof Response) return region;
  const locale = parseOpt(body.locale, "locale");
  if (locale instanceof Response) return locale;
  // locale だけは null では消さず（NOT NULL DEFAULT 'ja' なので）、undefined 扱いに丸める
  const finalLocale = typeof locale === "string" && locale.length > 0 ? locale : undefined;

  const existing = await c.env.DB.prepare(
    "SELECT pubkey, display_name, region, locale FROM profiles WHERE pubkey = ?",
  )
    .bind(pubkey)
    .first<ProfileRow>();

  if (existing) {
    const nextDisplay = displayName === undefined ? existing.display_name : displayName;
    const nextRegion = region === undefined ? existing.region : region;
    const nextLocale = finalLocale === undefined ? existing.locale : finalLocale;
    await c.env.DB.prepare(
      `UPDATE profiles
          SET display_name = ?,
              region = ?,
              locale = ?,
              updated_at = datetime('now')
        WHERE pubkey = ?`,
    )
      .bind(nextDisplay, nextRegion, nextLocale, pubkey)
      .run();
  } else {
    const nextDisplay = displayName === undefined ? null : displayName;
    const nextRegion = region === undefined ? null : region;
    const nextLocale = finalLocale ?? "ja";
    await c.env.DB.prepare(
      "INSERT INTO profiles (pubkey, display_name, region, locale) VALUES (?, ?, ?, ?)",
    )
      .bind(pubkey, nextDisplay, nextRegion, nextLocale)
      .run();
  }

  const row = await c.env.DB.prepare(
    "SELECT pubkey, display_name, region, locale FROM profiles WHERE pubkey = ?",
  )
    .bind(pubkey)
    .first<ProfileRow>();
  if (!row) return c.json({ error: "vanished" }, 500);
  return c.json({ ok: true, profile: toProfile(row) });
});

export default app;
