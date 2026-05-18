# Farm in Pocket (ポケ農) - 開発者向けガイド

ポケットの中の農業を実現するモバイルファースト PWA、ポケ農の開発リポジトリです。

## プロジェクト概要

- **コンセプト**: 牧場物語のリアル MMO な家庭菜園 SNS
- **ターゲット**: 家庭菜園ユーザー〜プロ農家
- **特徴**: 無料・登録不要・公開強制（投稿は常にパブリック）
- **配信**: https://farm-in-pocket.llll-ll.com （Cloudflare Pages、Coming soon）

## アーキ方針

### Nostr は mypace 丸投げ

認証・投稿などの Nostr 周りは [mypace](https://github.com/kako-jun/mypace) に完全に委譲します。

- **ポケ農は `nostr-tools` を依存に持たない**
- Nostr 鍵管理・relay 接続・event 発行はすべて mypace API 経由
- ポケ農側は「家庭菜園データの型と UI」に集中する
- ただし **nsec 生成 / NIP-01 イベント署名 / NIP-19 (nsec/npub) / NIP-98 HTTP 認証** は
  `@noble/secp256k1` + `@noble/hashes` + `@scure/base` を直接使う最小実装で
  `packages/shared/src/nostr/` に持つ（mypace API を叩く前段の Authorization ヘッダ生成に必要なため）。
  relay 接続や複雑な NIP は引き続き mypace 側に丸投げする方針は変えない。

### モバイルファースト PWA

- レイアウトは縦長スマホ画面前提
- オフライン対応（Service Worker + IndexedDB キャッシュ）
- インストール可能な PWA として配信

### Astro + Islands

- 静的部分は Astro でビルド時 SSG
- インタラクティブ部分のみ React island として hydrate
- Tailwind v4 で軽量スタイリング

## 主要ディレクトリ（予定）

```
apps/web         Astro + React islands + Tailwind v4  (Phase 0 で初期化予定)
apps/api         Hono + Cloudflare Workers           (Phase 0 で初期化予定)
packages/shared  型と mypace API クライアント         (Phase 0 で初期化予定)
iot/             旧 Raspberry Pi 版                   (Phase 4 で再統合予定)
```

## 開発フェーズ

- **Phase 0**: モノレポ初期化、D1 スキーマ、mypace クライアント、デプロイパイプライン
- **Phase 1**: MVP（投稿・閲覧・基本的な作物登録）
- **Phase 2**: コミュニティ機能拡張
- **Phase 3**: プロ農家向け機能
- **Phase 4**: 旧 IoT 版（`iot/`）との統合（センサーデータ取り込み）

## 注意事項

### コミットメッセージ

- **Co-Authored-By タグを付けない**
- Claude Code や AI ツールの痕跡をコミット履歴に残さないこと
- 全スキル・全経路で適用

### 旧 IoT 版

`iot/` 配下の旧コードは Phase 4 まで触らない方針です。Web 版開発中に破壊しないよう注意してください。

## 設計参照

- `repos/private/notes/.agasteer/notes/dev/farm-in-pocket.md` — 詳細設計メモ（ローカル Agasteer）
