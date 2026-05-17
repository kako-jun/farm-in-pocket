FROM node:18-alpine

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
RUN npm install

# アプリケーションのコピー
COPY . .

# ポート公開
EXPOSE 5173

# 開発サーバー起動
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
