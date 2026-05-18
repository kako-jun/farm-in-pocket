// RecordForm: 作業記録の入力フォーム + 下書きキュー UI。
//
// Issue: kako-jun/farm-in-pocket#16
// - 鍵未設定なら警告だけ出す
// - 作業種別ボタンを 4×2 で並べる
// - グリッド / セル / 作物名 / テキスト を入力
// - 「写真を添付」は disabled（Issue #17 で実装）
// - 「下書き保存」 / 「投稿する」 / 既存下書きの編集・削除・再送

import {
  FARM_ACTIONS,
  FARM_ACTION_ICONS,
  FARM_ACTION_LABELS_JA,
  type FarmAction,
  type GridRecord,
  WORK_RECORD_MAX_CONTENT_LENGTH,
  type WorkRecordDraft,
  buildWorkRecordEvent,
  signEvent,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { addDraft, loadDrafts, newDraftId, removeDraft } from "../lib/drafts";
import { listGrids } from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";
import { createMypaceClient } from "../lib/mypace";
import PhotoPicker from "./PhotoPicker";

type Status =
  | { kind: "idle" }
  | { kind: "info"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

interface FormState {
  draftId: string; // 編集中 draft の id（新規でも先に発行しておく）
  action: FarmAction;
  gridId: string | null;
  cellX: number | null;
  cellY: number | null;
  cropName: string;
  content: string;
  imageUrls: string[];
}

function emptyForm(): FormState {
  return {
    draftId: newDraftId(),
    action: "watering",
    gridId: null,
    cellX: null,
    cellY: null,
    cropName: "",
    content: "",
    imageUrls: [],
  };
}

export default function RecordForm(): JSX.Element {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  // npub (bech32) を持っておく。表示は短縮して noise を減らす。
  const [npub, setNpub] = useState<string | null>(null);
  const [grids, setGrids] = useState<GridRecord[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [drafts, setDrafts] = useState<WorkRecordDraft[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const kp = getMyKeyPair();
    if (kp === null) {
      setHasKey(false);
      return;
    }
    setHasKey(true);
    // getMyKeyPair() の中で encodeNpub() 済み。再エンコードせずに表示に使う。
    setNpub(kp.npub);
    setDrafts(loadDrafts());

    // グリッド一覧を取得（失敗してもフォームは出す）
    void listGrids(kp.pubkey)
      .then((list) => setGrids(list))
      .catch(() => {
        // 取得失敗時は空のまま続行
      });
  }, []);

  const selectedGrid = useMemo<GridRecord | null>(() => {
    if (form.gridId === null) return null;
    return grids.find((g) => g.id === form.gridId) ?? null;
  }, [form.gridId, grids]);

  const cellOptions = useMemo<{ x: number; y: number }[]>(() => {
    if (selectedGrid === null) return [];
    const opts: { x: number; y: number }[] = [];
    for (let y = 0; y < selectedGrid.sizeY; y++) {
      for (let x = 0; x < selectedGrid.sizeX; x++) {
        opts.push({ x, y });
      }
    }
    return opts;
  }, [selectedGrid]);

  if (hasKey === null) {
    return (
      <div data-testid="fip-record-form-loading" className="text-sm text-neutral-500">
        読み込み中...
      </div>
    );
  }

  if (hasKey === false) {
    return (
      <div data-testid="fip-record-form-no-key" className="space-y-3">
        <p className="text-sm text-red-700">
          先にアカウント設定を行ってください。設定ページで Nostr 鍵を作成すると投稿できます。
        </p>
        <a className="text-emerald-700 hover:underline text-sm" href="/settings">
          設定ページへ
        </a>
      </div>
    );
  }

  const remaining = WORK_RECORD_MAX_CONTENT_LENGTH - form.content.length;

  const resetForm = (): void => setForm(emptyForm());

  const handleSelectAction = (action: FarmAction): void => {
    setForm((f) => ({ ...f, action }));
  };

  const handleSelectGrid = (gridId: string): void => {
    if (gridId === "") {
      setForm((f) => ({ ...f, gridId: null, cellX: null, cellY: null }));
      return;
    }
    setForm((f) => ({ ...f, gridId, cellX: null, cellY: null }));
  };

  const handleSelectCell = (value: string): void => {
    if (value === "") {
      setForm((f) => ({ ...f, cellX: null, cellY: null }));
      return;
    }
    const [xs, ys] = value.split(",");
    const x = Number.parseInt(xs ?? "", 10);
    const y = Number.parseInt(ys ?? "", 10);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setForm((f) => ({ ...f, cellX: x, cellY: y }));
    }
  };

  const buildDraftFromForm = (createdAt: number): WorkRecordDraft => ({
    id: form.draftId,
    action: form.action,
    content: form.content,
    gridId: form.gridId,
    cellX: form.cellX,
    cellY: form.cellY,
    cropName: form.cropName.length > 0 ? form.cropName : null,
    imageUrls: form.imageUrls,
    createdAt,
  });

  const handleSaveDraft = (): void => {
    const draft = buildDraftFromForm(Math.floor(Date.now() / 1000));
    const next = addDraft(draft);
    setDrafts(next);
    setStatus({ kind: "info", message: "下書きを保存しました。" });
    resetForm();
  };

  const handleSubmit = async (): Promise<void> => {
    if (submitting) return;
    const kp = getMyKeyPair();
    if (kp === null) {
      setStatus({ kind: "error", message: "鍵が見つかりません。設定を確認してください。" });
      return;
    }
    if (form.content.length === 0) {
      setStatus({ kind: "error", message: "本文を入力してください。" });
      return;
    }
    if (form.content.length > WORK_RECORD_MAX_CONTENT_LENGTH) {
      setStatus({
        kind: "error",
        message: `本文は ${WORK_RECORD_MAX_CONTENT_LENGTH} 文字以内にしてください。`,
      });
      return;
    }

    setSubmitting(true);
    setStatus({ kind: "info", message: "投稿中..." });

    const now = Math.floor(Date.now() / 1000);
    const draftForFallback = buildDraftFromForm(now);

    try {
      const draftEvent = buildWorkRecordEvent({
        action: form.action,
        content: form.content,
        gridId: form.gridId,
        cellX: form.cellX,
        cellY: form.cellY,
        cropName: draftForFallback.cropName,
        imageUrls: form.imageUrls,
        createdAt: now,
      });
      const signed = signEvent(draftEvent, kp.secretKey);
      // publish は NIP-98 不要なので signer 不要。secretKey は渡さない。
      const client = createMypaceClient();
      await client.publishEvent(signed);

      // 成功: 既存 draft があれば消す
      const next = removeDraft(form.draftId);
      setDrafts(next);
      setStatus({ kind: "success", message: "投稿しました。" });
      resetForm();
    } catch (err) {
      // ネットワーク失敗 or API エラーは下書きに退避
      const next = addDraft(draftForFallback);
      setDrafts(next);
      const detail = err instanceof Error ? err.message : "投稿に失敗しました";
      setStatus({
        kind: "error",
        message: `送信できなかったため下書きに保存しました（あとで再送します）。${detail}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditDraft = (id: string): void => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    setForm({
      draftId: d.id,
      action: d.action,
      gridId: d.gridId,
      cellX: d.cellX,
      cellY: d.cellY,
      cropName: d.cropName ?? "",
      content: d.content,
      imageUrls: d.imageUrls,
    });
    setStatus({ kind: "info", message: "下書きを編集中です。投稿で送信、削除で破棄できます。" });
  };

  const handleDeleteDraft = (id: string): void => {
    const next = removeDraft(id);
    setDrafts(next);
    if (form.draftId === id) {
      resetForm();
    }
  };

  return (
    <div data-testid="fip-record-form" className="space-y-6">
      {/* 作業種別ボタン (4 列 × 2 行) - 単一選択なので radiogroup として扱う */}
      <section className="space-y-2">
        <h2 id="fip-record-form-actions-label" className="text-sm font-semibold text-neutral-700">
          作業の種類
        </h2>
        <div
          className="grid grid-cols-4 gap-2"
          data-testid="fip-record-form-actions"
          role="radiogroup"
          aria-labelledby="fip-record-form-actions-label"
        >
          {FARM_ACTIONS.map((a) => {
            const selected = form.action === a;
            return (
              <button
                key={a}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: 4x2 のアイコン付きボタンを単一選択 UI として提供したいので、ネイティブ <input type="radio"> ではなく button + role="radio" の組み合わせを採用。
                role="radio"
                aria-checked={selected}
                data-testid={`fip-record-form-action-${a}`}
                data-selected={selected ? "true" : "false"}
                onClick={() => handleSelectAction(a)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-xs ${
                  selected
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold"
                    : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
                style={{ minHeight: "64px" }}
              >
                <span className="text-xl leading-none" aria-hidden="true">
                  {FARM_ACTION_ICONS[a]}
                </span>
                <span>{FARM_ACTION_LABELS_JA[a]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* グリッド / セル */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-700">どのマイ畑？（任意）</h2>
        {grids.length === 0 ? (
          <p className="text-xs text-neutral-500" data-testid="fip-record-form-no-grids">
            マイ畑がまだ作られていません。グリッドページから作成すると、紐付けて記録できます。
          </p>
        ) : (
          <select
            data-testid="fip-record-form-grid-select"
            value={form.gridId ?? ""}
            onChange={(e) => handleSelectGrid(e.target.value)}
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">（指定しない）</option>
            {grids.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}

        {selectedGrid && cellOptions.length > 0 && (
          <select
            data-testid="fip-record-form-cell-select"
            value={form.cellX !== null && form.cellY !== null ? `${form.cellX},${form.cellY}` : ""}
            onChange={(e) => handleSelectCell(e.target.value)}
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">セルを指定しない</option>
            {cellOptions.map((c) => (
              <option key={`${c.x},${c.y}`} value={`${c.x},${c.y}`}>
                セル ({c.x}, {c.y})
              </option>
            ))}
          </select>
        )}
      </section>

      {/* 作物名 */}
      <section className="space-y-2">
        <label htmlFor="fip-record-crop" className="text-sm font-semibold text-neutral-700 block">
          作物名（任意）
        </label>
        <input
          id="fip-record-crop"
          data-testid="fip-record-form-crop"
          type="text"
          value={form.cropName}
          onChange={(e) => setForm((f) => ({ ...f, cropName: e.target.value }))}
          placeholder="例: トマト"
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          maxLength={64}
        />
      </section>

      {/* 本文 */}
      <section className="space-y-2">
        <label
          htmlFor="fip-record-content"
          className="text-sm font-semibold text-neutral-700 block"
        >
          記録の本文
        </label>
        <textarea
          id="fip-record-content"
          data-testid="fip-record-form-content"
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          maxLength={WORK_RECORD_MAX_CONTENT_LENGTH}
          rows={4}
          placeholder="今日の作業を書いてください..."
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <div className="flex justify-end text-xs text-neutral-500">
          <span data-testid="fip-record-form-remaining">残り {remaining} 文字</span>
        </div>
      </section>

      {/* 写真添付（最大 4 枚、nostr.build にアップロード） */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-700">写真</h2>
        <PhotoPicker
          urls={form.imageUrls}
          onChange={(next) => setForm((f) => ({ ...f, imageUrls: next }))}
          disabled={submitting}
        />
      </section>

      {/* アクション */}
      <section className="flex flex-wrap gap-3 pt-2 border-t border-neutral-200">
        <button
          type="button"
          data-testid="fip-record-form-save-draft"
          onClick={handleSaveDraft}
          disabled={submitting || form.content.length === 0}
          className="rounded-lg border border-neutral-400 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          下書き保存
        </button>
        <button
          type="button"
          data-testid="fip-record-form-submit"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={submitting || form.content.length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-bevel-sm hover:bg-emerald-700 hover:shadow-bevel disabled:opacity-50 disabled:shadow-none"
        >
          {submitting ? "投稿中..." : "投稿する"}
        </button>
        <button
          type="button"
          data-testid="fip-record-form-clear"
          onClick={resetForm}
          disabled={submitting}
          className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:underline"
        >
          クリア
        </button>
      </section>

      {/* ステータス表示 */}
      {status.kind !== "idle" && (
        <div
          data-testid="fip-record-form-status"
          data-status={status.kind}
          className={`text-sm rounded px-3 py-2 ${
            status.kind === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : status.kind === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-neutral-50 text-neutral-700 border border-neutral-200"
          }`}
        >
          {status.message}
        </div>
      )}

      {/* 下書き一覧 */}
      <section className="space-y-2 pt-4 border-t border-neutral-200">
        <h2 className="text-sm font-semibold text-neutral-700">下書き ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p className="text-xs text-neutral-500" data-testid="fip-record-form-drafts-empty">
            下書きはありません。
          </p>
        ) : (
          <ul className="space-y-2" data-testid="fip-record-form-drafts-list">
            {drafts.map((d) => (
              <li
                key={d.id}
                data-testid={`fip-record-form-draft-${d.id}`}
                className="rounded border border-neutral-200 bg-white p-3 text-sm space-y-1"
              >
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>{FARM_ACTION_ICONS[d.action]}</span>
                  <span>{FARM_ACTION_LABELS_JA[d.action]}</span>
                  {d.cropName && <span>· {d.cropName}</span>}
                </div>
                <p className="text-neutral-800 whitespace-pre-wrap break-words">{d.content}</p>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    data-testid={`fip-record-form-draft-edit-${d.id}`}
                    onClick={() => handleEditDraft(d.id)}
                    className="text-emerald-700 hover:underline text-xs"
                  >
                    編集して投稿
                  </button>
                  <button
                    type="button"
                    data-testid={`fip-record-form-draft-delete-${d.id}`}
                    onClick={() => handleDeleteDraft(d.id)}
                    className="text-red-700 hover:underline text-xs"
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 自分の npub をフッターに短縮表示（アカウント確認用、noise を減らす） */}
      {npub && (
        <p
          className="text-[10px] text-neutral-400 font-mono"
          data-testid="fip-record-form-npub-footer"
          title={npub}
        >
          {`${npub.slice(0, 8)}...${npub.slice(-4)}`}
        </p>
      )}
    </div>
  );
}
