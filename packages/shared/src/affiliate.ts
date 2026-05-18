// アフィリエイト表示ヘルパー (Issue: kako-jun/farm-in-pocket#37)
//
// seed_products / materials の affiliate_links は `{shop, url}[]` で永続化される。
// 表示側で shop 名から `Amazon` / `楽天市場` / `公式サイト` 等のラベルとアイコンを
// 自動付与するための薄いユーティリティ。
//
// 仕様:
//   - shop は文字列。`amazon` / `rakuten` / `official` / `mercari` / `yahoo` を
//     正規化（小文字比較）してラベルとアイコンを当てる。
//   - 未知の shop 名はそのまま label にし、アイコンは `🔗` をフォールバック。
//   - URL は http(s) のみを「表示してよい」と判定する（javascript: 等のガード）。
//   - 価格はあえて表示しない（飛び先で判断）。

export type AffiliateShop = "amazon" | "rakuten" | "official" | "mercari" | "yahoo" | "other";

export interface AffiliateLink {
  shop: string;
  url: string;
}

export interface AffiliateLinkDisplay {
  shop: string;
  url: string;
  label: string;
  icon: string;
}

const SHOP_DECORATIONS: Record<string, { label: string; icon: string }> = {
  amazon: { label: "Amazon", icon: "🛒" },
  rakuten: { label: "楽天市場", icon: "🛍️" },
  official: { label: "公式サイト", icon: "🌐" },
  mercari: { label: "メルカリ", icon: "🟧" },
  yahoo: { label: "Yahoo!ショッピング", icon: "🟣" },
};

/**
 * shop 名からラベルとアイコンを引き当てる。
 * 未知の shop は shop 文字列自体を label にし、汎用リンクアイコンを返す。
 */
export function decorateAffiliate(link: AffiliateLink): AffiliateLinkDisplay {
  const key = link.shop.toLowerCase().trim();
  const meta = SHOP_DECORATIONS[key] ?? { label: link.shop, icon: "🔗" };
  return {
    shop: link.shop,
    url: link.url,
    label: meta.label,
    icon: meta.icon,
  };
}

/**
 * 表示してよい URL か判定する。http(s) のみ許可。
 * isValidAffiliateLinks より緩い表示用ガード。
 */
export function isValidAffiliateUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
