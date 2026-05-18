-- ranking_votes : Nostalgic Ranking テーマ別ランキングの重複投票防止用
-- Issue: kako-jun/farm-in-pocket#39
--
-- 目的:
--   ランキング（fun-to-grow / beginner-friendly / difficult / balcony-friendly /
--   indoor-photogenic）への投票は「1 ユーザー 1 植物 1 票」。
--   Nostalgic 側は同一 name (= "p{plantId}") に対して UPSERT して score を伸ばすだけで、
--   投票者識別の機能は持たない。
--   そこで Workers 側で (slug, pubkey, plant_id) を一意キーに持って弾く。
--
-- スキーマ:
--   slug      : "fun-to-grow" 等の theme slug
--   pubkey    : 投票者の Nostr pubkey (hex)
--   plant_id  : 投票対象の植物 id (plants.id)
--   voted_at  : 投票時刻
--
-- 注:
--   D1 は外部キーを enforce しないため REFERENCES は文書化のみ。
--   投票履歴は永続。投票取り消し UI は持たない（カウンタ専用）。
--   slug は ENUM 化しない（クライアントから受け取った文字列をそのまま入れる。
--   未知 slug の投票は Workers 側で 400 を返してそもそもここまで来ない）。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ranking_votes (
  slug      TEXT NOT NULL,
  pubkey    TEXT NOT NULL,
  plant_id  INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  voted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, pubkey, plant_id)
);

CREATE INDEX IF NOT EXISTS idx_ranking_votes_slug_plant
  ON ranking_votes (slug, plant_id);

CREATE INDEX IF NOT EXISTS idx_ranking_votes_pubkey
  ON ranking_votes (pubkey);
