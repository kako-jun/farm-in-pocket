// Issue: kako-jun/farm-in-pocket#21
// けいふんくんの読み上げフック。
//
// Web Speech API (`window.speechSynthesis` / `SpeechSynthesisUtterance`) を
// 薄くラップする。サポート判定 + ミュート状態の localStorage 永続化 + 既存
// 発話の cancel が役割。Phase 1 は日本語固定（lang=ja-JP）。
//
// 設計メモ:
// - SSR / Speech API 非搭載環境では `supported: false`、speak は no-op
// - mute 状態は `fip:keifun-mute-v1` キーで保存（"true" / "false"）
// - speak 呼び出し時、再生中の utterance があれば cancel して新規発火
// - voice 選択はブラウザ任せ。明示的に `voice` を指定すると iOS Safari で
//   無音になることがあるので、lang だけ指定して任せる

import { useCallback, useEffect, useState } from "react";

export const KEIFUN_MUTE_STORAGE_KEY = "fip:keifun-mute-v1";

export interface UseTtsResult {
  speak: (text: string) => void;
  muted: boolean;
  toggleMute: () => void;
  supported: boolean;
}

function detectSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

function readInitialMute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEIFUN_MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useTts(): UseTtsResult {
  const [supported, setSupported] = useState(false);
  const [muted, setMuted] = useState(false);

  // SSR ハイドレーション安全のため初期描画後に確定する
  useEffect(() => {
    setSupported(detectSupported());
    setMuted(readInitialMute());
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(KEIFUN_MUTE_STORAGE_KEY, next ? "true" : "false");
      } catch {
        // localStorage が無効化されている場合は静かに無視
      }
      // ミュートに切り替えたタイミングで読み上げ中の発話を止める
      if (next && typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return next;
    });
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!detectSupported()) return;
      if (muted) return;
      if (!text) return;
      const synth = window.speechSynthesis;
      try {
        synth.cancel();
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.lang = "ja-JP";
        synth.speak(utter);
      } catch {
        // 一部ブラウザでは cancel/speak 直後に InvalidStateError を投げることがある
      }
    },
    [muted],
  );

  return { speak, muted, toggleMute, supported };
}
