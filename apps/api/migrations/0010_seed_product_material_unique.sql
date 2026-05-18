-- 0010_seed_product_material_unique.sql
-- Issue: kako-jun/farm-in-pocket#34 レビュー MUST-2
--
-- seed_products / materials の重複登録は従来「INSERT 前に SELECT」で擬似 UNIQUE 化していたが、
-- 2 リクエストの同時着信で SELECT が両方とも空ヒットすれば INSERT が両方走り、
-- (brand, name, type) または (brand, name, category) の重複行が DB に残るレース条件があった。
--
-- D1 では PRAGMA foreign_keys = ON 等のセッション制御が中心で、ALTER TABLE … ADD CONSTRAINT
-- には対応していないが、CREATE UNIQUE INDEX は素直に効くため、ここで物理 UNIQUE を敷く。
-- brand は NULL を許容するので COALESCE(brand, '') で正規化して比較する。
-- これにより、レース時の同時 INSERT は片方が UNIQUE 違反になり、ハンドラ側で
-- 既存行を SELECT し直して 200 + duplicated:true を返せる。
--
-- 既存データに既に重複行があるとこの CREATE は失敗するが、本リポは Phase 1 で
-- マスタ投入も未実施のため新規環境扱いで問題ない（CI と本番ともに db:reset:local で再構築）。

CREATE UNIQUE INDEX IF NOT EXISTS idx_seed_products_brand_name_type
  ON seed_products (COALESCE(brand, ''), name, type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_brand_name_category
  ON materials (COALESCE(brand, ''), name, category);
