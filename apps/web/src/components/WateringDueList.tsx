// WateringDueList: 「今日のおせわ」リスト (Issue #31)
//
// 鍵保有時のみマウントされる前提。鍵チェックは親 (index.astro 側の wrapper) で行う。
// 0 件なら「今日は予定なし」を出し、件数があれば各行に grid 名 + (x,y) + 作物名 +
// 「💧 やった」ボタンを並べる。ボタンを押すと POST /water → 楽観 update で行を消す。
//
// Issue #32: プロフィールに region が設定されていれば、今日の天気を上部に表示する。
// 雨判定なら「屋外の水やりは不要かもしれません」サジェスト、未設定なら設定誘導を出す。

import type { ProfileRecord, WateringDueRecord, WeatherCacheRecord } from "@farm-in-pocket/shared";
import { wmoToLabel } from "@farm-in-pocket/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import { fetchProfile, fetchWateringDue, fetchWeather, recordWatering } from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";
import { pushAction } from "../lib/offline-queue";

function isCurrentlyOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

interface WateringDueListProps {
  /** テスト用に pubkey を上書きできるようにする。実運用では未指定で keys.ts から取得。 */
  pubkey?: string;
}

export default function WateringDueList(props: WateringDueListProps): JSX.Element | null {
  const [pubkey, setPubkey] = useState<string | null>(props.pubkey ?? null);
  const [records, setRecords] = useState<WateringDueRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 「やった」処理中の plantingId を持って楽観 update + 二重押し抑止
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  // Issue #32: プロフィール / 当日の気象データ
  const [profile, setProfile] = useState<ProfileRecord | null | undefined>(undefined);
  const [weather, setWeather] = useState<WeatherCacheRecord | null>(null);

  // props.pubkey が無ければ localStorage から拾う。鍵が無ければ null のまま。
  useEffect(() => {
    if (props.pubkey !== undefined) {
      setPubkey(props.pubkey);
      return;
    }
    const kp = getMyKeyPair();
    setPubkey(kp?.pubkey ?? null);
  }, [props.pubkey]);

  const reload = useCallback(async (pk: string) => {
    setError(null);
    try {
      const res = await fetchWateringDue(pk);
      setRecords(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    if (!pubkey) return;
    void reload(pubkey);
  }, [pubkey, reload]);

  // Issue #32: プロフィール → 地域があれば今日の気象を取得
  useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await fetchProfile(pubkey);
        if (cancelled) return;
        setProfile(p);
        if (p?.region) {
          const r = await fetchWeather(p.region, todayYmd());
          if (!cancelled) setWeather(r.record);
        } else {
          setWeather(null);
        }
      } catch {
        // 取得失敗時は黙って何も表示しない（おせわリスト本体には影響させない）
        if (!cancelled) {
          setProfile(null);
          setWeather(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  // 鍵未保有時は何も描画しない（親側で鍵チェックする前提だが、保険として）
  if (!pubkey) {
    return null;
  }

  const handleWater = async (plantingId: number): Promise<void> => {
    if (!pubkey) return;
    if (busyIds.has(plantingId)) return;
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.add(plantingId);
      return next;
    });
    // Issue #42: 圏外時はキューに積んで楽観 update のみ実施。
    if (!isCurrentlyOnline()) {
      pushAction({
        kind: "recordWatering",
        plantingId,
        pubkey,
        queuedAt: Date.now(),
      });
      setRecords((prev) => (prev ?? []).filter((r) => r.plantingId !== plantingId));
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(plantingId);
        return next;
      });
      return;
    }
    try {
      await recordWatering(plantingId, pubkey);
      // 楽観 update: その行を records から消す（next_due_at は今日 + interval になり、
      // 今日のリストには載らないはず）。失敗したら reload で復旧。
      setRecords((prev) => (prev ?? []).filter((r) => r.plantingId !== plantingId));
    } catch (e) {
      // Issue #42: ネットワーク失敗時はキューに積んで楽観 update を維持。
      // UI 上は「やった」と見せ続け、復帰時に flusher が fire する。
      pushAction({
        kind: "recordWatering",
        plantingId,
        pubkey,
        queuedAt: Date.now(),
      });
      void e;
      setRecords((prev) => (prev ?? []).filter((r) => r.plantingId !== plantingId));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(plantingId);
        return next;
      });
    }
  };

  // Issue #32: 天気バナー要素
  const renderWeatherBanner = (): JSX.Element | null => {
    // プロフィール未取得中（undefined）は出さない。null = プロフィール無し。
    if (profile === undefined) return null;
    if (profile === null || !profile.region) {
      return (
        <p data-testid="fip-watering-due-region-prompt" className="text-xs text-neutral-600">
          <a href="/settings/" className="underline text-sky-700">
            地域を設定
          </a>
          すると、今日の天気予報が表示されます。
        </p>
      );
    }
    if (!weather) {
      return (
        <p data-testid="fip-watering-due-weather-unavailable" className="text-xs text-neutral-500">
          {profile.region} の天気を取得できませんでした。
        </p>
      );
    }
    const label = wmoToLabel(weather.weatherCode);
    const tempPart =
      weather.tempMax !== null && weather.tempMin !== null
        ? `（最高 ${Math.round(weather.tempMax)}℃ / 最低 ${Math.round(weather.tempMin)}℃）`
        : "";
    return (
      <div
        data-testid="fip-watering-due-weather"
        className="rounded border border-sky-200 bg-white px-3 py-2 text-xs text-neutral-700"
      >
        <p>
          <span data-testid="fip-watering-due-weather-region">{profile.region}</span>: {label.emoji}{" "}
          今日は{label.label}
          {tempPart}
        </p>
        {label.isRain && (
          <p data-testid="fip-watering-due-rain-suggest" className="mt-1 text-sky-800">
            ☔ 屋外グリッドの水やりは不要かもしれません
          </p>
        )}
      </div>
    );
  };

  return (
    <section
      data-testid="fip-watering-due-list"
      className="w-full max-w-md space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 p-4"
    >
      <h2 className="text-base font-semibold text-sky-900">💧 今日のおせわ</h2>
      {renderWeatherBanner()}
      {error && (
        <p data-testid="fip-watering-due-error" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {records === null ? (
        <p className="text-xs text-neutral-500" data-testid="fip-watering-due-loading">
          読み込み中…
        </p>
      ) : records.length === 0 ? (
        <p className="text-sm text-neutral-600" data-testid="fip-watering-due-empty">
          今日は予定なし
        </p>
      ) : (
        <ul className="space-y-2" data-testid="fip-watering-due-records">
          {records.map((rec) => (
            <li
              key={`due-${rec.plantingId}`}
              data-testid={`fip-watering-due-row-${rec.plantingId}`}
              className="flex items-center justify-between rounded border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-neutral-800">
                  🌱 {rec.plantName}
                  {rec.daysOverdue > 0 && (
                    <span
                      data-testid={`fip-watering-due-overdue-${rec.plantingId}`}
                      className="ml-2 inline-block rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800"
                    >
                      期日超過 {rec.daysOverdue}日
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-500">
                  {rec.gridName} ({rec.x}, {rec.y}) ・ 期日 {rec.nextDueAt}
                </span>
              </div>
              <button
                type="button"
                data-testid={`fip-watering-due-water-${rec.plantingId}`}
                disabled={busyIds.has(rec.plantingId)}
                onClick={() => void handleWater(rec.plantingId)}
                className="rounded-lg border border-sky-400 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                style={{ minHeight: 36 }}
              >
                💧 やった
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
