# Farm in Pocket - セットアップガイド

## クイックスタート

### 1. リポジトリのクローン

```bash
git clone https://github.com/kako-jun/farm-in-pocket.git
cd farm-in-pocket
```

### 2. Docker Composeで起動

```bash
docker-compose up -d
```

### 3. アクセス

- **Web UI**: http://localhost:5173
- **API ドキュメント**: http://localhost:8000/docs
- **バックエンドAPI**: http://localhost:8000

## 起動するサービス

| サービス | ポート | 説明 |
|---------|--------|------|
| `frontend` | 5173 | Vue.js Webダッシュボード |
| `backend` | 8000 | FastAPI バックエンド |
| `farminpocket-temp` | - | 温度・湿度監視モジュール |

## ログの確認

```bash
# 全サービスのログ
docker-compose logs -f

# 特定のサービスのログ
docker-compose logs -f backend
docker-compose logs -f farminpocket-temp
```

## モジュールの管理

### Web UIから操作

1. http://localhost:5173 にアクセス
2. ダッシュボードでモジュール一覧を確認
3. 起動・停止・再起動ボタンで操作

### CLIから操作

```bash
# モジュール一覧
docker ps -a | grep farminpocket

# モジュール起動
docker start farminpocket-temp

# モジュール停止
docker stop farminpocket-temp

# モジュール再起動
docker restart farminpocket-temp
```

## データの確認

### 温度・湿度データ

```bash
# データボリュームの確認
docker volume inspect farm-in-pocket_temp-data

# データファイルの確認
docker exec farminpocket-temp ls -la /data
docker exec farminpocket-temp cat /data/$(date +%Y-%m-%d).csv
```

## トラブルシューティング

### ポートが使用されている

```bash
# ポート8000または5173が使用中の場合
docker-compose down
lsof -ti:8000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

### Docker権限エラー

```bash
# Dockerソケットの権限設定
sudo chmod 666 /var/run/docker.sock
```

### データベースのリセット

```bash
# バックエンドデータをクリア
docker-compose down
docker volume rm farm-in-pocket_backend-data
docker-compose up -d
```

## 開発環境

### バックエンド開発

```bash
cd core/web-ui/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### フロントエンド開発

```bash
cd core/web-ui/frontend
npm install
npm run dev
```

### モジュール開発

```bash
cd modules/farminpocket-temp
docker build -t farminpocket-temp:dev .
docker run --rm -v $(pwd)/data:/data farminpocket-temp:dev
```

## 次のステップ

- 実際のセンサー（DHT22など）を接続する場合は、[センサー接続ガイド](modules/farminpocket-temp/README.md)を参照
- 新しいモジュールを追加する場合は、[モジュール開発ガイド](docs/guides/module-development.md)を参照
- システムのカスタマイズは、[CONTRIBUTING.md](CONTRIBUTING.md)を参照
