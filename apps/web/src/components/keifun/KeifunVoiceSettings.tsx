// Issue: kako-jun/farm-in-pocket#21
// 設定ページの「けいふんくんの読み上げ」セクション。
//
// 既存の AccountSettings / PrivacySettings に手を加えず、独立した子コンポーネントとして
// 設定ページに追加できるようにしている。Phase 1 では:
//   - ミュート切替トグル（useTts 経由で localStorage に永続化）
//   - テスト読み上げボタン
//   - サポート外環境向けの注意文言

import type { JSX } from "react";
import { useTts } from "../../hooks/useTts";

const SAMPLE_TEXT = "けいふんくんです。読み上げのテストです。";

export default function KeifunVoiceSettings(): JSX.Element {
  const { speak, muted, toggleMute, supported } = useTts();

  return (
    <div className="space-y-3" data-testid="fip-keifun-voice-settings">
      {!supported && (
        <p className="text-xs text-neutral-500">
          この端末では音声読み上げに対応していません（Web Speech API
          が無効です）。文字の吹き出しのみ表示します。
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-700">けいふんくんの声を出す</span>
        <button
          type="button"
          onClick={toggleMute}
          data-testid="fip-keifun-voice-settings-toggle"
          aria-pressed={!muted}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            muted
              ? "bg-neutral-200 text-neutral-600"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {muted ? "ミュート中" : "オン"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => speak(SAMPLE_TEXT)}
        data-testid="fip-keifun-voice-settings-test"
        disabled={!supported || muted}
        className="rounded-lg border border-emerald-400 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        テスト読み上げ
      </button>
    </div>
  );
}
