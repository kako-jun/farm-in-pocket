# Farm in Pocket - Web UI Backend

FastAPIベースのREST APIサーバー

## 機能

- システムステータス取得（CPU、メモリ、ディスク、稼働時間）
- モジュール管理（一覧、詳細、起動、停止、再起動）
- ログ取得（フィルタリング対応）
- システム設定管理

## セットアップ

### 1. 仮想環境の作成

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. 依存関係のインストール

```bash
pip install -r requirements.txt
```

### 3. 環境変数の設定

```bash
cp .env.example .env
# .envファイルを編集して設定を調整
```

### 4. サーバーの起動

```bash
python main.py
```

または

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API ドキュメント

サーバー起動後、以下のURLでSwagger UIにアクセス可能：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## エンドポイント一覧

### システム

- `GET /api/system/status` - システムステータス取得
- `GET /api/system/info` - システム情報取得

### モジュール

- `GET /api/modules` - モジュール一覧取得
- `GET /api/modules/{module_name}` - モジュール詳細取得
- `POST /api/modules/{module_name}/start` - モジュール起動
- `POST /api/modules/{module_name}/stop` - モジュール停止
- `POST /api/modules/{module_name}/restart` - モジュール再起動

### ログ

- `GET /api/logs` - ログ一覧取得（フィルタリング対応）

### 設定

- `GET /api/settings` - システム設定取得
- `PUT /api/settings` - システム設定更新

## ディレクトリ構成

```
backend/
├── main.py                 # エントリーポイント
├── requirements.txt        # 依存関係
├── .env.example           # 環境変数の例
├── app/
│   ├── __init__.py
│   ├── api/               # APIルーター
│   │   ├── __init__.py
│   │   ├── system.py
│   │   ├── modules.py
│   │   ├── logs.py
│   │   └── settings.py
│   └── core/              # コア機能
│       ├── __init__.py
│       └── config.py
└── tests/                 # テスト
```

## 開発

### テストの実行

```bash
pytest tests/
```

### コードフォーマット

```bash
black .
isort .
```

### リンター

```bash
flake8 .
pylint app/
```

## TODO

- [ ] Docker SDK統合（モジュール管理）
- [ ] SQLiteデータベース統合
- [ ] WebSocket実装（リアルタイム更新）
- [ ] 認証・認可実装
- [ ] ユニットテスト作成
- [ ] 統合テスト作成
