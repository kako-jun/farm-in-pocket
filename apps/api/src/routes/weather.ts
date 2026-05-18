// 気象データ API (Issue: kako-jun/farm-in-pocket#32)
//
// GET /api/weather?region=<text>&date=YYYY-MM-DD
//
// 1. weather_cache を (region, date) で SELECT
// 2. ヒット & 当日でない → そのまま返却
//    ヒット & 当日 & fetched_at から 6h 経過 → 再取得して UPSERT
//    ヒット & 当日 & 6h 未満 → そのまま返却
//    ミス → Open-Meteo geocoding → forecast を叩いて INSERT
// 3. 外部 API 失敗時は 200 + { record: null, error } で返す（フロントが「取れなかった」表示）
//
// 室内グリッド除外はフロント側の責務（GridEnvironment in indoor/greenhouse は呼ばない）。
// Phase 2 では認可なし: region 文字列単位のキャッシュ共有。

import type { WeatherCacheRecord } from "@farm-in-pocket/shared";
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

interface WeatherRow {
  region: string;
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_avg: number | null;
  weather_code: string | null;
  sunshine_hours: number | null;
  fetched_at: string;
}

function toRecord(row: WeatherRow): WeatherCacheRecord {
  return {
    region: row.region,
    date: row.date,
    tempMax: row.temp_max,
    tempMin: row.temp_min,
    tempAvg: row.temp_avg,
    weatherCode: row.weather_code,
    sunshineHours: row.sunshine_hours,
    fetchedAt: row.fetched_at,
  };
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * fetched_at（"YYYY-MM-DD HH:MM:SS" UTC）から経過時間（秒）。失敗時は無限大扱い。
 */
function secondsSince(iso: string): number {
  // D1 datetime('now') は "YYYY-MM-DD HH:MM:SS" 形式（UTC）。Date がパースできるよう "T" / "Z" 補正。
  const normalized = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
  const t = new Date(normalized).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 1000;
}

interface GeocodingResult {
  results?: Array<{
    latitude: number;
    longitude: number;
    name: string;
    country?: string;
    admin1?: string;
  }>;
}

interface ForecastResult {
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    weather_code?: Array<number | null>;
    sunshine_duration?: Array<number | null>;
  };
}

/**
 * Open-Meteo geocoding API で region 文字列 → (lat, lon)。失敗時は null。
 */
async function geocode(region: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    region,
  )}&count=1&language=ja`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as GeocodingResult;
    const first = data.results?.[0];
    if (!first) return null;
    return { lat: first.latitude, lon: first.longitude };
  } catch {
    return null;
  }
}

/**
 * Open-Meteo forecast で指定日 (1 日分) の天気を取得。失敗時 null。
 */
async function fetchForecast(
  lat: number,
  lon: number,
  date: string,
): Promise<{
  tempMax: number | null;
  tempMin: number | null;
  weatherCode: number | null;
  sunshineHours: number | null;
} | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code,sunshine_duration&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as ForecastResult;
    const daily = data.daily;
    if (!daily || !daily.time || daily.time.length === 0) return null;
    const i = daily.time.indexOf(date);
    const idx = i >= 0 ? i : 0;
    const sunshineSec = daily.sunshine_duration?.[idx] ?? null;
    return {
      tempMax: daily.temperature_2m_max?.[idx] ?? null,
      tempMin: daily.temperature_2m_min?.[idx] ?? null,
      weatherCode: daily.weather_code?.[idx] ?? null,
      sunshineHours: typeof sunshineSec === "number" ? sunshineSec / 3600 : null,
    };
  } catch {
    return null;
  }
}

const TODAY_REFRESH_SECONDS = 6 * 60 * 60; // 6h

// ----------------------------------------------------------------------------
// GET /api/weather?region=...&date=YYYY-MM-DD
// ----------------------------------------------------------------------------
app.get("/", async (c) => {
  const region = c.req.query("region");
  const date = c.req.query("date");
  if (!region || typeof region !== "string" || region.length === 0) {
    return c.json({ error: "region required" }, 400);
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "invalid date" }, 400);
  }

  const cached = await c.env.DB.prepare(
    `SELECT region, date, temp_max, temp_min, temp_avg, weather_code, sunshine_hours, fetched_at
       FROM weather_cache WHERE region = ? AND date = ?`,
  )
    .bind(region, date)
    .first<WeatherRow>();

  const isToday = date === todayYmd();
  if (cached) {
    // 過去日 → 変わらないのでそのまま返す。当日でも 6h 以内ならキャッシュ採用。
    if (!isToday || secondsSince(cached.fetched_at) < TODAY_REFRESH_SECONDS) {
      return c.json({ record: toRecord(cached) });
    }
    // 当日 & 古い → 再取得を試みる。失敗したら古いキャッシュを返す。
  }

  const geo = await geocode(region);
  if (!geo) {
    if (cached) return c.json({ record: toRecord(cached) });
    return c.json({ record: null, error: "geocoding_failed" });
  }
  const forecast = await fetchForecast(geo.lat, geo.lon, date);
  if (!forecast) {
    if (cached) return c.json({ record: toRecord(cached) });
    return c.json({ record: null, error: "forecast_failed" });
  }

  const tempAvg =
    forecast.tempMax !== null && forecast.tempMin !== null
      ? (forecast.tempMax + forecast.tempMin) / 2
      : null;
  const weatherCodeStr = forecast.weatherCode === null ? null : String(forecast.weatherCode);

  // UPSERT: 既存キャッシュは UNIQUE(region, date) の競合で上書きする
  await c.env.DB.prepare(
    `INSERT INTO weather_cache (region, date, temp_max, temp_min, temp_avg, weather_code, sunshine_hours, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(region, date) DO UPDATE SET
       temp_max = excluded.temp_max,
       temp_min = excluded.temp_min,
       temp_avg = excluded.temp_avg,
       weather_code = excluded.weather_code,
       sunshine_hours = excluded.sunshine_hours,
       fetched_at = excluded.fetched_at`,
  )
    .bind(
      region,
      date,
      forecast.tempMax,
      forecast.tempMin,
      tempAvg,
      weatherCodeStr,
      forecast.sunshineHours,
    )
    .run();

  const row = await c.env.DB.prepare(
    `SELECT region, date, temp_max, temp_min, temp_avg, weather_code, sunshine_hours, fetched_at
       FROM weather_cache WHERE region = ? AND date = ?`,
  )
    .bind(region, date)
    .first<WeatherRow>();
  if (!row) return c.json({ record: null, error: "cache_write_failed" });
  return c.json({ record: toRecord(row) });
});

export default app;
