// 振り返り > 失敗ログ (Issue #30)
//
// ended で end_tag が died / disease / pest / failed の plantings 一覧。
// 各行に end_tag + failure_memo + 経過日数（startDate → endDate）。

import { type FailurePlantingRecord, PLANTING_END_TAG_LABELS_JA } from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { getMyKeyPair } from "../../lib/keys";
import { fetchFailures } from "../../lib/retrospective-api";

function diffDays(startISO: string | null, endISO: string | null): number | null {
  if (!startISO || !endISO) return null;
  const s = new Date(`${startISO.slice(0, 10)}T00:00:00Z`);
  const e = new Date(`${endISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const ms = e.getTime() - s.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export default function FailureLogView(): JSX.Element {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [failures, setFailures] = useState<FailurePlantingRecord[]>([]);
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

  useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFailures(pubkey)
      .then((f) => {
        if (!cancelled) setFailures(f);
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
  }, [pubkey]);

  if (hasKey === false) {
    return (
      <div data-testid="fip-retro-fail-no-key" className="space-y-3">
        <p className="text-sm text-red-700">
          先にアカウント設定を行ってください。鍵を作成・インポートすると振り返りが見られます。
        </p>
        <a className="text-emerald-700 hover:underline text-sm" href="/settings">
          設定ページへ
        </a>
      </div>
    );
  }
  if (hasKey === null) return <div className="text-sm text-neutral-500">読み込み中...</div>;

  return (
    <div data-testid="fip-retro-fail" className="space-y-2">
      {loading && <div className="text-xs text-neutral-500">読み込み中...</div>}
      {error && <div className="text-xs text-red-700">{error}</div>}
      {!loading && failures.length === 0 && !error && (
        <p className="text-sm text-neutral-600">失敗ログはまだありません。</p>
      )}
      <ul className="space-y-2">
        {failures.map((f) => {
          const start = f.plantingDate ?? f.seedingDate;
          const days = diffDays(start, f.endDate);
          return (
            <li
              key={f.id}
              className="border border-neutral-200 bg-white rounded-md p-3 space-y-1"
              data-testid={`fip-retro-fail-row-${f.id}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {f.plantName}
                  <span className="ml-2 text-xs text-neutral-500">({f.plantFamily})</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  {f.endTag ? PLANTING_END_TAG_LABELS_JA[f.endTag] : "失敗"}
                </span>
              </div>
              <div className="text-xs text-neutral-500">
                {start ?? "(開始日不明)"} 〜 {f.endDate ?? "(終了日不明)"}
                {days !== null && ` (${days}日)`}
              </div>
              {f.failureMemo && <p className="text-xs text-rose-700">原因: {f.failureMemo}</p>}
              {f.note && <p className="text-xs text-neutral-600">{f.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
