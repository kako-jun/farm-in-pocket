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

**対応センサー**:
- 温度・湿度: DHT22, DHT11, BME280, SHT31
- 照度: BH1750, TSL2561

**主な機能**:
- 定期的な環境データ取得（デフォルト60秒間隔）
- CSVファイルへのデータ保存（日付ごとに分割）
- アラート機能
  - 高温・低温アラート
  - 高湿度・低湿度アラート
  - 低照度アラート（日照不足の警告）
- JSON設定ファイル対応

**ユースケース**:
- ハウス内の温度管理
- 湿度による病害予測
- 日照時間の記録

**データ例**:
```json
{
  "temperature": 24.5,
  "humidity": 65.0,
  "light": 15000,
  "timestamp": "2025-11-17T15:30:21Z"
}
```

---

### 2. farminpocket-water（潅水制御）

**旧名**: farminpocket-irrigation

**役割**: 土壌湿度監視 + 自動潅水

**対応ハードウェア**:
- センサー: 静電容量式土壌湿度センサー
- アクチュエータ: 電磁弁（3/4インチ、12V DC）、リレーモジュール（2ch以上推奨）

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

**対応ハードウェア**:
- Raspberry Pi Camera Module v2/v3
- USB Webカメラ
- Pi Camera HQ（高解像度）

**主な機能**:
- 定期的な写真撮影（タイムラプス）
- 動画生成（ffmpegによるタイムラプス動画化）
- リアルタイムストリーミング（MJPEG）
- AI画像認識（オプション）
  - 病害虫検知
  - 成長段階判定
- クラウドアップロード（オプション）

**設定項目**:
```json
{
  "camera_type": "pi_camera",
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

**対応ハードウェア**:
- センサー: PIRセンサー、超音波センサー
- アクチュエータ: 高輝度LED、スピーカー（Bluetooth/USB）

**主な機能**:
- PIRセンサーによる動体検知
- 検知時の自動威嚇
  - LED点滅（高輝度）
  - 音声再生（警告音、動物の鳴き声など）
- 検知ログの記録（日時、回数）
- スケジュール設定（夜間のみ動作など）

**設定項目**:
```json
{
  "pir_pin": 23,
  "led_pin": 24,
  "speaker_device": "/dev/snd/pcmC0D0p",
  "sensitivity": "medium",
  "scare_duration": 30,
  "enable_schedule": true,
  "active_hours": ["18:00-06:00"],
  "sound_file": "/sounds/alert.wav"
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

**対応プロトコル**:
- Wi-Fi
- LoRaWAN
- MQTT
- HTTP/HTTPS（REST API）

**主な機能**:
- 各ポッドからのデータ集約
- クラウドサービスへのデータ送信
  - AWS IoT Core
  - Google Cloud IoT
  - Azure IoT Hub
  - Ambient（データ可視化サービス）
- MQTT Broker連携
- LoRaWANゲートウェイ連携
- データのバッファリング（オフライン時）

**設定項目**:
```json
{
  "wifi_ssid": "MyWiFi",
  "enable_mqtt": true,
  "mqtt_broker": "mqtt.example.com",
  "mqtt_port": 1883,
  "mqtt_topics": {
    "atmosphere": "farm/atmosphere",
    "water": "farm/water"
  },
  "enable_lorawan": false,
  "cloud_provider": "ambient",
  "api_key": "YOUR_API_KEY"
}
```

**ユースケース**:
- 遠隔地からのデータ確認
- データの長期保存
- 複数デバイスの一元管理

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

これらのポッドを組み合わせることで、小規模農家でも高度なIoT農業を低コストで実現できます。
