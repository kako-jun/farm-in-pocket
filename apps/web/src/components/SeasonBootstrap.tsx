// SeasonBootstrap (Issue: kako-jun/farm-in-pocket#41)
//
// マウント時に「今の季節」を判定して、body の CSS 変数（背景グラデ・アクセント色）を上書きする。
// レンダリングするものは無い純粋な副作用コンポーネント。
//
// localStorage に `fip:season-override-v1` が "spring"/"summer"/"autumn"/"winter" のいずれかで
// 入っていれば、それを優先する（デバッグ・確認用。本番ユーザーは settings ページから切替可能）。
//
// unmount 時には設定した CSS 変数を消して、SSR 由来の既定値（CSS フォールバック）に戻す。
//
// 設計メモ:
// - 季節判定そのものは shared/season.ts に切り出し済み。ここでは DOM への適用だけを担う。
// - body は SSR 時に存在しないので、`useEffect` 内で document を触る（client:load 必須）。

import { type Season, seasonNow, seasonTheme } from "@farm-in-pocket/shared";
import { type JSX, useEffect } from "react";

export const SEASON_OVERRIDE_KEY = "fip:season-override-v1";

const VALID_SEASONS: ReadonlySet<Season> = new Set<Season>([
  "spring",
  "summer",
  "autumn",
  "winter",
]);

function readOverride(): Season | null {
  try {
    const raw = localStorage.getItem(SEASON_OVERRIDE_KEY);
    if (!raw) return null;
    if (VALID_SEASONS.has(raw as Season)) return raw as Season;
    return null;
  } catch {
    // localStorage 不可（プライベートモード等）でも壊さない。
    return null;
  }
}

/**
 * 今適用すべき季節を決定する。
 * override があればそれを優先し、なければ実時刻ベース。
 * テスト・他コンポーネントから再利用しやすいよう export する。
 */
export function resolveActiveSeason(now: Date = new Date()): Season {
  return readOverride() ?? seasonNow(now);
}

/**
 * body に季節テーマの CSS 変数を当てる。
 * - --fip-body-gradient
 * - --fip-accent-color
 * - --fip-accent-color-soft
 * - data-fip-season 属性（CSS / E2E 用フック）
 */
function applyThemeToBody(season: Season): void {
  const theme = seasonTheme(season);
  const body = document.body;
  if (!body) return;
  body.style.setProperty("--fip-body-gradient", theme.bodyGradient);
  body.style.setProperty("--fip-accent-color", theme.accentColor);
  body.style.setProperty("--fip-accent-color-soft", theme.accentColorSoft);
  body.dataset.fipSeason = season;
}

function clearThemeFromBody(): void {
  const body = document.body;
  if (!body) return;
  body.style.removeProperty("--fip-body-gradient");
  body.style.removeProperty("--fip-accent-color");
  body.style.removeProperty("--fip-accent-color-soft");
  delete body.dataset.fipSeason;
}

export default function SeasonBootstrap(): JSX.Element | null {
  useEffect(() => {
    applyThemeToBody(resolveActiveSeason());

    // override 変更を他タブ・他コンポーネントから反映できるよう storage イベントを購読する。
    const onStorage = (e: StorageEvent): void => {
      if (e.key === SEASON_OVERRIDE_KEY) {
        applyThemeToBody(resolveActiveSeason());
      }
    };
    window.addEventListener("storage", onStorage);

    // 同タブ内 (SeasonOverride 等) からの通知用カスタムイベント。
    const onLocalChange = (): void => {
      applyThemeToBody(resolveActiveSeason());
    };
    window.addEventListener("fip:season-override-changed", onLocalChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("fip:season-override-changed", onLocalChange);
      clearThemeFromBody();
    };
  }, []);

  return null;
}
