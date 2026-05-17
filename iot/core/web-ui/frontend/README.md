# Farm in Pocket - Web UI Frontend

Vue.js 3 + Tailwind CSSベースのSPA

## 機能

- ダッシュボード（システム情報、モジュール一覧）
- モジュール管理
- ログビューア
- システム設定

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:5173 にアクセス

### 3. ビルド

```bash
npm run build
```

ビルド成果物は `dist/` ディレクトリに出力されます。

## ディレクトリ構成

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.js           # エントリーポイント
│   ├── App.vue           # ルートコンポーネント
│   ├── assets/
│   │   └── main.css      # グローバルCSS
│   ├── components/       # 再利用可能なコンポーネント
│   ├── router/
│   │   └── index.js      # Vue Router設定
│   ├── stores/           # Pinia Store
│   │   ├── system.js
│   │   └── modules.js
│   └── views/            # ページコンポーネント
│       ├── Dashboard.vue
│       ├── ModuleManage.vue
│       ├── Logs.vue
│       └── Settings.vue
```

## 開発

### リンター

```bash
npm run lint
```

### プレビュー

```bash
npm run preview
```

## 技術スタック

- **Vue.js 3** - プログレッシブJavaScriptフレームワーク
- **Vite** - 高速ビルドツール
- **Vue Router 4** - SPAルーティング
- **Pinia** - 状態管理
- **Axios** - HTTP通信
- **Tailwind CSS** - ユーティリティファーストCSS
- **Chart.js** - グラフ描画（予定）

## TODO

- [ ] モジュール管理画面の実装
- [ ] ログビューアの実装
- [ ] 設定画面の実装
- [ ] WebSocket対応（リアルタイム更新）
- [ ] グラフ表示（Chart.js）
- [ ] レスポンシブ対応の強化
- [ ] エラーハンドリングの改善
