// 振り返り > カレンダー (Issue #30)
//
// 月単位の heatmap。各日のセルに 3 種類の活動件数 (plantings / endings / care) をドットで表示する。
// 矢印で月送り。鍵未設定ならエラー表示。
//
// 「heatmap」と書いたが、Phase 2 では色温度ではなく「種別ドット x 3」で件数を表現する。
// （色温度 heatmap は Phase 3 以降で考える）

import type { RetrospectiveActivityMonth, RetrospectiveDayActivity } from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { getMyKeyPair } from "../../lib/keys";
import { fetchActivity } from "../../lib/retrospective-api";

function formatMonth(year: number, monthIndex0: number): string {
  // monthIndex0: 0..11
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}

function todayMonth(): { year: number; monthIndex0: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), monthIndex0: now.getUTCMonth() };
}

function dayKey(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface DayCellProps {
  day: number;
  activity: RetrospectiveDayActivity | undefined;
}

function DayCell({ day, activity }: DayCellProps): JSX.Element {
  const total = (activity?.plantings ?? 0) + (activity?.endings ?? 0) + (activity?.care ?? 0);
  return (
    <div
      className="aspect-square border border-neutral-200 rounded-md p-1 flex flex-col items-center justify-between bg-white"
      data-testid={`fip-retro-cal-day-${day}`}
      aria-label={`${day}日 (${total}件)`}
    >
      <span className="text-xs text-neutral-600 self-start leading-none">{day}</span>
      <div className="flex gap-0.5 items-center justify-center pb-0.5">
        {(activity?.plantings ?? 0) > 0 && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            title={`植え付け ${activity?.plantings}`}
          />
        )}
        {(activity?.endings ?? 0) > 0 && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-600"
            title={`終了 ${activity?.endings}`}
          />
        )}
        {(activity?.care ?? 0) > 0 && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-sky-500"
            title={`手入れ ${activity?.care}`}
          />
        )}
      </div>
    </div>
  );
}

export default function CalendarView(): JSX.Element {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => todayMonth());
  const [days, setDays] = useState<RetrospectiveActivityMonth>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const kp = getMyKeyPair();
    if (kp === null) {
      setHasKey(false);
      return;
    }
    setHasKey(true);
    setPubkey(kp.pubkey);
  }, []);

  const monthStr = useMemo(() => formatMonth(cursor.year, cursor.monthIndex0), [cursor]);

  useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActivity(pubkey, monthStr)
      .then((d) => {
        if (!cancelled) setDays(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "取得に失敗しました");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pubkey, monthStr]);

  if (hasKey === false) {
    return (
      <div data-testid="fip-retro-cal-no-key" className="space-y-3">
        <p className="text-sm text-red-700">
          先にアカウント設定を行ってください。鍵を作成・インポートすると振り返りが見られます。
        </p>
        <a className="text-emerald-700 hover:underline text-sm" href="/settings">
          設定ページへ
        </a>
      </div>
    );
  }

  if (hasKey === null) {
    return <div className="text-sm text-neutral-500">読み込み中...</div>;
  }

  // 日付グリッド: 1 日が何曜日に当たるかでオフセット
  const firstDayOfWeek = new Date(Date.UTC(cursor.year, cursor.monthIndex0, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(cursor.year, cursor.monthIndex0 + 1, 0)).getUTCDate();

  const goPrev = (): void => {
    setCursor((c) => {
      const m = c.monthIndex0 - 1;
      if (m < 0) return { year: c.year - 1, monthIndex0: 11 };
      return { year: c.year, monthIndex0: m };
    });
  };
  const goNext = (): void => {
    setCursor((c) => {
      const m = c.monthIndex0 + 1;
      if (m > 11) return { year: c.year + 1, monthIndex0: 0 };
      return { year: c.year, monthIndex0: m };
    });
  };

  return (
    <div data-testid="fip-retro-cal" className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          className="px-3 py-1 text-sm rounded-md bg-neutral-100 hover:bg-neutral-200"
          aria-label="前の月"
        >
          ◀
        </button>
        <h2 className="text-base font-semibold">
          {cursor.year}年{cursor.monthIndex0 + 1}月
        </h2>
        <button
          type="button"
          onClick={goNext}
          className="px-3 py-1 text-sm rounded-md bg-neutral-100 hover:bg-neutral-200"
          aria-label="次の月"
        >
          ▶
        </button>
      </div>
      {loading && <div className="text-xs text-neutral-500">読み込み中...</div>}
      {error && <div className="text-xs text-red-700">{error}</div>}
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500 mb-1">
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: フィラーは index でしか識別できない
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: lastDay }, (_, i) => i + 1).map((day) => (
          <DayCell
            key={day}
            day={day}
            activity={days[dayKey(cursor.year, cursor.monthIndex0, day)]}
          />
        ))}
      </div>
      <div className="flex gap-3 text-xs text-neutral-600 pt-2">
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 植え付け
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" /> 終了
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> 手入れ
        </span>
      </div>
    </div>
  );
}
