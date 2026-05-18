-- grids: アーカイブ機能（凍結）
-- Issue: kako-jun/farm-in-pocket#40
--
-- 目的:
--   グリッドを「削除せず凍結」する運用を提供する。
--   削除カスケード（cells / plantings / 連作履歴）を実行せずに、一覧から外して
--   後から復元できる状態にする。
--   ユースケース:
--     - 季節終わりの畑を一旦しまっておきたい
--     - 引っ越し前の家のベランダを記録として残したい
--     - 失敗続きで気分転換にいったん畳みたい
--
-- スキーマ:
--   archived_at TEXT NULL   : ISO8601 のタイムスタンプ。NULL ならアクティブ。
--
-- 注:
--   - 一覧 API は既定で archived_at IS NULL のみを返す（includeArchived=true で混ぜる）。
--   - PATCH /api/grids/:id に archive: true|false パラメータを追加する（archive 専用）。
--   - 物理削除 (DELETE /api/grids/:id) は引き続き可能。「凍結」と「破棄」は別物。

PRAGMA foreign_keys = ON;

ALTER TABLE grids ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_grids_archived ON grids(archived_at);
