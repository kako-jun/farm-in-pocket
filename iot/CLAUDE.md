# Farm in Pocket 開発者向けドキュメント

零細農家・個人農家のための完全無料IoT農業システム。

## コンセプト

### 3つの基本方針

1. **完全無料・オープンソース** - ライセンス費用一切不要
2. **ノーコンフィグ** - SDカードに書き込むだけで起動
3. **プラグイン方式** - 必要なモジュール（ポッド）だけを選んで導入

### ターゲットユーザー

- 零細農家・個人農家
- 趣味で農業をする人
- 低コストでIoTを導入したい農業スタートアップ

## プロジェクト構造

```
farm-in-pocket/
├── core/
│   ├── web-ui/               # Web監視ダッシュボード
│   ├── os-image/             # Yoctoベースのカスタムイメージ
│   └── installer/            # SDカード書き込みツール
├── modules/                   # 機能モジュール（ポッド）
│   ├── farminpocket-temp/
│   ├── farminpocket-irrigation/
│   ├── farminpocket-photo/
│   ├── farminpocket-scare/
│   └── farminpocket-connect/
├── docs/
│   ├── guides/
│   ├── cost-calculator/
│   └── case-studies/
└── scripts/
```

## アーキテクチャ

```
┌─────────────────────────────────────┐
│   Web監視UI（監視ダッシュボード）      │
│   - モジュール一覧                    │
│   - 稼働状態表示                      │
│   - 簡易ログ                         │
│   - OTAアップデート                   │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│   Core OS（Yoctoベース）              │
│   - Dockerコンテナ管理                │
│   - manifest.json（モジュール管理）   │
└─────────────────────────────────────┘
                 ↓
┌───────┬─────────┬─────────┬─────────┐
│ Temp  │Irrigation│ Photo  │  Scare  │
│ Module│  Module  │ Module │  Module │
└───────┴─────────┴─────────┴─────────┘
```

## ポッド（Pod）設計

各機能は「ポッド」と呼ばれる独立したDockerコンテナとして実装。

### 標準ポッド（5種類）

#### 1. farminpocket-atmosphere（大気環境監視）

**役割**: 温度・湿度・気圧・照度の監視

**推奨センサー（ノーコンフィグ対応）**:
- BME280（温湿度気圧、I2C 0x76/0x77、約¥1,000）
- BH1750（照度、I2C 0x23、約¥300）

**機能**:
- 定期的な環境データ取得（デフォルト60秒間隔）
- CSVファイルへのデータ保存
- アラート機能（高温・低温・高湿度等）
- 自動センサー検出

#### 2. farminpocket-water（潅水制御）

**役割**: 土壌湿度監視 + 自動潅水

**推奨ハードウェア**:
- 静電容量式土壌湿度センサー（約¥500）
- ADS1115 ADC（I2C 0x48、約¥500）
- 電磁弁 3/4インチ 12V（約¥2,000）
- リレーモジュール 2ch（約¥300）

**対応灌漑方式**:
- 点滴灌漑（ドリップイリゲーション）
- スプリンクラー（回転式/インパルス式）
- マイクロスプリンクラー
- ポンプ式

#### 3. farminpocket-camera（撮影記録）

**役割**: タイムラプス撮影・リアルタイム監視

**推奨ハードウェア**:
- Raspberry Pi Camera Module v2（CSI、約¥3,000）

**機能**:
- 定期的な写真撮影（タイムラプス）
- 動画生成（ffmpeg）
- リアルタイムストリーミング（MJPEG）
- AI画像認識（オプション）

#### 4. farminpocket-guard（害獣対策）

**役割**: 動体検知 + 威嚇（光・音）

**推奨ハードウェア**:
- PIRセンサー HC-SR501（約¥200）
- 高輝度白色LED（約¥100）
- USB スピーカー（約¥500）

**機能**:
- PIRセンサーによる動体検知
- LED点滅・音声再生による威嚇
- 検知ログの記録
- スリープモード（バッテリー節約）

#### 5. farminpocket-gateway（データ送信・通信）

**役割**: 外出先からのアクセスを可能にする

**推奨ネットワーク**:
- Wi-Fi（推奨、ゼロコスト）
- 4G LTE + 格安SIM（月額¥500〜¥1,000）
- Tailscale（無料VPN、外出先アクセス用）

## 技術スタック

### Core OS

- **ベースイメージ**: Poky（Yoctoリファレンス）
- **カーネル**: Linux 5.15 LTS
- **init システム**: systemd
- **パッケージマネージャ**: opkg

### Web監視UI

**フロントエンド**:
- React 18
- React Router 6
- Zustand（状態管理）
- Recharts（グラフ表示）
- Tailwind CSS
- Vite

**バックエンド**:
- FastAPI（Python 3.9+）
- SQLAlchemy（ORM）
- Docker SDK for Python
- APScheduler

### データベース

SQLiteを使用:
- modules テーブル
- module_data テーブル
- logs テーブル
- settings テーブル

## 電源設計

### 基本方針

- 基本はAC電源直結（持続可能性と交換回数削減）
- guardポッドのみモバイルバッテリー対応
- ソーラー充電との組み合わせで長期運用

### ポッドごとの電源

| ポッド | 消費電力 | 推奨電源 |
|--------|---------|---------|
| atmosphere | 約1.2W | AC電源 |
| water | 約1.3W | AC電源 |
| camera | 約2.7W | AC電源 |
| guard | 約1.5W | モバイルバッテリー+ソーラー |
| gateway | 約1.5W | AC電源 |

### guardポッドのバッテリー駆動

```
ソーラーパネル（10W）
  ↓
モバイルバッテリー（20,000mAh）
  ↓
Raspberry Pi Zero W
```

- バッテリー駆動時間: 約49時間（ソーラー充電なし）
- ソーラー充電込み: 収支+14Wh/日（持続可能）

## コスト試算

### 初期費用

| ポッド | センサー等 |
|--------|-----------|
| atmosphere | ¥1,300 |
| water | ¥3,300 |
| camera | ¥3,000 |
| guard | ¥800 |
| gateway | ¥0（Wi-Fi利用時） |
| **合計** | **約¥8,400** |

### 10年間総コスト

Farm in Pocket: 約¥42,500
メーカー純正システム: 約¥800,000〜

**削減効果: 約95%**

## ノーコンフィグの実現方法

### I2Cセンサーの自動検出

```bash
i2cdetect -y 1
# 0x23 → BH1750（照度）
# 0x48 → ADS1115（ADC）
# 0x76 → BME280（温湿度気圧）
```

### GPIOピンのデフォルト設定

- PIRセンサー: GPIO 23
- LED: GPIO 24
- リレー1: GPIO 27
- リレー2: GPIO 22

配線ガイドをシールで同梱 → 決められたピンに接続するだけ

## プラットフォーム

### 公式サポート: Raspberry Pi のみ

**推奨モデル**:
- atmosphere/water/guard: Raspberry Pi Zero W（¥1,500、低消費電力）
- camera: Raspberry Pi 4 Model B 2GB（¥6,000、性能が必要）

### Arduino版（コミュニティサポート）

ArduinoはRaspberry Piにデータを送るセンサーノードとして使用可能。公式サポート対象外。

## モジュール標準仕様

### 必須ファイル

1. manifest.json - モジュールメタデータ
2. Dockerfile - コンテナイメージ定義
3. README.md - ドキュメント
4. config.example.yml - 設定例

### manifest.json スキーマ

```json
{
  "name": "string",
  "version": "string (semver)",
  "description": "string",
  "author": "string",
  "license": "string",
  "dependencies": { "hardware": [], "software": [] },
  "config": { ... },
  "ports": { "http": 8001 },
  "healthcheck": { ... }
}
```

## 開発状況

### Phase 1: 基本システム構築（進行中）

- ✅ プロジェクト構想策定
- ✅ リポジトリ構成設計
- ✅ 設計ドキュメント作成
- 🔄 Web UI実装
- 🔄 各モジュール開発
- 🔄 OSイメージビルド環境構築

### Phase 2〜4（予定）

- コミュニティ構築
- エコシステム拡大
- グローバル展開

## 類似プロジェクトとの違い

| 項目 | Farm in Pocket | FarmBot | Mycodo |
|------|---------------|---------|--------|
| 価格 | 無料 | $1,500〜 | 無料 |
| 難易度 | 簡単 | 中〜難 | 難 |
| 日本語対応 | ◎ | △ | × |
| ノーコンフィグ | ◎ | × | × |

## 参考資料

- [Yocto Project Documentation](https://docs.yoctoproject.org/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Docker SDK for Python](https://docker-py.readthedocs.io/)
