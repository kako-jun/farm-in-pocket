// applyFilterToFile のテスト (Issue: kako-jun/farm-in-pocket#28)
//
// happy-dom 環境の都合で HTMLCanvasElement#toBlob が無いため、
// テストごとに必要な部分だけスタブする。

import { describe, expect, it } from "vitest";
import { __internal, applyFilterToFile } from "./apply-filter";

describe("applyFilterToFile", () => {
  it("cssFilter='none' の場合は元 File をそのまま返す", async () => {
    const original = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
    const result = await applyFilterToFile(original, "none");
    expect(result).toBe(original);
  });

  it("空文字も filter なし扱いで元 File を返す", async () => {
    const original = new File([new Uint8Array([1])], "photo.png", { type: "image/png" });
    const result = await applyFilterToFile(original, "   ");
    expect(result).toBe(original);
  });

  it("SSR / Node 環境 (document が存在しない) ではフォールバックして元 File を返す", async () => {
    // shared package の vitest は node 環境で動くので document はそもそも未定義。
    // ガード分岐 (typeof document === "undefined") が踏まれ、画像ロード経路に入らないこと
    // を確認する。`document` を触らずに済む = 例外が出ない & 元 File をそのまま返す。
    const original = new File([new Uint8Array([4, 5, 6])], "p.jpg", { type: "image/jpeg" });
    const result = await applyFilterToFile(original, "contrast(1.2)");
    expect(result).toBe(original);
  });

  it("正常時はファイル名に -filtered サフィックスが付く", () => {
    expect(__internal.renameWithSuffix("photo.jpg", "-filtered", "image/jpeg")).toBe(
      "photo-filtered.jpg",
    );
    expect(__internal.renameWithSuffix("photo.png", "-filtered", "image/png")).toBe(
      "photo-filtered.png",
    );
  });

  it("拡張子なし / 複合拡張子も正規化される", () => {
    // 拡張子無し → デフォルトの jpg を追加
    expect(__internal.renameWithSuffix("photo", "-filtered", "image/jpeg")).toBe(
      "photo-filtered.jpg",
    );
    // PNG 出力で元拡張子が違うときも出力側に揃える (HEIC → JPEG, png 入力 → png 出力)
    expect(__internal.renameWithSuffix("photo.heic", "-filtered", "image/jpeg")).toBe(
      "photo-filtered.jpg",
    );
    expect(__internal.renameWithSuffix("photo.jpeg", "-filtered", "image/jpeg")).toBe(
      "photo-filtered.jpg",
    );
    // 名前途中のドットは消さない
    expect(__internal.renameWithSuffix("my.photo.001.jpg", "-filtered", "image/jpeg")).toBe(
      "my.photo.001-filtered.jpg",
    );
  });
});
