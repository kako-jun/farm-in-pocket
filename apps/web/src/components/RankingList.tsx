// Issue: kako-jun/farm-in-pocket#39
//
// テーマ別ランキング表示 + 投票ボタン。
//
// 投票テーマ slug (fun-to-grow / beginner-friendly / difficult /
// balcony-friendly / indoor-photogenic) と、自動算出の `auto-difficulty` を
// 同じコンポーネントで扱う。auto-difficulty は投票口を持たず、失敗率を表示する。
//
// 投票ボタンは secret key 保有時のみ active。未保有なら "鍵を作成すると投票できます"。

import {
  type DifficultyRecord,
  RANKING_LABELS_JA,
  type RankingEntry,
  type RankingSlug,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { fetchRanking, voteRanking } from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";

interface RankingListProps {
  slug: RankingSlug;
  limit?: number;
  /** PlantDetail から渡される場合のみ。指定すると「この植物に投票」ボタンを出す */
  highlightPlantId?: number;
}

type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

export default function RankingList(props: RankingListProps): JSX.Element {
  const { slug, limit = 20, highlightPlantId } = props;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [entries, setEntries] = useState<RankingEntry[] | DifficultyRecord[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [voting, setVoting] = useState(false);
  const [voteMessage, setVoteMessage] = useState<string | null>(null);

  useEffect(() => {
    setHasKey(getMyKeyPair() !== null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchRanking(slug, limit)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setState({ kind: "ready" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, limit]);

  async function handleVote(plantId: number): Promise<void> {
    if (voting) return;
    if (slug === "auto-difficulty") return;
    const kp = getMyKeyPair();
    if (kp === null) {
      setVoteMessage("鍵が未作成です。設定から鍵を作ると投票できます。");
      return;
    }
    setVoting(true);
    setVoteMessage(null);
    try {
      const r = await voteRanking(slug, plantId, kp.pubkey);
      if (r.alreadyVoted) {
        setVoteMessage("既に投票済みです。1 植物 1 票です。");
      } else {
        setVoteMessage("投票しました！");
      }
      // 再取得
      const res = await fetchRanking(slug, limit);
      setEntries(res.entries);
    } catch (e: unknown) {
      setVoteMessage(`投票に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVoting(false);
    }
  }

  const label = RANKING_LABELS_JA[slug];

  if (state.kind === "loading") {
    return (
      <div data-testid={`fip-ranking-${slug}-loading`} className="text-xs text-neutral-500">
        読み込み中…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div
        data-testid={`fip-ranking-${slug}-error`}
        className="rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"
      >
        ランキング取得に失敗しました: {state.message}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div data-testid={`fip-ranking-${slug}-empty`} className="text-xs text-neutral-500">
        まだ投票がありません。最初の一票を入れませんか？
      </div>
    );
  }

  // auto-difficulty 用と投票テーマ用で表示を分岐
  const isAuto = slug === "auto-difficulty";

  return (
    <div data-testid={`fip-ranking-${slug}`} className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-700">{label}</h3>
      {voteMessage && (
        <p
          data-testid={`fip-ranking-${slug}-vote-msg`}
          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
        >
          {voteMessage}
        </p>
      )}
      <ol className="space-y-1">
        {entries.map((entry) => {
          if (isAuto) {
            const e = entry as DifficultyRecord;
            return (
              <li
                key={`${slug}-${e.plantId}`}
                data-testid={`fip-ranking-${slug}-entry-${e.plantId}`}
                className="flex items-center justify-between rounded border border-neutral-100 px-2 py-1 text-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="w-6 text-right font-mono text-neutral-500">{e.rank}.</span>
                  <a
                    href={`/plants/${e.plantId}`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {e.plantName ?? `#${e.plantId}`}
                  </a>
                </span>
                <span className="text-[10px] text-neutral-500">
                  失敗率 {e.failureRate === null ? "—" : `${Math.round(e.failureRate * 100)}%`} (
                  {e.failed}/{e.total})
                </span>
              </li>
            );
          }
          const e = entry as RankingEntry;
          const canVote = hasKey && !voting;
          const isHighlight = highlightPlantId !== undefined && e.plantId === highlightPlantId;
          return (
            <li
              key={`${slug}-${e.plantId}`}
              data-testid={`fip-ranking-${slug}-entry-${e.plantId}`}
              className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                isHighlight ? "border-emerald-300 bg-emerald-50" : "border-neutral-100"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-6 text-right font-mono text-neutral-500">{e.rank}.</span>
                <a
                  href={`/plants/${e.plantId}`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  {e.plantName ?? `#${e.plantId}`}
                </a>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-500">{e.score} 票</span>
                <button
                  type="button"
                  data-testid={`fip-ranking-${slug}-vote-${e.plantId}`}
                  disabled={!canVote}
                  onClick={() => handleVote(e.plantId)}
                  className={`rounded border px-2 py-0.5 text-[10px] ${
                    canVote
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-neutral-200 bg-neutral-50 text-neutral-400"
                  }`}
                >
                  投票
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {!hasKey && !isAuto && (
        <p data-testid={`fip-ranking-${slug}-no-key`} className="text-[10px] text-neutral-500">
          鍵を作成すると投票できます（設定 → アカウント）。
        </p>
      )}
    </div>
  );
}
