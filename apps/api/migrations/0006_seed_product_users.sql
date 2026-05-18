-- seed_product_users : 種・苗マスターの利用ユーザー記録（DISTINCT 用）
-- Issue: kako-jun/farm-in-pocket#34
--
-- 目的:
--   seed_products.user_count は「何人のユーザーが使ったか」を表す DISTINCT カウント。
--   メモリで pubkey を持てない D1 環境では、利用ペア (seed_product_id, pubkey) を
--   ユニークに保存しておき、INSERT OR IGNORE で「初回利用かどうか」を判定して
--   user_count を加算する方式にする。
--   use_count は同じ pubkey でも何度でも加算（「のべ利用回数」）。
--
-- 注:
--   D1 は ON DELETE をセッション単位の PRAGMA foreign_keys でしか効かせない前提なので、
--   アプリ層で seed_products の DELETE は今のところ実装しない（マスタの追加のみ）。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS seed_product_users (
  seed_product_id INTEGER NOT NULL REFERENCES seed_products(id) ON DELETE CASCADE,
  pubkey          TEXT NOT NULL,
  used_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (seed_product_id, pubkey)
);

CREATE INDEX IF NOT EXISTS idx_seed_product_users_pubkey
  ON seed_product_users (pubkey);
