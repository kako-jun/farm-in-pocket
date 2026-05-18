// PlantsList (Issue: kako-jun/farm-in-pocket#38)
//
// 植物カタログ一覧。`/plants` ページにマウントされる React island。
// - 上部に検索 (q) / カテゴリ / 科 のフィルタ。
// - 結果はカードグリッドで描画。クリックで `/plants/:id` 詳細へ遷移。
// - カテゴリ・科の選択肢は plants マスタの category CHECK 制約と seed 投入された科から
//   保守的にハードコードする（マスタが拡張されたら都度ここを足す）。
//   将来的には `/api/plants/facets` 的なエンドポイントで動的取得しても良いが、
//   現状の 121 件規模では UI 操作で十分に絞り込める。

import type { PlantSummary } from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { type SearchPlantsParams, searchPlantsAdvanced } from "../lib/grid-api";

const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "すべて" },
  { value: "vegetable", label: "野菜" },
  { value: "fruit", label: "果物" },
  { value: "flower", label: "花" },
  { value: "herb", label: "ハーブ" },
  { value: "houseplant", label: "観葉" },
  { value: "bulb", label: "球根" },
  { value: "succulent", label: "多肉" },
  { value: "other", label: "その他" },
];

// 連作管理マップ (`ROTATION_WAIT_YEARS`) と seed データに登場する科を網羅。
const FAMILY_OPTIONS: ReadonlyArray<string> = [
  "ナス科",
  "ウリ科",
  "アブラナ科",
  "マメ科",
  "キク科",
  "セリ科",
  "ヒルガオ科",
  "ヒガンバナ科",
  "シソ科",
  "ユリ科",
  "サトイモ科",
  "ヒユ科",
  "サボテン科",
];

type Status =
  | { kind: "loading" }
  | { kind: "ready"; plants: PlantSummary[] }
  | { kind: "error"; message: string };

export default function PlantsList(): JSX.Element {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [family, setFamily] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  // 300ms デバウンスで検索を再実行する。
  const params = useMemo<SearchPlantsParams>(
    () => ({
      q: q.trim() || undefined,
      category: category || undefined,
      family: family || undefined,
      sort: "name",
      limit: 200,
    }),
    [q, category, family],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus({ kind: "loading" });
      searchPlantsAdvanced(params)
        .then((plants) => {
          if (cancelled) return;
          setStatus({ kind: "ready", plants });
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params]);

  return (
    <div data-testid="fip-plants-list" className="space-y-4">
      <div className="space-y-2 rounded border border-neutral-200 bg-white p-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="作物名で検索（例: トマト, basil）"
          data-testid="fip-plants-list-q"
          className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          style={{ minHeight: 44 }}
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-neutral-600">カテゴリ</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              data-testid="fip-plants-list-category"
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-neutral-600">科</span>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              data-testid="fip-plants-list-family"
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              <option value="">すべて</option>
              {FAMILY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {status.kind === "loading" && (
        <p
          data-testid="fip-plants-list-loading"
          className="py-4 text-center text-sm text-neutral-500"
        >
          読み込み中…
        </p>
      )}
      {status.kind === "error" && (
        <div
          data-testid="fip-plants-list-error"
          className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"
        >
          取得に失敗しました: {status.message}
        </div>
      )}
      {status.kind === "ready" && status.plants.length === 0 && (
        <p
          data-testid="fip-plants-list-empty"
          className="py-6 text-center text-sm text-neutral-500"
        >
          該当する作物が見つかりませんでした。
        </p>
      )}
      {status.kind === "ready" && status.plants.length > 0 && (
        <ul data-testid="fip-plants-list-grid" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {status.plants.map((p) => (
            <li key={p.id}>
              <a
                href={`/plants/${p.id}`}
                data-testid={`fip-plants-list-card-${p.id}`}
                className="block h-full rounded border border-neutral-200 bg-white p-3 text-sm hover:border-emerald-400 hover:bg-emerald-50"
              >
                <div className="font-medium text-neutral-900">{p.name}</div>
                {p.nameEn && <div className="text-xs text-neutral-500">{p.nameEn}</div>}
                <div className="mt-1 flex gap-1 text-xs text-neutral-600">
                  <span>{p.family}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
