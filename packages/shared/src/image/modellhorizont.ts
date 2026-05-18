// 写真の遠景差し替え（modellhorizont 連携）。
//
// Issue: kako-jun/farm-in-pocket#43
//
// 現状は modellhorizont が未成熟のため、ここはあくまで「統合点（placeholder）」。
// API/Library を呼び出すフック (`impl`) を差し込めるようにしておき、
// 本番統合時はアプリ側で impl を注入するだけで切り替わる構造にしてある。
//
// 動作:
//   - enabled=false → 元 File をそのまま返す (applied=false, reason="disabled")
//   - enabled=true + impl 未指定 → 元 File を返す (applied=false, reason="not_integrated_yet")
//   - enabled=true + impl 指定 → impl の戻り File を返す (applied=true)
//   - impl が throw → 元 File を返す (applied=false, reason=エラーメッセージ)
//
// 設計メモ:
//   - shared 側に置くのは、将来 web 以外（モバイル等）の経路でも同じ統合点を使えるようにするため
//   - impl は Promise<File> を返すフックに統一する。modellhorizont 側が WASM/REST どちらでも吸収可

export interface BackgroundReplaceResult {
  /** 加工後（あるいは未加工の元）の File。常に何かしらの File を返す。 */
  file: File;
  /** 実際に遠景差し替えが適用されたか。 */
  applied: boolean;
  /** applied=false のときの理由。`disabled` / `not_integrated_yet` / エラーメッセージ。 */
  reason?: string;
}

export interface ApplyBackgroundReplaceOptions {
  file: File;
  enabled: boolean;
  /** 本番統合時に差し替え可能なフック。未指定 = stub。 */
  impl?: (file: File) => Promise<File>;
}

/**
 * 遠景差し替え（modellhorizont）を写真に適用する placeholder 実装。
 * 現状は impl が未設定の場合、元 File をそのまま返す。
 * Issue: kako-jun/farm-in-pocket#43
 */
export async function applyBackgroundReplace(
  opts: ApplyBackgroundReplaceOptions,
): Promise<BackgroundReplaceResult> {
  if (!opts.enabled) {
    return { file: opts.file, applied: false, reason: "disabled" };
  }
  if (!opts.impl) {
    return { file: opts.file, applied: false, reason: "not_integrated_yet" };
  }
  try {
    const out = await opts.impl(opts.file);
    return { file: out, applied: true };
  } catch (e) {
    return {
      file: opts.file,
      applied: false,
      reason: e instanceof Error ? e.message : "failed",
    };
  }
}
