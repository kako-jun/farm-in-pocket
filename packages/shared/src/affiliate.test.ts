// affiliate ヘルパーのテスト (Issue: kako-jun/farm-in-pocket#37)

import { describe, expect, it } from "vitest";
import { decorateAffiliate, isValidAffiliateUrl } from "./affiliate";

describe("decorateAffiliate", () => {
  it("既知の shop (amazon) は日本語ラベルとアイコンを当てる", () => {
    const r = decorateAffiliate({ shop: "amazon", url: "https://amazon.co.jp/dp/X" });
    expect(r.label).toBe("Amazon");
    expect(r.icon).toBe("🛒");
    expect(r.shop).toBe("amazon");
    expect(r.url).toBe("https://amazon.co.jp/dp/X");
  });

  it("既知の shop は大文字混在でも引き当てる (Rakuten)", () => {
    const r = decorateAffiliate({ shop: "Rakuten", url: "https://item.rakuten.co.jp/x" });
    expect(r.label).toBe("楽天市場");
    expect(r.icon).toBe("🛍️");
  });

  it("未知の shop はそのまま label にし、汎用アイコン 🔗 を返す", () => {
    const r = decorateAffiliate({ shop: "Kakaku.com", url: "https://kakaku.com/" });
    expect(r.label).toBe("Kakaku.com");
    expect(r.icon).toBe("🔗");
  });

  it("official / mercari / yahoo のラベルが当たる", () => {
    expect(decorateAffiliate({ shop: "official", url: "https://x.example/" }).label).toBe(
      "公式サイト",
    );
    expect(decorateAffiliate({ shop: "mercari", url: "https://mercari.com/" }).label).toBe(
      "メルカリ",
    );
    expect(decorateAffiliate({ shop: "yahoo", url: "https://shopping.yahoo.co.jp/" }).label).toBe(
      "Yahoo!ショッピング",
    );
  });
});

describe("isValidAffiliateUrl", () => {
  it("http/https は OK", () => {
    expect(isValidAffiliateUrl("https://amazon.co.jp/dp/X")).toBe(true);
    expect(isValidAffiliateUrl("http://example.com/")).toBe(true);
  });

  it("javascript: / data: / 相対 URL は NG", () => {
    expect(isValidAffiliateUrl("javascript:alert(1)")).toBe(false);
    expect(isValidAffiliateUrl("data:text/html,<x>")).toBe(false);
    expect(isValidAffiliateUrl("/relative/path")).toBe(false);
    expect(isValidAffiliateUrl("")).toBe(false);
  });
});
