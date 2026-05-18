import { encodeNpub, encodeNsec, getPublicKey } from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { getOrCreateSecretKey, getStoredSecretKey, importNsec } from "../lib/keys";
import { STORAGE_KEY as PRIVACY_STORAGE_KEY } from "./PrivacyNotice";

type Phase = "hidden" | "choose" | "import" | "done";

export default function AccountSetup(): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [nsecInput, setNsecInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ npub: string; nsec: string } | null>(null);

  // privacy accepted + secret key 未保存 のときだけ表示
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const privacyAccepted = window.localStorage.getItem(PRIVACY_STORAGE_KEY) === "true";
    const hasKey = getStoredSecretKey() !== null;
    if (!privacyAccepted) {
      setPhase("hidden");
      return;
    }
    if (hasKey) {
      setPhase("hidden");
      return;
    }
    setPhase("choose");
  }, []);

  // PrivacyNotice 完了タイミング（同タブ内）を拾うため storage イベントを listen
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onStorage = (): void => {
      const privacyAccepted = window.localStorage.getItem(PRIVACY_STORAGE_KEY) === "true";
      const hasKey = getStoredSecretKey() !== null;
      if (privacyAccepted && !hasKey && phase === "hidden") {
        setPhase("choose");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [phase]);

  if (phase === "hidden") {
    return null;
  }

  const handleGenerate = (): void => {
    setError(null);
    try {
      const sk = getOrCreateSecretKey();
      const pubBytes = getPublicKey(sk);
      setCreated({ npub: encodeNpub(pubBytes), nsec: encodeNsec(sk) });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "鍵の生成に失敗しました");
    }
  };

  const handleImport = (): void => {
    setError(null);
    const trimmed = nsecInput.trim();
    if (trimmed.length === 0) {
      setError("nsec を入力してください");
      return;
    }
    try {
      const sk = importNsec(trimmed);
      const pubBytes = getPublicKey(sk);
      setCreated({ npub: encodeNpub(pubBytes), nsec: encodeNsec(sk) });
      setPhase("done");
    } catch {
      setError("nsec の形式が正しくありません（`nsec1...` で始まる文字列を貼り付けてください）");
    }
  };

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: PrivacyNotice と同じカスタムダイアログ
      role="dialog"
      aria-modal="true"
      aria-labelledby="fip-account-title"
      data-testid="fip-account-overlay"
      className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/70 p-4"
    >
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl overflow-hidden">
        <header className="px-6 pt-6 pb-3 border-b border-neutral-200">
          <h2 id="fip-account-title" className="text-xl font-bold text-neutral-900">
            アカウントを準備
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-neutral-800 space-y-4">
          {phase === "choose" && (
            <>
              <p>
                ポケ農のアカウントは <strong>Nostr の鍵ペア</strong> です。
                サーバーへの登録は不要で、この端末に鍵が保存されます。
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-700">
                <li>新しく鍵を作るとそのまま使い始められます。</li>
                <li>
                  既に Nostr の鍵 (<code>nsec1...</code>) を持っている方はインポートしてください。
                </li>
                <li>鍵を無くすとアカウント復元はできません。後で必ず控えてください。</li>
              </ul>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  data-testid="fip-account-generate"
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold shadow-bevel-sm transition-colors hover:bg-emerald-700 hover:shadow-bevel"
                >
                  新しい鍵を作る
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPhase("import");
                  }}
                  data-testid="fip-account-show-import"
                  className="w-full rounded-lg border border-emerald-600 px-4 py-2 text-emerald-700 font-semibold transition-colors hover:bg-emerald-50"
                >
                  既存の nsec をインポート
                </button>
              </div>
            </>
          )}

          {phase === "import" && (
            <>
              <p>
                既存の <code>nsec1...</code> を貼り付けてください。 この鍵はこの端末の localStorage
                に保存されます。
              </p>
              <label
                htmlFor="fip-nsec-input"
                className="block text-sm font-medium text-neutral-800"
              >
                nsec
              </label>
              <textarea
                id="fip-nsec-input"
                data-testid="fip-account-nsec-input"
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                aria-invalid={error !== null}
                aria-describedby={error !== null ? "fip-account-error" : undefined}
                rows={3}
                placeholder="nsec1..."
                className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {error !== null && (
                <p id="fip-account-error" role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNsecInput("");
                    setPhase("choose");
                  }}
                  className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-neutral-700 font-semibold transition-colors hover:bg-neutral-50"
                >
                  戻る
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  data-testid="fip-account-import"
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold shadow-bevel-sm transition-colors hover:bg-emerald-700 hover:shadow-bevel"
                >
                  インポート
                </button>
              </div>
            </>
          )}

          {phase === "done" && created !== null && (
            <>
              <p className="text-emerald-700 font-semibold">アカウントを保存しました。</p>
              <p>
                以下があなたの公開アドレス (<code>npub</code>) です。SNS で名乗るときに使えます。
              </p>
              <p
                data-testid="fip-account-npub"
                className="break-all font-mono text-xs bg-neutral-100 rounded p-2"
              >
                {created.npub}
              </p>
              <p className="text-red-700 font-semibold pt-2">
                ※ 復元用の秘密鍵 (<code>nsec</code>) は「設定」画面で表示できます。
                忘れずに安全な場所に控えてください。
              </p>
              <button
                type="button"
                onClick={() => setPhase("hidden")}
                data-testid="fip-account-close"
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold shadow-bevel-sm transition-colors hover:bg-emerald-700 hover:shadow-bevel"
              >
                始める
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
