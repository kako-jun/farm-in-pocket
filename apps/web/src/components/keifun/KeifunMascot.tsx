// Issue: kako-jun/farm-in-pocket#21
// けいふんくん（マスコット）本体コンポーネント。
//
// 役割:
// - 表情アイコン + 吹き出し（LINE 風） + TTS 読み上げ
// - Phase 1 は定型文のみ。`kind` に応じて `messages.ts` からランダム選択
// - 将来 LLM 連携できるよう、disabled の入力欄を吹き出しの下に置いておく
//
// 使い方:
//   <KeifunMascot />                          ... idle 文言、bottom-right 固定
//   <KeifunMascot kind="welcome" />           ... マウント時に welcome 発火
//   <KeifunMascot kind="record_posted" trigger={postCount} /> ... 投稿のたびに発火
//   <KeifunMascot kind="encourage" placement="inline" /> ... fixed 配置なし
//
// placement:
//   - "bottom-right" (default): fixed bottom-20 right-4 z-30。ボトムナビ z-40 より下
//   - "inline": ふつうの inline-block。テストやインライン埋め込み用
//
// trigger:
//   - 値が変わると文言を再選択して読み上げる
//   - 同じ kind を再発火したいときに increment する

import type { JSX } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useTts } from "../../hooks/useTts";
import { KeifunFace } from "./icons";
import { type KeifunMessage, type KeifunMessageKind, pickRandom } from "./messages";

export interface KeifunMascotProps {
  kind?: KeifunMessageKind;
  /** 値が変わると文言を再選択して再表示する */
  trigger?: number;
  onClose?: () => void;
  placement?: "bottom-right" | "inline";
  /** 自動フェードアウト時間（ms）。テストで 0 にすると自動消えを止める */
  autoDismissMs?: number;
}

const DEFAULT_AUTO_DISMISS_MS = 8000;

export default function KeifunMascot({
  kind = "idle",
  trigger,
  onClose,
  placement = "bottom-right",
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}: KeifunMascotProps): JSX.Element | null {
  const { speak, muted, toggleMute, supported } = useTts();
  const [message, setMessage] = useState<KeifunMessage | null>(null);
  const [visible, setVisible] = useState(true);
  const inputId = useId();
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 最新の onClose / speak を ref で保持し、useEffect 依存に入れない
  // （kind / trigger 変化時のみ発火させたいため）。
  const onCloseRef = useRef(onClose);
  const speakRef = useRef(speak);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  // 文言選択 + 読み上げ。kind / trigger 変化時に再発火する。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 意図的に kind / trigger / autoDismissMs のみ追う
  useEffect(() => {
    const msg = pickRandom(kind);
    setMessage(msg);
    setVisible(true);
    speakRef.current(msg.text);
    // 自動消え
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (autoDismissMs > 0) {
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false);
        onCloseRef.current?.();
      }, autoDismissMs);
    }
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [kind, trigger, autoDismissMs]);

  // ESC キーで閉じる
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setVisible(false);
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, onClose]);

  if (!visible || message === null) return null;

  const containerClass =
    placement === "bottom-right"
      ? "fixed bottom-20 right-4 z-30 flex items-end gap-2 pointer-events-auto"
      : "flex items-end gap-2";

  const handleBubbleClick = (): void => {
    // タップで延長: 自動消えタイマーをリセット
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (autoDismissMs > 0) {
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, autoDismissMs);
    }
  };

  const handleClose = (): void => {
    setVisible(false);
    onClose?.();
  };

  return (
    <output
      className={containerClass}
      data-testid="fip-keifun-mascot"
      data-placement={placement}
      aria-live="polite"
    >
      {/* アイコン */}
      <button
        type="button"
        onClick={handleClose}
        data-testid="fip-keifun-mascot-icon"
        aria-label="けいふんくんを閉じる"
        className="rounded-full bg-soil-50 shadow-bevel hover:shadow-deep transition-shadow"
      >
        <KeifunFace expression={message.expression} size={64} />
      </button>

      {/* 吹き出し */}
      <div className="relative max-w-xs">
        <button
          type="button"
          onClick={handleBubbleClick}
          data-testid="fip-keifun-mascot-bubble"
          className="relative block w-full text-left rounded-2xl bg-white px-4 py-3 shadow-bevel border border-neutral-200"
        >
          {/* 左下の三角（吹き出しのしっぽ） */}
          <span
            aria-hidden="true"
            className="absolute -left-2 bottom-3 block h-0 w-0 border-y-8 border-r-8 border-y-transparent border-r-white"
          />
          <p className="text-sm text-neutral-800 leading-relaxed">{message.text}</p>
          {/* 将来の LLM 連携プレースホルダ */}
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={inputId} className="sr-only">
              けいふんくんに聞く（後続フェーズで実装予定）
            </label>
            <input
              id={inputId}
              type="text"
              disabled
              placeholder="けいふんくんに聞く（後で実装予定）"
              title="LLM 連携は後続フェーズで実装予定"
              data-testid="fip-keifun-mascot-prompt-input"
              className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-400"
            />
          </div>
        </button>

        {/* ミュートトグル */}
        {supported && (
          <button
            type="button"
            onClick={toggleMute}
            data-testid="fip-keifun-mascot-mute"
            aria-label={muted ? "読み上げを有効にする" : "読み上げをミュートにする"}
            aria-pressed={muted}
            className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-bevel-sm border border-neutral-200 text-xs"
          >
            {/* スピーカーアイコン（自前 SVG） */}
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M4 9 H8 L13 5 V19 L8 15 H4 Z"
                fill={muted ? "#9ca3af" : "#374151"}
                stroke={muted ? "#9ca3af" : "#374151"}
                strokeWidth="1"
                strokeLinejoin="round"
              />
              {!muted && (
                <path
                  d="M16 9 Q18 12 16 15"
                  stroke="#374151"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                />
              )}
              {muted && (
                <path
                  d="M16 9 L21 14 M21 9 L16 14"
                  stroke="#9ca3af"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        )}
      </div>
    </output>
  );
}
