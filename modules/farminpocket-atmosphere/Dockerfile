FROM python:3.9-slim

LABEL maintainer="Farm in Pocket Contributors"
LABEL version="1.0.0"
LABEL description="温度・湿度監視モジュール"

WORKDIR /app

# 依存関係のインストール（実際のセンサー使用時は追加が必要）
# RUN pip install --no-cache-dir Adafruit-DHT w1thermsensor

# アプリケーションのコピー
COPY src/ .
COPY config.example.json config.json

# データディレクトリの作成
RUN mkdir -p /data

# 非rootユーザーで実行
RUN useradd -m -u 1000 farmuser && \
    chown -R farmuser:farmuser /app /data
USER farmuser

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD test -f /data/$(date +%Y-%m-%d).csv || exit 1

# アプリケーション起動
CMD ["python", "main.py"]
