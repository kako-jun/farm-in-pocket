// Issue: kako-jun/farm-in-pocket#31
// 水やりリマインダー（D1 状態管理）
//
// 概念:
//   - watering_settings: 植物（planting_id）ごとの水やり間隔と、最後にやった日 / 次回予定日。
//   - watering_log:      水やり実施記録（POST /water で 1 行追加 + settings の last_watered_at/next_due_at を更新）。
//   - 「今日のおせわ」リスト = next_due_at <= today AND interval_days IS NOT NULL な plantings。
//
// 認可: planting 経由は requirePlantingOwner、ユーザー横断は path/query pubkey 一致チェック。
// Phase 2 範囲。Web Push 通知は別 Issue (Phase 3+) で実装する。

import type { WateringDueRecord, WateringSettings } from "@farm-in-pocket/shared";
import { isValidPubkeyHex } from "@farm-in-pocket/shared";
import { Hono } from "hono";
import { requirePlantingOwner } from "../lib/auth";

type Bindings = {
  DB: D1Database;
};

// ルーターは 2 種類の prefix で mount される:
//   /api/plantings/:plantingId/{watering,water}
//   /api/users/:pubkey/watering-due
// それぞれ別 Hono にして index 側で個別 mount する。
const plantingsApp = new Hono<{ Bindings: Bindings }>();
const usersApp = new Hono<{ Bindings: Bindings }>();

interface WateringSettingsRow {
  planting_id: number;
  interval_days: number;
  last_watered_at: string | null;
  next_due_at: string | null;
}

function toWateringSettings(row: WateringSettingsRow): WateringSettings {
  return {
    plantingId: row.planting_id,
    intervalDays: row.interval_days,
    lastWateredAt: row.last_watered_at,
    nextDueAt: row.next_due_at,
  };
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * baseDate + interval_days を YYYY-MM-DD で返す。baseDate 不正なら今日基準で計算する。
 */
function addDays(baseDate: string | null, intervalDays: number): string {
  let base: Date;
  if (baseDate && /^\d{4}-\d{2}-\d{2}/.test(baseDate)) {
    base = new Date(`${baseDate.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(base.getTime())) {
      base = new Date();
    }
  } else {
    base = new Date();
  }
  const next = new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

/**
 * 日付文字列 a と b の差分日数 = floor((a - b) / 1day)。a/b は YYYY-MM-DD 前提。
 * 例: a="2026-05-20", b="2026-05-18" → 2。
 *     a="2026-05-18", b="2026-05-20" → -2。
 */
function diffDays(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime();
  const db = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.floor((da - db) / (24 * 60 * 60 * 1000));
}

// ----------------------------------------------------------------------------
// GET /api/plantings/:plantingId/watering?pubkey=<hex64>
// 設定取得。settings 行が無ければ settings: null を返す。
// ----------------------------------------------------------------------------
plantingsApp.get("/:plantingId/watering", async (c) => {
  const plantingId = Number(c.req.param("plantingId"));
  if (!Number.isInteger(plantingId) || plantingId <= 0) {
    return c.json({ error: "invalid plantingId" }, 400);
  }
  const auth = await requirePlantingOwner(c.env.DB, plantingId, c.req.query("pubkey"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const row = await c.env.DB.prepare(
    `SELECT planting_id, interval_days, last_watered_at, next_due_at
       FROM watering_settings WHERE planting_id = ?`,
  )
    .bind(plantingId)
    .first<WateringSettingsRow>();
  return c.json({ settings: row ? toWateringSettings(row) : null });
});

// ----------------------------------------------------------------------------
// PUT /api/plantings/:plantingId/watering
// body: { pubkey, intervalDays }
//   - intervalDays > 0 で upsert。next_due_at は last_watered_at + interval を再計算
//     （無ければ today + interval）。
//   - intervalDays = 0 / null / undefined で settings を DELETE（リマインダー解除）。
// ----------------------------------------------------------------------------
plantingsApp.put("/:plantingId/watering", async (c) => {
  const plantingId = Number(c.req.param("plantingId"));
  if (!Number.isInteger(plantingId) || plantingId <= 0) {
    return c.json({ error: "invalid plantingId" }, 400);
  }
  const body = await c.req.json<{ pubkey?: unknown; intervalDays?: unknown }>();
  const auth = await requirePlantingOwner(c.env.DB, plantingId, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const rawInterval = body.intervalDays;
  // null / undefined / 0 → 解除
  if (rawInterval === null || rawInterval === undefined || rawInterval === 0) {
    await c.env.DB.prepare("DELETE FROM watering_settings WHERE planting_id = ?")
      .bind(plantingId)
      .run();
    return c.json({ ok: true, settings: null });
  }
  if (typeof rawInterval !== "number" || !Number.isFinite(rawInterval) || rawInterval < 0) {
    return c.json({ error: "invalid intervalDays" }, 400);
  }
  const intervalDays = Math.floor(rawInterval);
  if (intervalDays <= 0) {
    return c.json({ error: "invalid intervalDays" }, 400);
  }

  // 既存 settings の last_watered_at を尊重し、next_due_at を再計算する
  const existing = await c.env.DB.prepare(
    `SELECT planting_id, interval_days, last_watered_at, next_due_at
       FROM watering_settings WHERE planting_id = ?`,
  )
    .bind(plantingId)
    .first<WateringSettingsRow>();

  const lastWateredAt = existing?.last_watered_at ?? null;
  const nextDueAt = addDays(lastWateredAt, intervalDays);

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE watering_settings
          SET interval_days = ?,
              next_due_at = ?,
              updated_at = datetime('now')
        WHERE planting_id = ?`,
    )
      .bind(intervalDays, nextDueAt, plantingId)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO watering_settings (planting_id, interval_days, last_watered_at, next_due_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(plantingId, intervalDays, lastWateredAt, nextDueAt)
      .run();
  }

  const row = await c.env.DB.prepare(
    `SELECT planting_id, interval_days, last_watered_at, next_due_at
       FROM watering_settings WHERE planting_id = ?`,
  )
    .bind(plantingId)
    .first<WateringSettingsRow>();
  if (!row) return c.json({ error: "vanished" }, 500);
  return c.json({ ok: true, settings: toWateringSettings(row) });
});

// ----------------------------------------------------------------------------
// POST /api/plantings/:plantingId/water
// body: { pubkey, wateredAt?, note? }
//   - watering_log INSERT。
//   - watering_settings があれば last_watered_at = wateredAt、next_due_at = wateredAt + interval。
//   - 無ければ何もしない（記録だけ残す）。
// ----------------------------------------------------------------------------
plantingsApp.post("/:plantingId/water", async (c) => {
  const plantingId = Number(c.req.param("plantingId"));
  if (!Number.isInteger(plantingId) || plantingId <= 0) {
    return c.json({ error: "invalid plantingId" }, 400);
  }
  const body = await c.req.json<{ pubkey?: unknown; wateredAt?: unknown; note?: unknown }>();
  const auth = await requirePlantingOwner(c.env.DB, plantingId, body.pubkey);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  let wateredAt: string;
  if (body.wateredAt === undefined || body.wateredAt === null) {
    wateredAt = todayYmd();
  } else if (typeof body.wateredAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.wateredAt)) {
    wateredAt = body.wateredAt.slice(0, 10);
  } else {
    return c.json({ error: "invalid wateredAt" }, 400);
  }

  const note =
    body.note === undefined || body.note === null
      ? null
      : typeof body.note === "string"
        ? body.note
        : null;

  await c.env.DB.prepare(
    "INSERT INTO watering_log (planting_id, watered_at, note) VALUES (?, ?, ?)",
  )
    .bind(plantingId, wateredAt, note)
    .run();

  // settings があれば last_watered_at / next_due_at を更新
  const settings = await c.env.DB.prepare(
    `SELECT planting_id, interval_days, last_watered_at, next_due_at
       FROM watering_settings WHERE planting_id = ?`,
  )
    .bind(plantingId)
    .first<WateringSettingsRow>();
  let updatedSettings: WateringSettings | null = null;
  if (settings) {
    const nextDueAt = addDays(wateredAt, settings.interval_days);
    await c.env.DB.prepare(
      `UPDATE watering_settings
          SET last_watered_at = ?,
              next_due_at = ?,
              updated_at = datetime('now')
        WHERE planting_id = ?`,
    )
      .bind(wateredAt, nextDueAt, plantingId)
      .run();
    updatedSettings = {
      plantingId: settings.planting_id,
      intervalDays: settings.interval_days,
      lastWateredAt: wateredAt,
      nextDueAt,
    };
  }

  return c.json({ ok: true, wateredAt, settings: updatedSettings });
});

// ----------------------------------------------------------------------------
// GET /api/users/:pubkey/watering-due?pubkey=<hex64>&on=YYYY-MM-DD
// その日に水やり期日を迎える plantings 一覧。
//   - on 省略時は今日。
//   - 条件: ws.interval_days IS NOT NULL AND ws.next_due_at <= on
//   - state="ended" は除外（終わった植物にリマインダーを出さない）。
// ----------------------------------------------------------------------------
usersApp.get("/:pubkey/watering-due", async (c) => {
  const pathPubkey = c.req.param("pubkey").toLowerCase();
  const queryPubkey =
    typeof c.req.query("pubkey") === "string" ? c.req.query("pubkey")?.toLowerCase() : null;
  if (!queryPubkey) {
    return c.json({ error: "pubkey query required" }, 400);
  }
  if (!isValidPubkeyHex(pathPubkey) || !isValidPubkeyHex(queryPubkey)) {
    return c.json({ error: "invalid pubkey" }, 400);
  }
  if (pathPubkey !== queryPubkey) {
    return c.json({ error: "forbidden" }, 403);
  }

  const onRaw = c.req.query("on");
  let on: string;
  if (onRaw === undefined || onRaw === null || onRaw === "") {
    on = todayYmd();
  } else if (typeof onRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(onRaw)) {
    on = onRaw;
  } else {
    return c.json({ error: "invalid on" }, 400);
  }

  // SHOULD: planting.state="ended" は除外。crop_history は state 管理外なので join しない。
  const res = await c.env.DB.prepare(
    `SELECT ws.planting_id   AS planting_id,
            ws.interval_days AS interval_days,
            ws.last_watered_at AS last_watered_at,
            ws.next_due_at   AS next_due_at,
            p.cell_id        AS cell_id,
            p.plant_id       AS plant_id,
            c.grid_id        AS grid_id,
            c.x              AS x,
            c.y              AS y,
            g.name           AS grid_name,
            pl.name          AS plant_name
       FROM watering_settings ws
       JOIN plantings p ON p.id = ws.planting_id
       JOIN cells c    ON c.id = p.cell_id
       JOIN grids g    ON g.id = c.grid_id
       LEFT JOIN plants pl ON pl.id = p.plant_id
      WHERE g.user_pubkey = ?
        AND p.state != 'ended'
        AND ws.interval_days IS NOT NULL
        AND ws.next_due_at IS NOT NULL
        AND substr(ws.next_due_at, 1, 10) <= ?
      ORDER BY ws.next_due_at ASC, ws.planting_id ASC`,
  )
    .bind(pathPubkey, on)
    .all<{
      planting_id: number;
      interval_days: number;
      last_watered_at: string | null;
      next_due_at: string;
      cell_id: number;
      plant_id: number;
      grid_id: string;
      x: number;
      y: number;
      grid_name: string;
      plant_name: string | null;
    }>();

  const records: WateringDueRecord[] = (res.results ?? []).map((row) => ({
    plantingId: row.planting_id,
    cellId: row.cell_id,
    gridId: row.grid_id,
    gridName: row.grid_name,
    x: row.x,
    y: row.y,
    plantId: row.plant_id,
    plantName: row.plant_name ?? "(削除済み作物)",
    intervalDays: row.interval_days,
    lastWateredAt: row.last_watered_at,
    nextDueAt: row.next_due_at.slice(0, 10),
    daysOverdue: diffDays(on, row.next_due_at.slice(0, 10)),
  }));
  return c.json({ records });
});

export { plantingsApp as wateringPlantingsRouter, usersApp as wateringUsersRouter };
