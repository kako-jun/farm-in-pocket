// 振り返り > グリッド履歴 (Issue #30)
//
// 全グリッド × 全セルの crop_history を縦の表で表示する。
// grid 別のタブで切り替え、選択した grid 内では (x, y) 別にグループ化した縦表を出す。

import type { CropHistoryRecord } from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { getMyKeyPair } from "../../lib/keys";
import { fetchCellHistories } from "../../lib/retrospective-api";

const SEASON_LABEL: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

export default function CellHistoryView(): JSX.Element {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [records, setRecords] = useState<CropHistoryRecord[]>([]);
  const [selectedGrid, setSelectedGrid] = useState<string | null>(null);
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
    fetchCellHistories(pubkey)
      .then((r) => {
        if (cancelled) return;
        setRecords(r);
        // 最初のグリッドを既定の選択にする
        const firstGrid = r.find((row) => row.gridId)?.gridId ?? null;
        setSelectedGrid((cur) => cur ?? firstGrid);
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

  const gridIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const r of records) {
      if (!seen.has(r.gridId)) {
        seen.add(r.gridId);
        ids.push(r.gridId);
      }
    }
    return ids;
  }, [records]);

  const currentRecords = useMemo(() => {
    if (!selectedGrid) return [];
    return records.filter((r) => r.gridId === selectedGrid);
  }, [records, selectedGrid]);

  if (hasKey === false) {
    return (
      <div data-testid="fip-retro-cellhist-no-key" className="space-y-3">
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
    <div data-testid="fip-retro-cellhist" className="space-y-3">
      {loading && <div className="text-xs text-neutral-500">読み込み中...</div>}
      {error && <div className="text-xs text-red-700">{error}</div>}
      {!loading && gridIds.length === 0 && !error && (
        <p className="text-sm text-neutral-600">まだ履歴がありません。</p>
      )}
      {gridIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {gridIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedGrid(id)}
              className={`px-2 py-1 text-xs rounded-md border ${
                selectedGrid === id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-neutral-700 border-neutral-300"
              }`}
              data-testid={`fip-retro-cellhist-tab-${id}`}
            >
              {id.length > 8 ? `${id.slice(0, 8)}…` : id}
            </button>
          ))}
        </div>
      )}
      {currentRecords.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="border-b border-neutral-200 py-1 pr-2">セル</th>
              <th className="border-b border-neutral-200 py-1 pr-2">作物</th>
              <th className="border-b border-neutral-200 py-1 pr-2">科</th>
              <th className="border-b border-neutral-200 py-1 pr-2">時期</th>
              <th className="border-b border-neutral-200 py-1 pr-2">期間</th>
            </tr>
          </thead>
          <tbody>
            {currentRecords.map((r) => (
              <tr
                key={r.id}
                className="border-b border-neutral-100"
                data-testid={`fip-retro-cellhist-row-${r.id}`}
              >
                <td className="py-1 pr-2 font-mono">
                  ({r.x},{r.y})
                </td>
                <td className="py-1 pr-2">{r.plantName}</td>
                <td className="py-1 pr-2 text-neutral-500">{r.plantFamily}</td>
                <td className="py-1 pr-2 text-neutral-500">
                  {r.year}
                  {r.season ? `・${SEASON_LABEL[r.season] ?? r.season}` : ""}
                </td>
                <td className="py-1 pr-2 text-neutral-500">
                  {r.plantedAt}
                  {r.endedAt ? ` 〜 ${r.endedAt}` : " 〜 (継続中)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
