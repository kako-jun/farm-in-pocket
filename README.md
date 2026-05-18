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

## レイアウト / デザイン

全ページは `apps/web/src/layouts/MainLayout.astro` を共通レイアウトとして経由します（Issue #20）。MainLayout は HTML 骨格 / global CSS / PWA manifest 連携と、画面最下部のボトムナビ (`apps/web/src/components/BottomNav.astro`) を提供します。

### ボトムナビ

5 タブ固定の `position: fixed` ナビ（モバイル想定で高さ 64px）。アクティブ判定は `Astro.url.pathname` の startsWith。`/community/<npub>` のような動的サブパスも親タブが点灯します。

| アイコン | ラベル | href | 用途 |
|---|---|---|---|
| 🌱 | マイ畑 | `/` | トップ / ポータル |
| 🌾 | 畑編集 | `/grid` | グリッドエディタ |
| 📅 | 記録 | `/record` | 作業ログ投稿 |
| 🌍 | みんな | `/community` | コミュニティ一覧 / 他人の畑 |
| 👤 | 設定 | `/settings` | アカウント・プライバシー |

### スキュモーフィズム方針（控えめ）

- 操作系はタッチ最適化のモダン UI のまま。ビジュアルの質感だけ「ほんのり」懐かしくする。
- 過度なベタ塗りテクスチャや凹凸は付けない。業務アプリの使いやすさが最優先。
- ボトムナビと主要 primary ボタンに、ごく薄いハイライト + ドロップシャドウの bevel を載せる程度。

### デザイントークン

`apps/web/src/styles/global.css` の `@theme` ブロックで Tailwind v4 のユーティリティとして定義しています。

- `soil-50` / `soil-100` / `soil-200` / `soil-300` / `soil-500` / `soil-700` — オフホワイト〜薄茶のグラデ用。
- `shadow-bevel-sm` / `shadow-bevel` / `shadow-deep` — 内側ハイライト + 外側影の bevel 用シャドウ。
- `.safe-area-bottom` — iOS のホームバー / ノッチ用 `padding-bottom: env(safe-area-inset-bottom)`。

PWA manifest の `theme_color` / `background_color` も同系統（落ち着いた緑 + オフホワイト soil）に揃えています。

## 季節UI

Issue #41 で導入した、月から自動判定する季節テーマです。日本基準（北半球）。

### 月 → 季節 判定

| 月 | 季節 | アクセント色 | 背景グラデ |
|---|---|---|---|
| 3, 4, 5 | 🌸 春 | pink-500 (#ec4899) | `#fefcf7 → #ffe9ec` |
| 6, 7, 8 | ☀️ 夏 | sky-500 (#0ea5e9) | `#fefcf7 → #dbeafe` |
| 9, 10, 11 | 🍁 秋 | orange-600 (#ea580c) | `#fefcf7 → #fed7aa` |
| 12, 1, 2 | ❄️ 冬 | indigo-500 (#6366f1) | `#fefcf7 → #e0e7ff` |

正本は `packages/shared/src/season.ts`。判定ロジック (`seasonFromMonth` / `seasonNow`)、テーマ定義 (`seasonTheme`)、旬判定 (`inferSeasonForPlant` / `isSeasonalPlantForNow`) をひとまとめにしています。

### 実装

- `apps/web/src/components/SeasonBootstrap.tsx`（`MainLayout` から `client:load` で常時マウント）が、`document.body` に CSS 変数 (`--fip-body-gradient` / `--fip-accent-color` / `--fip-accent-color-soft`) と `data-fip-season` 属性を当てる。
- `apps/web/src/styles/global.css` の `body { background: var(--fip-body-gradient, ...) }` が変数を参照する。JS 無効環境ではフォールバック値（従来 soil グラデ）が当たる。

### 旬バッジ

plants.tags（JSON 配列）に「春まき / 春植え / 春先 / 夏野菜 / 夏まき / 夏植え / 秋まき / 秋植え / 秋野菜 / 冬野菜 / 冬まき」のいずれかの文字列が含まれていれば、その作物の季節を推定します。今の季節と一致したら:

- `/plants` の一覧カード右上に `🌸 旬` バッジ
- `/plants/:id` 詳細ページ冒頭に「今が旬です」バナー

を表示します。

### 季節を強制する（テスト・確認用）

`/settings` ページの「季節UI」セクションから、「自動 / 春 / 夏 / 秋 / 冬」を切替できます。選択は `localStorage` の `fip:season-override-v1` に保存され、`SeasonBootstrap` が拾って即座に反映します（タブ間も `storage` イベントで同期）。

## マイ畑（グリッド）

`/grid` ページから「マイ畑」を編集できます（Phase 1 / Issue #13, #14）。

- **複数マップ管理**（Issue #14）。「南側プランター / ベランダ左 / 祖母の畑」のように、屋外・室内・場所別に複数のマイ畑を持てます。
  - ヘッダーのタブバーで切り替え（横スクロール対応）。タブをダブルクリックすると名前を編集（最大 32 文字）。
  - 「+」ボタンで新規作成モーダル。「・・・」ボタンで並び替え・凍結・削除モード（↑↓で sort_order 入れ替え、削除は cells / plantings / 連作履歴も含めてカスケード削除する確認ダイアログ付き）。
  - アクティブなグリッド ID は `localStorage` キー `fip:active-grid-id-v1` に保存され、次回ロード時に復元されます（存在しない ID なら先頭にフォールバック）。
- **グリッドのアーカイブ（凍結）・サムネプレビュー・統計表示**（Issue #40）。「削除」と別に「凍結」操作を用意し、運用に耐える一覧 UI を整えました。
  - **凍結（archive）**: `PATCH /api/grids/:id` に `archive: true` を送ると `archived_at = datetime('now')` に切り替わります。`false` で復元。削除と違い `cells` / `plantings` / `crop_history` は壊さないので、季節終わりの畑や引っ越し前のベランダを「記録として残す」運用に使えます。
  - **アーカイブ表示トグル**: 一覧 `GET /api/grids` の既定は `archived_at IS NULL` のみ。`?includeArchived=true` で凍結中も混ぜて取得します。UI 上は「・・・」モードの「📦 凍結中を表示」ボタンで ON/OFF を切り替え。凍結中のタブには 📦 のラベルが付き、グレー表示になります。
  - **サムネプレビュー**: 並び替え・凍結・削除モードのリストに `GridThumbnail` を表示。各セルを 8px の正方形で塗り分けて、グリッドの形と植え付け状況を一目で把握できます（VOID=グレー斜線 / planting=濃い緑 / 容器あり=薄い緑 / 未設定=白）。
  - **グリッド統計**: `GET /api/grids?summary=true` で `cellCount` / `plantingCount` / `voidCount` / `cellsByContainer` を JOIN して返します。ManagePanel の各行に「N セル / N 植え付け中 / N 空き ( / N VOID )」を表示し、グリッドごとの使用率を確認できます。`summary` フィールドは `GridRecord` のオプショナル（指定時のみ詰める）。
- **最大 9×9 グリッド**（実用 5×5 想定）。各セルは大きめのタップ領域でモバイル前提。
- **VOID セル**: 畝の外を「畑じゃない場所」として明示するための塗り潰し（背景斜線テクスチャ）。
- **容器 / 用土**: 各セルに容器タイプ（地植え / プランター / 鉢 / コンテナ / 板付け / ハンギング / 水耕 / その他）と用土タイプ（培養土 / 赤玉土 / 腐葉土 / ハイドロボール / 水苔 / ココチップ / 軽石 / 砂 / 水のみ / 養液 / なし / その他）を割り当て。
- **環境フラグ**: グリッド単位で「屋外（日向 / 半日陰 / 日陰）/ 室内 / 温室」を選択。室内のときだけ照明（自然光 / 育成ライト / 蛍光灯）を追加で選べる。屋外と室内で容器の選択肢を出し分け。
- **作物を植える**: セル → 「作物を植える」→ 検索（debounce 300ms）→ 選んだ作物の `plantings` レコードを作成。`seeding_date` は今日に自動セット。
- **作物の状態遷移**（Issue #29）。セル詳細の「現在の作物」セクションから、`planted → growing → ended` のライフサイクル状態を切り替えられる。
  - **状態フロー**:
    - `planted`（植え付け）: 種まき直後 / 苗を植えた直後の初期状態。
    - `growing`（生育中）: 「生育中にする」ボタンで遷移。発芽・定着が確認できたタイミングなど。
    - `ended`（終了）: 「終了する」モーダルから `end_tag` を選んで遷移。任意で `failure_memo` を残せる。
  - **終了タグ 7 種**: 咲いた / 実った / 枯れた / 病気 / 虫害 / 失敗（原因不明）/ 抜いた。
  - **失敗メモ**: 終了モーダルの自由入力欄。「水切れさせた」「夏越し失敗」のようなふりかえりを残すため。
  - `state=ended` に遷移すると、`end_date` 省略時は API 側で今日が入り、対応する `crop_history.ended_at` も同じ日付で埋まる。連作判定はこの履歴を見ている。
  - `state` を `planted` / `growing` に戻すと `end_tag` / `end_date` / `failure_memo` は NULL リセットされる。
  - **削除より終了を優先**: `DELETE /api/plantings/:id` は物理削除のまま残しているが、UI 上は「終了する」ボタンを推奨。終了状態で残せば連作判断材料が増える。
- **サイズ変更**: グリッドの size_x / size_y を変えると「過去の連作履歴との対応がリセットされます」確認ダイアログが出る（座標ベースで履歴管理しているため）。
- **連作履歴の座標ベース管理**（Issue #22）。`crop_history` テーブルは `cell_id` ではなく **`grid_id + x + y`** で履歴を保持します。畝の区切りを変えても、同じ座標であれば養分・病気の偏りを追えます。
  - 履歴行の `plant_family` は **植えた時点の値を凍結**保存（denormalize）。`plants` マスタを後から削除/改名しても過去の科分類は壊れません。
  - 新しい planting を植えると、前 planting の crop_history は `ended_at = date('now')` で閉じられ、新規行が INSERT されます。
  - `DELETE /api/plantings/:id` は planting 自体は物理削除しますが、**crop_history は残します**（座標の連作判断材料として必要）。`ended_at` だけ `date('now')` で埋めます。
  - グリッドの `size_x` / `size_y` を変えると「過去の連作履歴との対応がリセットされます」の確認ダイアログが出ます。座標が変わるため履歴の意味が崩れるからです。
- **連作障害警告**（Issue #23）。新しい planting を作るとき、同じ座標 (grid_id, x, y) の `crop_history` に**同じ科**の最新行があれば、推奨待機年数と比較して警告を出します。
  - 推奨待機年数の参考値（`packages/shared/src/farm.ts` の `ROTATION_WAIT_YEARS`）:
    - ナス科: 4 年（トマト / なす / ピーマン / じゃがいも）
    - ウリ科: 3 年（きゅうり）
    - アブラナ科: 3 年（大根）
    - マメ科: 3 年
    - キク科: 2 年
    - セリ科: 2 年
    - ヒルガオ科: 2 年（さつまいも）
    - ヒガンバナ科: 2 年（ねぎ）
    - その他: 1 年
  - **警告はブロックではなく確認**です。「このセルでは N 年前にナス科のトマトを植えています。連作障害を避けるため、ナス科の植え付けは 4 年空けるのが理想です。それでも植えますか？」のダイアログで OK / キャンセルを選びます。
  - クライアントは初回 `POST /api/grids/:gridId/cells/:x/:y/plantings` を `confirmRotation: false` で送り、警告が返れば確認ダイアログを出し、ユーザーが OK したら `confirmRotation: true` で再送します（"分かった上で植える"）。
  - 旧クライアント（`confirmRotation` 未送信）は **既定で `true` 扱い**となり、警告は出さず作成だけ進めるため後方互換を壊しません。
- **セル詳細・施肥/農薬の記録**（Issue #15）。セルをタップすると詳細モーダルが開き、容器/用土・現在の作物・直近 10 件ずつの履歴・過去の連作履歴（直近 10 件）を確認でき、「🍃 施肥」「🛡️ 農薬」ボタンで小フォームから種別・量・メモを記録できる（POST `/api/grids/:gridId/cells/:x/:y/{nutrient,pesticide}`）。
  - **💧 水やり**（Issue #31）。作物（planting）が植わっているセルなら、クイック行の「💧 水やり」ボタンで `POST /api/plantings/:id/water` を打って実施記録を残せる。`watering_settings` があれば `last_watered_at = today` / `next_due_at = today + interval` も同時に更新される。
  - **施肥バッジ**: 施肥履歴があれば右下に緑の点（`●` + 日数）。経過日数に応じて自動でフェード（Issue #26）。
  - **農薬バッジ**: 農薬履歴があれば左下に赤の点。同じくフェード。
  - 編集アクション（容器を変える / 用土を変える / VOID / クリア / 作物を植える）は詳細モーダル下部の小さなボタン群から委譲される。
- **経過時間フェード**（Issue #26）。施肥/農薬/pH それぞれに「だいぶ前だな」を opacity で伝える演出。正確な残効モデル（半減期・温度・降雨量…）は定義せず、UI ヘルパとして `packages/shared/src/fade.ts` の `fadeOpacity(daysElapsed, schedule)` に集約。

  | schedule | 1.0 (濃い)              | 0.5 (薄い)        | 最終値 (ほぼ透明) |
  | -------- | ----------------------- | ----------------- | ----------------- |
  | `fertilize` | 〜7 日 (plateau)       | 30 日             | 90 日以上 = 0.15  |
  | `pesticide` | 〜7 日 (plateau)       | 14 日             | 28 日以上 = 0.15  |
  | `ph`        | 〜30 日 (plateau)      | 90 日             | 180 日以上 = 0.2  |

  - 閾値超過でもバッジ自体は非表示にせず、ほぼ透明グレーで「いつかやった」の名残を残す。
  - 同じヘルパをセル詳細モーダルの履歴リスト・pH リスト・pH 時系列グラフ・養分タイムラインチャートにも適用しているため、見え方が統一されている。
- **pH 測定記録**（Issue #24）。セル詳細モーダルに「土壌 pH」セクションがあり、現在の pH（最新測定値 + 測定日）と「pH 測定を記録」ボタンが並びます。
  - **入力範囲**: pH 0-14（実用は 3-10 を想定）。範囲外は API 側で 400。`measured_at` 省略時は今日。
  - **時系列グラフ**: 自前 SVG（外部ライブラリ非依存）で折れ線 + 各点を描画。y 軸は 0-14 固定で 4 / 7 / 10 にガイドライン。x 軸ラベルは最初・中央・最後の最大 3 点。
  - **古い値はフェード**: グラフの点も、直近 10 件の一覧も、古い測定値ほど薄く表示されます（参考値扱い）。
  - 関連 API: `POST /api/grids/:gridId/cells/:x/:y/ph`（記録）/ `GET /api/grids/:gridId/cells/:x/:y/ph?pubkey=<hex64>`（時系列昇順で全件）。
- **養分タイムライン**（Issue #25）。セル詳細モーダルに「養分タイムライン」セクションがあり、主要養分（窒素 N / リン酸 P / カリ K）の最終投入日サマリの 3 行と、自前 SVG タイムラインチャートが並びます。
  - **可視化方法**: 量を積み上げる累積グラフではなく、`nutrient_type` ごとに段（縦軸位置）を割り当て、その段に投入イベントを ● サイズ 6px で打つドットマップ。同じ種類の点は薄い線で繋ぐので、「最後にいつ何を入れたか」が一目で分かります。
  - **色の正本**: `packages/shared/src/farm.ts` の `NUTRIENT_COLORS`（nitrogen=緑 / phosphorus=赤 / potassium=紫 / calcium=黄 / magnesium=水色 / sulfur=橙 / iron=灰 / manganese=ライム / zinc=シアン / boron=薄灰 / organic=土色 / other=濃灰）。
  - **アクセシビリティ**: 各点に `aria-label="YYYY-MM-DD nutrient_type 量"` と SVG `<title>` を付与。
  - 関連 API: `GET /api/grids/:gridId/cells/:x/:y/nutrients?pubkey=<hex64>` がそのセルの全 `nutrient_records` を `applied_at` 昇順で返します（既存 `/records` は最新 10 件専用の Phase 1 仕様として残しています）。
- **水やりリマインダー**（Issue #31）。作物（planting）ごとに水やり間隔を設定し、「今日水やりすべきか」を見える化します。
  - **間隔ベース**（毎日リセットなし）。「やった」を記録すると `last_watered_at = today` / `next_due_at = today + interval_days` を再計算します。間隔は 1 日 / 2 日 / 3 日 / 週 1 / カスタム / 設定解除（リマインダーなし）の中から選びます。
  - **デフォルトは「なし」**（リマインダー対象外）。新規 planting は `watering_settings` 行が無い状態で始まり、ユーザーが明示的に設定したときだけ「今日のおせわ」リストに乗ります。
  - **「今日のおせわ」リスト**: トップページに「💧 今日のおせわ」セクションを置き、`next_due_at <= today AND interval_days IS NOT NULL` な plantings を一覧表示します。各行に grid 名 + (x, y) + 作物名 + 「💧 やった」ボタンが並び、ボタンを押すと `POST /api/plantings/:id/water` で記録 → 行が消えます。
  - **期日超過表示**: `next_due_at < today` の行には赤バッジ「期日超過 N 日」が出ます（CellDetail の水やりパネルにも同じバッジ）。
  - **CellDetail の水やりパネル**: セル詳細モーダルの「現在の作物」セクション直下に間隔設定 UI が並びます。現在の間隔 / 最後の水やり / 次回予定日 + 「変更する」「💧 水やりした」ボタン。終了 (`state="ended"`) 済みの植物には表示されません。
  - **Web Push 通知はスコープ外**。Phase 3 以降で実装予定（Service Worker + Push API + サーバー側 cron）。現状はトップページに乗る「今日のおせわ」リストでのみ可視化します。
  - 関連 API:
    - `GET /api/plantings/:id/watering?pubkey=<hex64>` — 設定取得（無ければ `settings: null`）
    - `PUT /api/plantings/:id/watering` — body `{ pubkey, intervalDays }`。`intervalDays=null|0` で DELETE（解除）
    - `POST /api/plantings/:id/water` — body `{ pubkey, wateredAt?, note? }`。settings があれば `last_watered_at` / `next_due_at` を同時更新
    - `GET /api/users/:pubkey/watering-due?pubkey=<hex64>&on=YYYY-MM-DD` — その日に期日を迎える plantings 一覧。`on` 省略時は今日 (UTC)。`state="ended"` は除外
- **気象データ**（Issue #32）。プロフィールに地域（市区町村レベル）を設定すると、屋外グリッドの作業日に気温・天気・日照時間を **Open-Meteo** から取得して表示します。
  - **地域設定**: 設定ページの「地域（気象データ用）」セクションで「石川県金沢市」のようにテキスト入力 →「設定する」で `PUT /api/profiles/me` に upsert。
  - **取得経路**: 初回は Open-Meteo geocoding API で region → (lat, lon) を引き、forecast API で `temperature_2m_max / min / weather_code / sunshine_duration` を取得して `weather_cache` テーブルに INSERT。次回以降は `(region, date) UNIQUE` でキャッシュヒットを優先します。当日は `fetched_at` から 6 時間経過したら再取得を許容、過去日は変わらないので再取得しません。
  - **「今日のおせわ」の天気バナー**: トップページの「💧 今日のおせわ」上部に「石川県金沢市: ☔ 今日は雨（最高 18℃ / 最低 12℃）」のように表示します。`weather_code` が雨カテゴリ（WMO 51-67 / 80-82 / 95-99）のときは「☔ 屋外グリッドの水やりは不要かもしれません」サジェストを追加表示します。
  - **室内グリッド除外**: `grid.environment in ('indoor','greenhouse')` のグリッドには気象 UI を出しません（屋内なので天気は関係ない）。`isOutdoorEnvironment()` ヘルパで判定します。
  - **取得失敗時**: 200 + `{ record: null, error: "geocoding_failed" | "forecast_failed" }` で返し、フロントは「天気を取得できませんでした」を表示するだけで「今日のおせわ」本体には影響させません。
  - 関連 API:
    - `GET /api/profiles/me?pubkey=<hex64>` — 自分のプロフィール取得（無ければ `profile: null`）
    - `PUT /api/profiles/me` — body `{ pubkey, displayName?, region?, locale? }` で upsert
    - `GET /api/weather?region=<text>&date=YYYY-MM-DD` — `weather_cache` を見て、無ければ Open-Meteo から取得 → INSERT して返却

データは **Cloudflare D1** に保存され、Nostr リレーには流れません。プライバシー方針として「日記＝D1、写真＝Nostr」を分離しています。

作物マスタは `apps/api/migrations/0002_seed_initial_plants.sql` で 20 件投入されます（トマト / ミニトマト / きゅうり / なす / ピーマン / じゃがいも / さつまいも / バジル / しそ / パセリ / ねぎ / レタス / ほうれん草 / 大根 / にんじん / ひまわり / チューリップ / モンステラ / ポトス / サボテン）。`family` は連作管理に効くため Wikipedia ベースで設定済み。

## マスター DB（作物マスタ）

家庭菜園で出会う作物を幅広くカバーするため、`plants` テーブルには **121 件**の作物を seed しています（Issue #33 / `apps/api/migrations/0005_expand_plants_seed.sql` で 0002 の 20 件に 101 件を追加）。

### カテゴリ分布（計 121 件）

| category     | 件数 | 例                                                                  |
| ------------ | ---- | ------------------------------------------------------------------- |
| `vegetable`  | 49   | 葉物 (小松菜・水菜・春菊・ケール…) / 根菜 (ごぼう・ラディッシュ・しょうが・玉ねぎ…) / 果菜 (ズッキーニ・かぼちゃ・苦瓜・オクラ…) / 豆類 (えだまめ・そら豆・エンドウ・落花生…) |
| `fruit`      | 16   | いちご・ブルーベリー・レモン・柚子・温州みかん・いちじく・柿・栗・ぶどう・梅・ラズベリー・キウイフルーツ等                                            |
| `herb`       | 15   | バジル・しそ・パセリ・ローズマリー・タイム・オレガノ・ミント・コリアンダー・ラベンダー・カモミール等                                              |
| `flower`     | 13   | ひまわり・ペチュニア・マリーゴールド・コスモス・朝顔・ガーベラ・ジニア・サルビア・パンジー・ビオラ等                                            |
| `houseplant` | 10   | モンステラ・ポトス・ガジュマル・サンスベリア・ドラセナ・フィカスウンベラータ・シェフレラ・パキラ・ベンジャミン・ユッカ                            |
| `bulb`       | 9    | チューリップ・スイセン・ヒヤシンス・クロッカス・ダリア・グラジオラス・シクラメン・ユリ・アマリリス                                              |
| `succulent`  | 9    | サボテン・アロエ・エケベリア・セダム・ハオルチア・リトープス・カランコエ・グラプトペタルム・クラッスラ                                            |

### family 一覧（連作管理に使う 36 科）

`family` 表記は Wikipedia ベースで統一しています。連作障害の判定は同じ家族（family）の作物が同じ座標に植わっていないかを `crop_history.plant_family` でチェックする方式です（推奨待機年数は `packages/shared/src/farm.ts` の `ROTATION_WAIT_YEARS` に集約）。

| 件数 | family                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| 13   | アブラナ科                                                                                                        |
| 12   | キク科                                                                                                            |
| 9    | シソ科                                                                                                            |
| 8    | ナス科 / ヒガンバナ科                                                                                             |
| 7    | ウリ科                                                                                                            |
| 5    | セリ科 / ベンケイソウ科 / マメ科 / ミカン科                                                                       |
| 4    | キジカクシ科 / クワ科                                                                                             |
| 3    | サトイモ科 / バラ科                                                                                               |
| 2    | アオイ科 / アヤメ科 / イネ科 / ススキノキ科 / スミレ科 / ヒユ科 / ヒルガオ科 / ユリ科                              |
| 1    | ウコギ科 / カキノキ科 / サクラソウ科 / サボテン科 / シュウカイドウ科 / ショウガ科 / ツツジ科 / ツリフネソウ科 / ナデシコ科 / ハマミズナ科 / ブドウ科 / ブナ科 / マタタビ科 / ヤマノイモ科 |

`thumbnail_url` は Phase 3 のファイル管理 Issue（別 Issue）で投入予定なので、現状は全件 NULL です。

### API (Phase 1 範囲)

NIP-98 認可は未実装。`pubkey` をクエリ/body で受ける Phase 1 範囲（Issue #16 以降で NIP-98 化予定）。

- `GET    /api/grids?pubkey=<hex64>` — そのユーザーの全グリッド + cells を返す
- `POST   /api/grids` — 新規グリッド作成（profiles も同時 upsert）
- `PATCH  /api/grids/:id` — 部分更新。size_x/size_y 変更時はレスポンスに `cropHistoryResetWarning: true`
- `DELETE /api/grids/:id` — cells / plantings / crop_history も手動カスケード削除
- `PUT    /api/grids/:gridId/cells/:x/:y` — container_type / soil_type の upsert
- `DELETE /api/grids/:gridId/cells/:x/:y` — セル削除（VOID 解除や planting 解除には DELETE を使う）
- `GET    /api/plants?q=&family=&category=&tag=&sort=name|id&limit=N` — 作物マスタ検索（最大 200 件、既定 50 件、Issue #38 で `tag` / `sort` / `limit` 拡張）
- `GET    /api/plants/:id` — 単体取得（Issue #38 で `genus` / `tags` / `description` / `thumbnailUrl` を含む詳細を返すよう拡張）
- `GET    /api/plants/:id/seed-products` — その plant_id に紐付く種・苗マスタを人気順で返す（Issue #38）
- `GET    /api/plants/:id/users` — その plant_id を育てている／いたユーザー（pubkey / plantingCount / lastPlantedAt）を返す（Issue #38）
- `POST   /api/grids/:gridId/cells/:x/:y/plantings` — 作物を植える
- `DELETE /api/plantings/:id` — 撤去（cells.current_planting_id を NULL に戻す）
- `POST   /api/grids/:gridId/cells/:x/:y/nutrient` — 施肥記録（Issue #15）
- `POST   /api/grids/:gridId/cells/:x/:y/pesticide` — 農薬記録（Issue #15）
- `GET    /api/grids/:gridId/cells/:x/:y/records?pubkey=<hex64>` — 直近の施肥/農薬を各 10 件返す（Issue #15）
- `GET    /api/grids/:gridId/cells/:x/:y/nutrients?pubkey=<hex64>` — そのセルの全 `nutrient_records` を applied_at 昇順で返す（Issue #25, 養分タイムライン用）
- `GET    /api/grids/:gridId/cells/:x/:y/history?pubkey=<hex64>` — 座標ベース連作履歴を直近 10 件、時系列降順で返す（Issue #22）
- `POST   /api/grids/:gridId/cells/:x/:y/ph` — pH 測定値を記録（Issue #24, value: 0-14, measuredAt 省略時は今日）
- `GET    /api/grids/:gridId/cells/:x/:y/ph?pubkey=<hex64>` — そのセルの pH 測定記録を measured_at 昇順で全件返す（Issue #24）
- `GET    /api/plantings/:id/watering?pubkey=<hex64>` — 水やり間隔設定取得（無ければ `settings: null`）（Issue #31）
- `PUT    /api/plantings/:id/watering` — body `{ pubkey, intervalDays }` で upsert / 解除（`intervalDays=null|0` で DELETE）（Issue #31）
- `POST   /api/plantings/:id/water` — 水やり実施を記録、settings があれば `last_watered_at` / `next_due_at` を更新（Issue #31）
- `GET    /api/users/:pubkey/watering-due?pubkey=<hex64>&on=YYYY-MM-DD` — その日に水やり期日を迎える plantings 一覧（Issue #31）

## 記録（作業ログの投稿）

`/record` ページから「作業記録」を Nostr に投稿できます（Issue #16）。

- **作業種別**（種まき・水やり・収穫・施肥・pH測定・農薬・観察・その他）を大きめのボタンから選択。
- **マイ畑との紐付け**（任意）。グリッドとセル (x, y) を選ぶと `farm-cell` タグで紐付けられます。
- **作物名**（任意・最大 64 文字）と**本文**（最大 280 文字）を入力。
- **「投稿する」** で `mypace` API（`POST /api/publish`）へ NIP-98 認証付きで送信。署名は端末側で行います（`packages/shared/src/nostr/sign.ts`）。
- **オフライン/失敗時**: 送信に失敗したら自動で下書きキューに退避。あとから「編集して投稿」できます。
- **「下書き保存」** で任意のタイミングで退避。下書き一覧から再開できます。
- **写真の添付**（Issue #17）。1 投稿あたり最大 **4 枚**まで添付できます。
  - 画像本体は **[nostr.build](https://nostr.build/)** に **NIP-98** 認証付きで直接アップロードされます（mypace API は経由しません）。
  - 成功した URL は mypace `/api/uploads` に履歴として fire-and-forget で記録されます（履歴登録の失敗はアップロード本体の成功を妨げません）。
  - サムネの **×** ボタンで個別に削除できます（nostr.build からも `NIP-96 DELETE` で削除を試みます）。
  - **アップロード上限**: 画像 **10MB** / 動画 **10MB** / 音声 **1MB**。上限超過時はアップロード前に弾きます。
- **フィルタガチャ**（Issue #28）。写真を選択すると、アップロード前に **mypace 互換のフィルタプリセット 7 種**（Fuji / Kodak / Wash / Xpro / Mono / Cool / Vivid）からランダムに 1 つが自動適用されます。
  - **🎲 もう一回** で別プリセットに再抽選、**フィルタを選ぶ** で 7 種 + 「なし」のドット UI から手動選択できます。
  - **アップロード** 確定時に HTML5 Canvas の `ctx.filter` で**実体に焼き込み**してから nostr.build に POST します（プレビューは CSS filter、配信物は焼き込み済み JPEG/PNG）。
  - 複数枚選択時は **全枚に同じプリセット**が適用されます（プレビューは先頭 1 枚 + 「×N 枚」バッジ）。
  - 一部古いブラウザ（`ctx.filter` 未対応の旧 Safari など）では加工をスキップして元画像をそのままアップロードします。プリセット定義は `packages/shared/src/filters.ts`、焼き込みは `packages/shared/src/image/apply-filter.ts` に集約。

### Nostr イベント仕様（kind = 1）

| タグ                                          | 用途                                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| `["t", "farm-in-pocket"]`                     | 検索/フィルタ用ハッシュタグ（常に付与）                       |
| `["farm-action", <FarmAction>]`               | 作業種別（`seeding` / `watering` / `harvest` / ...）          |
| `["farm-crop", <name>]`                       | 作物名（任意）                                                |
| `["farm-cell", <gridId>, <x>, <y>]`           | 紐付け先セル（gridId + x + y がすべて揃ったときだけ）         |
| `["image", <url>]` ×N                         | 添付写真の URL（nostr.build、最大 4 枚、Issue #17）           |
| `["farm-milestone", <FarmMilestone>]`         | 節目イベント識別（任意・Issue #27）                           |

### 節目イベント（farm-milestone）

「今年初収穫！」「初めて咲いた」などの**特別な節目**を mypace タイムラインに知らせるためのタグです（Issue #27）。`farm-milestone` タグが付いた投稿は、ポケ農のコミュニティ一覧・他人の畑タイムラインで **emerald 系の太枠 + 🏆 バッジ** で強調表示されます（カード風）。

- **付与は任意**: ユーザーが RecordForm の「これは節目イベントです 🏆」チェックを入れたときだけ付きます。`harvest` や `observation` でも自動では付きません（自動推奨はしない方針 — 何を「節目」とみなすかはユーザー判断）。
- **デフォルト推奨値**: チェックを入れた瞬間の `farm-action` に応じて、`harvest` なら `harvest_complete`、`seeding` なら `seeding_complete`、それ以外は `other` を初期値として埋めます。セレクトで自由に変更できます。
- **任意の作業に付けられる**: 例えば「観察」中に「咲いた」を発見した場合も `observation` + `bloom` で投稿できます。

| 種別                | 値                  | アイコン |
| ------------------- | ------------------- | -------- |
| 播種完了            | `seeding_complete`  | 🌱       |
| 収穫完了            | `harvest_complete`  | 🌾       |
| 咲いた              | `bloom`             | 🌸       |
| 実った              | `fruit`             | 🍅       |
| 枯れた・失敗        | `failure`           | 🥀       |
| その他の節目        | `other`             | 🏆       |

### ローカルストレージキー

- `fip:work-record-drafts-v1` — 下書きキュー（最大 100 件、古いものから trim）。
- `fip:offline-actions-v1` — オフラインアクションキュー（最大 100 件、Issue #42 / 「PWA オフライン対応」参照）。
- `fip:cache:grids:<pubkey>` — 自分のグリッド一覧の最終取得スナップショット（圏外時の fallback 用）。
- `fip:cache:plants` — 植物マスタの最終取得結果。

## PWA オフライン対応

畑は電波が悪いので、ポケ農は「圏外でも作業を止めない」ことを目標に PWA + アプリケーションレイヤのキューで設計しています（Issue #42）。

### キュー: `fip:offline-actions-v1`

圏外時や fetch 失敗時に、以下の **OfflineAction** を localStorage キュー（最大 100 件）に積みます。

- `publishEvent` — 署名済み Nostr event を mypace `/api/publish` に POST する予定のアクション。作業記録投稿で使う。
- `recordWatering` — 水やり実施を D1 `/api/plantings/:id/water` に POST する予定のアクション。「💧 やった」ボタンで使う。

ユーザー UI 上は「保留しました（オンライン復帰時に送信します）」として完了したように見せます（楽観 update）。

### キャッシュ: `fip:cache:grids:<pubkey>` / `fip:cache:plants`

API レスポンスを最後の状態として localStorage に保持し、オフライン時に fallback で読みます。

- `fip:cache:grids:<pubkey>` — グリッド一覧（cells / summary 込み）。`GridEditor` が `listGrids()` 成功時に書き込み、失敗時に読み出す。
- `fip:cache:plants` — 植物マスタ一覧。`PlantsList` が `searchPlantsAdvanced()` 成功時に書き込み、失敗時に読み出す。

PWA precache（`@vite-pwa/astro`）はアプリ shell（HTML/JS/CSS、約 51 entries）を担当し、上記キャッシュは「ユーザーデータの最後の状態」を担当します。

### 復帰トリガー

`OfflineFlusherBoot` が `MainLayout` に `client:idle` でマウントされ、以下のタイミングでキューを順次 fire します。

- `window` の `online` イベント（OS / ブラウザがオンライン復帰を検知した瞬間）
- 60 秒ごとの `setInterval`（ネットワーク状態が変化しなくても定期的に試行）
- 起動時 1 回（リロード直後にキューが残っていれば即送信）

1 件失敗したら以降の flush を打ち切り、次回トリガーで先頭から再試行します。すべての fire 成功でキューは空になります。

### 振り返り 4 ビュー（Issue #30）

`/record` ページは「投稿」タブの他に**振り返り 4 ビュー**を持ち、ハッシュルーティングで切り替えます。表示されるデータはすべて **D1 由来**（自分専用の `plantings` / `crop_history` / `nutrient_records` / `pesticide_records` / `ph_records`）で、Nostr リレーに投稿された kind:1 のタイムラインは含みません（コミュニティ系は #18 / #19）。

| タブ | ハッシュ | 用途 |
|---|---|---|
| 投稿 | `/record` | 既存の作業記録フォーム |
| カレンダー | `/record#calendar` | 月単位 heatmap。各日の `plantings` / `endings` / `care`（施肥+農薬+pH）件数をドット 3 色で表示 |
| 作物別 | `/record#by-plant` | 育てたことのある作物（`plant_id`）ごとにアコーディオン。各作物の plantings を一覧 |
| グリッド履歴 | `/record#cell-history` | グリッド別タブ → `(x, y)` 別の `crop_history` 縦表（直近 200 件） |
| 失敗ログ | `/record#failures` | `state='ended'` で `end_tag` が `died` / `disease` / `pest` / `failed` の planting + `failure_memo` + 経過日数 |

関連 API:

- `GET /api/users/:pubkey/activity?pubkey=<hex64>&month=YYYY-MM` — カレンダー用 1 か月分の日次集計
- `GET /api/users/:pubkey/plantings-by-plant?pubkey=<hex64>` — 作物別 plantings グループ
- `GET /api/users/:pubkey/cell-histories?pubkey=<hex64>` — 全グリッド × セル × `crop_history`（200 件まで）
- `GET /api/users/:pubkey/failures?pubkey=<hex64>` — 失敗 ended plantings 一覧（200 件まで）

認可は Phase 1 と同じ「`?pubkey=` 必須」方式。`URL path の :pubkey` と `query の pubkey` が一致しない場合は 403。NIP-98 への置き換えは Issue #16+ で対応します。

## コミュニティ（みんな）

`/community` ページから「`#farm-in-pocket` を付けて投稿しているユーザー」を一覧できます（Issue #18）。横長バナーカード（バナー + 丸アイコン + 表示名 + 最新作業）をスクロールできるシンプルな一覧で、各カードはタップで `/community/<npub>`（**他人の畑ページ** — Issue #19）に遷移します。

### 他人の畑ページ `/community/<npub>` （Issue #19）

`/community/<npub>` はそのユーザーの公開プロフィール + 投稿タイムラインを表示する SSR ページです。Astro の動的ルートで実装し、Cloudflare Pages Functions として配信されます（既存の `/`, `/grid`, `/record`, `/settings`, `/community` は引き続き SSG）。

- **グリッド間取りは非公開**: D1 に保存しているマイ畑の cells/plantings 情報は他人の畑ページからは絶対に取得しません。代わりに「5×5 のぼかしグリッド + `🔒 間取りは公開されていません` ラベル」だけを表示します。プライバシー方針として「日記＝D1（自分専用）、写真と作業ログ＝Nostr（公開）」を分離している方針の徹底です。
- **タイムラインは Nostr リレーから直接**: `kind:1` / `["#t", "farm-in-pocket"]` / `authors=<対象 pubkey>` で直近 50 件を `packages/shared/src/relay/` の WebSocket クライアントで取得します。`farm-action` / `farm-crop` / `content` / `image` タグ + 相対時刻を 1 件ずつカード表示。
- **Follow / Unfollow は kind:3 (NIP-02) で発行**: 鍵を端末に保存していれば、ボタンクリックで自分の最新 kind:3 contact list を取得 → 追加/削除 → 再署名して mypace の `/api/publish` 経由で発行します。ローカルキャッシュは `fip:my-contacts-v1`。
- **Stella リアクションは Issue #27 で実装予定**: 各タイムラインカードに 5 色（赤/橙/黄/緑/青）のドット placeholder を並べていますが、現状は disabled です。実体は mypace 側の stella システム連携（**Issue #27 mypace 投稿カード連携**）で対応します。
- **無効な npub**: bech32 形式が壊れている場合はクライアント側で「見つかりませんでした」と表示します（SSR 段階で 404 にはしません）。

### 表示の仕組み

- **投稿は Nostr リレーから直接読む**: ポケ農は `nostr-tools` を使わない方針なので、`packages/shared/src/relay/` に最小の WebSocket クライアント（NIP-01 `REQ` / `EVENT` / `EOSE` / `CLOSE` のみ）を自前実装しています。読み取り専用で、書き込み（投稿）は引き続き mypace API 経由。
- **プロフィールは mypace から bulk 取得**: 取得した投稿の `pubkey` を集めて `GET /api/profiles?pubkeys=...` で kind:0 メタデータ（`display_name` / `picture` / `banner` 等）をまとめて引きます。失敗しても profile=null で続行します。
- **dedup**: 同一 `event.id` は最新の `created_at` を残し、同一 `pubkey` は最新投稿 1 件だけ表示します。

### 利用する既定リレー

`packages/shared/src/relay/defaults.ts` に並んでいます。

- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.snort.social`

並列に問い合わせて、結果を統合します。一部リレーがダウンしていても他で補完できます。

## 植物カタログ

「ポケ農で扱える 121 件の作物を、育てている人と一緒に眺めて選べる」入口として `/plants` を提供します（Issue #38）。

- **一覧 `/plants`** （SSG）: 検索 (作物名 / 英名)、カテゴリ (vegetable, fruit, flower, herb, houseplant, bulb, succulent, other)、科の絞り込みができるカードグリッド。300ms デバウンスでクライアント側から `GET /api/plants` を叩きます。カードをタップすると詳細ページへ。
- **詳細 `/plants/:id`** （SSR、`prerender=false`）: 植物本体の情報（科・属・カテゴリ・タグ・説明・サムネ）、関連する種・苗（人気順）、そして **「この植物を育てているユーザー」** 一覧を一画面に集約します。
  - 「この植物を育てているユーザー」は `GET /api/plants/:id/users` で `plantings → cells → grids.user_pubkey` を集計（最終植え付け日降順、最大 100 件）。mypace の bulk profile API で display_name / picture を肉付けし、`/community/<npub>` の他人の畑ページへリンクします。
  - 「マイ畑に植える」ボタンは `/grid?plantId=<id>` に遷移します。GridEditor 側でクエリを拾ってヒントバナーを出し、ユーザーは空いているセルをタップして通常の「作物を植える」フローに合流します。
- **GridEditor / CellDetail からの導線**:
  - `PlantPicker`（作物検索モーダル）の各候補に「詳細 →」リンクを追加し、`/plants/:id` を新規タブで開けるようにしました。
  - CellDetail の「現在の作物」セクションに「詳細を見る →」リンクを追加し、すでに植わっている作物のマスター情報へ即ジャンプできます。

ナビゲーションのボトムバーは 5 タブのまま据え置きで、`/plants` には GridEditor の plant ピッカーや CellDetail のリンク経由でアクセスする設計です。今後、植物カタログそのものをタブに昇格させる場合はボトムナビ拡張を別 Issue で扱います。

## ランキング

Issue #39 で導入したテーマ別ランキング機能です。植物カタログを「順位」という別軸で楽しめます。

### 5 つの投票テーマ

ユーザーが好きな植物に投票して累計票数で並ぶランキング。1 ユーザー 1 植物 1 票（取り消し不可、ただし別の植物には別途投票できます）。

| slug | テーマ |
| --- | --- |
| `fun-to-grow` | 育ててて楽しい作物 |
| `beginner-friendly` | 初心者におすすめ |
| `difficult` | 失敗しやすい |
| `balcony-friendly` | ベランダで育てやすい |
| `indoor-photogenic` | 室内映え |

各テーマは [Nostalgic Ranking](https://nostalgic.llll-ll.com/) (`api.nostalgic.llll-ll.com/api/ranking`) でデータを保持します。ポケ農の Workers が server-side で proxy するため、クライアントは直接 Nostalgic を叩きません。

- 投票 URL 識別子: `https://farm-in-pocket.llll-ll.com/rankings/{slug}`
- Nostalgic 上の `name` は `p{plantId}` 形式（例: 植物 id = 1 なら `p1`）
- `score` は累計投票数

### 自動算出: 植物難易度ランキング

`/rankings/auto-difficulty` は Nostalgic を使わず、D1 上の plantings 集計から自動計算します。`end_tag` が `died` / `disease` / `pest` / `failed` のいずれかなら「失敗」とみなし、(失敗数 / 総 planting 数) を失敗率としてランク付けします。投票口は持ちません。

### 認可とトークン

Nostalgic Ranking は url + owner token で管理します。token は **Cloudflare Workers Secret** に格納し、コードには絶対に書かないでください。

- 本番投入: `cd apps/api && pnpm wrangler secret put NOSTALGIC_TOKEN`（kako-jun 統一値）
- ローカル開発: `apps/api/.dev.vars` に `NOSTALGIC_TOKEN=...` を書く（`.dev.vars` は git 管理外）
- token 未設定時は GET は空配列を返し、POST は D1 への投票記録だけ残してフロントを壊さない

### エンドポイント

- `GET  /api/rankings/:slug?limit=N` … 上位 N 件 + plant_name 付きで返す
- `POST /api/rankings/:slug/vote`     body: `{ pubkey, plantId }` … 重複投票（D1 `ranking_votes` 主キー `(slug, pubkey, plant_id)`）を抑制した上で Nostalgic に submit

### UI

- `/rankings` … 全テーマ目次
- `/rankings/:slug` … 各テーマのランキング 50 位まで
- `/plants/:id` 詳細ページ下部 … 全 6 ランキングでのこの植物の順位 + 投票ボタン（鍵保有時のみ active）

## けいふんくん（マスコット）

Phase 1 で導入したマスコットコンポーネント `KeifunMascot`（Issue #21）です。アイコン + 吹き出し + 音声読み上げ の最小 UI 雛形で、Phase 2 以降の LLM 連携（「けいふんくんに聞く」）の入口になります。

### 3 表情

土色の丸顔 + 真上に伸びるチョンマゲ草（新緑の葉 1 枚）の SVG を、目・口・葉の角度で差分化しています。

- `normal` — 通常。目はドット、口は短い横線、葉は真上に伸びる
- `happy` — 完了系の褒め文言で使用。目は半月、口は笑顔、葉は揺れる
- `worried` — 失敗・慰めで使用。目は ò ó 風、口は波線、葉は萎れる

### 定型文（8 kind）

Phase 1 は LLM 連携無しの定型文ライブラリ `apps/web/src/components/keifun/messages.ts` です。

| kind            | 用途                                       |
| --------------- | ------------------------------------------ |
| `welcome`       | 初回起動／アカウント設定完了後の歓迎       |
| `grid_created`  | グリッド作成完了                           |
| `record_posted` | 作業記録投稿完了                           |
| `follow_done`   | フォロー完了                               |
| `watering_due`  | 水やり期日通知（Phase 2 で発火、API のみ） |
| `encourage`     | 失敗・枯れた報告への慰め                   |
| `tip`           | 育てるコツ・雑学                           |
| `idle`          | タップなどでただ顔を出す                   |

各 kind に複数候補を持ち、`pickRandom(kind)` でランダムに 1 つ返します。

### 使い方

`MainLayout.astro` から `<KeifunMascot client:idle />` を全ページに撒いています（デフォルト `kind="idle"`、`placement="bottom-right"`）。ページ固有のトリガは後続 Issue で個別に呼び出します。

```tsx
// 完了通知（投稿カウンタが増えるたびに表示更新）
<KeifunMascot kind="record_posted" trigger={postCount} />

// インライン埋め込み（fixed しない）
<KeifunMascot kind="tip" placement="inline" />
```

`trigger` 値が変わると文言を再選択して再表示・再読み上げします。8 秒で自動フェードアウトし、吹き出しタップで延長、アイコンクリック / ESC で閉じます。

### TTS（音声読み上げ）

Web Speech API (`SpeechSynthesisUtterance`, lang=ja-JP) を使用します。設定ページ「けいふんくんの読み上げ」セクションでミュート切替とテスト読み上げが可能です。

- ミュート状態は localStorage キー `fip:keifun-mute-v1` (`"true"` / `"false"`) に保存
- Web Speech API 非対応環境（SSR、一部古いブラウザ）では `supported: false` を返し、speak は no-op

### 将来の LLM 連携

吹き出し下に `disabled` 状態のプロンプト入力欄（`fip-keifun-mascot-prompt-input`）を置いてあります。Phase 2 以降で `kind="llm"` を追加し、ここに入力された文字列をエージェント API に投げる予定です。

## ディレクトリ構成

```
apps/web         Astro + React islands + Tailwind v4  (Phase 0 で初期化予定)
apps/api         Hono + Cloudflare Workers           (Phase 0 で初期化予定)
packages/shared  型 & mypace API クライアント         (Phase 0 で初期化予定)
iot/             旧 Raspberry Pi 版                   (Phase 4 で再統合予定)
```

## マスター DB（種・苗）

`seed_products` テーブルに市販の種袋・苗パック・球根を登録できます（Issue #34）。

- `GET /api/seed-products?q=&plantId=&type=&sort=&limit=50` — 検索（name LIKE / plant_id / type / brand）
- `GET /api/seed-products/:id` — 単体取得
- `POST /api/seed-products` — body: `{ pubkey, name, brand?, plantId, type, thumbnailUrl?, affiliateLinks? }`。誰でも登録可能（コミュニティ参加型マスタ）
- `POST /api/seed-products/:id/use` — `use_count++` と `seed_product_users` への UPSERT で `user_count` を DISTINCT pubkey で集計

`sort` パラメータ（Issue #37）:

| sort | 並び | 用途 |
|---|---|---|
| `popular`（デフォルト） | `use_count DESC, user_count DESC, id DESC` | 人気順。Picker のデフォルト |
| `recent` | `created_at DESC` | 新着順 |
| `name` | `name ASC` | 名前順 |

「作物を植える」フローで `SeedProductPicker` から検索・選択・新規登録できます。選択された種・苗 ID は plantings.seed_product_id に保存されます。

## マスター DB（資材）

`materials` テーブルに用土・肥料・農薬・道具などの資材を登録できます（Issue #35）。
種・苗マスタと同じ「コミュニティ参加型」運用で、誰でも追加可能。

- `GET /api/materials?q=&category=&subcategory=&sort=&limit=50` — 検索（name/brand LIKE、category/subcategory 完全一致）
- `GET /api/materials/:id` — 単体取得
- `POST /api/materials` — body: `{ pubkey, name, brand?, category, subcategory?, targetTags?, tags?, dilution?, description?, thumbnailUrl?, affiliateLinks? }`
- `POST /api/materials/:id/use` — `use_count++` と `material_users` への UPSERT で `user_count` を DISTINCT pubkey で集計
- `sort` パラメータは seed_products と共通（`popular` / `recent` / `name`、デフォルト `popular`）

### カテゴリ

| category | 説明 | subcategory |
|---|---|---|
| `soil` | 用土 | 自由文字列（任意） |
| `fertilizer_solid` | 肥料（固形） | 自由文字列（任意） |
| `fertilizer_liquid` | 肥料（液体） | 自由文字列（任意） |
| `pesticide` | 農薬 | `insecticide` / `fungicide` / `herbicide` / `repellent` / `adhesive` のいずれか |
| `tool` | 資材・道具 | 自由文字列（任意） |

`pesticide` の `subcategory` のみ列挙チェックが入ります（殺虫/殺菌/除草/忌避/展着）。それ以外は将来拡張の余地を残すため自由文字列です。

### dilution（希釈倍率）の JSON 形式

液体肥料・農薬で希釈倍率を表現するための JSON。任意項目。

```json
{
  "unit": "倍液",
  "ratios": [
    { "purpose": "野菜全般", "ratio": 500 },
    { "purpose": "観葉植物", "ratio": 1000 }
  ]
}
```

### 使用カウント

施肥フォーム（`category=fertilizer_solid` / `fertilizer_liquid`）と農薬フォーム（`category=pesticide`）で `MaterialPicker` から資材を選択すると、`nutrient_records.material_id` / `pesticide_records.material_id` に保存され、`POST /api/materials/:id/use` が fire-and-forget で呼ばれて `use_count` / `user_count` が加算されます。

### 希釈計算サポーター（Issue #36）

`dilution` が定義された資材（液体肥料・農薬・除草剤など）を施肥／農薬フォームで選択すると、自動的に「希釈計算サポーター」が表示されます。

- 計算式: `原液 ml = 作りたい量(L) × 1000 / ratio` / `水 ml = 作りたい量(L) × 1000 − 原液 ml`
- 例: 1000倍液を 2L 作る → 原液 2ml + 水 1998ml
- `dilution.ratios` に複数エントリがあるときは「目的」（通常散布 / 高濃度 など）を選べます
- 計算結果は施肥／農薬フォームの `amount` (`ml` 単位) に自動セットされ、農薬は `pesticide_records.dilution_ratio` に保存されます
- 施肥（`nutrient_records`）は `dilution_ratio` カラムを持たないため、note に「希釈 1000x」のタグが追記されます
- `dilution` が無い資材を選んだ場合はサポーターは表示されず、通常の数量入力のままです

計算ミスは薬害や効果不足の直接原因になるため、結果は emerald 系の大きな枠で目立つように表示しています。

### アフィリエイト表示と利用カウント（Issue #37）

seed_products / materials は `affiliate_links: [{ shop, url }]` を持ちます。`SeedProductPicker` / `MaterialPicker` の検索結果カードに、shop 名から自動でラベルとアイコンを当てたボタンを表示します（`AffiliateLinks` コンポーネント、`packages/shared/src/affiliate.ts` の `decorateAffiliate`）。

| shop | ラベル | アイコン |
|---|---|---|
| `amazon` | Amazon | 🛒 |
| `rakuten` | 楽天市場 | 🛍️ |
| `official` | 公式サイト | 🌐 |
| `mercari` | メルカリ | 🟧 |
| `yahoo` | Yahoo!ショッピング | 🟣 |
| その他 | shop 名そのまま | 🔗 |

- リンクは `target="_blank" rel="noopener noreferrer sponsored"` 固定（アフィリエイト規約上 `sponsored` が推奨）
- `javascript:` / `data:` / 相対パスなど http(s) 以外の URL は表示時に除外
- 価格はあえて表示せず、飛び先で判断させます
- 検索結果カードには `UsageBadge` も併記され、「N人が使っています ／ M回記録されています」表示。0 件のときは「まだ記録なし」
- 検索のデフォルトソートは `popular`（`use_count DESC, user_count DESC`）なので、利用実績の多いものが上に来ます

## 設計参照

詳細な設計メモはローカルの Agasteer 上にあります:

- `repos/private/notes/.agasteer/notes/dev/farm-in-pocket.md`

## 旧 IoT 版について

Raspberry Pi 向けの旧版（Docker Compose + Yocto + React 監視 UI）は [`iot/`](./iot/) に保管されています。
将来 **Phase 4** で本 Web アプリと統合予定です（センサーデータを Web 側で受信・可視化する想定）。

## ライセンス

MIT
