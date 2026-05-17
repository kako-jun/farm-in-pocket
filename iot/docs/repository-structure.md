# GitHubリポジトリ構成ガイド

## リポジトリ全体構成

```
farm-in-pocket/
├── .github/                    # GitHub設定
│   ├── workflows/              # GitHub Actions
│   │   ├── build-os-image.yml  # OSイメージビルド
│   │   ├── build-modules.yml   # モジュールビルド
│   │   ├── test.yml            # テスト実行
│   │   └── release.yml         # リリース自動化
│   ├── ISSUE_TEMPLATE/         # Issueテンプレート
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── module_proposal.md
│   └── PULL_REQUEST_TEMPLATE.md
│
├── core/                       # コアシステム
│   ├── web-ui/                 # Web監視UI
│   │   ├── backend/            # Flaskバックエンド
│   │   │   ├── app.py
│   │   │   ├── api/
│   │   │   ├── models/
│   │   │   ├── services/
│   │   │   └── requirements.txt
│   │   ├── frontend/           # Vue.jsフロントエンド
│   │   │   ├── src/
│   │   │   ├── public/
│   │   │   ├── package.json
│   │   │   └── vite.config.js
│   │   ├── docker-compose.yml
│   │   └── README.md
│   │
│   ├── os-image/               # Yocto OSイメージ
│   │   ├── meta-farminpocket/  # Yoctoレイヤー
│   │   │   ├── recipes-core/
│   │   │   ├── recipes-connectivity/
│   │   │   └── conf/
│   │   ├── build-scripts/      # ビルドスクリプト
│   │   ├── Dockerfile
│   │   └── README.md
│   │
│   └── installer/              # SDカード書き込みツール
│       ├── farminpocket-installer.py
│       ├── gui/                # GUIツール
│       ├── cli/                # CLIツール
│       └── README.md
│
├── modules/                    # 機能モジュール
│   ├── farminpocket-temp/      # 温度・湿度監視
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── manifest.json
│   │   ├── config.example.yml
│   │   ├── tests/
│   │   └── README.md
│   │
│   ├── farminpocket-irrigation/ # 自動潅水制御
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── manifest.json
│   │   ├── config.example.yml
│   │   ├── tests/
│   │   └── README.md
│   │
│   ├── farminpocket-photo/     # タイムラプス写真記録
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── manifest.json
│   │   ├── config.example.yml
│   │   ├── tests/
│   │   └── README.md
│   │
│   ├── farminpocket-scare/     # 害獣監視＋威嚇
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── manifest.json
│   │   ├── config.example.yml
│   │   ├── tests/
│   │   └── README.md
│   │
│   ├── farminpocket-connect/   # データ送信
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── manifest.json
│   │   ├── config.example.yml
│   │   ├── tests/
│   │   └── README.md
│   │
│   └── _template/              # モジュールテンプレート
│       ├── src/
│       ├── Dockerfile
│       ├── manifest.json
│       ├── config.example.yml
│       ├── tests/
│       └── README.md
│
├── docs/                       # ドキュメント
│   ├── guides/                 # 導入ガイド
│   │   ├── getting-started.md
│   │   ├── installation.md
│   │   ├── module-development.md
│   │   └── troubleshooting.md
│   │
│   ├── cost-calculator/        # コスト試算ツール
│   │   ├── index.html
│   │   ├── calculator.js
│   │   ├── examples/
│   │   └── README.md
│   │
│   ├── case-studies/           # 事例報告テンプレート
│   │   ├── template.md
│   │   └── examples/
│   │
│   ├── web-ui-design.md        # Web UI設計書
│   ├── repository-structure.md # このファイル
│   └── architecture.md         # アーキテクチャ設計書
│
├── scripts/                    # ビルド・デプロイスクリプト
│   ├── build-all.sh
│   ├── test-all.sh
│   ├── deploy.sh
│   └── utils/
│
├── tests/                      # 統合テスト
│   ├── integration/
│   └── e2e/
│
├── .gitignore
├── .editorconfig
├── LICENSE
├── README.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

---

## 主要ディレクトリの役割

### `/core/` - コアシステム

Farm in Pocketの中核を成すコンポーネント群です。

#### `/core/web-ui/`
Web監視ダッシュボードの実装。

- **backend/**: Flask/FastAPIベースのREST API
- **frontend/**: Vue.js 3ベースのSPA
- **docker-compose.yml**: 開発環境用

#### `/core/os-image/`
YoctoベースのカスタムLinuxイメージ。

- **meta-farminpocket/**: Yoctoレシピ
- **build-scripts/**: ビルド自動化スクリプト

#### `/core/installer/`
SDカードへのイメージ書き込みツール。

- GUI版（Electron/Tauri）
- CLI版（Python）

---

### `/modules/` - 機能モジュール

各機能はDockerコンテナとして独立して動作します。

#### モジュールの標準構成

すべてのモジュールは以下の構造に従います：

```
farminpocket-<module-name>/
├── src/                    # ソースコード
│   ├── main.py             # エントリーポイント
│   ├── config.py           # 設定管理
│   ├── sensors/            # センサー制御
│   └── ...
├── Dockerfile              # Dockerイメージ定義
├── manifest.json           # モジュールメタデータ
├── config.example.yml      # 設定例
├── tests/                  # ユニットテスト
├── README.md               # モジュール説明
└── LICENSE
```

#### `manifest.json` の例

```json
{
  "name": "farminpocket-temp",
  "version": "1.0.0",
  "description": "温度・湿度監視モジュール",
  "author": "Farm in Pocket Contributors",
  "license": "MIT",
  "dependencies": {
    "hardware": ["DHT22", "DS18B20"],
    "software": ["python:3.9", "Adafruit_DHT"]
  },
  "config": {
    "sensor_type": "DHT22",
    "gpio_pin": 4,
    "interval": 60
  },
  "ports": {
    "http": 8001
  },
  "volumes": [
    "/data/temp:/app/data"
  ]
}
```

---

### `/docs/` - ドキュメント

#### `/docs/guides/`
ユーザー向け導入ガイドと開発者向けドキュメント。

- **getting-started.md**: クイックスタートガイド
- **installation.md**: 詳細インストール手順
- **module-development.md**: モジュール開発ガイド
- **troubleshooting.md**: トラブルシューティング

#### `/docs/cost-calculator/`
Web上で動作するコスト試算ツール。

- HTML/JavaScriptで実装
- GitHub Pagesで公開

#### `/docs/case-studies/`
ユーザーの導入事例報告用テンプレート。

---

### `/scripts/` - ビルド・デプロイスクリプト

プロジェクト全体のビルド・テスト・デプロイを自動化。

```bash
# すべてのモジュールをビルド
./scripts/build-all.sh

# すべてのテストを実行
./scripts/test-all.sh

# リリースイメージを生成
./scripts/deploy.sh --release v1.0.0
```

---

## モジュール開発ワークフロー

### 1. 新規モジュールの作成

```bash
# テンプレートからコピー
cp -r modules/_template modules/farminpocket-newmodule

# モジュール名を変更
cd modules/farminpocket-newmodule
# manifest.json, README.md, Dockerfileを編集
```

### 2. モジュールの実装

```python
# src/main.py
import time
from config import Config

def main():
    config = Config.load()

    while True:
        # センサー読み取り
        data = read_sensor()

        # データ送信
        send_data(data)

        time.sleep(config.interval)

if __name__ == "__main__":
    main()
```

### 3. Dockerイメージのビルド

```bash
docker build -t farminpocket-newmodule:latest .
```

### 4. テスト

```bash
pytest tests/
```

### 5. Pull Requestの作成

1. フォークして開発ブランチを作成
2. コードを実装
3. テストを追加
4. Pull Requestを作成

---

## GitHub Actionsワークフロー

### `/workflows/build-os-image.yml`

OSイメージの自動ビルド。

```yaml
name: Build OS Image

on:
  push:
    branches: [main]
    paths:
      - 'core/os-image/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Yocto image
        run: ./core/os-image/build-scripts/build.sh
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: farminpocket-image
          path: build/farminpocket.img.gz
```

### `/workflows/build-modules.yml`

各モジュールのDockerイメージビルド。

```yaml
name: Build Modules

on:
  push:
    paths:
      - 'modules/**'

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        module: [temp, irrigation, photo, scare, connect]
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: |
          cd modules/farminpocket-${{ matrix.module }}
          docker build -t farminpocket-${{ matrix.module }}:latest .
      - name: Push to registry
        run: docker push farminpocket-${{ matrix.module }}:latest
```

### `/workflows/release.yml`

リリース自動化。

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Create Release
        uses: actions/create-release@v1
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          draft: false
          prerelease: false
```

---

## Issue / Pull Requestテンプレート

### Bug Report (`bug_report.md`)

```markdown
## バグの概要


## 再現手順

1.
2.
3.

## 期待される動作


## 実際の動作


## 環境
- OSイメージバージョン:
- モジュール:
- ハードウェア:
```

### Feature Request (`feature_request.md`)

```markdown
## 機能の概要


## 解決したい課題


## 提案する実装方法


## 代替案

```

### Module Proposal (`module_proposal.md`)

```markdown
## モジュール名

farminpocket-<name>

## 目的


## 対象ハードウェア


## 必要なセンサー/アクチュエーター


## 設定項目

```

---

## ブランチ戦略

- **main**: 安定版（リリース準備完了）
- **develop**: 開発中の最新コード
- **feature/\***: 新機能開発
- **bugfix/\***: バグ修正
- **release/\***: リリース準備

---

## バージョニング

Semantic Versioning (SemVer) を採用：

- **MAJOR**: 互換性のない変更
- **MINOR**: 後方互換性のある機能追加
- **PATCH**: 後方互換性のあるバグ修正

例: `v1.2.3`

---

## リリースプロセス

1. **開発**: `develop`ブランチで開発
2. **テスト**: すべてのテストが通過
3. **リリースブランチ作成**: `release/v1.0.0`
4. **最終確認**: 統合テスト・ドキュメント確認
5. **mainマージ**: `release` → `main`
6. **タグ付け**: `git tag v1.0.0`
7. **GitHub Release**: 自動ビルドされたイメージを添付
8. **develop同期**: `main` → `develop`

---

## コントリビューションガイドライン

詳細は [CONTRIBUTING.md](../CONTRIBUTING.md) を参照。

### コミットメッセージ規約

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type**:
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: コードスタイル
- `refactor`: リファクタリング
- `test`: テスト追加
- `chore`: ビルド・ツール変更

**例**:
```
feat(temp): DHT22センサー対応を追加

温度・湿度モジュールにDHT22センサーの読み取り機能を追加しました。

Closes #123
```

---

このリポジトリ構成により、プロジェクト全体が整理され、コントリビューターが参加しやすい環境を提供します。
