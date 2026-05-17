-- farm-in-pocket initial schema (Phase 0)
-- Issue: kako-jun/farm-in-pocket#8
--
-- Notes:
--   * SQLite / Cloudflare D1 compatible.
--   * Masters (plants / seed_products / materials) are defined here as empty tables.
--     Initial data is loaded in Phase 3 issues.
--   * timestamps use TEXT ISO 8601 via datetime('now') default.
--   * forward references between grids / cells / plantings are allowed in SQLite;
--     order below is chosen for readability.

PRAGMA foreign_keys = ON;

-- ============================================================================
-- profiles : Nostr npub 単位のプロフィール
-- ============================================================================
CREATE TABLE profiles (
  pubkey       TEXT PRIMARY KEY,
  display_name TEXT,
  region       TEXT,
  locale       TEXT NOT NULL DEFAULT 'ja',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- grids : 畑グリッド定義
-- ============================================================================
CREATE TABLE grids (
  id           TEXT PRIMARY KEY,
  user_pubkey  TEXT NOT NULL REFERENCES profiles(pubkey) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  environment  TEXT NOT NULL CHECK (environment IN (
                 'outdoor_sunny','outdoor_partial_shade','outdoor_shade','indoor','greenhouse'
               )),
  lighting     TEXT CHECK (lighting IN ('natural_only','grow_light','fluorescent_led')),
  size_x       INTEGER NOT NULL CHECK (size_x BETWEEN 1 AND 9),
  size_y       INTEGER NOT NULL CHECK (size_y BETWEEN 1 AND 9),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_grids_user_sort ON grids (user_pubkey, sort_order);

-- ============================================================================
-- plants : 作物マスター（Phase 3 で初期データ投入）
-- ============================================================================
CREATE TABLE plants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  name_en       TEXT,
  family        TEXT NOT NULL,
  genus         TEXT,
  category      TEXT NOT NULL CHECK (category IN (
                  'vegetable','fruit','flower','herb','houseplant','bulb','succulent','other'
                )),
  tags          TEXT,
  start_methods TEXT NOT NULL,
  description   TEXT,
  thumbnail_url TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plants_family   ON plants (family);
CREATE INDEX idx_plants_category ON plants (category);

-- ============================================================================
-- seed_products : 種・苗マスター（Phase 3）
-- ============================================================================
CREATE TABLE seed_products (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  brand            TEXT,
  plant_id         INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('seed','seedling','bulb','other')),
  thumbnail_url    TEXT,
  affiliate_links  TEXT,
  use_count        INTEGER NOT NULL DEFAULT 0,
  user_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- materials : 資材マスター（Phase 3）
-- ============================================================================
CREATE TABLE materials (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  brand           TEXT,
  category        TEXT NOT NULL CHECK (category IN (
                    'soil','fertilizer_solid','fertilizer_liquid','pesticide','tool'
                  )),
  subcategory     TEXT,
  target_tags     TEXT,
  tags            TEXT,
  dilution        TEXT,
  description     TEXT,
  thumbnail_url   TEXT,
  affiliate_links TEXT,
  use_count       INTEGER NOT NULL DEFAULT 0,
  user_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- cells : グリッドのセル
--   * current_planting_id は plantings を参照する forward reference。
--     SQLite は forward reference を許す（plantings 定義は下に続く）。
-- ============================================================================
CREATE TABLE cells (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  grid_id             TEXT NOT NULL REFERENCES grids(id) ON DELETE CASCADE,
  x                   INTEGER NOT NULL,
  y                   INTEGER NOT NULL,
  container_type      TEXT CHECK (container_type IN (
                        'jiue','planter','pot','container','board_mounted','hanging',
                        'hydroponics','other','void'
                      )),
  soil_type           TEXT CHECK (soil_type IN (
                        'potting_mix','akadama','leafmold','hydroball','sphagnum',
                        'coconut_chips','pumice','sand','water_only',
                        'hydroponics_nutrient','none','other'
                      )),
  current_planting_id INTEGER REFERENCES plantings(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (grid_id, x, y)
);

-- ============================================================================
-- plantings : 作物ライフサイクル
-- ============================================================================
CREATE TABLE plantings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id           INTEGER NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  plant_id          INTEGER NOT NULL REFERENCES plants(id) ON DELETE RESTRICT,
  seed_product_id   INTEGER REFERENCES seed_products(id) ON DELETE SET NULL,
  state             TEXT NOT NULL CHECK (state IN ('planted','growing','ended')) DEFAULT 'planted',
  seeding_date      TEXT,
  germination_date  TEXT,
  planting_date     TEXT,
  end_date          TEXT,
  end_tag           TEXT CHECK (end_tag IN (
                      'bloomed','fruited','died','disease','pest','failed','removed'
                    )),
  seeding_depth_cm  REAL,
  plant_spacing_cm  REAL,
  row_spacing_cm    REAL,
  failure_memo      TEXT,
  note              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plantings_cell  ON plantings (cell_id);
CREATE INDEX idx_plantings_state ON plantings (state);

-- ============================================================================
-- crop_history : 座標ベース連作履歴
--   * plant_family は plants.family を凍結保存（denormalize）して履歴の科を保持
-- ============================================================================
CREATE TABLE crop_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  grid_id       TEXT NOT NULL REFERENCES grids(id) ON DELETE CASCADE,
  x             INTEGER NOT NULL,
  y             INTEGER NOT NULL,
  plant_id      INTEGER NOT NULL REFERENCES plants(id) ON DELETE RESTRICT,
  plant_family  TEXT NOT NULL,
  year          INTEGER NOT NULL,
  season        TEXT CHECK (season IN ('spring','summer','autumn','winter')),
  planted_at    TEXT NOT NULL,
  ended_at      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_crop_history_grid_xy_year ON crop_history (grid_id, x, y, year);

-- ============================================================================
-- ph_records : pH 測定記録
-- ============================================================================
CREATE TABLE ph_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id     INTEGER NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  measured_at TEXT NOT NULL,
  value       REAL NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ph_records_cell_measured ON ph_records (cell_id, measured_at);

-- ============================================================================
-- nutrient_records : 養分投入記録
-- ============================================================================
CREATE TABLE nutrient_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id       INTEGER NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  applied_at    TEXT NOT NULL,
  nutrient_type TEXT NOT NULL CHECK (nutrient_type IN (
                  'nitrogen','phosphorus','potassium','calcium','magnesium','sulfur',
                  'iron','manganese','zinc','boron','organic','other'
                )),
  material_id   INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  amount        REAL,
  amount_unit   TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nutrient_records_cell_applied ON nutrient_records (cell_id, applied_at);

-- ============================================================================
-- watering_settings : 水やり間隔
-- ============================================================================
CREATE TABLE watering_settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  planting_id     INTEGER NOT NULL REFERENCES plantings(id) ON DELETE CASCADE,
  interval_days   INTEGER NOT NULL CHECK (interval_days > 0),
  last_watered_at TEXT,
  next_due_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (planting_id)
);

-- ============================================================================
-- watering_log : 水やり実施記録
-- ============================================================================
CREATE TABLE watering_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  planting_id INTEGER NOT NULL REFERENCES plantings(id) ON DELETE CASCADE,
  watered_at  TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_watering_log_planting_watered ON watering_log (planting_id, watered_at);

-- ============================================================================
-- weather_cache : 気象データキャッシュ（Open-Meteo 等）
-- ============================================================================
CREATE TABLE weather_cache (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  region         TEXT NOT NULL,
  date           TEXT NOT NULL,
  temp_max       REAL,
  temp_min       REAL,
  temp_avg       REAL,
  weather_code   TEXT,
  sunshine_hours REAL,
  fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (region, date)
);
