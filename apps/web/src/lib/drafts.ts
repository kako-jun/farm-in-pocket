// 作業記録の下書きキュー（localStorage 永続化）。
//
// Issue: kako-jun/farm-in-pocket#16
// オフライン時 or 投稿失敗時の draft を一時保管する。最大 100 件で古いものから trim。
// SSR 時は localStorage が無いため、load は空配列を、save 系は no-op を返す。

import { type WorkRecordDraft, isFarmMilestone } from "@farm-in-pocket/shared";

export const DRAFTS_STORAGE_KEY = "fip:work-record-drafts-v1";
export const DRAFTS_MAX = 100;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isValidDraft(value: unknown): value is WorkRecordDraft {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  // milestone は Issue #27 で追加。後方互換のため undefined も許容し、load 側で null に正規化する。
  const milestoneOk =
    d.milestone === undefined ||
    d.milestone === null ||
    (typeof d.milestone === "string" && isFarmMilestone(d.milestone));
  return (
    typeof d.id === "string" &&
    typeof d.action === "string" &&
    typeof d.content === "string" &&
    (d.gridId === null || typeof d.gridId === "string") &&
    (d.cellX === null || typeof d.cellX === "number") &&
    (d.cellY === null || typeof d.cellY === "number") &&
    (d.cropName === null || typeof d.cropName === "string") &&
    Array.isArray(d.imageUrls) &&
    typeof d.createdAt === "number" &&
    milestoneOk
  );
}

export function loadDrafts(): WorkRecordDraft[] {
  if (!hasWindow()) return [];
  const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
  if (raw === null || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // 旧スキーマ（milestone 未保存）の draft も読めるようにここで null に正規化する。
    return parsed.filter(isValidDraft).map((d) => ({
      ...d,
      milestone: isFarmMilestone(d.milestone) ? d.milestone : null,
    }));
  } catch {
    return [];
  }
}

export function saveDrafts(drafts: WorkRecordDraft[]): void {
  if (!hasWindow()) return;
  // 古いものから trim（先頭が古い）
  const trimmed = drafts.length > DRAFTS_MAX ? drafts.slice(drafts.length - DRAFTS_MAX) : drafts;
  window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(trimmed));
}

export function addDraft(draft: WorkRecordDraft): WorkRecordDraft[] {
  const drafts = loadDrafts();
  // 既存 id があれば差し替え（updateDraft 相当）
  const idx = drafts.findIndex((d) => d.id === draft.id);
  if (idx >= 0) {
    drafts[idx] = draft;
  } else {
    drafts.push(draft);
  }
  saveDrafts(drafts);
  return loadDrafts();
}

export function removeDraft(id: string): WorkRecordDraft[] {
  const drafts = loadDrafts().filter((d) => d.id !== id);
  saveDrafts(drafts);
  return drafts;
}

export function updateDraft(id: string, patch: Partial<WorkRecordDraft>): WorkRecordDraft[] {
  const drafts = loadDrafts();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx < 0) return drafts;
  const current = drafts[idx];
  if (!current) return drafts;
  // id は変更させない（patch.id を弾く）
  drafts[idx] = { ...current, ...patch, id: current.id };
  saveDrafts(drafts);
  return loadDrafts();
}

/** crypto.randomUUID() があれば使う。無ければ簡易フォールバック（テスト/旧環境向け）。 */
export function newDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122 v4 風（暗号強度は弱いがフォールバック）
  const rnd = (): string =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, "0");
  return `${rnd()}${rnd()}-${rnd()}-4${rnd().slice(1)}-${rnd()}-${rnd()}${rnd()}${rnd()}`;
}
