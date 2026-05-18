// UsageBadge (Issue: kako-jun/farm-in-pocket#37)
//
// seed_products / materials の use_count / user_count を表示する小さなバッジ。
//   - 「12人が使っています ／ 34回記録されています」
//   - 0 件なら「まだ記録なし」
// 検索結果カードの隅に出すことを想定している。

import type { JSX } from "react";

interface UsageBadgeProps {
  useCount: number;
  userCount: number;
  /** 余白を詰めるコンパクトモード（Picker カード用） */
  compact?: boolean;
}

export default function UsageBadge(props: UsageBadgeProps): JSX.Element {
  const useCount = Math.max(0, Math.floor(props.useCount));
  const userCount = Math.max(0, Math.floor(props.userCount));
  const compact = props.compact ?? false;

  if (useCount === 0 && userCount === 0) {
    return (
      <span
        data-testid="fip-usage-badge-empty"
        className={compact ? "text-[10px] text-neutral-400" : "text-xs text-neutral-500"}
      >
        まだ記録なし
      </span>
    );
  }

  return (
    <span
      data-testid="fip-usage-badge"
      className={compact ? "text-[10px] text-neutral-500" : "text-xs text-neutral-600"}
    >
      <span data-testid="fip-usage-badge-users">{userCount}人</span>が使っています ／{" "}
      <span data-testid="fip-usage-badge-uses">{useCount}回</span>記録されています
    </span>
  );
}
