// PhotoPicker: 作業記録に添付する写真を選び、nostr.build にアップロードしてサムネ
// を表示する。urls は親（RecordForm）が単一の真実として保持する。
//
// Issue: kako-jun/farm-in-pocket#17
// 拡張: kako-jun/farm-in-pocket#28 — フィルタガチャを挟む
//
// UX:
//   - <input type="file" multiple capture="environment"> で複数選択
//   - 選択直後に FilterPickerModal でランダムプリセット適用 → 確定するまでアップロードしない
//   - 「アップロード」確定 → 全選択ファイルに同じフィルタを焼き込み (apply-filter) → 順次 POST
//   - 「キャンセル」でアップロード自体を中止 (urls は変化なし)
//   - 進捗「アップロード中... (n/m)」、失敗は errors にリスト表示
//   - サムネは grid、× で削除（urls から除外 + deleteFromNostrBuild を fire-and-forget）
//   - maxFiles 既定 4。超過は警告だけ出して受け付けない

import {
  type FilterPreset,
  applyBackgroundReplace,
  applyFilterToFile,
  createNip98Signer,
  deleteFromNostrBuild,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useId, useRef, useState } from "react";
import { useImageUpload } from "../hooks/useImageUpload";
import { getBackgroundReplaceEnabled } from "../lib/background-replace-prefs";
import { getMyKeyPair } from "../lib/keys";
import FilterPickerModal from "./FilterPickerModal";

export interface PhotoPickerProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  /** デフォルト 4。 */
  maxFiles?: number;
  disabled?: boolean;
}

export default function PhotoPicker({
  urls,
  onChange,
  maxFiles = 4,
  disabled = false,
}: PhotoPickerProps): JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { uploading, uploadFile } = useImageUpload();
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  // 遠景差し替え（modellhorizont 連携、#43）が実際に適用された件数。
  // 現状は placeholder で常に 0 になるが、本番統合後はここを基に「遠景差し替え済み」表示が出る。
  const [backgroundReplacedCount, setBackgroundReplacedCount] = useState<number>(0);
  // フィルタ確定待ちの File 群。null の間はモーダル非表示。
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);

  const handlePickClick = (): void => {
    inputRef.current?.click();
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    // 同じファイルを連続選択しても change が発火するように input を即クリア
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    // 二重実行ガード: アップロード進行中なら新しい選択を黙って無視
    if (uploading) return;

    setWarning(null);
    setErrors([]);

    const remaining = maxFiles - urls.length;
    if (remaining <= 0) {
      setWarning(`写真は最大 ${maxFiles} 枚までです`);
      return;
    }
    const targets = files.slice(0, remaining);
    if (files.length > remaining) {
      setWarning(`最大 ${maxFiles} 枚までです。${files.length - remaining} 枚は無視しました`);
    }

    // 実アップロードは FilterPickerModal の onConfirm まで遅延する
    setPendingFiles(targets);
  };

  const handleFilterCancel = (): void => {
    setPendingFiles(null);
  };

  const handleFilterConfirm = async (filter: FilterPreset, files: File[]): Promise<void> => {
    setPendingFiles(null);
    setBackgroundReplacedCount(0);

    const collected: string[] = [];
    const failed: string[] = [];
    const bgEnabled = getBackgroundReplaceEnabled();
    let appliedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      setProgress({ current: i + 1, total: files.length });

      // フィルタを実体に焼き込む。none / 未対応環境では元 File が返る。
      let prepared: File;
      try {
        prepared = await applyFilterToFile(file, filter.filter);
      } catch (_err) {
        // 焼き込み失敗時は加工なしで続行 (アップロード自体は試みる)
        prepared = file;
      }

      // 遠景差し替え（modellhorizont 連携、#43）。
      // impl 未注入の placeholder 段階なので、bgEnabled が ON でも実体は no-op で
      // applied=false (reason="not_integrated_yet") が返る。実体は本番統合時に
      // impl: (f) => modellhorizont(f) を渡すだけで切り替わる。
      const bgResult = await applyBackgroundReplace({ file: prepared, enabled: bgEnabled });
      if (bgResult.applied) appliedCount++;
      prepared = bgResult.file;

      const res = await uploadFile(prepared);
      if (res.success && res.url) {
        collected.push(res.url);
      } else {
        failed.push(`${file.name}: ${res.error ?? "アップロード失敗"}`);
      }
    }

    setProgress(null);
    setBackgroundReplacedCount(appliedCount);
    if (failed.length > 0) setErrors(failed);
    if (collected.length > 0) onChange([...urls, ...collected]);
  };

  const handleRemove = (url: string): void => {
    onChange(urls.filter((u) => u !== url));
    // nostr.build からも削除（fire-and-forget）。鍵が無い・失敗しても UI には出さない。
    const kp = getMyKeyPair();
    if (kp === null) return;
    const signer = createNip98Signer(kp.secretKey);
    void deleteFromNostrBuild({ signer, url }).catch(() => {
      // noop
    });
  };

  const reachedMax = urls.length >= maxFiles;

  return (
    <div data-testid="fip-photo-picker" className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        data-testid="fip-photo-picker-input"
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        disabled={disabled || uploading}
        onChange={handleFilesChange}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="fip-photo-picker-add"
          onClick={handlePickClick}
          disabled={disabled || uploading || reachedMax}
          aria-label="写真を追加"
          className="rounded-lg border border-emerald-600 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: "48px" }}
        >
          {uploading ? "アップロード中..." : `📷 写真を追加 (${urls.length}/${maxFiles})`}
        </button>

        {progress && (
          <span
            data-testid="fip-photo-picker-progress"
            className="text-xs text-neutral-600"
            aria-live="polite"
          >
            アップロード中... ({progress.current}/{progress.total})
          </span>
        )}
      </div>

      {warning && (
        <output
          data-testid="fip-photo-picker-warning"
          className="block text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
        >
          {warning}
        </output>
      )}

      {backgroundReplacedCount > 0 && (
        <output
          data-testid="fip-photo-picker-bg-replaced"
          className="block text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1"
        >
          遠景差し替え済み ({backgroundReplacedCount} 枚)
        </output>
      )}

      {urls.length > 0 && (
        <ul
          data-testid="fip-photo-picker-thumbs"
          className="grid grid-cols-4 gap-2"
          aria-label="添付された写真"
        >
          {urls.map((url) => (
            <li
              key={url}
              data-testid={`fip-photo-picker-thumb-${url}`}
              className="relative aspect-square overflow-hidden rounded border border-neutral-200 bg-neutral-100"
            >
              <img
                src={url}
                alt="添付写真のサムネイル"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                data-testid={`fip-photo-picker-remove-${url}`}
                onClick={() => handleRemove(url)}
                aria-label="この写真を削除"
                disabled={disabled || uploading}
                className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white text-sm hover:bg-black/80 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <ul
          data-testid="fip-photo-picker-errors"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 space-y-1"
          role="alert"
        >
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {pendingFiles !== null && (
        <FilterPickerModal
          files={pendingFiles}
          onConfirm={(filter, files) => {
            void handleFilterConfirm(filter, files);
          }}
          onCancel={handleFilterCancel}
        />
      )}
    </div>
  );
}
