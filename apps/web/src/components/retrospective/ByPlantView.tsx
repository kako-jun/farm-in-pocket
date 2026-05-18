// 振り返り > 作物別 (Issue #30)
//
// 育てたことのある作物 (plant_id) でグルーピングし、アコーディオンで plantings を見せる。
// 鍵未設定ならエラー表示。

import {
  PLANTING_END_TAG_LABELS_JA,
  PLANTING_STATE_LABELS_JA,
  type PlantingsByPlantGroup,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { getMyKeyPair } from "../../lib/keys";
import { fetchPlantingsByPlant } from "../../lib/retrospective-api";

export default function ByPlantView(): JSX.Element {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [groups, setGroups] = useState<PlantingsByPlantGroup[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
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
    fetchPlantingsByPlant(pubkey)
      .then((g) => {
        if (!cancelled) setGroups(g);
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
      <div data-testid="fip-retro-by-plant-no-key" className="space-y-3">
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
    <div data-testid="fip-retro-by-plant" className="space-y-2">
      {loading && <div className="text-xs text-neutral-500">読み込み中...</div>}
      {error && <div className="text-xs text-red-700">{error}</div>}
      {!loading && groups.length === 0 && !error && (
        <p className="text-sm text-neutral-600">まだ作物を植えた記録がありません。</p>
      )}
      {groups.map((g) => {
        const isOpen = openId === g.plantId;
        return (
          <section
            key={g.plantId}
            className="border border-neutral-200 rounded-md bg-white"
            data-testid={`fip-retro-by-plant-group-${g.plantId}`}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between p-3 text-left"
              onClick={() => setOpenId(isOpen ? null : g.plantId)}
              aria-expanded={isOpen}
            >
              <span className="font-medium">
                {g.plantName}
                <span className="ml-2 text-xs text-neutral-500">({g.plantFamily})</span>
              </span>
              <span className="text-sm text-neutral-500">
                {g.plantings.length} 件 {isOpen ? "▴" : "▾"}
              </span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-neutral-100">
                {g.plantings.map((p) => (
                  <li key={p.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-700">
                        {p.plantingDate ?? p.seedingDate ?? "(日付未設定)"}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {PLANTING_STATE_LABELS_JA[p.state]}
                        {p.endTag ? ` / ${PLANTING_END_TAG_LABELS_JA[p.endTag]}` : ""}
                      </span>
                    </div>
                    {p.note && <p className="text-xs text-neutral-600 mt-1">{p.note}</p>}
                    {p.failureMemo && (
                      <p className="text-xs text-rose-700 mt-1">原因: {p.failureMemo}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
