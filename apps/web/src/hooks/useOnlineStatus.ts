// useOnlineStatus (Issue: kako-jun/farm-in-pocket#42)
//
// navigator.onLine + online/offline イベントを購読する React hook。
// SSR 中は navigator が無いため初期値を true（楽観）にしておく。

import { useEffect, useState } from "react";

export interface OnlineStatus {
  online: boolean;
}

function readInitial(): boolean {
  if (typeof navigator === "undefined") return true;
  // navigator.onLine は「ネットワークがあるかも」程度の指標だが
  // 圏外検出としてはこの値 + fetch エラー fallback の併用で十分。
  return navigator.onLine !== false;
}

export function useOnlineStatus(): OnlineStatus {
  const [online, setOnline] = useState<boolean>(readInitial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // mount 時にも navigator.onLine を再チェック（初期描画時と差異があった場合）
    if (typeof navigator !== "undefined") {
      setOnline(navigator.onLine !== false);
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { online };
}
