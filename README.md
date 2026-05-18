# Farm in Pocket (ポケ農)

**ポケットの中の農業 — 牧場物語のリアル MMO な家庭菜園 SNS**

> ステータス: 設計・実装中（旧 IoT 版は [`iot/`](./iot/) に保管）
>
> URL: https://farm-in-pocket.llll-ll.com （Coming soon）

## 概要

ポケ農は、家庭菜園からプロ農家までが自分の畑・プランターを「ポケットに入れて持ち歩く」感覚で記録・共有できるモバイルファースト PWA です。

- **モバイルファースト PWA** — スマホの中で完結する軽量 Web アプリ
- **無料・登録不要・公開強制** — 投稿は常にパブリック、アカウントは Nostr 鍵で自動生成
- **Nostr 基盤** — 認証・投稿は Nostr プロトコル経由（[mypace](https://github.com/kako-jun/mypace) に丸投げ）
- **家庭菜園からプロ農家まで** — プランター 1 つから就農レベルまで同じ UI でスケール

牧場物語のような「育てる楽しさ」と Twitter/Instagram のような「見せる気軽さ」をリアル農業に持ち込むのが狙いです。

## 技術スタック

- **Frontend**: Astro + React islands + Tailwind v4
- **Backend**: Hono + Cloudflare Workers
- **DB**: Cloudflare D1
- **配信**: Cloudflare Pages
- **認証/投稿**: Nostr (mypace 経由)

## D1 セットアップと運用

### 初回（本番 DB 作成）

1. `cd apps/api && pnpm wrangler d1 create farm-in-pocket`
2. 出力された `database_id` を `apps/api/wrangler.toml` の `REPLACE_WITH_PROD_DATABASE_ID` に貼る
3. `pnpm migrate:remote` で本番にマイグレーションを適用

### 開発時（ローカル sqlite）

- 初回: `cd apps/api && pnpm migrate:local`
- スキーマやり直し: `pnpm db:reset:local`（ローカル sqlite を全消去して再適用）
- 状態確認: `pnpm dev` 起動後、`http://127.0.0.1:8787/db/health` で テーブル一覧 JSON が返る

### マイグレーション追加

- 新規ファイルを `apps/api/migrations/NNNN_short_name.sql` で追加（連番）
- SQLite/D1 互換 SQL のみ使用
- **D1 では外部キー制約は enforce されない**（アプリ層で担保）
- **`updated_at` は手動で UPDATE 文に含める**（SQLite に ON UPDATE トリガがない）

## デプロイ（Cloudflare）

### 必要な GitHub Secrets
リポジトリ Settings → Secrets and variables → Actions に以下を登録:

- `CLOUDFLARE_API_TOKEN` — Pages + Workers + D1 の権限を持つトークン
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare ダッシュボードの Account ID

### 初期セットアップ（kako-jun 手動）

1. Cloudflare Pages プロジェクト作成: `farm-in-pocket`（Production branch: main）
2. カスタムドメイン: `farm-in-pocket.llll-ll.com` を Pages に紐付け（llll-ll.com の DNS は Cloudflare 管理）
3. Workers プロジェクト作成: `wrangler deploy` を 1 回 apps/api で実行（dashboard 上は `farm-in-pocket-api` で出現）
4. D1: `cd apps/api && pnpm wrangler d1 create farm-in-pocket` → 出力された ID を `wrangler.toml` の `REPLACE_WITH_PROD_DATABASE_ID` に貼る → コミット
5. 本番マイグレーション: `pnpm migrate:remote`
6. Workers のカスタムドメイン: `api.farm-in-pocket.llll-ll.com` を割り当て（wrangler.toml の routes コメントを有効化）
7. `apps/web/public/_redirects` の Workers ドメインを実 URL に書き換えてコミット

### 自動デプロイ

main マージ後、GitHub Actions が以下を実行:
- typecheck / biome / 全テスト
- apps/web を Cloudflare Pages にデプロイ
- apps/api を Workers にデプロイ
- マイグレーションは含めない（手動で `pnpm migrate:remote`）

### ローカル動作確認

- web: `pnpm --filter @farm-in-pocket/web dev` → http://127.0.0.1:4321
- api: `pnpm --filter @farm-in-pocket/api dev` → http://127.0.0.1:8787
- D1: `pnpm migrate:local` 済み前提

## プライバシー方針

ポケ農の作業記録・写真投稿は Nostr 経由で公開される。初回起動時に必読の注意事項モーダルを表示し、スキップ不可で承認させる。`localStorage` キー: `fip:privacy-accepted-v1`。承認後は設定 → 「プライバシー注意事項を再表示」から再表示できる。

## アカウント（Nostr）

ポケ農のアカウントは Nostr の鍵ペア（secp256k1）です。サーバー登録は不要で、端末ローカルに鍵が保存されます。

- **新規生成**: プライバシー注意事項を承認すると、初回フローで「新しい鍵を作る」を選べます。CSPRNG で 32 バイトの秘密鍵を生成。
- **インポート**: 既に他の Nostr クライアント（mypace, Damus, Snort 等）で使っている `nsec1...` を貼り付けて移行できます。
- **保存場所**: `localStorage` キー `fip:secret-key-v1` に hex 文字列で保存（MVP 実装）。
  - **TODO**: 後続フェーズで IndexedDB + WebCrypto (`SubtleCrypto`) による暗号化保存に移行予定。現状はプレーン保存なので、公共端末・共用ブラウザでは使わないでください。
- **リセット**: 設定 → アカウント → 「鍵を削除」で本端末から鍵を消せます。**復元は不可**なので、続けて使うなら先に nsec を控えてください。
- **npub 表示**: 設定 → アカウント → 「公開アドレス (npub)」でコピー可能。SNS で名乗るときに使えます。

実装は `nostr-tools` には依存せず、`@noble/secp256k1` v3 / `@noble/hashes` / `@scure/base` を直接使った最小実装（NIP-01 イベント署名 / NIP-19 nsec/npub / NIP-98 HTTP 認証）を `packages/shared/src/nostr/` に持っています。

## マイ畑（グリッド）

`/grid` ページから「マイ畑」を編集できます（Phase 1 / Issue #13, #14）。

- **複数マップ管理**（Issue #14）。「南側プランター / ベランダ左 / 祖母の畑」のように、屋外・室内・場所別に複数のマイ畑を持てます。
  - ヘッダーのタブバーで切り替え（横スクロール対応）。タブをダブルクリックすると名前を編集（最大 32 文字）。
  - 「+」ボタンで新規作成モーダル。「・・・」ボタンで並び替え・削除モード（↑↓で sort_order 入れ替え、削除は cells / plantings / 連作履歴も含めてカスケード削除する確認ダイアログ付き）。
  - アクティブなグリッド ID は `localStorage` キー `fip:active-grid-id-v1` に保存され、次回ロード時に復元されます（存在しない ID なら先頭にフォールバック）。
- **最大 9×9 グリッド**（実用 5×5 想定）。各セルは大きめのタップ領域でモバイル前提。
- **VOID セル**: 畝の外を「畑じゃない場所」として明示するための塗り潰し（背景斜線テクスチャ）。
- **容器 / 用土**: 各セルに容器タイプ（地植え / プランター / 鉢 / コンテナ / 板付け / ハンギング / 水耕 / その他）と用土タイプ（培養土 / 赤玉土 / 腐葉土 / ハイドロボール / 水苔 / ココチップ / 軽石 / 砂 / 水のみ / 養液 / なし / その他）を割り当て。
- **環境フラグ**: グリッド単位で「屋外（日向 / 半日陰 / 日陰）/ 室内 / 温室」を選択。室内のときだけ照明（自然光 / 育成ライト / 蛍光灯）を追加で選べる。屋外と室内で容器の選択肢を出し分け。
- **作物を植える**: セル → 「作物を植える」→ 検索（debounce 300ms）→ 選んだ作物の `plantings` レコードを作成。`seeding_date` は今日に自動セット。ライフサイクル詳細（germination / state 遷移 / 終了タグ）は後続 Issue で。
- **サイズ変更**: グリッドの size_x / size_y を変えると「過去の連作履歴との対応がリセットされます」確認ダイアログが出る（座標ベースで履歴管理しているため）。
- **セル詳細・施肥/農薬の記録**（Issue #15）。セルをタップすると詳細モーダルが開き、容器/用土・現在の作物・直近 10 件ずつの履歴を確認でき、「🍃 施肥」「🛡️ 農薬」ボタンで小フォームから種別・量・メモを記録できる（POST `/api/grids/:gridId/cells/:x/:y/{nutrient,pesticide}`）。
  - 「💧 水やり」は plantings の watering_settings 統合になるため別 Issue で実装予定。
  - **施肥バッジ**: 直近 30 日以内に施肥していたら右下に緑の点（`●` + 日数）。
  - **農薬バッジ**: 直近 14 日以内に農薬していたら左下に赤の点。
  - 経過時間に応じた fade（古いほど薄くなる演出）は **Phase 2 (#26)** で実装予定。本 Issue では閾値（30日 / 14日）で「出すか出さないか」だけ判定する。
  - 編集アクション（容器を変える / 用土を変える / VOID / クリア / 作物を植える）は詳細モーダル下部の小さなボタン群から委譲される。

データは **Cloudflare D1** に保存され、Nostr リレーには流れません。プライバシー方針として「日記＝D1、写真＝Nostr」を分離しています。

作物マスタは `apps/api/migrations/0002_seed_initial_plants.sql` で 20 件投入されます（トマト / ミニトマト / きゅうり / なす / ピーマン / じゃがいも / さつまいも / バジル / しそ / パセリ / ねぎ / レタス / ほうれん草 / 大根 / にんじん / ひまわり / チューリップ / モンステラ / ポトス / サボテン）。`family` は連作管理に効くため Wikipedia ベースで設定済み。

### API (Phase 1 範囲)

NIP-98 認可は未実装。`pubkey` をクエリ/body で受ける Phase 1 範囲（Issue #16 以降で NIP-98 化予定）。

- `GET    /api/grids?pubkey=<hex64>` — そのユーザーの全グリッド + cells を返す
- `POST   /api/grids` — 新規グリッド作成（profiles も同時 upsert）
- `PATCH  /api/grids/:id` — 部分更新。size_x/size_y 変更時はレスポンスに `cropHistoryResetWarning: true`
- `DELETE /api/grids/:id` — cells / plantings / crop_history も手動カスケード削除
- `PUT    /api/grids/:gridId/cells/:x/:y` — container_type / soil_type の upsert
- `DELETE /api/grids/:gridId/cells/:x/:y` — セル削除（VOID 解除や planting 解除には DELETE を使う）
- `GET    /api/plants?q=&family=&category=` — 作物マスタ検索（最大 50 件）
- `GET    /api/plants/:id` — 単体取得
- `POST   /api/grids/:gridId/cells/:x/:y/plantings` — 作物を植える
- `DELETE /api/plantings/:id` — 撤去（cells.current_planting_id を NULL に戻す）
- `POST   /api/grids/:gridId/cells/:x/:y/nutrient` — 施肥記録（Issue #15）
- `POST   /api/grids/:gridId/cells/:x/:y/pesticide` — 農薬記録（Issue #15）
- `GET    /api/grids/:gridId/cells/:x/:y/records?pubkey=<hex64>` — 直近の施肥/農薬を各 10 件返す（Issue #15）

## ディレクトリ構成

```
apps/web         Astro + React islands + Tailwind v4  (Phase 0 で初期化予定)
apps/api         Hono + Cloudflare Workers           (Phase 0 で初期化予定)
packages/shared  型 & mypace API クライアント         (Phase 0 で初期化予定)
iot/             旧 Raspberry Pi 版                   (Phase 4 で再統合予定)
```

## 設計参照

詳細な設計メモはローカルの Agasteer 上にあります:

- `repos/private/notes/.agasteer/notes/dev/farm-in-pocket.md`

## 旧 IoT 版について

Raspberry Pi 向けの旧版（Docker Compose + Yocto + React 監視 UI）は [`iot/`](./iot/) に保管されています。
将来 **Phase 4** で本 Web アプリと統合予定です（センサーデータを Web 側で受信・可視化する想定）。

## ライセンス

MIT
