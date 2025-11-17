# Farm in Pocket - 設計概要

最終更新: 2025-11-17

## 全体アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        ユーザー                                  │
│              (Webブラウザ / モバイル端末)                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/WebSocket
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Web監視UI                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ ダッシュ     │  │ モジュール   │  │ システム     │             │
│  │ ボード      │  │ 管理        │  │ 設定        │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  (Vue.js 3 + Tailwind CSS)                                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST API
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                 Core OS (Yocto Linux)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Web UI Backend (Flask/FastAPI)                          │   │
│  │  - REST API サーバー                                     │   │
│  │  - WebSocket サーバー                                    │   │
│  │  - モジュール管理                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Docker Engine                                            │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │  Temp   │ │Irrigation│ │  Photo  │ │  Scare  │  ...  │   │
│  │  │ Module  │ │  Module  │ │ Module  │ │  Module │        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  システムサービス                                          │   │
│  │  - ログ管理 (journald)                                   │   │
│  │  - データ永続化 (SQLite)                                 │   │
│  │  - ネットワーク管理 (NetworkManager)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ GPIO / I2C / SPI
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                  ハードウェア層                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ DHT22   │ │土壌湿度  │ │ カメラ  │ │PIRセンサー│  ...        │
│  │ センサー │ │センサー  │ │         │ │         │              │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## コアシステム設計

### 1. OSイメージ（Yocto Linux）

#### 構成要素

- **ベースイメージ**: Poky（Yoctoリファレンス）
- **カーネル**: Linux 5.15 LTS
- **init システム**: systemd
- **パッケージマネージャ**: opkg（軽量）

#### カスタムレイヤー: meta-farminpocket

```
meta-farminpocket/
├── conf/
│   ├── layer.conf
│   └── distro/
│       └── farminpocket.conf
├── recipes-core/
│   ├── images/
│   │   └── farminpocket-image.bb
│   └── init/
│       └── farminpocket-init.bb
├── recipes-connectivity/
│   ├── docker/
│   └── network/
└── recipes-extended/
    └── farminpocket-webui/
```

#### 主要パッケージ

- Docker Engine 24.x
- Python 3.9+
- Node.js 18 LTS
- nginx (リバースプロキシ)
- SQLite 3
- NetworkManager

---

### 2. Web監視UI

#### 技術スタック

**フロントエンド**:
- Vue.js 3 (Composition API)
- Vue Router 4
- Pinia (状態管理)
- Axios (HTTP通信)
- Chart.js (グラフ表示)
- Tailwind CSS (スタイリング)

**バックエンド**:
- Flask または FastAPI
- SQLAlchemy (ORM)
- Docker SDK for Python
- APScheduler (定期実行)

#### ディレクトリ構成

```
core/web-ui/
├── backend/
│   ├── app.py                 # エントリーポイント
│   ├── config.py              # 設定
│   ├── api/
│   │   ├── __init__.py
│   │   ├── system.py          # システムAPI
│   │   ├── modules.py         # モジュールAPI
│   │   ├── logs.py            # ログAPI
│   │   └── settings.py        # 設定API
│   ├── models/
│   │   ├── __init__.py
│   │   ├── module.py          # モジュールモデル
│   │   └── log.py             # ログモデル
│   ├── services/
│   │   ├── __init__.py
│   │   ├── docker_manager.py  # Docker管理
│   │   ├── module_manager.py  # モジュール管理
│   │   └── system_monitor.py  # システム監視
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── router/
│   │   │   └── index.js
│   │   ├── stores/
│   │   │   ├── system.js
│   │   │   └── modules.js
│   │   ├── views/
│   │   │   ├── Dashboard.vue
│   │   │   ├── ModuleDetail.vue
│   │   │   ├── ModuleManage.vue
│   │   │   ├── Settings.vue
│   │   │   └── Logs.vue
│   │   └── components/
│   │       ├── ModuleCard.vue
│   │       ├── StatusBadge.vue
│   │       └── Chart.vue
│   ├── public/
│   ├── package.json
│   └── vite.config.js
└── docker-compose.yml
```

#### API設計

**エンドポイント一覧**:

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/system/status` | システム状態取得 |
| GET | `/api/modules` | モジュール一覧 |
| GET | `/api/modules/:name` | モジュール詳細 |
| POST | `/api/modules/:name/start` | モジュール起動 |
| POST | `/api/modules/:name/stop` | モジュール停止 |
| POST | `/api/modules/:name/restart` | モジュール再起動 |
| POST | `/api/modules/install` | モジュールインストール |
| DELETE | `/api/modules/:name` | モジュール削除 |
| GET | `/api/modules/:name/data` | センサーデータ取得 |
| GET | `/api/logs` | ログ取得 |
| GET | `/api/settings` | 設定取得 |
| PUT | `/api/settings` | 設定更新 |

**WebSocket**:
- エンドポイント: `ws://farminpocket.local/ws`
- イベント:
  - `module_status_changed`: モジュール状態変更
  - `new_data`: 新しいセンサーデータ
  - `new_log`: 新しいログ

---

## モジュール設計

### モジュール標準仕様

#### 必須ファイル

1. **manifest.json** - モジュールメタデータ
2. **Dockerfile** - Dockerイメージ定義
3. **README.md** - ドキュメント
4. **config.example.yml** - 設定例

#### manifest.json スキーマ

```json
{
  "name": "string (必須)",
  "version": "string (必須, semver)",
  "description": "string (必須)",
  "author": "string (必須)",
  "license": "string (必須)",
  "homepage": "string (オプション)",
  "dependencies": {
    "hardware": ["array of strings"],
    "software": ["array of strings"]
  },
  "config": {
    "key": {
      "type": "string|integer|float|boolean",
      "default": "any",
      "enum": ["array (オプション)"],
      "description": "string"
    }
  },
  "ports": {
    "http": "integer (オプション)",
    "mqtt": "integer (オプション)"
  },
  "volumes": ["array of strings"],
  "environment": {
    "KEY": "value"
  },
  "healthcheck": {
    "test": ["CMD", "..."],
    "interval": "string (e.g. 30s)",
    "timeout": "string",
    "retries": "integer"
  }
}
```

#### モジュール間通信

**プロトコル**:
- HTTP REST API（ポート8000番台）
- MQTT（オプション）

**データフォーマット**:
```json
{
  "module": "farminpocket-temp",
  "timestamp": "2025-11-17T15:30:21Z",
  "data": {
    "temperature": 24.5,
    "humidity": 65.0
  },
  "status": "ok"
}
```

---

## データベース設計

### SQLiteスキーマ

#### modules テーブル

```sql
CREATE TABLE modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL, -- running, stopped, error
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### module_data テーブル

```sql
CREATE TABLE module_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_name TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    data JSON NOT NULL,
    FOREIGN KEY (module_name) REFERENCES modules(name)
);

CREATE INDEX idx_module_data_timestamp ON module_data(timestamp);
CREATE INDEX idx_module_data_module_name ON module_data(module_name);
```

#### logs テーブル

```sql
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_name TEXT,
    level TEXT NOT NULL, -- DEBUG, INFO, WARNING, ERROR
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_module_name ON logs(module_name);
CREATE INDEX idx_logs_level ON logs(level);
```

#### settings テーブル

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## セキュリティ設計

### 認証・認可

1. **初回起動時のセットアップ**
   - パスワード設定
   - Wi-Fi設定

2. **認証方式**
   - JWT (JSON Web Token)
   - セッションタイムアウト: 24時間

3. **アクセス制御**
   - デフォルト: ローカルネットワーク内のみ
   - オプション: Let's Encrypt + HTTPS

### セキュアコーディング

1. **入力検証**
   - すべてのAPI入力をバリデーション
   - SQLインジェクション対策（ORM使用）
   - XSS対策（エスケープ処理）

2. **Docker セキュリティ**
   - 非rootユーザーでコンテナ実行
   - 最小権限の原則
   - イメージスキャン（Trivy）

3. **ネットワークセキュリティ**
   - ファイアウォール設定
   - 不要なポートを閉じる
   - SSH: デフォルトで無効化（OTA経由で有効化可能）

---

## モジュール個別設計

### farminpocket-temp（温度・湿度監視）

**対応センサー**:
- DHT22, DHT11, DS18B20

**主要機能**:
- 定期的な温度・湿度測定
- アラート機能（閾値超過時）
- データのCSV保存
- REST API提供

**技術スタック**:
- Python 3.9+
- Adafruit_DHT ライブラリ
- w1thermsensor ライブラリ

---

### farminpocket-irrigation（自動潅水制御）

**対応ハードウェア**:
- 土壌湿度センサー（静電容量式）
- 電磁弁（12V DC）
- リレーモジュール

**主要機能**:
- 土壌湿度の監視
- スケジュール潅水
- 条件付き潅水（湿度が閾値以下の場合のみ）
- 散水履歴の記録

---

### farminpocket-photo（タイムラプス写真記録）

**対応ハードウェア**:
- Raspberry Pi Camera Module
- USB Webカメラ

**主要機能**:
- 定期的な写真撮影
- タイムラプス動画生成
- 写真のクラウドアップロード（オプション）
- AI画像認識（病害虫検知、オプション）

---

### farminpocket-scare（害獣監視＋威嚇）

**対応ハードウェア**:
- PIRセンサー（人感センサー）
- LED（高輝度）
- スピーカー（Bluetooth/USB）

**主要機能**:
- 動体検知
- 光による威嚇（LED点滅）
- 音による威嚇（警告音再生）
- 検知ログ記録

---

### farminpocket-connect（データ送信）

**対応プロトコル**:
- LoRaWAN
- Wi-Fi
- MQTT

**主要機能**:
- センサーデータのクラウド送信
- MQTT Broker連携
- LoRaWANゲートウェイ連携
- データ集約・転送

---

## インストーラー設計

### SDカード書き込みツール

#### GUI版（Electron/Tauri）

**機能**:
- OSイメージのダウンロード
- SDカードの自動検出
- 書き込み進捗表示
- 検証（書き込み後のチェック）

#### CLI版（Python）

```bash
# 使用例
farminpocket-installer --image farminpocket-latest.img.gz --device /dev/sdX
```

---

## ビルド・デプロイ

### CI/CDパイプライン（GitHub Actions）

1. **OSイメージビルド**
   - Yoctoビルド（時間がかかるためキャッシュ活用）
   - イメージ圧縮
   - GitHub Releasesへアップロード

2. **モジュールビルド**
   - Dockerイメージビルド
   - セキュリティスキャン（Trivy）
   - Docker Hubへプッシュ

3. **テスト**
   - ユニットテスト
   - 統合テスト
   - E2Eテスト（Raspberry Pi実機）

4. **リリース**
   - タグ付け（semver）
   - CHANGELOG自動生成
   - リリースノート作成

---

## パフォーマンス設計

### リソース要件

**最小スペック**:
- Raspberry Pi 3B+
- メモリ: 1GB
- ストレージ: 8GB

**推奨スペック**:
- Raspberry Pi 4 (4GB)
- メモリ: 4GB
- ストレージ: 32GB

### 最適化戦略

1. **OS最適化**
   - 不要なサービスの無効化
   - swapサイズの最適化

2. **Webアプリ最適化**
   - 静的ファイルのgzip圧縮
   - CDNキャッシング（ローカル）
   - 遅延ロード

3. **データベース最適化**
   - インデックス設計
   - 古いデータの定期削除

---

## 詳細設計ドキュメント

詳細な設計は以下のドキュメントを参照：

- [Web UI設計](../docs/web-ui-design.md)
- [リポジトリ構成](../docs/repository-structure.md)

---

この設計に基づいて、プロジェクトの実装を進めます。
