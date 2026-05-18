// nostr.build への直接アップロード（NIP-98 認可）。
//
// Issue: kako-jun/farm-in-pocket#17
// mypace 版の `useImageUpload.ts` を踏襲して、ファイル本体は nostr.build に直接送り、
// 成功した URL は呼び出し側で mypace の `/api/uploads` 履歴に記録する 2 段構成にしている
// （nostr.build を mypace 経由でプロキシしない分、無料枠の帯域を mypace 側で消費しない）。
//
// 認証は NIP-98 (kind=27235, `Nostr <base64>` ヘッダ)。
// 検証ロジックは nostr.build 側に任せ、こちらはヘッダ構築と response パースに専念する。
//
// 上限:
//   - 画像: 10MB（mypace と同じ。nostr.build 無料枠は 25MB だが、Cloudflare Pages の
//     Service Worker 経路で扱いやすいサイズに合わせて 10MB に絞る）
//   - 動画: 10MB（Phase 1 は未使用、将来用に枠だけ）
//   - 音声: 1MB（Phase 1 は未使用）

import type { MypaceSigner } from "../mypace/types";

export const NOSTR_BUILD_UPLOAD_URL = "https://nostr.build/api/v2/upload/files";
// NIP-96 互換の delete エンドポイント。`{base}/{sha256}` で叩く。
// 公開 URL の末尾 `<sha256>.<ext>` から sha256 を抜き出す前提なので、命名規則が
// 変わったら extractHashFromUrl() ごと更新する必要あり。
export const NOSTR_BUILD_DELETE_API_BASE = "https://nostr.build/api/v2/nip96/upload";

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface UploadLimits {
  maxImageBytes: number;
  maxVideoBytes: number;
  maxAudioBytes: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 10 * 1024 * 1024,
  maxAudioBytes: 1 * 1024 * 1024,
};

// nostr.build の v2 レスポンス。配列で複数ファイル分返るが、Phase 1 では 1 ファイル単位で叩く想定。
interface NostrBuildResponse {
  status: string;
  message?: string;
  data?: Array<{ url?: string }>;
}

export interface UploadOptions {
  signer: MypaceSigner;
  file: File;
  /** デフォルト DEFAULT_UPLOAD_LIMITS。テスト用に注入可。 */
  limits?: UploadLimits;
  /** テスト用 fetch 差し替え。 */
  fetch?: typeof fetch;
}

/**
 * nostr.build に file を NIP-98 認可付きでアップロードする。
 * 失敗時は throw せず {success: false, error} を返す。
 */
export async function uploadToNostrBuild(opts: UploadOptions): Promise<UploadResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const limits = opts.limits ?? DEFAULT_UPLOAD_LIMITS;
  const file = opts.file;

  const kind = classifyFile(file);
  if (!kind) {
    return { success: false, error: "Unsupported file type" };
  }

  const maxSize =
    kind === "video"
      ? limits.maxVideoBytes
      : kind === "audio"
        ? limits.maxAudioBytes
        : limits.maxImageBytes;
  if (file.size > maxSize) {
    return {
      success: false,
      error: `File must be less than ${(maxSize / 1024 / 1024).toFixed(0)} MB`,
    };
  }

  try {
    const auth = await opts.signer.buildNip98Header("POST", NOSTR_BUILD_UPLOAD_URL);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetchImpl(NOSTR_BUILD_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: auth },
      body: formData,
    });
    if (!response.ok) {
      return { success: false, error: `Upload failed with status ${response.status}` };
    }
    const data = (await response.json()) as NostrBuildResponse;
    if (data.status === "success" && data.data?.[0]?.url) {
      return { success: true, url: data.data[0].url };
    }
    return { success: false, error: data.message ?? "Invalid response from nostr.build" };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to upload" };
  }
}

export interface DeleteOptions {
  signer: MypaceSigner;
  /** 公開 URL（image.nostr.build/... or nostr.build/i/... 形式）。 */
  url: string;
  fetch?: typeof fetch;
}

/**
 * nostr.build から該当ファイルを削除する。
 * 公開 URL から sha256 ハッシュを抜き出して NIP-96 DELETE で叩く。
 */
export async function deleteFromNostrBuild(opts: DeleteOptions): Promise<DeleteResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const hash = extractHashFromUrl(opts.url);
  if (!hash) {
    return { success: false, error: "Could not extract file hash from URL" };
  }
  const deleteUrl = `${NOSTR_BUILD_DELETE_API_BASE}/${hash}`;
  try {
    const auth = await opts.signer.buildNip98Header("DELETE", deleteUrl);
    const response = await fetchImpl(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    if (response.status === 403) return { success: false, error: "403: Permission denied" };
    if (response.status === 404) return { success: false, error: "404: File not found" };
    if (response.status === 401) return { success: false, error: "401: Unauthorized" };
    if (response.ok) return { success: true, message: "File deleted successfully" };
    return { success: false, error: `Delete failed with status ${response.status}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete" };
  }
}

function classifyFile(file: File): "image" | "video" | "audio" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

/**
 * 公開 URL から sha256 ハッシュ（64 文字 hex）を抜き出す。
 * 既知の形式:
 *   - https://image.nostr.build/<sha256>.<ext>
 *   - https://nostr.build/i/<sha256>.<ext>
 *   - https://video.nostr.build/<sha256>.<ext>
 * いずれもファイル名が `<sha256>.<ext>` なので、拡張子を剥がして 64 文字 hex か検証する。
 */
export function extractHashFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split("/").pop();
    if (!filename) return null;
    const hash = filename.replace(/\.[^.]+$/, "");
    if (/^[a-f0-9]{64}$/i.test(hash)) return hash;
    return null;
  } catch {
    return null;
  }
}
