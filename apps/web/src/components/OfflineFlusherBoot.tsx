// OfflineFlusherBoot (Issue: kako-jun/farm-in-pocket#42)
//
// アプリ起動時にオフラインキューの自動 flush を仕掛ける副作用専用コンポーネント。
// 描画 DOM は持たない。MainLayout から client:idle で 1 回だけマウントする。

import { type JSX, useEffect } from "react";
import { recordWatering } from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";
import { createMypaceClient } from "../lib/mypace";
import { startFlusher } from "../lib/offline-flusher";

export default function OfflineFlusherBoot(): JSX.Element | null {
  useEffect(() => {
    // 鍵が無いユーザーは何も投稿していないので flush も不要。
    // ただし将来「未ログインでも閲覧時にキャッシュを使う」用途が想定されるため、
    // flusher は publish/water の deps だけ準備して起動しておく（キューが空なら no-op）。
    const handle = startFlusher({
      publishEvent: async (event) => {
        const kp = getMyKeyPair();
        // signer が要らない publish なので secretKey 渡さない
        void kp;
        const client = createMypaceClient();
        return client.publishEvent(event);
      },
      recordWatering: (plantingId, pubkey, wateredAt, note) =>
        recordWatering(plantingId, pubkey, wateredAt, note),
      isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
    });
    return () => {
      handle.stop();
    };
  }, []);

  return null;
}
