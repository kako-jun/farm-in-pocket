# Farm in Pocket - Web UI

零細農家・個人農家のための完全無料IoT農業システムの管理画面

## 技術スタック

### フロントエンド
- **React 18** (Vue.js 3から移行)
- **React Router 6** - ルーティング
- **Zustand** - 状態管理（軽量、Reduxより簡単）
- **Axios** - HTTP通信
- **Recharts** - グラフ表示
- **Tailwind CSS** - スタイリング
- **Vite** - ビルドツール

### バックエンド
- **FastAPI** (Python 3.9+) - REST API
- **SQLAlchemy** - ORM（非同期対応）
- **Docker SDK for Python** - ポッド管理
- **APScheduler** - 定期実行
- **SQLite** - データベース

## 開発環境セットアップ

### 1. バックエンド起動

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

- **FastAPI**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### 2. フロントエンド起動

```bash
cd frontend
npm install
npm run dev
```

- **Vite dev server**: http://localhost:5173
- Viteのproxyで `/api` → `localhost:8000` に自動転送

### 開発時のアクセス

- **フロントエンド**: http://localhost:5173 ← ここにアクセス
- **API**: http://localhost:8000/api
- **API Docs**: http://localhost:8000/docs

## 本番環境ビルド・起動

### 1. フロントエンドをビルド

```bash
cd frontend
npm run build
```

→ `frontend/dist/` ディレクトリが生成される

### 2. FastAPIを起動

```bash
cd backend
python main.py
```

→ FastAPIが自動的に `frontend/dist/` を検出して静的ファイルとして配信

### 本番環境のアクセス

- **すべて**: http://localhost:8000 ← ここだけでOK
  - `/` → Reactアプリ
  - `/api` → REST API
  - `/docs` → API Docs

**Nginxは不要** - FastAPI単体ですべて配信します。

## ディレクトリ構成

```
core/web-ui/
├── backend/
│   ├── main.py              # FastAPI エントリーポイント
│   ├── app/
│   │   ├── api/             # APIルーター
│   │   │   ├── system.py    # システム情報API
│   │   │   ├── modules.py   # ポッド管理API
│   │   │   ├── logs.py      # ログAPI
│   │   │   └── settings.py  # 設定API
│   │   ├── core/            # 設定・DB
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/          # SQLAlchemy モデル
│   │   │   ├── module.py
│   │   │   └── log.py
│   │   └── services/        # ビジネスロジック
│   │       └── docker_manager.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx         # React エントリーポイント
│   │   ├── App.jsx          # ルーター設定 + ナビゲーション
│   │   ├── store/           # Zustand store
│   │   │   ├── systemStore.js
│   │   │   └── modulesStore.js
│   │   ├── pages/           # ページコンポーネント
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ModuleManage.jsx
│   │   │   ├── Logs.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/      # 共通コンポーネント（今後）
│   │   └── assets/
│   │       └── main.css     # Tailwind CSS
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── dist/                # ビルド出力（本番時）
├── docker-compose.yml
└── README.md
```

## 機能

### 実装済み ✅

- システムステータス表示（CPU、メモリ、稼働時間）
- ポッド一覧表示
- ポッドの起動・停止・再起動
- 30秒ごとの自動更新
- レスポンシブデザイン（Tailwind CSS）
- Docker SDK統合（実際のコンテナ管理）

### 実装予定 📝

- [ ] ログビューア
- [ ] ポッド詳細画面
- [ ] ポッドのインストール・アンインストール
- [ ] システム設定画面（Wi-Fi、Tailscale等）
- [ ] グラフ表示（Recharts）
- [ ] WebSocket（リアルタイム更新）
- [ ] 認証・認可（本番環境）

## APIエンドポイント

詳細は http://localhost:8000/docs を参照

### システム
- `GET /api/system/status` - システムステータス（CPU、メモリ、稼働時間）
- `GET /api/system/info` - システム情報

### ポッド
- `GET /api/modules` - ポッド一覧
- `POST /api/modules/{name}/start` - ポッド起動
- `POST /api/modules/{name}/stop` - ポッド停止
- `POST /api/modules/{name}/restart` - ポッド再起動

### ログ
- `GET /api/logs` - ログ一覧

### 設定
- `GET /api/settings` - 設定取得
- `PUT /api/settings` - 設定更新

## Docker Compose での起動

```bash
docker-compose up -d
```

- Backend: http://localhost:8000
- Frontend (dev): http://localhost:5173

## トラブルシューティング

### ビルド済みファイルが見つからない

```
⚠️  React build not found. Run 'npm run build' in frontend/ directory.
```

→ `cd frontend && npm run build` を実行してください

### CORS エラー

開発環境でCORSエラーが出る場合、`backend/app/core/config.py` の `CORS_ORIGINS` を確認してください。

デフォルト設定:
```python
CORS_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:8000",  # FastAPI
]
```

### ポートが使用中

```bash
# ポート8000が使用中
lsof -ti:8000 | xargs kill -9

# ポート5173が使用中
lsof -ti:5173 | xargs kill -9
```

### Docker権限エラー

```bash
# Dockerソケットのパーミッション設定
sudo chmod 666 /var/run/docker.sock
```

## 開発

### バックエンド

```bash
cd backend

# テスト実行（TODO: 未実装）
pytest tests/

# コードフォーマット
black .
isort .

# リンター
flake8 .
```

### フロントエンド

```bash
cd frontend

# リンター
npm run lint

# ビルド（本番用）
npm run build

# プレビュー（ビルド後の動作確認）
npm run preview
```

## デプロイ（Raspberry Pi）

### 1. Yocto OSイメージに組み込み

```bash
# フロントエンドをビルド
cd frontend
npm run build

# OSイメージに含める
# core/web-ui/frontend/dist/ → Yocto recipes
```

### 2. 起動時にFastAPIを自動起動

systemdサービス化（TODO: 実装予定）

```ini
[Unit]
Description=Farm in Pocket Web UI
After=network.target

[Service]
Type=simple
User=farminpocket
WorkingDirectory=/opt/farminpocket/web-ui/backend
ExecStart=/usr/bin/python3 main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

## ライセンス

MIT License
