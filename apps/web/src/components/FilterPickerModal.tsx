// FilterPickerModal: 写真選択直後にフィルタを「ガチャ」抽選し、
// プレビュー → アップロード前に焼き込み確定までを担うモーダル。
//
// Issue: kako-jun/farm-in-pocket#28
//
// UX:
//   - 開いた瞬間にランダムプリセットを 1 つ選び、CSS filter で 1 枚目に適用
//   - 「🎲 もう一回」で別プリセット (現在と違うものを優先) に再抽選
//   - 「フィルタを選ぶ」で 7 種 + なし のドット選択 UI に切替
//   - 「アップロード」で onConfirm(filter) を呼び、親側で焼き込み → 実アップロードへ進む
//   - 複数選択時は **全枚共通の 1 プリセット** を適用するシンプル運用 (プレビューは先頭 1 枚)
//
// 親側責務:
//   - onConfirm を受け取ったら applyFilterToFile() で全 File に焼き込み → useImageUpload に渡す
//   - onCancel はモーダルを閉じてアップロードを中止する

import {
  FILTER_NONE,
  FILTER_PRESETS,
  type FilterPreset,
  pickRandomFilter,
} from "@farm-in-pocket/shared";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";

export interface FilterPickerModalProps {
  /** プレビュー対象。1 枚目を CSS filter プレビュー、残りは件数だけ表示。 */
  files: File[];
  /** 確定。filter.filter === "none" の場合は焼き込み不要。 */
  onConfirm: (filter: FilterPreset, files: File[]) => void;
  /** キャンセル (アップロード自体を取り止め)。 */
  onCancel: () => void;
}

export default function FilterPickerModal({
  files,
  onConfirm,
  onCancel,
}: FilterPickerModalProps): JSX.Element | null {
  // 開いた直後にランダム抽選
  const [filter, setFilter] = useState<FilterPreset>(() => pickRandomFilter());
  const [pickerOpen, setPickerOpen] = useState(false);
  const previewFile = files[0] ?? null;

  // File → object URL を作って <img src> で表示。File が変わるたびに revoke。
  const previewUrl = useMemo(() => {
    if (!previewFile) return null;
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(previewFile);
  }, [previewFile]);

  useEffect(() => {
    return () => {
      if (previewUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // ガチャの再抽選: 現在と異なるプリセットを優先する
  const handleReroll = (): void => {
    if (FILTER_PRESETS.length <= 1) {
      setFilter(pickRandomFilter());
      return;
    }
    // 8 回まで違う方を狙う (確率的にすぐ抜けるが、極端な乱数連続でも止まらないように上限)
    for (let i = 0; i < 8; i++) {
      const next = pickRandomFilter();
      if (next.name !== filter.name) {
        setFilter(next);
        return;
      }
    }
    setFilter(pickRandomFilter());
  };

  const handleSelect = (preset: FilterPreset): void => {
    setFilter(preset);
    setPickerOpen(false);
  };

  const handleConfirm = (): void => {
    onConfirm(filter, files);
  };

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    // 初回マウント時にダイアログへフォーカス (a11y / ESC で閉じる前提)
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (files.length === 0) return null;

  // プリセット + なし の選択肢 (ドット UI 用)
  const allChoices: readonly FilterPreset[] = [...FILTER_PRESETS, FILTER_NONE];

  return (
    <div
      data-testid="fip-filter-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <dialog
        open
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby="fip-filter-picker-title"
        className="w-full max-w-md rounded-xl bg-white p-4 shadow-deep focus:outline-none"
      >
        <h2
          id="fip-filter-picker-title"
          className="text-base font-semibold text-neutral-800 flex items-center gap-2"
        >
          <span aria-hidden="true">🎞️</span>
          フィルタガチャ
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          おまかせで色味を決めます。気に入らなければ「もう一回」かフィルタを選んでください。
        </p>

        <div
          data-testid="fip-filter-picker-preview"
          className="mt-3 relative aspect-square w-full overflow-hidden rounded-lg bg-neutral-100"
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt="プレビュー"
              data-testid="fip-filter-picker-preview-img"
              className="h-full w-full object-cover transition-[filter] duration-300"
              style={{ filter: filter.filter }}
            />
          )}
          <span
            data-testid="fip-filter-picker-current"
            className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white"
          >
            {filter.name}
          </span>
          {files.length > 1 && (
            <span
              data-testid="fip-filter-picker-multi-count"
              className="absolute top-2 right-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white"
              aria-label={`${files.length} 枚に同じフィルタを適用します`}
            >
              ×{files.length} 枚
            </span>
          )}
        </div>

        {pickerOpen ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-neutral-600">フィルタを選ぶ</p>
            <ul
              data-testid="fip-filter-picker-choices"
              className="flex flex-wrap gap-2"
              aria-label="フィルタ一覧"
            >
              {allChoices.map((preset) => {
                const active = preset.name === filter.name;
                return (
                  <li key={preset.name}>
                    <button
                      type="button"
                      data-testid={`fip-filter-picker-choice-${preset.name}`}
                      onClick={() => handleSelect(preset)}
                      aria-pressed={active}
                      aria-label={`フィルタ ${preset.name}`}
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${
                        active
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "border-neutral-300 bg-white text-neutral-700"
                      }`}
                      style={{ minHeight: "40px" }}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: preset.color }}
                      />
                      {preset.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="fip-filter-picker-reroll"
              onClick={handleReroll}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              style={{ minHeight: "44px" }}
            >
              🎲 もう一回
            </button>
            <button
              type="button"
              data-testid="fip-filter-picker-open-choices"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              style={{ minHeight: "44px" }}
            >
              {pickerOpen ? "閉じる" : "フィルタを選ぶ"}
            </button>
            <button
              type="button"
              data-testid="fip-filter-picker-none"
              onClick={() => setFilter(FILTER_NONE)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              style={{ minHeight: "44px" }}
            >
              なし
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="fip-filter-picker-cancel"
              onClick={onCancel}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              style={{ minHeight: "44px" }}
            >
              キャンセル
            </button>
            <button
              type="button"
              data-testid="fip-filter-picker-confirm"
              onClick={handleConfirm}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              style={{ minHeight: "44px" }}
            >
              アップロード
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
