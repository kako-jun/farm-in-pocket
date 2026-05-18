-- 作物マスタは name で実質ユニーク（INSERT OR IGNORE で seed が二重投入されないように）
-- Issue: kako-jun/farm-in-pocket#13 レビュー対応 (MUST #1)
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_name_unique ON plants(name);
