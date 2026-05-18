// 写真の遠景差し替え（modellhorizont）の有効/無効をローカル保存する。
//
// Issue: kako-jun/farm-in-pocket#43
//
// 設計:
//   - 端末ごと設定（localStorage）。既定は OFF。
//   - 値は "true" / "false" の文字列で保存し、ストレージ上の他フラグと書式を合わせる。
//   - SSR/Node 環境では window が無いので getter は false、setter は no-op。

export const BACKGROUND_REPLACE_PREF_KEY = "fip:background-replace-enabled-v1";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** 現在の有効状態を返す。既定は false。 */
export function getBackgroundReplaceEnabled(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(BACKGROUND_REPLACE_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

/** 有効状態を保存する。SSR では no-op。 */
export function setBackgroundReplaceEnabled(enabled: boolean): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(BACKGROUND_REPLACE_PREF_KEY, enabled ? "true" : "false");
  } catch {
    // quota / privacy mode 等は黙って無視
  }
}
