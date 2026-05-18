// WateringDueList: 「今日のおせわ」リスト (Issue #31)
//
// 鍵保有時のみマウントされる前提。鍵チェックは親 (index.astro 側の wrapper) で行う。
// 0 件なら「今日は予定なし」を出し、件数があれば各行に grid 名 + (x,y) + 作物名 +
// 「💧 やった」ボタンを並べる。ボタンを押すと POST /water → 楽観 update で行を消す。

import type { WateringDueRecord } from "@farm-in-pocket/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import { fetchWateringDue, recordWatering } from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";

interface WateringDueListProps {
  /** テスト用に pubkey を上書きできるようにする。実運用では未指定で keys.ts から取得。 */
  pubkey?: string;
}

export default function WateringDueList(props: WateringDueListProps): JSX.Element | null {
  const [pubkey, setPubkey] = useState<string | null>(props.pubkey ?? null);
  const [records, setRecords] = useState<WateringDueRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 「やった」処理中の plantingId を持って楽観 update + 二重押し抑止
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  // props.pubkey が無ければ localStorage から拾う。鍵が無ければ null のまま。
  useEffect(() => {
    if (props.pubkey !== undefined) {
      setPubkey(props.pubkey);
      return;
    }
    const kp = getMyKeyPair();
    setPubkey(kp?.pubkey ?? null);
  }, [props.pubkey]);

  const reload = useCallback(async (pk: string) => {
    setError(null);
    try {
      const res = await fetchWateringDue(pk);
      setRecords(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    if (!pubkey) return;
    void reload(pubkey);
  }, [pubkey, reload]);

  // 鍵未保有時は何も描画しない（親側で鍵チェックする前提だが、保険として）
  if (!pubkey) {
    return null;
  }

  const handleWater = async (plantingId: number): Promise<void> => {
    if (!pubkey) return;
    if (busyIds.has(plantingId)) return;
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.add(plantingId);
      return next;
    });
    try {
      await recordWatering(plantingId, pubkey);
      // 楽観 update: その行を records から消す（next_due_at は今日 + interval になり、
      // 今日のリストには載らないはず）。失敗したら reload で復旧。
      setRecords((prev) => (prev ?? []).filter((r) => r.plantingId !== plantingId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      // 失敗時は再読み込みして表示を巻き戻す
      void reload(pubkey);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(plantingId);
        return next;
      });
    }
  };

  return (
    <section
      data-testid="fip-watering-due-list"
      className="w-full max-w-md space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 p-4"
    >
      <h2 className="text-base font-semibold text-sky-900">💧 今日のおせわ</h2>
      {error && (
        <p data-testid="fip-watering-due-error" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {records === null ? (
        <p className="text-xs text-neutral-500" data-testid="fip-watering-due-loading">
          読み込み中…
        </p>
      ) : records.length === 0 ? (
        <p className="text-sm text-neutral-600" data-testid="fip-watering-due-empty">
          今日は予定なし
        </p>
      ) : (
        <ul className="space-y-2" data-testid="fip-watering-due-records">
          {records.map((rec) => (
            <li
              key={`due-${rec.plantingId}`}
              data-testid={`fip-watering-due-row-${rec.plantingId}`}
              className="flex items-center justify-between rounded border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-neutral-800">
                  🌱 {rec.plantName}
                  {rec.daysOverdue > 0 && (
                    <span
                      data-testid={`fip-watering-due-overdue-${rec.plantingId}`}
                      className="ml-2 inline-block rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800"
                    >
                      期日超過 {rec.daysOverdue}日
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-500">
                  {rec.gridName} ({rec.x}, {rec.y}) ・ 期日 {rec.nextDueAt}
                </span>
              </div>
              <button
                type="button"
                data-testid={`fip-watering-due-water-${rec.plantingId}`}
                disabled={busyIds.has(rec.plantingId)}
                onClick={() => void handleWater(rec.plantingId)}
                className="rounded-lg border border-sky-400 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                style={{ minHeight: 36 }}
              >
                💧 やった
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
