# Farm in Pocket

零細農家・個人農家のための完全無料IoT農業システム。

**「ポケットの中の農業」— 農業の未来をポケットに**

## 特徴

- **完全無料** - ソフトウェア・ドキュメントすべて無償
- **ノーコンフィグ** - SDカードに書き込むだけで起動
- **プラグイン方式** - 必要な機能だけを選んで導入
- **低コスト** - 10年間で約95%のコスト削減

## 機能モジュール

| モジュール | 機能 |
|-----------|------|
| atmosphere | 温度・湿度・気圧・照度監視 |
| water | 自動潅水制御 |
| camera | タイムラプス写真記録 |
| guard | 害獣監視＋威嚇（光・音） |
| gateway | データ送信・遠隔監視 |

## クイックスタート

```bash
# OSイメージをダウンロード
wget https://github.com/kako-jun/farm-in-pocket/releases/latest/download/farminpocket-latest.img.gz

# SDカードに書き込み
gunzip -c farminpocket-latest.img.gz | sudo dd of=/dev/sdX bs=4M status=progress

# Raspberry Piに挿入して起動
# ブラウザで http://farminpocket.local にアクセス
```

## コスト試算

| 項目 | 初期費用 | 10年総額 |
|------|---------|---------|
| Farm in Pocket | ¥18,500 | ¥42,500 |
| メーカー純正 | ¥300,000〜 | ¥800,000〜 |

## 対応ハードウェア

- Raspberry Pi Zero W / 4

## ライセンス

MIT

## サポート

- [GitHub Issues](https://github.com/kako-jun/farm-in-pocket/issues)
- [GitHub Discussions](https://github.com/kako-jun/farm-in-pocket/discussions)
