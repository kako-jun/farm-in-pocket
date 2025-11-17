# Farm in Pocket - ポッド設計

最終更新: 2025-11-17

## ポッド（Pod）とは

Farm in Pocketでは、各機能を「**ポッド（Pod）**」と呼びます。

- **定義**: 特定の機能に特化した、独立して動作するDockerコンテナ
- **特徴**:
  - 1つのポッド = 1つの責務（Single Responsibility）
  - プラグイン方式で追加・削除が容易
  - 互いに独立して動作（疎結合）
  - manifest.jsonで標準化された設定

**呼び名の由来**:
- 「ポケット」のコンセプトと語感が良い
- 小さな独立したユニットというイメージ
- Kubernetesの「Pod」と同様の概念

---

## 標準ポッド構成（5種類）

### 1. farminpocket-atmosphere（大気環境監視）

**旧名**: farminpocket-temp

**役割**: 温度・湿度・照度の監視

**推奨センサー（ノーコンフィグ対応）**:
- **温度・湿度・気圧**: **BME280**（I2C、約1000円）
  - I2Cアドレス: 0x76 または 0x77（自動検出）
  - 配線: SDA, SCL, VCC (3.3V), GND の4本のみ
  - 精度: 温度±1℃、湿度±3%、気圧±1hPa
- **照度**: **BH1750**（I2C、約300円）
  - I2Cアドレス: 0x23（自動検出）
  - 配線: SDA, SCL, VCC (3.3V), GND の4本のみ
  - 測定範囲: 1〜65535 lux

**なぜこの構成？**
- ✅ I2Cで自動検出できるため**設定不要**
- ✅ 配線がシンプル（複数センサーを同じSDA/SCLに接続可能）
- ✅ 気圧も測定できる（天候予測に有用）
- ✅ 入手性が良く、コスパが高い

**主な機能**:
- 定期的な環境データ取得（デフォルト60秒間隔）
- CSVファイルへのデータ保存（日付ごとに分割）
- アラート機能
  - 高温・低温アラート
  - 高湿度・低湿度アラート
  - 低照度アラート（日照不足の警告）
  - 気圧変化アラート（天候急変の予兆）
- **自動センサー検出**（GPIO設定不要）

**ユースケース**:
- ハウス内の温度管理
- 湿度による病害予測
- 日照時間の記録
- 気圧変化による天候予測

**データ例**:
```json
{
  "temperature": 24.5,
  "humidity": 65.0,
  "pressure": 1013.25,
  "light": 15000,
  "timestamp": "2025-11-17T15:30:21Z"
}
```

---

### 2. farminpocket-water（潅水制御）

**旧名**: farminpocket-irrigation

**役割**: 土壌湿度監視 + 自動潅水

**推奨ハードウェア（ノーコンフィグ対応）**:
- **土壌湿度センサー**: 静電容量式（約500円）
  - 抵抗式より耐久性が高い（腐食しにくい）
  - アナログ出力
- **ADコンバータ**: **ADS1115**（I2C、約500円）
  - 16bit 4ch ADコンバータ
  - I2Cアドレス: 0x48（自動検出）
  - Raspberry PiにはADCがないため必須
- **電磁弁**: 3/4インチ 12V DC（約2000円）
- **リレーモジュール**: 2ch以上（約300円）
  - 5V駆動、Raspberry PiのGPIOで制御

**対応する灌漑方式**:

#### 1. 点滴灌漑（ドリップイリゲーション）
```
蛇口 → 電磁弁 → ドリップホース/チューブ（穴あき）
```
- 屋外にホースをはりめぐらせて穴を開け、そこから水を流す方式
- じわじわ浸透させるため、水の無駄が少ない
- 必要水圧: 0.5〜2.0 bar（蛇口の水圧で十分）
- 適用: 畝に沿った野菜栽培、ハウス内栽培

#### 2. スプリンクラー（回転式/インパルス式）
```
蛇口 → 電磁弁 → スプリンクラーヘッド（反動回転式）
```
- 蛇口に繋いで広範囲に散水
- 反動で自動回転するタイプに対応
- 必要水圧: 2.0〜3.5 bar（蛇口の水圧で対応可能）
- 適用: 芝生、広い畑、露地栽培

#### 3. その他の灌漑方式
- **マイクロスプリンクラー**: 小規模散水、果樹の根元など
- **ポンプ式**: 雨水タンクや井戸水からポンプで汲み上げ
- **タイマー式**: 電磁弁 + 機械式タイマーの併用

**電磁弁の仕様**:
- 口径: 3/4インチ（20mm）※一般的な蛇口のサイズ
- 電圧: 12V DC（Raspberry Piからリレー経由で制御）
- 消費電力: 開閉時のみ 6W程度（常時は0W）
- 推奨品: UEETEK 電磁弁、タカギ 電磁弁など

**主な機能**:
- 土壌湿度の定期監視
- スケジュール潅水（時刻指定）
- 条件付き潅水（湿度が閾値以下の場合のみ）
- 散水履歴の記録
- 手動潅水トリガー（WebUI経由）
- 複数ゾーン対応（リレー2ch以上で複数電磁弁を制御）

**設定項目**:
```json
{
  "soil_sensor_pin": 17,
  "valve_pin": 27,
  "irrigation_type": "drip",
  "threshold_dry": 30,
  "threshold_wet": 60,
  "schedule": ["06:00", "18:00"],
  "duration": 60,
  "enable_auto": true,
  "zones": [
    {
      "name": "zone1",
      "valve_pin": 27,
      "type": "drip"
    },
    {
      "name": "zone2",
      "valve_pin": 22,
      "type": "sprinkler"
    }
  ]
}
```

**ユースケース**:
- 自動水やり（点滴、スプリンクラー）
- 土壌湿度の最適化
- 水やり作業の省力化
- 複数ゾーンの独立制御

---

### 3. farminpocket-camera（撮影記録）

**旧名**: farminpocket-photo

**役割**: タイムラプス撮影・リアルタイム監視

**推奨ハードウェア（ノーコンフィグ対応）**:
- **Raspberry Pi Camera Module v2**（CSI接続、約3000円）
  - 解像度: 8MP (3280×2464)
  - 動画: 1080p30, 720p60
  - CSIケーブルで自動検出（設定不要）
  - 豊富な実績、確実に動く

**なぜv2？**
- ✅ v3は高価で入手性が悪い
- ✅ USB Webカメラはドライバ問題がある
- ✅ Pi Camera HQは約8000円と高価
- ✅ v2なら3000円程度で十分な画質

**主な機能**:
- 定期的な写真撮影（タイムラプス）
- 動画生成（ffmpegによるタイムラプス動画化）
- リアルタイムストリーミング（MJPEG）
- AI画像認識（オプション）
  - 病害虫検知
  - 成長段階判定
- クラウドアップロード（オプション）
- **自動カメラ検出**（CSI接続時）

**設定項目**:
```json
{
  "resolution": [1920, 1080],
  "interval": 600,
  "enable_timelapse": true,
  "timelapse_fps": 30,
  "enable_ai": false,
  "upload_to_cloud": false
}
```

**ユースケース**:
- 成長記録の撮影
- 病害虫の早期発見
- 作業記録

**注意**: カメラ機能に特化し、他の機能とは分離

---

### 4. farminpocket-guard（害獣対策）

**旧名**: farminpocket-scare

**役割**: 動体検知 + 威嚇（光・音）

**推奨ハードウェア（ノーコンフィグ対応）**:
- **動体検知**: **PIRセンサー HC-SR501**（約200円）
  - 赤外線で人間/動物の動きを検知
  - デジタル出力（GPIO接続）
  - 検知距離: 3〜7m（調整可能）
  - 検知角度: 約120度
  - 配線: VCC (5V), GND, OUT の3本のみ
- **威嚇LED**: 高輝度白色LED（約100円）
- **威嚇音**: USB スピーカー（約500円）
  - Raspberry Pi Zero Wの3.5mmジャック経由

**なぜPIRセンサー？**
- ✅ 超音波センサーは距離測定向き（動体検知には不向き）
- ✅ PIRは害獣対策の実績が豊富
- ✅ 安価で消費電力が少ない（0.3W程度）
- ✅ 配線が簡単

**主な機能**:
- PIRセンサーによる動体検知
- 検知時の自動威嚇
  - LED点滅（高輝度）
  - 音声再生（警告音、動物の鳴き声など）
- 検知ログの記録（日時、回数）
- スケジュール設定（夜間のみ動作など）
- **スリープモード**（バッテリー節約）

**設定項目**:
```json
{
  "pir_pin": 23,
  "led_pin": 24,
  "speaker_device": "default",
  "sensitivity": "medium",
  "scare_duration": 30,
  "enable_schedule": true,
  "active_hours": ["18:00-06:00"],
  "sound_file": "/sounds/alert.wav",
  "sleep_mode": true
}
```

**ユースケース**:
- 夜間の害獣侵入防止
- イノシシ・シカ対策
- 鳥害対策

**注意**: 威嚇のみで、捕獲や危害を与える機能は含まない

---

### 5. farminpocket-gateway（データ送信・通信）

**旧名**: farminpocket-connect

**役割**: クラウド連携・データ集約・通信

**推奨ネットワーク（ノーコンフィグ対応）**:

#### 1. Wi-Fi（推奨、ゼロコスト）
- Raspberry Pi標準搭載
- 自宅の既存Wi-Fiルーターに接続
- 追加コスト: ¥0
- 設定: SSID + パスワードのみ

#### 2. 4G LTE（Wi-Fiが届かない場合）
- **USB 4G LTE モデム**（約3000円）
  - 推奨: Huawei E3372、ZTE MF823など
  - Raspberry PiのUSBポートに差し込むだけ
- **格安データSIM**（月額500〜1000円）
  - IIJmio データプラン: 2GB ¥740/月
  - OCNモバイルONE: 3GB ¥858/月
  - mineo: 5GB ¥1,265/月
  - 家族契約のシェアプランで追加可能
- APN自動設定（主要キャリア対応）

**なぜこの構成？**
- ✅ Wi-Fiは既存ネットワークを利用（ゼロコスト）
- ✅ 格安SIMは家族契約のシェアプランで安価
- ✅ LoRaWAN/ZigBee/SOCROMは高コストで複雑（個人農業には不向き）
- ✅ AWS IoT Core/Azure IoT Hubはエンタープライズ向けで設定が複雑

**対応データ送信先**:
1. **Ambient**（推奨、無料枠あり）
   - 無料枠: 8チャネル、1分間隔
   - 日本の農業IoTで実績豊富
   - グラフ自動生成
2. **MQTT**（軽量、IoT標準）
   - mosquitto（オープンソース）
   - CloudMQTT（無料枠あり）
3. **HTTP/HTTPS**（シンプル）
   - 自前サーバーへPOST
   - Webhookなど

**主な機能**:
- 各ポッドからのデータ集約
- Ambientへのデータ送信（グラフ可視化）
- MQTT Broker連携
- データのバッファリング（オフライン時）
- **自動再接続**（Wi-Fi/4G切断時）

**設定項目**:
```json
{
  "network": {
    "type": "wifi",
    "wifi_ssid": "MyWiFi",
    "wifi_password": "password"
  },
  "data_destination": "ambient",
  "ambient": {
    "channel_id": "12345",
    "write_key": "YOUR_WRITE_KEY"
  },
  "mqtt": {
    "enable": false,
    "broker": "mqtt.example.com",
    "port": 1883,
    "topics": {
      "atmosphere": "farm/atmosphere",
      "water": "farm/water"
    }
  }
}
```

**ユースケース**:
- 外出先からスマホでデータ確認
- データの長期保存・グラフ化
- 複数デバイスの一元管理

**ランニングコスト**:
- Wi-Fi: ¥0/月
- 4G LTE（格安SIM）: ¥500〜¥1,000/月
- Ambient無料枠: ¥0/月

**注意**: データ転送に特化し、センサーやアクチュエータは持たない

---

## ポッドの設計原則

### 1. Single Responsibility（単一責任の原則）

- 1つのポッド = 1つの機能
- カメラはカメラに特化
- 温度と湿度は兼ねても良い（同じ環境データ）

### 2. 独立性

- 各ポッドは独立して動作
- 他のポッドに依存しない
- 障害の局所化（1つのポッドが止まっても他は動く）

### 3. 標準化されたインターフェース

- すべてのポッドは manifest.json を持つ
- Docker コンテナとして動作
- REST API または MQTT で通信

### 4. 拡張性

- 新しいポッドを簡単に追加可能
- コミュニティが独自ポッドを開発可能

---

## ポッドの命名規則

```
farminpocket-<機能名>
```

**例**:
- farminpocket-atmosphere
- farminpocket-water
- farminpocket-camera
- farminpocket-guard
- farminpocket-gateway

**ルール**:
- すべて小文字
- ハイフン区切り
- 機能が明確にわかる英単語を使用

---

## ポッド間通信

### 方法1: REST API

各ポッドはHTTPポートを公開し、REST APIで通信

```
farminpocket-atmosphere: http://localhost:8001/api/data
farminpocket-water:      http://localhost:8002/api/status
farminpocket-camera:     http://localhost:8003/api/image
```

### 方法2: MQTT

MQTTブローカー経由でPub/Sub

```
farm/atmosphere/data    → 温度・湿度・照度データ
farm/water/status       → 潅水ステータス
farm/camera/captured    → 写真撮影通知
farm/guard/detected     → 動体検知通知
```

### 方法3: Shared Volume

Dockerボリューム経由でデータ共有

```
/data/shared/
├── atmosphere/
│   └── latest.json
├── water/
│   └── status.json
└── camera/
    └── latest.jpg
```

---

## ポッドのライフサイクル

### 1. インストール

Web UIまたはCLI経由でインストール

```bash
# Web UI
ポッド管理 → [利用可能なポッド] → farminpocket-atmosphere → [インストール]

# CLI
docker-compose up -d farminpocket-atmosphere
```

### 2. 設定

`config.json`を編集

```bash
cd modules/farminpocket-atmosphere
cp config.example.json config.json
nano config.json
```

### 3. 起動

```bash
docker-compose restart farminpocket-atmosphere
```

### 4. 監視

Web UIのダッシュボードで稼働状況を確認

### 5. 更新

新しいバージョンをpull

```bash
docker pull farminpocket/atmosphere:latest
docker-compose restart farminpocket-atmosphere
```

### 6. アンインストール

```bash
docker-compose down farminpocket-atmosphere
docker rmi farminpocket/atmosphere:latest
```

---

## カスタムポッドの開発

コミュニティが独自のポッドを開発する場合：

### 必須ファイル

1. **manifest.json** - ポッドのメタデータ
2. **Dockerfile** - コンテナイメージ定義
3. **README.md** - ドキュメント
4. **config.example.json** - 設定例

### manifest.json テンプレート

```json
{
  "name": "farminpocket-yourpod",
  "version": "1.0.0",
  "description": "ポッドの説明",
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "hardware": ["必要なハードウェア"],
    "software": ["python:3.9"]
  },
  "config": {
    "key": {
      "type": "string",
      "default": "value",
      "description": "説明"
    }
  },
  "ports": {
    "http": 8001
  }
}
```

---

## 今後の拡張ポッド候補

### farminpocket-nutrition（養液管理）

- EC（電気伝導率）、pH測定
- 養液の自動調整

### farminpocket-ventilation（換気制御）

- CO2濃度測定
- 換気扇の自動制御

### farminpocket-energy（電力監視）

- 電力消費量の測定
- ソーラーパネル発電量の監視

### farminpocket-weather（気象情報）

- 外部天気予報APIとの連携
- 降雨予測による潅水制御

---

## 推奨構成まとめ（ノーコンフィグ実現）

### 各ポッドの推奨センサー（1通り）

| ポッド | 推奨センサー/ハードウェア | 接続方式 | 価格 | 自動検出 |
|--------|--------------------------|----------|------|---------|
| **atmosphere** | BME280 (温湿度気圧) | I2C (0x76/0x77) | ¥1,000 | ✅ |
| | BH1750 (照度) | I2C (0x23) | ¥300 | ✅ |
| **water** | 静電容量式土壌湿度センサー | アナログ | ¥500 | - |
| | ADS1115 (ADC) | I2C (0x48) | ¥500 | ✅ |
| | 電磁弁 3/4インチ 12V | リレー | ¥2,000 | - |
| | リレーモジュール 2ch | GPIO | ¥300 | - |
| **camera** | Pi Camera Module v2 | CSI | ¥3,000 | ✅ |
| **guard** | PIRセンサー HC-SR501 | GPIO | ¥200 | - |
| | 高輝度LED | GPIO | ¥100 | - |
| | USB スピーカー | 3.5mmジャック | ¥500 | - |
| **gateway** | Wi-Fi（標準搭載） | - | ¥0 | - |
| | USB 4G LTE モデム（オプション） | USB | ¥3,000 | - |

### 初期費用の目安

- **atmosphere**: ¥1,300（センサーのみ）
- **water**: ¥3,300（センサー+電磁弁+リレー）
- **camera**: ¥3,000（カメラのみ）
- **guard**: ¥800（PIR+LED+スピーカー）
- **gateway**: ¥0（Wi-Fi利用時）/ ¥3,000（4G LTE利用時）

**合計**: 約¥8,400（Raspberry Pi本体を除く、Wi-Fi利用時）

### ランニングコスト（月額）

- **Wi-Fi利用時**: ¥0/月（既存ネットワーク利用）
- **4G LTE利用時**: ¥500〜¥1,000/月（格安データSIM）
- **Ambient無料枠**: ¥0/月（8チャネル、1分間隔）

**年間**: ¥6,000〜¥12,000（4G LTE + 格安SIM利用時）

### ノーコンフィグの実現方法

#### I2Cセンサーの自動検出
```bash
# I2Cデバイスをスキャン
i2cdetect -y 1

# 例: 以下のアドレスが見つかれば自動設定
# 0x23 → BH1750（照度センサー）
# 0x48 → ADS1115（ADC）
# 0x76 → BME280（温湿度気圧センサー）
```

#### CSIカメラの自動検出
```bash
# カメラが接続されていれば自動認識
vcgencmd get_camera
# supported=1 detected=1
```

#### GPIOピンのデフォルト設定
- PIRセンサー: GPIO 23（固定）
- LED: GPIO 24（固定）
- リレー1: GPIO 27（固定）
- リレー2: GPIO 22（固定）

**配線ガイドをシールで同梱** → ユーザーは決められたピンに接続するだけ

### ノーコンフィグのメリット

1. ✅ **SDカードを焼いて、センサーを接続するだけで動作**
2. ✅ I2Cセンサーは自動検出（config.json不要）
3. ✅ GPIOピンは固定（配線ガイド通りに接続するだけ）
4. ✅ 複数のI2Cセンサーを同じバス（SDA/SCL）に接続可能
5. ✅ 初心者でも迷わない

### 今後の拡張

コミュニティがカスタムセンサーに対応したい場合は、`config.json`で手動設定可能：

```json
{
  "sensors": {
    "temperature": {
      "type": "DHT22",
      "gpio_pin": 4
    }
  }
}
```

ただし、**標準構成ではconfig.jsonは不要**。

---

これらのポッドを組み合わせることで、小規模農家でも高度なIoT農業を低コストで実現できます。
