import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";

export const STORAGE_KEY = "fip:privacy-accepted-v1";
const SCROLL_THRESHOLD_PX = 4;

export function resetPrivacyAcceptance(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

export default function PrivacyNotice(): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (accepted !== "true") {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    // モーダルが見えたタイミングで確認チェックボックスへフォーカス
    checkboxRef.current?.focus();

    // 既にスクロール不要なくらい短いコンテンツなら最初から最下部扱い
    // ただし scrollHeight が 0 (= 未測定) のときは判定しない
    const el = scrollRef.current;
    if (el && el.scrollHeight > 0 && el.scrollHeight - el.clientHeight <= SCROLL_THRESHOLD_PX) {
      setScrolledToEnd(true);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD_PX) {
      setScrolledToEnd(true);
    }
  };

  const canProceed = checked && scrolledToEnd;

  const handleProceed = (): void => {
    if (!canProceed) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: dialog 要素は強制クローズ手段が無いためカスタム実装
      role="dialog"
      aria-modal="true"
      aria-labelledby="fip-privacy-title"
      aria-describedby="fip-privacy-desc"
      data-testid="fip-privacy-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4"
    >
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl overflow-hidden">
        <header className="px-6 pt-6 pb-3 border-b border-neutral-200">
          <h2 id="fip-privacy-title" className="text-xl font-bold text-neutral-900">
            プライバシーについて
          </h2>
        </header>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-testid="fip-privacy-scroll"
          className="flex-1 overflow-y-auto px-6 py-4 text-sm text-neutral-800 space-y-3"
        >
          <p id="fip-privacy-desc">
            ポケ農の作業記録・写真投稿は基本的に公開されます（Nostr
            経由）。下記の注意点を必ず確認してください。
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              畑の名前に <strong>本名・家族の名前・子どもの名前を使わない</strong>
              （「○○ちゃんの畑」は危険）。
            </li>
            <li>
              <strong>住所・地名など場所が特定できる情報を書かない</strong>。
            </li>
            <li>
              <strong>写真の背景に家・表札・車のナンバー</strong>
              が写らないよう注意（撮影前に確認）。
            </li>
            <li>
              位置情報の自動取得はしません。地域設定は市区町村レベルまで（番地・座標は持ちません）。
            </li>
            <li>
              <strong>グリッドの間取り（何をどこに植えているか）は非公開</strong>。Nostr
              には流れず、サーバー（D1）にのみ保存します。
            </li>
            <li>
              投稿時は「これは見ず知らずの人にも見える」前提で文章・写真を最終チェックしてください。
            </li>
          </ul>
        </div>

        <footer className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 space-y-3">
          <label className="flex items-start gap-2 text-sm text-neutral-800 cursor-pointer">
            <input
              ref={checkboxRef}
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              data-testid="fip-privacy-check"
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <span>上記をすべて読み、理解しました</span>
          </label>
          <button
            type="button"
            onClick={handleProceed}
            disabled={!canProceed}
            data-testid="fip-privacy-proceed"
            aria-describedby={!scrolledToEnd ? "fip-privacy-proceed-help" : undefined}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold shadow-bevel-sm transition-colors hover:bg-emerald-700 hover:shadow-bevel disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none"
          >
            進める
          </button>
          {!scrolledToEnd && (
            <p id="fip-privacy-proceed-help" className="text-xs text-neutral-500 text-center">
              ※ 最下部までスクロールして全文を確認してください
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
