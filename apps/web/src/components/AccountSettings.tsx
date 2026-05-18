import type { JSX } from "react";
import { useEffect, useState } from "react";
import { clearSecretKey, getMyKeyPair } from "../lib/keys";

export default function AccountSettings(): JSX.Element {
  const [pair, setPair] = useState<{ npub: string; nsec: string } | null>(null);
  const [showNsec, setShowNsec] = useState(false);
  const [copied, setCopied] = useState<"npub" | "nsec" | null>(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);

  useEffect(() => {
    const kp = getMyKeyPair();
    if (kp === null) {
      setEmptyMessage("まだアカウントが作成されていません。トップページから準備してください。");
      setPair(null);
    } else {
      setEmptyMessage(null);
      setPair({ npub: kp.npub, nsec: kp.nsec });
    }
  }, []);

  const handleCopy = async (kind: "npub" | "nsec", value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // クリップボード API が無い環境（古い iOS Safari 等）は静かに無視
    }
  };

  const handleReset = (): void => {
    if (!resetConfirming) {
      setResetConfirming(true);
      return;
    }
    clearSecretKey();
    setPair(null);
    setShowNsec(false);
    setResetConfirming(false);
    setEmptyMessage("鍵を削除しました。トップページから再度準備してください。");
  };

  if (pair === null) {
    return (
      <div className="space-y-3" data-testid="fip-account-settings-empty">
        <p className="text-sm text-neutral-600">{emptyMessage ?? "読み込み中..."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="fip-account-settings">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">公開アドレス (npub)</h3>
        <p
          data-testid="fip-account-settings-npub"
          className="break-all font-mono text-xs bg-neutral-100 rounded p-2"
        >
          {pair.npub}
        </p>
        <button
          type="button"
          onClick={() => handleCopy("npub", pair.npub)}
          className="text-sm text-emerald-700 hover:underline"
        >
          {copied === "npub" ? "コピーしました" : "コピー"}
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">秘密鍵 (nsec)</h3>
        <p className="text-xs text-red-700">
          ※ nsec は他人に絶対見せないでください。SNS や Discord
          に貼り付けたら一発でアカウントを乗っ取られます。
        </p>
        {!showNsec ? (
          <button
            type="button"
            onClick={() => setShowNsec(true)}
            data-testid="fip-account-settings-show-nsec"
            className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            nsec を表示（自己責任）
          </button>
        ) : (
          <>
            <p
              data-testid="fip-account-settings-nsec"
              className="break-all font-mono text-xs bg-red-50 rounded p-2 border border-red-200"
            >
              {pair.nsec}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCopy("nsec", pair.nsec)}
                className="text-sm text-emerald-700 hover:underline"
              >
                {copied === "nsec" ? "コピーしました" : "コピー"}
              </button>
              <button
                type="button"
                onClick={() => setShowNsec(false)}
                className="text-sm text-neutral-600 hover:underline"
              >
                隠す
              </button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-2 pt-2 border-t border-neutral-200">
        <h3 className="text-sm font-semibold text-neutral-700">鍵をリセット</h3>
        <p className="text-xs text-neutral-600">
          この端末から鍵を削除します。<strong>削除した鍵は復元できません</strong>。
          続けて使うつもりなら、先に nsec を控えてください。
        </p>
        <button
          type="button"
          onClick={handleReset}
          data-testid="fip-account-settings-reset"
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            resetConfirming
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-red-400 text-red-700 hover:bg-red-50"
          }`}
        >
          {resetConfirming ? "本当に削除する" : "鍵を削除"}
        </button>
        {resetConfirming && (
          <button
            type="button"
            onClick={() => setResetConfirming(false)}
            className="ml-2 text-sm text-neutral-600 hover:underline"
          >
            キャンセル
          </button>
        )}
      </section>
    </div>
  );
}
