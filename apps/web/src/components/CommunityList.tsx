// CommunityList: 「#farm-in-pocket」を付けて投稿しているユーザー一覧。
//
// Issue: kako-jun/farm-in-pocket#18
// 横長バナーカード（aspect-[3/1] のバナー + 丸アイコン重ね）を縦並びで表示する。
// クリックで /community/<npub> へ遷移するが、その先のページは Issue #19 で実装する。

import {
  FARM_ACTION_ICONS,
  FARM_ACTION_LABELS_JA,
  FARM_MILESTONE_ICONS,
  FARM_MILESTONE_LABELS_JA,
  type FarmAction,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import {
  type CommunityUser,
  fetchFarmInPocketUsers,
  getBannerUrl,
  getDisplayName,
  getPictureUrl,
  relativeJa,
} from "../lib/community";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; users: CommunityUser[] }
  | { kind: "error"; message: string };

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

export default function CommunityList(): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchFarmInPocketUsers()
      .then((res) => {
        if (cancelled) return;
        setStatus({ kind: "ready", users: res.users });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setStatus({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind === "loading") {
    return (
      <div className="py-8 text-center text-neutral-500" data-testid="community-loading">
        読み込み中…
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div
        className="rounded border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800"
        data-testid="community-error"
      >
        リレーから取得できませんでした。時間を置いて再試行してください。
      </div>
    );
  }

  if (status.users.length === 0) {
    return (
      <div
        className="rounded border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600"
        data-testid="community-empty"
      >
        まだコミュニティに投稿がありません。最初のユーザーになりましょう！
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4" data-testid="community-list">
      {status.users.map((user) => (
        <li key={user.pubkey}>
          <UserCard user={user} />
        </li>
      ))}
    </ul>
  );
}

function UserCard({ user }: { user: CommunityUser }): JSX.Element {
  const banner = getBannerUrl(user);
  const picture = getPictureUrl(user);
  const name = getDisplayName(user);
  const href = `/community/${user.npub}`;
  const action = user.latestEvent.action;
  const crop = user.latestEvent.crop;
  const milestone = user.latestEvent.milestone;
  const rel = relativeJa(user.latestEvent.created_at);

  // 節目イベントなら emerald 系の太枠で「これは特別」と一目で分かるようにする。
  const cardClass = milestone
    ? "block overflow-hidden rounded-lg border-2 border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-200 hover:shadow"
    : "block overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm hover:shadow";

  return (
    <a
      href={href}
      className={cardClass}
      data-testid="community-card"
      data-milestone={milestone ?? undefined}
    >
      {/* 横長バナー: aspect-[3/1]、丸アイコンを下端に少し重ねる */}
      <div className="relative">
        <div
          className="aspect-[3/1] w-full bg-gradient-to-br from-emerald-300 to-emerald-600 bg-cover bg-center"
          style={banner ? { backgroundImage: `url(${banner})` } : undefined}
          data-testid="community-banner"
          data-has-banner={banner ? "true" : "false"}
          aria-hidden="true"
        />
        <div className="absolute left-4 -bottom-8 h-16 w-16 overflow-hidden rounded-full border-4 border-white bg-emerald-100">
          {picture ? (
            // banner と同じく picture は外部 URL。alt は表示名。
            <img
              src={picture}
              alt={name}
              className="h-full w-full object-cover"
              loading="lazy"
              data-testid="community-picture"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl">🌱</div>
          )}
        </div>
      </div>
      <div className="px-4 pt-10 pb-4 min-h-[44px]">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold text-neutral-900">{name}</div>
          {milestone && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white"
              data-testid="community-milestone-badge"
            >
              <span aria-hidden="true">{FARM_MILESTONE_ICONS[milestone]}</span>
              <span>{FARM_MILESTONE_LABELS_JA[milestone]}</span>
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-neutral-600">
          <span>
            {actionIcon(action)} {actionLabel(action)}
          </span>
          {crop && <span className="ml-1">— {crop}</span>}
          <span className="ml-2 text-neutral-400">{rel}</span>
        </div>
      </div>
    </a>
  );
}
