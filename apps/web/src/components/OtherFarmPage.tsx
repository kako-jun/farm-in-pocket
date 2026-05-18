// 他人の畑ページ。
//
// Issue: kako-jun/farm-in-pocket#19
// レイアウト:
//   1. 「← みんなへ戻る」リンク
//   2. バナー + アイコン + 表示名 + about
//   3. Follow / Unfollow ボタン（鍵未保存時は disabled）
//   4. 「畑（プライバシー保護のため間取りは非公開）」セクション
//      - 5×5 のぼかしグリッド + 中央に🔒ラベル
//   5. 「最近の作業」タイムライン
//      - action / crop / content / image / 相対時刻 + Stella placeholder
//
// プライバシー方針: マイ畑の D1 グリッド構造は絶対にここに出さない。Nostr 公開チャネルだけを使う。

import {
  FARM_ACTION_ICONS,
  FARM_ACTION_LABELS_JA,
  FARM_MILESTONE_ICONS,
  FARM_MILESTONE_LABELS_JA,
  type FarmAction,
  isFarmMilestone,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { relativeJa } from "../lib/community";
import { followPubkey, getMyContacts, unfollowPubkey } from "../lib/follow";
import { getMyKeyPair } from "../lib/keys";
import { type OtherFarmData, fetchOtherFarm, findImageUrls, findTagValue } from "../lib/other-farm";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; data: OtherFarmData }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

type FollowState =
  | { kind: "no-key" }
  | { kind: "loading" }
  | { kind: "ready"; following: boolean; error?: string }
  | { kind: "saving" };

function isKnownAction(s: string | null): s is FarmAction {
  if (!s) return false;
  return s in FARM_ACTION_ICONS;
}

function actionLabel(action: string | null): string {
  if (isKnownAction(action)) return FARM_ACTION_LABELS_JA[action];
  return "作業";
}

function actionIcon(action: string | null): string {
  if (isKnownAction(action)) return FARM_ACTION_ICONS[action];
  return "📝";
}

function displayName(data: OtherFarmData): string {
  const dn = data.profile?.display_name;
  if (typeof dn === "string" && dn.trim().length > 0) return dn;
  const name = data.profile?.name;
  if (typeof name === "string" && name.trim().length > 0) return name;
  return data.npub.slice(0, 12);
}

function picture(data: OtherFarmData): string | null {
  const p = data.profile?.picture;
  return typeof p === "string" && p.length > 0 ? p : null;
}

function banner(data: OtherFarmData): string | null {
  const b = data.profile?.banner;
  return typeof b === "string" && b.length > 0 ? b : null;
}

// Stella 用 placeholder の 5 色（mypace 側の reaction カラー範囲を意識）
const STELLA_COLORS: { name: string; cls: string }[] = [
  { name: "red", cls: "bg-rose-300" },
  { name: "orange", cls: "bg-orange-300" },
  { name: "yellow", cls: "bg-yellow-300" },
  { name: "green", cls: "bg-emerald-300" },
  { name: "blue", cls: "bg-sky-300" },
];

// 5×5 ぼかしグリッドのセル定数。key は再描画安定性のため固定 id を持たせる。
// opacity の決め方は決定論的（i*17 % 70 / 100）で「畑っぽい濃淡ムラ」を演出する。
const BLUR_CELLS: { id: string; opacity: number }[] = Array.from({ length: 25 }, (_, i) => ({
  id: `blur-${i}`,
  opacity: 0.3 + ((i * 17) % 70) / 100,
}));

interface Props {
  npub: string;
}

export default function OtherFarmPage({ npub }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [follow, setFollow] = useState<FollowState>({ kind: "loading" });

  // データ取得
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    fetchOtherFarm(npub)
      .then((data) => {
        if (cancelled) return;
        if (data === null) {
          setStatus({ kind: "not-found" });
        } else {
          setStatus({ kind: "ready", data });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setStatus({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [npub]);

  // follow 状態取得（鍵が無ければ no-key）
  // status.ready 時にだけ判定する（pubkey が確定するまで待つ）。
  useEffect(() => {
    if (status.kind !== "ready") return;
    const kp = getMyKeyPair();
    if (kp === null) {
      setFollow({ kind: "no-key" });
      return;
    }
    // 自分自身のページなら follow ボタンを出さない
    if (kp.pubkey === status.data.pubkey) {
      setFollow({ kind: "no-key" });
      return;
    }
    let cancelled = false;
    setFollow({ kind: "loading" });
    getMyContacts(kp.secretKey)
      .then((contacts) => {
        if (cancelled) return;
        setFollow({ kind: "ready", following: contacts.includes(status.data.pubkey) });
      })
      .catch(() => {
        if (cancelled) return;
        // 失敗時は不明扱い: ボタンは押せるが「フォロー」表示にしておく
        setFollow({ kind: "ready", following: false });
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status.kind === "loading") {
    return (
      <div className="py-12 text-center text-neutral-500" data-testid="other-loading">
        読み込み中…
      </div>
    );
  }

  if (status.kind === "not-found") {
    return (
      <div
        className="rounded border border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-900"
        data-testid="other-not-found"
      >
        <p className="font-semibold">そのユーザーは見つかりませんでした。</p>
        <p className="mt-2 text-neutral-600">npub が正しいか確認してください。</p>
        <p className="mt-4">
          <a className="text-emerald-700 hover:underline" href="/community">
            ← みんなへ戻る
          </a>
        </p>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div
        className="rounded border border-rose-300 bg-rose-50 p-6 text-center text-sm text-rose-800"
        data-testid="other-error"
      >
        <p>取得に失敗しました。時間を置いて再試行してください。</p>
        <p className="mt-2 text-xs text-rose-600">{status.message}</p>
      </div>
    );
  }

  const data = status.data;
  const name = displayName(data);
  const pic = picture(data);
  const ban = banner(data);
  const aboutRaw = typeof data.profile?.about === "string" ? data.profile.about : "";
  const about = aboutRaw.trim();

  const handleFollowToggle = async () => {
    if (follow.kind !== "ready") return;
    const kp = getMyKeyPair();
    if (kp === null) return;
    const previousFollowing = follow.following;
    setFollow({ kind: "saving" });
    try {
      if (previousFollowing) {
        await unfollowPubkey(kp.secretKey, data.pubkey);
        setFollow({ kind: "ready", following: false });
      } else {
        await followPubkey(kp.secretKey, data.pubkey);
        setFollow({ kind: "ready", following: true });
      }
    } catch (e: unknown) {
      // 失敗時は元の状態に戻し、エラー文言を表示する（再クリックで再試行可能）
      const message = e instanceof Error ? e.message : String(e);
      setFollow({ kind: "ready", following: previousFollowing, error: message });
    }
  };

  return (
    <div className="space-y-6" data-testid="other-farm-page">
      <p className="text-sm">
        <a className="text-emerald-700 hover:underline" href="/community">
          ← みんなへ戻る
        </a>
      </p>

      {/* プロフィールカード */}
      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div
          className="aspect-[3/1] w-full bg-gradient-to-br from-emerald-300 to-emerald-600 bg-cover bg-center"
          style={ban ? { backgroundImage: `url(${ban})` } : undefined}
          data-testid="other-banner"
          data-has-banner={ban ? "true" : "false"}
          aria-hidden="true"
        />
        <div className="relative px-4 pt-4 pb-4">
          <div className="absolute -top-10 left-4 h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-emerald-100">
            {pic ? (
              <img
                src={pic}
                alt={name}
                className="h-full w-full object-cover"
                loading="lazy"
                data-testid="other-picture"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">🌱</div>
            )}
          </div>
          <div className="pl-24 min-h-[80px]">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-bold text-neutral-900" data-testid="other-display-name">
                {name}
              </h2>
              <FollowButton state={follow} onToggle={handleFollowToggle} />
            </div>
            {about.trim().length > 0 && (
              <p
                className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-700"
                data-testid="other-about"
              >
                {about}
              </p>
            )}
            <p className="mt-2 break-all font-mono text-[10px] text-neutral-400">{data.npub}</p>
          </div>
        </div>
      </section>

      {/* ぼかしグリッド (5×5) */}
      <section data-testid="other-grid-section">
        <h3 className="text-lg font-semibold text-neutral-900">畑</h3>
        <p className="mt-1 text-xs text-neutral-500">
          プライバシー保護のため、間取りは非公開です。
        </p>
        <div className="relative mt-3 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div
            className="grid grid-cols-5 gap-1.5"
            style={{ filter: "blur(8px)" }}
            data-testid="other-grid-blur"
            aria-hidden="true"
          >
            {BLUR_CELLS.map((cell) => (
              <div
                key={cell.id}
                className="aspect-square rounded bg-emerald-300/50 backdrop-blur-sm"
                style={{ opacity: cell.opacity }}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded bg-white/80 px-3 py-1 text-xs font-medium text-neutral-700 shadow">
              🔒 間取りは公開されていません
            </span>
          </div>
        </div>
      </section>

      {/* タイムライン */}
      <section data-testid="other-timeline-section">
        <h3 className="text-lg font-semibold text-neutral-900">最近の作業</h3>
        {data.events.length === 0 ? (
          <p
            className="mt-2 rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-600"
            data-testid="other-timeline-empty"
          >
            まだ farm-in-pocket の投稿がありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-3" data-testid="other-timeline">
            {data.events.map((event) => {
              const action = findTagValue(event.tags, "farm-action");
              const crop = findTagValue(event.tags, "farm-crop");
              const images = findImageUrls(event.tags);
              const milestoneRaw = findTagValue(event.tags, "farm-milestone");
              const milestone = isFarmMilestone(milestoneRaw) ? milestoneRaw : null;
              // 節目イベントは emerald 系の太枠 + バッジで強調表示する（Issue #27）。
              const itemClass = milestone
                ? "rounded border-2 border-emerald-500 bg-emerald-50 p-3 ring-2 ring-emerald-200"
                : "rounded border border-neutral-200 bg-white p-3";
              return (
                <li
                  key={event.id}
                  className={itemClass}
                  data-testid="other-timeline-item"
                  data-milestone={milestone ?? undefined}
                >
                  {milestone && (
                    <div className="mb-2 flex items-center gap-1">
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white"
                        data-testid="other-timeline-milestone-badge"
                      >
                        <span aria-hidden="true">{FARM_MILESTONE_ICONS[milestone]}</span>
                        <span>{FARM_MILESTONE_LABELS_JA[milestone]}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <span>
                      {actionIcon(action)} {actionLabel(action)}
                    </span>
                    {crop && <span className="text-neutral-500">— {crop}</span>}
                    <span className="ml-auto text-xs text-neutral-400">
                      {relativeJa(event.created_at)}
                    </span>
                  </div>
                  {event.content.length > 0 && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-800">
                      {event.content}
                    </p>
                  )}
                  {images.length > 0 && (
                    <div
                      className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                      data-testid="other-timeline-images"
                    >
                      {images.map((url, idx) => (
                        <img
                          key={`${event.id}-${idx}`}
                          src={url}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full rounded object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {/* Stella placeholder */}
                  <div
                    className="mt-2 flex items-center gap-1.5"
                    data-testid="other-stella-placeholder"
                    title="Stella リアクションは #27 で実装予定"
                  >
                    {STELLA_COLORS.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        disabled
                        aria-label={`${c.name} reaction (coming in #27)`}
                        className={`h-4 w-4 rounded-full ${c.cls} opacity-50`}
                      />
                    ))}
                    <span className="ml-1 text-[10px] text-neutral-400">#27 で実装予定</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FollowButton({
  state,
  onToggle,
}: {
  state: FollowState;
  onToggle: () => void;
}): JSX.Element {
  if (state.kind === "no-key") {
    return (
      <button
        type="button"
        disabled
        title="鍵を設定するとフォローできます"
        className="rounded border border-neutral-300 bg-neutral-100 px-3 py-1 text-sm text-neutral-400"
        data-testid="other-follow-btn"
        data-state="no-key"
      >
        フォロー
      </button>
    );
  }
  if (state.kind === "loading") {
    return (
      <button
        type="button"
        disabled
        className="rounded border border-neutral-300 bg-neutral-100 px-3 py-1 text-sm text-neutral-400"
        data-testid="other-follow-btn"
        data-state="loading"
      >
        …
      </button>
    );
  }
  if (state.kind === "saving") {
    return (
      <button
        type="button"
        disabled
        className="rounded border border-emerald-400 bg-emerald-100 px-3 py-1 text-sm text-emerald-700"
        data-testid="other-follow-btn"
        data-state="saving"
      >
        保存中…
      </button>
    );
  }
  // ready
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onToggle}
        className={
          state.following
            ? "rounded border border-emerald-600 bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
            : "rounded border border-emerald-600 bg-white px-3 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        }
        data-testid="other-follow-btn"
        data-state={state.following ? "following" : "not-following"}
        data-error={state.error ? "true" : undefined}
      >
        {state.following ? "フォロー中" : "フォロー"}
      </button>
      {state.error && (
        <p
          className="max-w-[10rem] text-right text-[10px] text-rose-600"
          data-testid="other-follow-error"
        >
          失敗しました。再試行してください。
        </p>
      )}
    </div>
  );
}
