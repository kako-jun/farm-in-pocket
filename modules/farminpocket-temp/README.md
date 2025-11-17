# farminpocket-temp

温度・湿度監視モジュール - ハウス内の温度と湿度をリアルタイムで監視します。

## 概要

このモジュールは、DHT22/DHT11/DS18B20センサーを使用してハウス内の温度と湿度を測定し、Web UIに送信します。設定した閾値を超えた場合は、アラートを発報します。

## 対応センサー

- **DHT22** (推奨)
  - 温度範囲: -40℃ 〜 80℃ (精度 ±0.5℃)
  - 湿度範囲: 0% 〜 100% (精度 ±2%)
  - 価格: 約500円

- **DHT11**
  - 温度範囲: 0℃ 〜 50℃ (精度 ±2℃)
  - 湿度範囲: 20% 〜 80% (精度 ±5%)
  - 価格: 約200円

- **DS18B20**
  - 温度範囲: -55℃ 〜 125℃ (精度 ±0.5℃)
  - 湿度測定: 非対応
  - 価格: 約300円

## 必要なハードウェア

- Raspberry Pi (3B+ / 4 推奨)
- 温度・湿度センサー (DHT22/DHT11/DS18B20)
- ジャンパワイヤー x3
- 抵抗 (10kΩ) x1 (プルアップ用)

## 配線図

### DHT22/DHT11の場合

```
DHT22/DHT11          Raspberry Pi
    VCC -------------- 3.3V (Pin 1)
    DATA ------------- GPIO 4 (Pin 7) + 10kΩプルアップ抵抗
    GND -------------- GND (Pin 6)
```

```
    Raspberry Pi
    ┌─────────────┐
    │  1  2       │
    │  3  4 ●─────┼──── GPIO 4 (DATA)
    │  5  6 ■─────┼──── GND
    │  7  8       │
    │ ...         │
    └─────────────┘

    ● = GPIO 4 (Pin 7)
    ■ = GND (Pin 6)

    DHT22
    ┌───┐
    │ 1 │── VCC (3.3V)
    │ 2 │── DATA + 10kΩ抵抗
    │ 3 │── (未接続)
    │ 4 │── GND
    └───┘
```

### DS18B20の場合

```
DS18B20              Raspberry Pi
    VCC -------------- 3.3V (Pin 1)
    DATA ------------- GPIO 4 (Pin 7) + 4.7kΩプルアップ抵抗
    GND -------------- GND (Pin 6)
```

## インストール

### 1. モジュールのインストール

```bash
# Web UIからインストールする場合
モジュール管理 → farminpocket-temp → [インストール]

# 手動でインストールする場合
cd /opt/farminpocket/modules
docker-compose up -d farminpocket-temp
```

### 2. 設定ファイルの作成

```bash
cd modules/farminpocket-temp
cp config.example.yml config.yml
nano config.yml
```

### 3. 設定内容の編集

```yaml
# config.yml
sensor_type: DHT22        # DHT22 / DHT11 / DS18B20
gpio_pin: 4               # GPIOピン番号
interval: 60              # 測定間隔（秒）

# 補正値
temp_offset: 0.0          # 温度補正（℃）
humidity_offset: 0.0      # 湿度補正（%）

# アラート閾値
alert_temp_high: 35.0     # 高温アラート（℃）
alert_temp_low: 5.0       # 低温アラート（℃）
alert_humidity_high: 80.0 # 高湿度アラート（%）
alert_humidity_low: 30.0  # 低湿度アラート（%）
```

### 4. モジュールの起動

```bash
docker-compose restart farminpocket-temp
```

## 使用方法

### Web UIでの確認

1. ブラウザで `http://farminpocket.local` にアクセス
2. ダッシュボードに温度・湿度が表示されます

```
┌──────────────────────────────────────────────────┐
│ ✅ farminpocket-temp         v1.0.0  [稼働中]    │
│    温度: 24.5℃  湿度: 65%    最終更新: 5分前     │
└──────────────────────────────────────────────────┘
```

### APIでのデータ取得

```bash
# 最新のデータを取得
curl http://localhost:8001/api/data

# レスポンス例
{
  "temperature": 24.5,
  "humidity": 65.0,
  "timestamp": "2025-11-17T15:30:21Z"
}
```

### ログの確認

```bash
# Docker logsで確認
docker logs farminpocket-temp

# 出力例
2025-11-17 15:30:21 [INFO] Temperature: 24.5°C, Humidity: 65%
2025-11-17 15:31:21 [INFO] Temperature: 24.3°C, Humidity: 64%
```

## アラート機能

設定した閾値を超えた場合、以下のアラートが発報されます：

- **高温アラート**: 温度が `alert_temp_high` を超えた
- **低温アラート**: 温度が `alert_temp_low` を下回った
- **高湿度アラート**: 湿度が `alert_humidity_high` を超えた
- **低湿度アラート**: 湿度が `alert_humidity_low` を下回った

アラートはWeb UIとログに記録されます。

## データ保存

測定データは以下の形式で保存されます：

```
/data/temp/
├── 2025-11-17.csv
├── 2025-11-18.csv
└── ...
```

CSVフォーマット：
```csv
timestamp,temperature,humidity
2025-11-17T15:30:21Z,24.5,65.0
2025-11-17T15:31:21Z,24.3,64.0
```

## トラブルシューティング

### センサーが認識されない

**症状**: `Sensor error: Failed to read from sensor`

**原因**:
- センサーの配線ミス
- プルアップ抵抗が接続されていない
- GPIOピン番号の設定ミス

**対処法**:
1. 配線を確認
2. プルアップ抵抗（10kΩ）を追加
3. config.ymlのgpio_pin設定を確認

### 測定値が異常

**症状**: 温度が -999℃ や 999℃ など異常値

**原因**:
- センサーの故障
- 電源電圧不足
- センサータイプの設定ミス

**対処法**:
1. センサーを交換
2. 3.3Vピンから電源供給していることを確認
3. config.ymlのsensor_type設定を確認

### データが更新されない

**症状**: Web UIで「最終更新: X時間前」と表示

**原因**:
- モジュールが停止している
- ネットワーク接続の問題

**対処法**:
```bash
# モジュールの状態確認
docker ps | grep farminpocket-temp

# 再起動
docker-compose restart farminpocket-temp
```

## 開発者向け情報

### ディレクトリ構成

```
farminpocket-temp/
├── src/
│   ├── main.py              # メインプログラム
│   ├── sensors/
│   │   ├── dht22.py         # DHT22/DHT11センサー
│   │   └── ds18b20.py       # DS18B20センサー
│   ├── config.py            # 設定管理
│   └── api.py               # REST API
├── tests/
│   ├── test_sensors.py
│   └── test_api.py
├── Dockerfile
├── docker-compose.yml
├── manifest.json
├── config.example.yml
└── README.md
```

### テストの実行

```bash
# ユニットテスト
pytest tests/

# カバレッジ付き
pytest --cov=src tests/
```

### モジュールのビルド

```bash
# Dockerイメージのビルド
docker build -t farminpocket-temp:latest .

# ローカルでテスト実行
docker run --rm --privileged \
  -v /sys/class/gpio:/sys/class/gpio \
  -v $(pwd)/config.yml:/app/config.yml \
  farminpocket-temp:latest
```

## ライセンス

MIT License - 詳細は [LICENSE](../../LICENSE) を参照

## サポート

- Issues: https://github.com/kako-jun/farm-in-pocket/issues
- Discussions: https://github.com/kako-jun/farm-in-pocket/discussions
