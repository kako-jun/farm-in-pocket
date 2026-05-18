-- material_users : 資材マスターの利用ユーザー記録（DISTINCT 用）
-- Issue: kako-jun/farm-in-pocket#35
--
-- 目的:
--   materials.user_count は「何人のユーザーが使ったか」を表す DISTINCT カウント。
--   D1 では使用ペア (material_id, pubkey) をユニークに保存しておき、
--   INSERT OR IGNORE で「初回利用かどうか」を判定して user_count を加算する。
--   use_count は同じ pubkey でも何度でも加算（「のべ利用回数」）。
--
-- 注:
--   seed_product_users (0006) と同パターン。
--   D1 は PRAGMA foreign_keys をセッション単位でしか効かせないため、
--   ON DELETE CASCADE は enforce されない前提。
--   アプリ層で materials の DELETE は実装しない（マスタの追加のみ）。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS material_users (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  pubkey      TEXT NOT NULL,
  used_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (material_id, pubkey)
);

CREATE INDEX IF NOT EXISTS idx_material_users_pubkey
  ON material_users (pubkey);
