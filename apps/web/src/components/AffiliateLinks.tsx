// AffiliateLinks (Issue: kako-jun/farm-in-pocket#37)
//
// seed_products / materials の affiliate_links を表示する小さな部品。
//   - shop 名から `🛒 Amazon` / `🛍️ 楽天市場` 等のラベル＋アイコンを自動付与
//   - 価格は表示しない（飛び先で判断）
//   - rel="noopener noreferrer sponsored"（アフィリエイト規約上 sponsored は推奨）
//   - 不正な URL（http(s) 以外）は表示しない

import type { AffiliateLink } from "@farm-in-pocket/shared";
import { decorateAffiliate, isValidAffiliateUrl } from "@farm-in-pocket/shared";
import type { JSX } from "react";

interface AffiliateLinksProps {
  links: AffiliateLink[] | null | undefined;
  /** ボタンの並び。row=横並び、col=縦並び。デフォルト row */
  align?: "row" | "col";
  /** 余白を詰めて Picker のカードに埋め込むためのコンパクトモード */
  compact?: boolean;
}

export default function AffiliateLinks(props: AffiliateLinksProps): JSX.Element | null {
  const safe = (props.links ?? []).filter((l) => isValidAffiliateUrl(l.url));
  if (safe.length === 0) return null;

  const decorated = safe.map((l) => decorateAffiliate(l));
  const align = props.align ?? "row";
  const compact = props.compact ?? false;

  const containerClass =
    align === "row" ? "flex flex-wrap items-center gap-1" : "flex flex-col items-stretch gap-1";

  const buttonClass = compact
    ? "inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[10px] text-neutral-700 hover:bg-emerald-50"
    : "inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100";

  return (
    <div data-testid="fip-affiliate-links" className={containerClass}>
      {decorated.map((d, idx) => (
        <a
          // shop+url の組合せで一意になることが期待されるが、安全側で idx を補助に
          key={`${d.shop}-${idx}`}
          href={d.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          data-testid={`fip-affiliate-link-${idx}`}
          className={buttonClass}
          style={compact ? undefined : { minHeight: 44 }}
          onClick={(e) => {
            // Picker の li > button の onClick まで伝播すると意図しない選択になる
            e.stopPropagation();
          }}
        >
          <span aria-hidden="true">{d.icon}</span>
          <span>{d.label}</span>
        </a>
      ))}
    </div>
  );
}
