# Contributing to Farm in Pocket

Farm in Pocketプロジェクトへのコントリビューションをありがとうございます！

このドキュメントでは、プロジェクトへの貢献方法について説明します。

## 目次

- [行動規範](#行動規範)
- [貢献の方法](#貢献の方法)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [コーディング規約](#コーディング規約)
- [コミットメッセージ規約](#コミットメッセージ規約)
- [Pull Requestのプロセス](#pull-requestのプロセス)

## 行動規範

このプロジェクトは、すべての参加者にとって安全で歓迎される環境を提供することを目指しています。

- 敬意を持って他者と接する
- 建設的なフィードバックを提供する
- 異なる視点や経験を尊重する

## 貢献の方法

以下のような方法でプロジェクトに貢献できます：

### バグ報告

バグを発見した場合は、[Issue](https://github.com/kako-jun/farm-in-pocket/issues)を作成してください。

- バグ報告テンプレートを使用
- 再現手順を明確に記載
- 環境情報（OSバージョン、モジュールバージョンなど）を含める

### 機能提案

新しい機能のアイデアがある場合は、Feature Requestを作成してください。

- 解決したい課題を明確に説明
- 提案する実装方法を記載
- 代替案があれば併記

### 新規モジュールの提案

新しい機能モジュールを提案する場合は、Module Proposalテンプレートを使用してください。

### コードの貢献

1. リポジトリをフォーク
2. 新しいブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

## 開発環境のセットアップ

### 前提条件

- Git
- Docker & Docker Compose
- Python 3.9+
- Node.js 16+

### セットアップ手順

```bash
# リポジトリをクローン
git clone https://github.com/kako-jun/farm-in-pocket.git
cd farm-in-pocket

# Web UIの開発環境セットアップ
cd core/web-ui

# バックエンド
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# フロントエンド
cd ../frontend
npm install

# 開発サーバー起動
npm run dev
```

### モジュール開発

```bash
# テンプレートからコピー
cp -r modules/_template modules/farminpocket-yourmodule

# Dockerイメージをビルド
cd modules/farminpocket-yourmodule
docker build -t farminpocket-yourmodule:dev .

# テストを実行
pytest tests/
```

## コーディング規約

### Python

- **スタイルガイド**: [PEP 8](https://pep8-ja.readthedocs.io/)
- **フォーマッタ**: Black
- **リンター**: flake8, pylint
- **型ヒント**: 可能な限り使用

```python
# 良い例
def calculate_temperature(celsius: float) -> float:
    """摂氏を華氏に変換します。

    Args:
        celsius: 摂氏温度

    Returns:
        華氏温度
    """
    return celsius * 9/5 + 32
```

### JavaScript/TypeScript

- **スタイルガイド**: [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- **フォーマッタ**: Prettier
- **リンター**: ESLint

```javascript
// 良い例
const calculateHumidity = (rawValue) => {
  const humidity = (rawValue / 1024) * 100;
  return Math.round(humidity * 10) / 10;
};
```

### Dockerfileのベストプラクティス

```dockerfile
# 軽量なベースイメージを使用
FROM python:3.9-slim

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係のみを先にコピー（キャッシュ効率化）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY . .

# 非rootユーザーで実行
RUN useradd -m appuser
USER appuser

# ヘルスチェックを追加
HEALTHCHECK --interval=30s --timeout=3s \
  CMD python healthcheck.py || exit 1

CMD ["python", "main.py"]
```

## コミットメッセージ規約

Conventional Commitsに従います。

### フォーマット

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: コードスタイル（機能変更なし）
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: ビルド・ツール変更

### Scope

- `temp`: 温度・湿度モジュール
- `irrigation`: 潅水モジュール
- `photo`: 写真モジュール
- `scare`: 害獣対策モジュール
- `connect`: 接続モジュール
- `web-ui`: Web UI
- `core`: コアシステム
- `docs`: ドキュメント

### 例

```
feat(temp): DHT22センサーのサポートを追加

温度・湿度モジュールにDHT22センサーの読み取り機能を追加しました。
既存のDS18B20センサーとの互換性を維持しています。

Closes #123
```

```
fix(irrigation): 散水タイマーのバグを修正

散水終了後にタイマーがリセットされない問題を修正しました。

Fixes #456
```

## Pull Requestのプロセス

### チェックリスト

Pull Requestを作成する前に、以下を確認してください：

- [ ] すべてのテストが通過している
- [ ] 新しい機能にはテストが追加されている
- [ ] ドキュメントが更新されている
- [ ] コードがスタイルガイドに従っている
- [ ] コミットメッセージが規約に従っている

### レビュープロセス

1. **自動チェック**: GitHub Actionsがテストとリンターを実行
2. **コードレビュー**: メンテナーがコードをレビュー
3. **修正対応**: 必要に応じて修正
4. **承認**: 2人以上のメンテナーが承認
5. **マージ**: mainブランチにマージ

### レビュー観点

- **機能性**: 意図した通りに動作するか
- **コード品質**: 読みやすく、保守しやすいか
- **テストカバレッジ**: 十分なテストがあるか
- **ドキュメント**: 適切に文書化されているか
- **セキュリティ**: セキュリティ上の問題がないか

## テストガイドライン

### ユニットテスト

すべての関数に対してユニットテストを作成します。

```python
import pytest
from sensors.dht22 import read_temperature

def test_read_temperature_valid():
    """正常な温度読み取りのテスト"""
    temp = read_temperature(gpio_pin=4)
    assert 0 <= temp <= 50

def test_read_temperature_sensor_error():
    """センサーエラー時のテスト"""
    with pytest.raises(SensorError):
        read_temperature(gpio_pin=999)
```

### 統合テスト

モジュール間の連携をテストします。

```python
def test_module_integration():
    """モジュール間のデータフローをテスト"""
    # センサーデータ取得
    data = temp_module.get_data()

    # Web UIへ送信
    response = web_ui.send_data(data)

    assert response.status_code == 200
```

## モジュール開発ガイドライン

### manifest.jsonの必須項目

```json
{
  "name": "farminpocket-yourmodule",
  "version": "1.0.0",
  "description": "モジュールの説明",
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "hardware": ["必要なハードウェア"],
    "software": ["必要なソフトウェア"]
  },
  "config": {
    "key": "default_value"
  }
}
```

### README.mdの構成

各モジュールのREADME.mdには以下を含めてください：

1. **概要**: モジュールの目的
2. **必要なハードウェア**: センサーやアクチュエーター
3. **配線図**: GPIO接続の図解
4. **設定**: config.ymlの設定項目
5. **使用方法**: インストールと起動手順
6. **トラブルシューティング**: よくある問題と解決方法

## ドキュメントへの貢献

ドキュメントの改善も大歓迎です！

- タイポの修正
- 説明の追加・改善
- 図やスクリーンショットの追加
- 翻訳（英語版の作成など）

## 質問・相談

わからないことがあれば、遠慮なく質問してください：

- [GitHub Discussions](https://github.com/kako-jun/farm-in-pocket/discussions)
- [Issues](https://github.com/kako-jun/farm-in-pocket/issues)

---

ご協力ありがとうございます！Farm in Pocketを一緒に素晴らしいプロジェクトにしていきましょう。
