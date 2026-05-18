// PhotoPicker: 作業記録に添付する写真を選び、nostr.build にアップロードしてサムネ
// を表示する。urls は親（RecordForm）が単一の真実として保持する。
//
// Issue: kako-jun/farm-in-pocket#17
//
// UX:
//   - <input type="file" multiple capture="environment"> で複数選択
//   - 順次アップロード（並列にすると nostr.build の rate limit を踏みやすい）
//   - 進捗「アップロード中... (n/m)」
//   - 失敗は累計 error として下部にリスト表示
//   - サムネは grid、× で削除（urls から除外 + deleteFromNostrBuild を fire-and-forget で呼ぶ）
//   - maxFiles 既定 4。超過は警告だけ出して受け付けない

import { createNip98Signer, deleteFromNostrBuild } from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useId, useRef, useState } from "react";
import { useImageUpload } from "../hooks/useImageUpload";
import { getMyKeyPair } from "../lib/keys";

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

  const handlePickClick = (): void => {
    inputRef.current?.click();
  };

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? []);
    // 同じファイルを連続選択しても change が発火するように input を即クリア
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

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

    const collected: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const file = targets[i];
      if (!file) continue;
      setProgress({ current: i + 1, total: targets.length });
      const res = await uploadFile(file);
      if (res.success && res.url) {
        collected.push(res.url);
      } else {
        failed.push(`${file.name}: ${res.error ?? "アップロード失敗"}`);
      }
    }

    setProgress(null);
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
        onChange={(e) => {
          void handleFilesChange(e);
        }}
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
    </div>
  );
}
