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
