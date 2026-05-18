// AffiliateLinks テスト (Issue: kako-jun/farm-in-pocket#37)

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AffiliateLinks from "./AffiliateLinks";

describe("AffiliateLinks", () => {
  it("links が空 / null のときは何も描画しない", () => {
    const { container: c1 } = render(<AffiliateLinks links={null} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<AffiliateLinks links={[]} />);
    expect(c2.firstChild).toBeNull();
  });

  it("Amazon 単独リンクは 🛒 + Amazon ラベル + target/rel が正しく付く", () => {
    render(
      <AffiliateLinks links={[{ shop: "amazon", url: "https://www.amazon.co.jp/dp/B000XYZ" }]} />,
    );
    const link = screen.getByTestId("fip-affiliate-link-0");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "https://www.amazon.co.jp/dp/B000XYZ");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer sponsored");
    expect(link.textContent).toContain("🛒");
    expect(link.textContent).toContain("Amazon");
  });

  it("複数 shop の場合は全部ボタンが出る（Amazon / 楽天 / 未知）", () => {
    render(
      <AffiliateLinks
        links={[
          { shop: "amazon", url: "https://amazon.co.jp/dp/X" },
          { shop: "rakuten", url: "https://item.rakuten.co.jp/x" },
          { shop: "Kakaku.com", url: "https://kakaku.com/" },
          // 不正 URL は除外される
          { shop: "evil", url: "javascript:alert(1)" },
        ]}
      />,
    );
    expect(screen.getByText("Amazon")).toBeInTheDocument();
    expect(screen.getByText("楽天市場")).toBeInTheDocument();
    expect(screen.getByText("Kakaku.com")).toBeInTheDocument();
    // 不正 URL は除外され、合計 3 件
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
