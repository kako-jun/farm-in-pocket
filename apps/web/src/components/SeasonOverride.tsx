// SeasonOverride (Issue: kako-jun/farm-in-pocket#41)
//
// 設定ページに置く「季節を強制する」ラジオ。
// - 「自動」「春」「夏」「秋」「冬」の 5 択。
// - 選択値は localStorage `fip:season-override-v1` に保存し、SeasonBootstrap が拾って body
//   に CSS 変数を当て直す。
// - 「自動」を選ぶと localStorage キーを削除して seasonNow() ベースに戻す。
// - 端末ローカル設定（Nostr イベント不要）。

import { type Season, seasonTheme } from "@farm-in-pocket/shared";
import { type JSX, useEffect, useState } from "react";
import { SEASON_OVERRIDE_KEY } from "./SeasonBootstrap";

type Choice = "auto" | Season;

const CHOICES: ReadonlyArray<{ value: Choice; label: string; icon: string }> = [
  { value: "auto", label: "自動", icon: "🕒" },
  { value: "spring", label: seasonTheme("spring").label, icon: seasonTheme("spring").icon },
  { value: "summer", label: seasonTheme("summer").label, icon: seasonTheme("summer").icon },
  { value: "autumn", label: seasonTheme("autumn").label, icon: seasonTheme("autumn").icon },
  { value: "winter", label: seasonTheme("winter").label, icon: seasonTheme("winter").icon },
];

function readStored(): Choice {
  try {
    const raw = localStorage.getItem(SEASON_OVERRIDE_KEY);
    if (raw === "spring" || raw === "summer" || raw === "autumn" || raw === "winter") {
      return raw;
    }
    return "auto";
  } catch {
    return "auto";
  }
}

function writeStored(choice: Choice): void {
  try {
    if (choice === "auto") {
      localStorage.removeItem(SEASON_OVERRIDE_KEY);
    } else {
      localStorage.setItem(SEASON_OVERRIDE_KEY, choice);
    }
    // 同タブの SeasonBootstrap に変更を通知する（storage event は他タブ専用のため）。
    window.dispatchEvent(new Event("fip:season-override-changed"));
  } catch {
    // localStorage 不可環境では何もしない。
  }
}

export default function SeasonOverride(): JSX.Element {
  const [choice, setChoice] = useState<Choice>("auto");

  // 初期マウント時に localStorage から復元する（SSR では window 未定義のため useEffect で）。
  useEffect(() => {
    setChoice(readStored());
  }, []);

  const handleChange = (next: Choice): void => {
    setChoice(next);
    writeStored(next);
  };

  return (
    <div
      data-testid="fip-season-override"
      className="flex flex-wrap gap-2 text-xs text-neutral-700"
    >
      {CHOICES.map((c) => {
        const selected = choice === c.value;
        return (
          <label
            key={c.value}
            data-testid={`fip-season-override-${c.value}`}
            className={
              selected
                ? "flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700"
                : "flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1 hover:bg-neutral-50"
            }
          >
            <input
              type="radio"
              name="fip-season-override"
              value={c.value}
              checked={selected}
              onChange={() => handleChange(c.value)}
              className="sr-only"
            />
            <span aria-hidden="true">{c.icon}</span>
            <span>{c.label}</span>
          </label>
        );
      })}
    </div>
  );
}
