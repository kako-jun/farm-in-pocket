// useImageUpload: 写真を nostr.build に NIP-98 でアップロードし、成功 URL を mypace
// `/api/uploads` に履歴記録する React フック。
//
// Issue: kako-jun/farm-in-pocket#17
//
// 設計メモ:
// - 画像本体は nostr.build に直接送る（mypace を経由しない）。mypace の無料帯域を消費しない
// - 履歴登録は fire-and-forget。ネットワーク失敗で画像 URL を握り潰さない
// - 鍵未保存時は早期に `{ success: false, error }` を返す。フォームから呼んでもクラッシュしない
// - 戻り値 `uploading` は呼び出し側で「アップロード中...」を出すための単純フラグ
// - fetch はモックしたい場合 `globalThis.fetch` を差し替える前提（既存テストと同じ手法）

import { type UploadResult, createNip98Signer, uploadToNostrBuild } from "@farm-in-pocket/shared";
import { useCallback, useState } from "react";
import { getMyKeyPair } from "../lib/keys";
import { createMypaceClient } from "../lib/mypace";

export interface UseImageUploadResult {
  uploading: boolean;
  uploadFile: (file: File) => Promise<UploadResult>;
}

export function useImageUpload(): UseImageUploadResult {
  const [uploading, setUploading] = useState(false);

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    const kp = getMyKeyPair();
    if (kp === null) {
      return { success: false, error: "アカウント設定が必要です" };
    }

    setUploading(true);
    try {
      const signer = createNip98Signer(kp.secretKey);
      const result = await uploadToNostrBuild({
        signer,
        file,
      });

      if (result.success && result.url) {
        // mypace に履歴記録（fire-and-forget）。失敗してもアップロード自体は成功扱い。
        const client = createMypaceClient(kp.secretKey);
        const type = file.type.startsWith("audio/") ? "audio" : "image";
        void client
          .recordUpload({
            pubkey: kp.pubkey,
            url: result.url,
            filename: file.name,
            type,
          })
          .catch(() => {
            // 履歴記録失敗は黙殺（画像 URL は既に手に入っている）
          });
      }

      return result;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, uploadFile };
}
