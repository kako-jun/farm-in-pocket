// RegionSettings: プロフィールの地域（市区町村）設定 UI (Issue #32)
//
// 設定ページに置く。鍵が無ければ「先に鍵を作って」誘導を出す。
// 入力 → 「設定する」で PUT /api/profiles/me に upsert。
// 入力例「石川県金沢市」を placeholder にする。気象データは Open-Meteo の
// geocoding API がこの粒度でヒットするので、その単位での入力を期待する。

import type { JSX } from "react";
import { useEffect, useState } from "react";
import { fetchProfile, updateProfile } from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";

interface RegionSettingsProps {
  /** テスト用に pubkey を上書きできるようにする */
  pubkey?: string;
}

export default function RegionSettings(props: RegionSettingsProps): JSX.Element {
  const [pubkey, setPubkey] = useState<string | null>(props.pubkey ?? null);
  const [region, setRegion] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.pubkey !== undefined) {
      setPubkey(props.pubkey);
      return;
    }
    const kp = getMyKeyPair();
    setPubkey(kp?.pubkey ?? null);
  }, [props.pubkey]);

  useEffect(() => {
    if (!pubkey) return;
    setStatus("loading");
    fetchProfile(pubkey)
      .then((p) => {
        setRegion(p?.region ?? "");
        setStatus("idle");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "load failed");
        setStatus("error");
      });
  }, [pubkey]);

  if (!pubkey) {
    return (
      <p className="text-sm text-neutral-600" data-testid="fip-region-settings-no-key">
        鍵を作成すると地域を設定できます。
      </p>
    );
  }

  const handleSave = async (): Promise<void> => {
    if (!pubkey) return;
    setStatus("saving");
    setError(null);
    try {
      const trimmed = region.trim();
      await updateProfile(pubkey, { region: trimmed.length === 0 ? null : trimmed });
      setStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-2" data-testid="fip-region-settings">
      <label className="block text-sm font-medium text-neutral-700" htmlFor="fip-region-input">
        地域（市区町村）
      </label>
      <input
        id="fip-region-input"
        data-testid="fip-region-settings-input"
        type="text"
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        placeholder="石川県金沢市"
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        style={{ minHeight: 40 }}
      />
      <p className="text-xs text-neutral-500">
        屋外グリッドの作業日に、気温・天気・日照時間を Open-Meteo から取得して表示します。
        室内グリッドには気象データを付与しません。
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="fip-region-settings-save"
          onClick={() => void handleSave()}
          disabled={status === "saving" || status === "loading"}
          className="rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          style={{ minHeight: 40 }}
        >
          設定する
        </button>
        {status === "saved" && (
          <span data-testid="fip-region-settings-saved" className="text-xs text-emerald-700">
            保存しました
          </span>
        )}
        {status === "error" && error && (
          <span data-testid="fip-region-settings-error" className="text-xs text-red-600">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
