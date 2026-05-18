// PlantDetail (Issue: kako-jun/farm-in-pocket#38)
//
// `/plants/:id` ページ本体。React island。
//
// 内容:
//  - 植物情報（科・属・カテゴリ・タグ・説明・サムネ）
//  - 「マイ畑に植える」ボタン → /grid?plantId=... へ遷移（GridEditor 側で拾う）
//  - 関連する種・苗（GET /api/plants/:id/seed-products）
//  - この植物を育てているユーザー一覧（GET /api/plants/:id/users + mypace bulk profile）
//
// プロフィール（display_name / picture）は mypace の bulk profile API で取りに行く。
// 失敗してもユーザーリストは pubkey ベースで描画し続ける（graceful fallback）。

import {
  type NostrProfile,
  type PlantUserRecord,
  RANKING_VOTABLE_SLUGS,
  SEED_PRODUCT_TYPE_LABELS_JA,
  type SeedProductRecord,
  type PlantDetail as TPlantDetail,
  encodeNpub,
  hexToBytes,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { fetchPlant, fetchPlantSeedProducts, fetchPlantUsers } from "../lib/grid-api";
import { createMypaceClient } from "../lib/mypace";
import RankingList from "./RankingList";

interface PlantDetailProps {
  plantId: number;
}

type DetailStatus =
  | { kind: "loading" }
  | { kind: "ready"; plant: TPlantDetail }
  | { kind: "error"; message: string };

interface UserView {
  pubkey: string;
  npub: string;
  profile: NostrProfile | null;
  plantingCount: number;
  lastPlantedAt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  vegetable: "野菜",
  fruit: "果物",
  flower: "花",
  herb: "ハーブ",
  houseplant: "観葉",
  bulb: "球根",
  succulent: "多肉",
  other: "その他",
};

function tryEncodeNpub(hex: string): string {
  try {
    return encodeNpub(hexToBytes(hex));
  } catch {
    return "";
  }
}

function pickDisplayName(profile: NostrProfile | null, fallbackHex: string): string {
  if (profile?.display_name) return profile.display_name;
  if (profile?.name) return profile.name;
  return `${fallbackHex.slice(0, 8)}…`;
}

export default function PlantDetail(props: PlantDetailProps): JSX.Element {
  const { plantId } = props;
  const [detail, setDetail] = useState<DetailStatus>({ kind: "loading" });
  const [products, setProducts] = useState<SeedProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [users, setUsers] = useState<UserView[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // 植物本体
  useEffect(() => {
    let cancelled = false;
    setDetail({ kind: "loading" });
    fetchPlant(plantId)
      .then((plant) => {
        if (cancelled) return;
        setDetail({ kind: "ready", plant });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDetail({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  // 種・苗
  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    fetchPlantSeedProducts(plantId)
      .then((list) => {
        if (cancelled) return;
        setProducts(list);
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  // 育てているユーザー（+ mypace bulk profile）
  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    fetchPlantUsers(plantId)
      .then(async (records: PlantUserRecord[]) => {
        if (records.length === 0) {
          if (!cancelled) setUsers([]);
          return;
        }
        let profilesMap: Record<string, NostrProfile> = {};
        try {
          const client = createMypaceClient();
          profilesMap = await client.getProfiles(records.map((r) => r.pubkey));
        } catch {
          profilesMap = {};
        }
        const merged: UserView[] = records.map((r) => ({
          pubkey: r.pubkey,
          npub: tryEncodeNpub(r.pubkey),
          profile: profilesMap[r.pubkey] ?? null,
          plantingCount: r.plantingCount,
          lastPlantedAt: r.lastPlantedAt,
        }));
        if (!cancelled) setUsers(merged);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  if (detail.kind === "loading") {
    return (
      <div
        data-testid="fip-plant-detail-loading"
        className="py-6 text-center text-sm text-neutral-500"
      >
        読み込み中…
      </div>
    );
  }
  if (detail.kind === "error") {
    return (
      <div
        data-testid="fip-plant-detail-error"
        className="rounded border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800"
      >
        植物情報を取得できませんでした: {detail.message}
        <div className="mt-2">
          <a href="/plants" className="text-emerald-700 hover:underline">
            ← 一覧に戻る
          </a>
        </div>
      </div>
    );
  }

  const plant = detail.plant;
  const categoryLabel = CATEGORY_LABELS[plant.category] ?? plant.category;

  return (
    <div data-testid="fip-plant-detail" className="space-y-5">
      {/* ヘッダ */}
      <section className="space-y-2 rounded border border-neutral-200 bg-white p-4">
        <div className="flex gap-3">
          {plant.thumbnailUrl && (
            <img
              src={plant.thumbnailUrl}
              alt={plant.name}
              data-testid="fip-plant-detail-thumb"
              className="h-20 w-20 rounded object-cover"
            />
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold text-neutral-900" data-testid="fip-plant-detail-name">
              {plant.name}
            </h2>
            {plant.nameEn && (
              <p className="text-sm text-neutral-500" data-testid="fip-plant-detail-name-en">
                {plant.nameEn}
              </p>
            )}
            <ul className="mt-2 space-y-0.5 text-xs text-neutral-700">
              <li>
                <span className="text-neutral-500">科:</span>{" "}
                <span data-testid="fip-plant-detail-family">{plant.family}</span>
              </li>
              {plant.genus && (
                <li>
                  <span className="text-neutral-500">属:</span>{" "}
                  <span data-testid="fip-plant-detail-genus">{plant.genus}</span>
                </li>
              )}
              <li>
                <span className="text-neutral-500">カテゴリ:</span>{" "}
                <span data-testid="fip-plant-detail-category">{categoryLabel}</span>
              </li>
            </ul>
            {plant.tags.length > 0 && (
              <ul
                data-testid="fip-plant-detail-tags"
                className="mt-2 flex flex-wrap gap-1 text-[10px]"
              >
                {plant.tags.map((t) => (
                  <li
                    key={t}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {plant.description && (
          <p
            data-testid="fip-plant-detail-description"
            className="whitespace-pre-line text-sm text-neutral-700"
          >
            {plant.description}
          </p>
        )}
        <div>
          <a
            href={`/grid?plantId=${plant.id}`}
            data-testid="fip-plant-detail-plant-to-my-grid"
            className="inline-block rounded border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            🌱 マイ畑に植える
          </a>
        </div>
      </section>

      {/* 種・苗 */}
      <section className="space-y-2 rounded border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-700">関連する種・苗</h3>
        {productsLoading ? (
          <p data-testid="fip-plant-detail-products-loading" className="text-xs text-neutral-500">
            読み込み中…
          </p>
        ) : products.length === 0 ? (
          <p data-testid="fip-plant-detail-products-empty" className="text-xs text-neutral-500">
            まだ登録されていません。
          </p>
        ) : (
          <ul data-testid="fip-plant-detail-products" className="space-y-1">
            {products.map((p) => (
              <li
                key={p.id}
                data-testid={`fip-plant-detail-product-${p.id}`}
                className="rounded border border-neutral-100 px-2 py-1 text-xs"
              >
                <span className="font-medium text-neutral-800">{p.name}</span>
                {p.brand && <span className="ml-1 text-neutral-500">({p.brand})</span>}
                <span className="ml-2 text-[10px] text-neutral-500">
                  {SEED_PRODUCT_TYPE_LABELS_JA[p.type] ?? p.type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ランキング順位（Issue #39） */}
      <section
        data-testid="fip-plant-detail-rankings"
        className="space-y-3 rounded border border-neutral-200 bg-white p-4"
      >
        <h3 className="text-sm font-semibold text-neutral-700">ランキング順位</h3>
        <p className="text-[10px] text-neutral-500">
          5 種類のテーマ別ランキング + 自動算出の植物難易度。投票ボタンで応援できます（1 植物 1
          票）。
        </p>
        <div className="space-y-4">
          {RANKING_VOTABLE_SLUGS.map((slug) => (
            <RankingList key={slug} slug={slug} limit={10} highlightPlantId={plant.id} />
          ))}
          <RankingList slug="auto-difficulty" limit={10} highlightPlantId={plant.id} />
        </div>
      </section>

      {/* 育てているユーザー */}
      <section className="space-y-2 rounded border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-700">この植物を育てているユーザー</h3>
        {usersLoading ? (
          <p data-testid="fip-plant-detail-users-loading" className="text-xs text-neutral-500">
            読み込み中…
          </p>
        ) : users.length === 0 ? (
          <p data-testid="fip-plant-detail-users-empty" className="text-xs text-neutral-500">
            まだ誰も育てていません。最初の一人になりませんか？
          </p>
        ) : (
          <ul data-testid="fip-plant-detail-users" className="space-y-2">
            {users.map((u) => {
              const name = pickDisplayName(u.profile, u.pubkey);
              const href = u.npub ? `/community/${u.npub}` : "#";
              return (
                <li key={u.pubkey} data-testid={`fip-plant-detail-user-${u.pubkey}`}>
                  <a
                    href={href}
                    className="flex items-center gap-2 rounded border border-neutral-100 p-2 text-xs hover:bg-emerald-50"
                  >
                    {u.profile?.picture ? (
                      <img
                        src={u.profile.picture}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="inline-block h-8 w-8 rounded-full bg-emerald-200" />
                    )}
                    <span className="flex-1 truncate font-medium text-neutral-800">{name}</span>
                    <span className="text-[10px] text-neutral-500">
                      {u.plantingCount}件{u.lastPlantedAt && ` · ${u.lastPlantedAt}`}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
