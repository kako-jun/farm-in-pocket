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

### Nostr イベント仕様（kind = 1）

| タグ                                          | 用途                                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| `["t", "farm-in-pocket"]`                     | 検索/フィルタ用ハッシュタグ（常に付与）                       |
| `["farm-action", <FarmAction>]`               | 作業種別（`seeding` / `watering` / `harvest` / ...）          |
| `["farm-crop", <name>]`                       | 作物名（任意）                                                |
| `["farm-cell", <gridId>, <x>, <y>]`           | 紐付け先セル（gridId + x + y がすべて揃ったときだけ）         |
| `["image", <url>]` ×N                         | 添付写真の URL（nostr.build、最大 4 枚、Issue #17）           |

### ローカルストレージキー

- `fip:work-record-drafts-v1` — 下書きキュー（最大 100 件、古いものから trim）。

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

## 設計参照

詳細な設計メモはローカルの Agasteer 上にあります:

- `repos/private/notes/.agasteer/notes/dev/farm-in-pocket.md`

## 旧 IoT 版について

Raspberry Pi 向けの旧版（Docker Compose + Yocto + React 監視 UI）は [`iot/`](./iot/) に保管されています。
将来 **Phase 4** で本 Web アプリと統合予定です（センサーデータを Web 側で受信・可視化する想定）。

## ライセンス

MIT
