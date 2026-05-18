-- farm-in-pocket: 農薬記録テーブル
-- Issue: kako-jun/farm-in-pocket#15
--
-- nutrient_records は 0001 で既に存在する。今回は pesticide_records のみ追加。
-- 「最後にやったか」バッジ表示・履歴一覧で使う。

CREATE TABLE IF NOT EXISTS pesticide_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id         INTEGER NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  applied_at      TEXT NOT NULL,
  pesticide_type  TEXT NOT NULL CHECK (pesticide_type IN (
                    'insecticide','fungicide','herbicide','repellent','adhesive','other'
                  )),
  material_id     INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  target_tags     TEXT, -- JSON array (例: '["aphid","powdery_mildew"]')
  amount          REAL,
  amount_unit     TEXT,
  dilution_ratio  INTEGER, -- 倍液 (例: 1000)
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pesticide_records_cell_applied
  ON pesticide_records (cell_id, applied_at DESC);
