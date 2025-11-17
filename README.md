# Farm in Pocket

**ポケットの中の農業** - 零細農家・個人農家のための完全無料IoT農業システム

## プロジェクト概要

Farm in Pocketは、高額なメーカー純正システムを使わずに、IoTで農業を効率化できる無料の仕組みを提供するオープンソースプロジェクトです。

### コンセプト

- **完全無料** - すべてのソフトウェアとドキュメントが無料で利用可能
- **ノーコンフィグ** - SDカードに書き込むだけで起動
- **プラグイン方式** - 必要なモジュールだけを選んで導入可能
- **長期運用を前提** - 10年間の運用コストを見据えた設計

### 主な機能

Farm in Pocketは、モジュール方式で以下の機能を提供します：

| モジュール名 | 機能 | 対象課題 |
|------------|------|---------|
| `farminpocket-temp` | 温度・湿度監視 | ハウス内環境の可視化 |
| `farminpocket-irrigation` | 自動潅水制御 | 水やり作業の自動化 |
| `farminpocket-photo` | タイムラプス写真記録 | 成長記録・異常検知 |
| `farminpocket-scare` | 害獣監視＋威嚇（光・音） | 害獣対策の自動化 |
| `farminpocket-connect` | データ送信（LoRaWAN/Wi-Fi/MQTT） | クラウド連携・遠隔監視 |

### アーキテクチャ

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

## リポジトリ構成

```
farm-in-pocket/
├── core/                      # コアシステム
│   ├── web-ui/               # Web監視UI
│   ├── os-image/             # Yoctoベースのカスタムイメージ
│   └── installer/            # SDカード書き込みツール
├── modules/                   # 機能モジュール
│   ├── farminpocket-temp/
│   ├── farminpocket-irrigation/
│   ├── farminpocket-photo/
│   ├── farminpocket-scare/
│   └── farminpocket-connect/
├── docs/                      # ドキュメント
│   ├── guides/               # 導入ガイド
│   ├── cost-calculator/      # コスト試算ツール
│   └── case-studies/         # 事例報告テンプレート
└── scripts/                   # ビルド・デプロイスクリプト
```

## クイックスタート

### 1. OSイメージのダウンロード

```bash
# リリースページから最新のイメージをダウンロード
wget https://github.com/kako-jun/farm-in-pocket/releases/latest/download/farminpocket-latest.img.gz
```

### 2. SDカードに書き込み

```bash
# イメージをSDカードに書き込み（例：/dev/sdX）
gunzip -c farminpocket-latest.img.gz | sudo dd of=/dev/sdX bs=4M status=progress
sync
```

### 3. 起動

1. SDカードをRaspberry Piに挿入
2. 電源を入れる
3. ブラウザで `http://farminpocket.local` にアクセス

## 差別化ポイント

1. **完全無料・オープンソース** - 利用料金やライセンス費用が一切不要
2. **書き込むだけで動く** - 複雑な設定作業が不要
3. **長期運用試算の標準化** - 初期費用・年間維持費・10年試算を明確化
4. **個人農家向けに特化** - 大規模システムではなく小規模感を重視
5. **簡単なモジュール追加** - 必要な機能だけを選択可能

## コスト試算例

| 項目 | 初期費用 | 年間維持費 | 10年総額 |
|------|---------|-----------|---------|
| Raspberry Pi 4 (4GB) | ¥8,000 | - | ¥8,000 |
| SDカード (64GB) | ¥1,500 | - | ¥1,500 |
| センサー類 | ¥5,000 | - | ¥5,000 |
| 電気代 | - | ¥2,400 | ¥24,000 |
| **合計** | **¥14,500** | **¥2,400** | **¥38,500** |

※メーカー純正システムは初期費用30万円〜、年間保守費5万円〜が一般的

## 開発状況

現在、プロジェクトの基本構造を構築中です。

- [x] プロジェクト構想の策定
- [x] リポジトリ構成の設計
- [ ] Web監視UIの開発
- [ ] 各モジュールの開発
- [ ] OSイメージのビルド環境構築
- [ ] ドキュメント整備

## コントリビューション

Farm in Pocketはオープンソースプロジェクトです。バグ報告、機能提案、コード貢献を歓迎します！

詳細は [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

## ライセンス

MIT License

## サポート

- Issues: [GitHub Issues](https://github.com/kako-jun/farm-in-pocket/issues)
- Discussions: [GitHub Discussions](https://github.com/kako-jun/farm-in-pocket/discussions)

---

**Farm in Pocket** - 農業の未来をポケットに
