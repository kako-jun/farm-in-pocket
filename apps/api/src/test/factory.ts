// Issue: kako-jun/farm-in-pocket#87
// 統合テスト用ファクトリ。
//
// テスト時の Bindings 構築 + よく使う INSERT のショートカット。
// d1-mock の生 sqlite で直 INSERT して setup を高速化する（API 経由でセットアップ
// するとコード変更でテストが壊れやすいため、データ層を直に作る）。

import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { MockD1Database } from "./d1-mock";

export interface TestBindings {
  DB: D1Database;
  MYPACE_API_URL: string;
  NOSTALGIC_TOKEN: string;
  NOSTALGIC_API_BASE?: string;
}

/** Hono の Bindings 互換オブジェクトを作る。 */
export function mockEnv(db: MockD1Database, overrides?: Partial<TestBindings>): TestBindings {
  return {
    DB: db as unknown as D1Database,
    MYPACE_API_URL: "https://mypace.test.invalid",
    // 既定で `vote` テストが Nostalgic を叩こうとしないよう空文字にしておく
    // （ハンドラ側は空文字を「未設定」扱いで分岐するため）。
    NOSTALGIC_TOKEN: "",
    ...overrides,
  };
}

/** profiles テーブルに 1 行入れる。重複は無視。 */
export function makeProfile(
  sqlite: BetterSqliteDatabase,
  pubkey: string,
  region: string | null = null,
): void {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO profiles (pubkey, display_name, region, locale)
       VALUES (?, NULL, ?, 'ja')`,
    )
    .run(pubkey.toLowerCase(), region);
}

interface MakeGridOpts {
  id?: string;
  name?: string;
  environment?: string;
  lighting?: string | null;
  sizeX?: number;
  sizeY?: number;
  sortOrder?: number;
  archivedAt?: string | null;
}

/**
 * grids に 1 行入れる。profiles は無ければ作る。
 * 戻り値: 作った grid_id。
 */
export function makeGrid(
  sqlite: BetterSqliteDatabase,
  pubkey: string,
  opts: MakeGridOpts = {},
): string {
  makeProfile(sqlite, pubkey);
  const id = opts.id ?? `grid-${Math.random().toString(36).slice(2, 10)}`;
  const name = opts.name ?? "テスト畑";
  const environment = opts.environment ?? "outdoor_sunny";
  const lighting = opts.lighting ?? null;
  const sizeX = opts.sizeX ?? 3;
  const sizeY = opts.sizeY ?? 3;
  const sortOrder = opts.sortOrder ?? 0;
  const archivedAt = opts.archivedAt ?? null;
  sqlite
    .prepare(
      `INSERT INTO grids (id, user_pubkey, name, environment, lighting, size_x, size_y, sort_order, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      pubkey.toLowerCase(),
      name,
      environment,
      lighting,
      sizeX,
      sizeY,
      sortOrder,
      archivedAt,
    );
  return id;
}

interface MakeCellOpts {
  containerType?: string | null;
  soilType?: string | null;
}

/**
 * cells に 1 行入れる。戻り値は cell_id。
 * UNIQUE(grid_id, x, y) を尊重して上書きはしない（既存があれば古い id を返す）。
 */
export function makeCell(
  sqlite: BetterSqliteDatabase,
  gridId: string,
  x: number,
  y: number,
  opts: MakeCellOpts = {},
): number {
  const existing = sqlite
    .prepare("SELECT id FROM cells WHERE grid_id = ? AND x = ? AND y = ?")
    .get(gridId, x, y) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = sqlite
    .prepare(
      `INSERT INTO cells (grid_id, x, y, container_type, soil_type)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(gridId, x, y, opts.containerType ?? null, opts.soilType ?? null);
  return Number(info.lastInsertRowid);
}

interface MakePlantOpts {
  name: string;
  family: string;
  category: string;
  nameEn?: string | null;
  genus?: string | null;
  tags?: string[] | null;
  startMethods?: string[];
}

/**
 * plants に 1 行入れる。seed migrations で既存の name と衝突する場合は既存 id を返す。
 * 戻り値: plant_id。
 */
export function makePlant(sqlite: BetterSqliteDatabase, opts: MakePlantOpts): number {
  const existing = sqlite.prepare("SELECT id FROM plants WHERE name = ?").get(opts.name) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  const tagsJson = opts.tags ? JSON.stringify(opts.tags) : null;
  const startMethodsJson = JSON.stringify(opts.startMethods ?? ["seed"]);
  const info = sqlite
    .prepare(
      `INSERT INTO plants (name, name_en, family, genus, category, tags, start_methods, description, thumbnail_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .run(
      opts.name,
      opts.nameEn ?? null,
      opts.family,
      opts.genus ?? null,
      opts.category,
      tagsJson,
      startMethodsJson,
    );
  return Number(info.lastInsertRowid);
}

interface MakePlantingOpts {
  cellId: number;
  plantId: number;
  seedProductId?: number | null;
  state?: "planted" | "growing" | "ended";
  seedingDate?: string | null;
  plantingDate?: string | null;
  endDate?: string | null;
  endTag?: string | null;
  note?: string | null;
  failureMemo?: string | null;
}

/**
 * plantings に 1 行入れて current_planting_id も更新する。
 * 戻り値: planting_id。
 */
export function makePlanting(sqlite: BetterSqliteDatabase, opts: MakePlantingOpts): number {
  const info = sqlite
    .prepare(
      `INSERT INTO plantings (cell_id, plant_id, seed_product_id, state, seeding_date, planting_date,
                              end_date, end_tag, note, failure_memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.cellId,
      opts.plantId,
      opts.seedProductId ?? null,
      opts.state ?? "planted",
      opts.seedingDate ?? null,
      opts.plantingDate ?? null,
      opts.endDate ?? null,
      opts.endTag ?? null,
      opts.note ?? null,
      opts.failureMemo ?? null,
    );
  const id = Number(info.lastInsertRowid);
  // ended でないなら current_planting_id を更新
  if ((opts.state ?? "planted") !== "ended") {
    sqlite.prepare("UPDATE cells SET current_planting_id = ? WHERE id = ?").run(id, opts.cellId);
  }
  return id;
}

interface MakeSeedProductOpts {
  name: string;
  brand?: string | null;
  plantId: number;
  type?: "seed" | "seedling" | "bulb" | "other";
}

/** seed_products に 1 行入れて id を返す。 */
export function makeSeedProduct(sqlite: BetterSqliteDatabase, opts: MakeSeedProductOpts): number {
  const info = sqlite
    .prepare(
      `INSERT INTO seed_products (name, brand, plant_id, type)
       VALUES (?, ?, ?, ?)`,
    )
    .run(opts.name, opts.brand ?? null, opts.plantId, opts.type ?? "seed");
  return Number(info.lastInsertRowid);
}

interface MakeMaterialOpts {
  name: string;
  brand?: string | null;
  category: "soil" | "fertilizer_solid" | "fertilizer_liquid" | "pesticide" | "tool";
  subcategory?: string | null;
}

/** materials に 1 行入れて id を返す。 */
export function makeMaterial(sqlite: BetterSqliteDatabase, opts: MakeMaterialOpts): number {
  const info = sqlite
    .prepare(
      `INSERT INTO materials (name, brand, category, subcategory)
       VALUES (?, ?, ?, ?)`,
    )
    .run(opts.name, opts.brand ?? null, opts.category, opts.subcategory ?? null);
  return Number(info.lastInsertRowid);
}
