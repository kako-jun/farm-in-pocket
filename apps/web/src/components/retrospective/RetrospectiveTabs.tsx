// /record ページのサブタブ切替 (Issue #30)
//
// 「投稿」「カレンダー」「作物別」「グリッド履歴」「失敗ログ」を hash routing で切り替える。
// URL: /record / /record#calendar / /record#by-plant / /record#cell-history / /record#failures
//
// hash の同期は最小限。location.hash を直接見て state 化し、popstate / hashchange に追従する。

import type { JSX } from "react";
import { useEffect, useState } from "react";
import RecordForm from "../RecordForm";
import ByPlantView from "./ByPlantView";
import CalendarView from "./CalendarView";
import CellHistoryView from "./CellHistoryView";
import FailureLogView from "./FailureLogView";

type Tab = "post" | "calendar" | "by-plant" | "cell-history" | "failures";

const TABS: ReadonlyArray<{ id: Tab; label: string; hash: string }> = [
  { id: "post", label: "投稿", hash: "" },
  { id: "calendar", label: "カレンダー", hash: "calendar" },
  { id: "by-plant", label: "作物別", hash: "by-plant" },
  { id: "cell-history", label: "グリッド履歴", hash: "cell-history" },
  { id: "failures", label: "失敗ログ", hash: "failures" },
];

function tabFromHash(hash: string): Tab {
  const h = hash.replace(/^#/, "");
  const t = TABS.find((x) => x.hash === h);
  return (t?.id ?? "post") as Tab;
}

export default function RetrospectiveTabs(): JSX.Element {
  const [active, setActive] = useState<Tab>("post");

  useEffect(() => {
    setActive(tabFromHash(window.location.hash));
    const onHashChange = (): void => setActive(tabFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const select = (t: Tab): void => {
    const tab = TABS.find((x) => x.id === t);
    if (!tab) return;
    if (typeof window !== "undefined") {
      const next = tab.hash ? `#${tab.hash}` : " ";
      // hash="" のときは履歴を汚さず先頭に戻す。pushState で # を消す
      if (tab.hash === "") {
        history.replaceState(null, "", window.location.pathname);
      } else {
        history.replaceState(null, "", next);
      }
    }
    setActive(t);
  };

  return (
    <div data-testid="fip-retro-tabs" className="space-y-4">
      <nav className="flex flex-wrap gap-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            data-testid={`fip-retro-tab-${t.id}`}
            onClick={() => select(t.id)}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              active === t.id
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-neutral-700 border-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div>
        {active === "post" && <RecordForm />}
        {active === "calendar" && <CalendarView />}
        {active === "by-plant" && <ByPlantView />}
        {active === "cell-history" && <CellHistoryView />}
        {active === "failures" && <FailureLogView />}
      </div>
    </div>
  );
}
