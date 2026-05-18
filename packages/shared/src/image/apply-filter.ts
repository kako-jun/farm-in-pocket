// 画像 File に CSS filter を canvas で焼き込み、新しい File を返す。
//
// Issue: kako-jun/farm-in-pocket#28
//
// 用途:
//   PhotoPicker で抽選したフィルタを実体に焼き込んでから nostr.build に
//   アップロードする。「プレビューでは CSS filter、アップロード時は焼き込み」
//   の 2 段構成で、受信側 (mypace タイムライン等) には加工済み JPEG/PNG が届く。
//
// 設計メモ:
//   - 画像処理ライブラリは追加しない。HTMLCanvasElement#getContext('2d') の
//     `filter` プロパティだけで完結させる
//   - 古い Safari など `ctx.filter` 未対応の環境では加工せず元 File を返す
//   - SSR/Node 環境では document が無いので、`typeof document` で早期離脱
//   - 出力 MIME は元 File のものを尊重。`image/png` 以外は基本 `image/jpeg`
//     に正規化する (HEIC など `toBlob` が扱えない MIME を JPEG に寄せる)
//   - JPEG 時は quality=0.92 で書き出す。PNG は可逆なので quality 指定なし

/** File に CSS filter を canvas で焼き込み、新しい File を返す。 */
export async function applyFilterToFile(file: File, cssFilter: string): Promise<File> {
  // フィルタなしは何もしない (canvas を経由するとサイズが膨らんだり EXIF が消える等の副作用)
  if (cssFilter === "none" || cssFilter.trim() === "") {
    return file;
  }

  // SSR / Node 環境では document が無いので何もせず素通し
  if (typeof document === "undefined") {
    return file;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // 2D コンテキスト取得失敗 (極端な環境) は元 File を返す
    return file;
  }

  // 一部ブラウザ (古い Safari など) は ctx.filter 未対応。
  // 検知できなければ素通し。"filter" in ctx は型上常に true なので typeof で見る。
  if (typeof ctx.filter === "undefined") {
    return file;
  }

  ctx.filter = cssFilter;
  ctx.drawImage(img, 0, 0);

  const mime = file.type.startsWith("image/png") ? "image/png" : "image/jpeg";
  const quality = mime === "image/jpeg" ? 0.92 : undefined;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mime, quality);
  });
  if (!blob) {
    // toBlob が null を返す (空キャンバス等) の場合も元 File を返す
    return file;
  }

  const newName = renameWithSuffix(file.name, "-filtered", mime);
  return new File([blob], newName, { type: blob.type });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("FileReader result was not a string"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

/**
 * ファイル名に `-filtered` を挿入し、出力 MIME に応じた拡張子に揃える。
 * - `photo.jpg` + jpeg → `photo-filtered.jpg`
 * - `photo.heic` + jpeg → `photo-filtered.jpg`（HEIC は JPEG に正規化）
 * - 名前に拡張子が無い場合は末尾に追加
 */
function renameWithSuffix(name: string, suffix: string, mime: string): string {
  const desiredExt = mime === "image/png" ? "png" : "jpg";
  // ファイル名末尾の `.ext` を抽出。`.tar.gz` のような複合拡張子は最後の dot のみ
  const dot = name.lastIndexOf(".");
  const hasExt = dot > 0 && dot < name.length - 1;
  const base = hasExt ? name.slice(0, dot) : name;
  return `${base}${suffix}.${desiredExt}`;
}

// テストから renameWithSuffix の挙動を直接確認したいケースに備えて export しておく。
// （プロダクトコードでは applyFilterToFile 内でのみ参照）
export const __internal = {
  renameWithSuffix,
};
