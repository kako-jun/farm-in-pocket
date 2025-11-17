# Farm in Pocket - Web UI

Web監視ダッシュボード（バックエンド + フロントエンド）

## 概要

Farm in Pocket Web UIは、導入されたモジュールの稼働状況を監視し、システム管理を行うためのWebアプリケーションです。

### 構成

- **バックエンド**: FastAPI (Python)
- **フロントエンド**: Vue.js 3 + Tailwind CSS
- **データベース**: SQLite
- **デプロイ**: Docker Compose

## クイックスタート

### Docker Composeで起動（推奨）

```bash
cd core/web-ui
docker-compose up -d
```

- バックエンド: http://localhost:8000
- フロントエンド: http://localhost:5173
- API ドキュメント: http://localhost:8000/docs

### 個別に起動

#### バックエンド

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

#### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

## 機能

### 実装済み

- [x] システムステータス表示（CPU、メモリ、ディスク、稼働時間）
- [x] モジュール一覧表示
- [x] モジュール起動・停止・再起動
- [x] ダッシュボード画面
- [x] レスポンシブデザイン（Tailwind CSS）

### 実装予定

- [ ] Docker SDK統合（実際のコンテナ管理）
- [ ] SQLiteデータベース統合
- [ ] ログビューア
- [ ] モジュール管理（追加・削除）
- [ ] システム設定画面
- [ ] WebSocket（リアルタイム更新）
- [ ] グラフ表示（Chart.js）
- [ ] 認証・認可

## ディレクトリ構成

```
web-ui/
├── docker-compose.yml     # Docker Compose設定
├── backend/               # FastAPI バックエンド
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── app/
│   │   ├── api/          # APIルーター
│   │   └── core/         # コア機能
│   └── tests/
└── frontend/              # Vue.js フロントエンド
    ├── package.json
    ├── vite.config.js
    ├── Dockerfile
    ├── src/
    │   ├── main.js
    │   ├── App.vue
    │   ├── router/
    │   ├── stores/
    │   └── views/
    └── public/
```

## 開発

### バックエンド開発

```bash
cd backend

# テスト実行
pytest tests/

# コードフォーマット
black .
isort .

# リンター
flake8 .
```

### フロントエンド開発

```bash
cd frontend

# リンター
npm run lint

# ビルド
npm run build
```

## API仕様

詳細は Swagger UI (http://localhost:8000/docs) を参照。

### 主要エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/system/status` | システムステータス取得 |
| GET | `/api/modules` | モジュール一覧取得 |
| POST | `/api/modules/{name}/start` | モジュール起動 |
| POST | `/api/modules/{name}/stop` | モジュール停止 |
| GET | `/api/logs` | ログ取得 |

## トラブルシューティング

### ポートが既に使用されている

```bash
# ポート8000または5173が使用中の場合
docker-compose down
# または
lsof -ti:8000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

### Docker権限エラー

```bash
# Dockerソケットのパーミッション設定
sudo chmod 666 /var/run/docker.sock
```

## ライセンス

MIT License
