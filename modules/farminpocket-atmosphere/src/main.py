#!/usr/bin/env python3
"""
Farm in Pocket - 温度・湿度監視モジュール

DHT22/DHT11/DS18B20センサーから温度・湿度を読み取り、
定期的にログに記録するシンプルなモジュール。
"""
import time
import random
import json
import logging
from datetime import datetime
from pathlib import Path


# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class TemperatureSensor:
    """温度・湿度センサークラス（ダミー実装）"""

    def __init__(self, sensor_type="DHT22", gpio_pin=4):
        self.sensor_type = sensor_type
        self.gpio_pin = gpio_pin
        logger.info(f"Initialized {sensor_type} sensor on GPIO {gpio_pin}")

    def read(self):
        """
        センサーから温度・湿度を読み取る

        実際の実装では、Adafruit_DHTやw1thermsensorライブラリを使用
        現在はダミーデータを生成

        Returns:
            tuple: (temperature, humidity) または (None, None)
        """
        # ダミーデータ生成（実際にはセンサーから読み取り）
        # 温度: 20-30℃の範囲でランダム
        # 湿度: 40-80%の範囲でランダム
        temperature = round(20 + random.uniform(0, 10), 1)
        humidity = round(40 + random.uniform(0, 40), 1)

        return temperature, humidity


class FarmInPocketTemp:
    """Farm in Pocket 温度・湿度監視モジュール"""

    def __init__(self, config_path="config.json"):
        self.config = self.load_config(config_path)
        self.sensor = TemperatureSensor(
            sensor_type=self.config.get("sensor_type", "DHT22"),
            gpio_pin=self.config.get("gpio_pin", 4)
        )
        self.data_dir = Path(self.config.get("data_dir", "/data"))
        self.data_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Farm in Pocket Temperature Module started")
        logger.info(f"Config: {self.config}")

    def load_config(self, config_path):
        """設定ファイルを読み込む"""
        default_config = {
            "sensor_type": "DHT22",
            "gpio_pin": 4,
            "interval": 60,
            "temp_offset": 0.0,
            "humidity_offset": 0.0,
            "alert_temp_high": 35.0,
            "alert_temp_low": 5.0,
            "alert_humidity_high": 80.0,
            "alert_humidity_low": 30.0,
            "data_dir": "/data"
        }

        try:
            with open(config_path, 'r') as f:
                user_config = json.load(f)
                default_config.update(user_config)
        except FileNotFoundError:
            logger.warning(f"Config file not found: {config_path}, using defaults")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse config file: {e}, using defaults")

        return default_config

    def check_alerts(self, temperature, humidity):
        """アラート条件をチェック"""
        alerts = []

        if temperature > self.config["alert_temp_high"]:
            alerts.append(f"High temperature alert: {temperature}°C")
        if temperature < self.config["alert_temp_low"]:
            alerts.append(f"Low temperature alert: {temperature}°C")
        if humidity > self.config["alert_humidity_high"]:
            alerts.append(f"High humidity alert: {humidity}%")
        if humidity < self.config["alert_humidity_low"]:
            alerts.append(f"Low humidity alert: {humidity}%")

        return alerts

    def save_data(self, temperature, humidity):
        """データをCSVファイルに保存"""
        today = datetime.now().strftime("%Y-%m-%d")
        csv_file = self.data_dir / f"{today}.csv"

        # ファイルが存在しない場合はヘッダーを書き込む
        if not csv_file.exists():
            with open(csv_file, 'w') as f:
                f.write("timestamp,temperature,humidity\n")

        # データを追記
        timestamp = datetime.now().isoformat()
        with open(csv_file, 'a') as f:
            f.write(f"{timestamp},{temperature},{humidity}\n")

    def run(self):
        """メインループ"""
        interval = self.config.get("interval", 60)

        logger.info(f"Starting monitoring loop (interval: {interval}s)")

        try:
            while True:
                # センサーから読み取り
                temperature, humidity = self.sensor.read()

                if temperature is None or humidity is None:
                    logger.error("Failed to read from sensor")
                    time.sleep(interval)
                    continue

                # 補正値を適用
                temperature += self.config.get("temp_offset", 0.0)
                humidity += self.config.get("humidity_offset", 0.0)

                # ログに記録
                logger.info(f"Temperature: {temperature}°C, Humidity: {humidity}%")

                # アラートチェック
                alerts = self.check_alerts(temperature, humidity)
                for alert in alerts:
                    logger.warning(alert)

                # データを保存
                self.save_data(temperature, humidity)

                # 次の測定まで待機
                time.sleep(interval)

        except KeyboardInterrupt:
            logger.info("Stopping temperature monitoring")
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)


def main():
    """エントリーポイント"""
    module = FarmInPocketTemp()
    module.run()


if __name__ == "__main__":
    main()
