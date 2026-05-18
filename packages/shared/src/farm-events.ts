// 作業記録 Nostr イベントの組み立て（pure 関数）。
//
// Issue: kako-jun/farm-in-pocket#16
// 入力 → 署名前イベント（pubkey 抜き、kind=1）を生成する。署名は signEvent 側に任せる。
// タグ仕様:
//   ["t", "mypace"]                                … mypace タイムライン参加（kako-jun 製アプリの投稿は
//                                                    mypace の1投稿として発行して、mypace 上で入り混じって
//                                                    賑わわせる設計。rate limit / serial / sitemap 連携の入口）
//   ["t", "farm-in-pocket"]                       … farm-in-pocket 識別用ハッシュタグ
//   ["farm-action", <FarmAction>]                  … 作業種別（必須）
//   ["farm-crop", <name>]                          … 作物名（任意）
//   ["farm-cell", <gridId>, <x>, <y>]              … 紐付け先セル（全部揃ったときだけ）
//   ["image", <url>] *N                            … 添付写真（#17 で増える）

import type { FarmAction } from "./farm";
import type { UnsignedNostrEvent } from "./mypace/types";

export interface BuildWorkRecordEventInput {
  action: FarmAction;
  content: string;
  gridId?: string | null;
  cellX?: number | null;
  cellY?: number | null;
  cropName?: string | null;
  imageUrls?: string[];
  /** 省略時は `Math.floor(Date.now() / 1000)`。テストでは固定値を渡す。 */
  createdAt?: number;
}

/**
 * 署名前イベントを返す。`pubkey` は signEvent 側で secretKey から導出されるためここでは含めない。
 */
export function buildWorkRecordEvent(
  input: BuildWorkRecordEventInput,
): Omit<UnsignedNostrEvent, "pubkey"> {
  const tags: string[][] = [
    ["t", "mypace"], // mypace タイムライン参加（rate limit / serial / sitemap 連携の入口）
    ["t", "farm-in-pocket"], // farm-in-pocket 識別用
    ["farm-action", input.action],
  ];

  if (typeof input.cropName === "string" && input.cropName.length > 0) {
    tags.push(["farm-crop", input.cropName]);
  }

  // farm-cell は gridId / cellX / cellY が3つ揃ったときだけ追加する（部分指定は壊れた tag になるため捨てる）
  if (
    typeof input.gridId === "string" &&
    input.gridId.length > 0 &&
    typeof input.cellX === "number" &&
    Number.isFinite(input.cellX) &&
    typeof input.cellY === "number" &&
    Number.isFinite(input.cellY)
  ) {
    tags.push(["farm-cell", input.gridId, String(input.cellX), String(input.cellY)]);
  }

  if (input.imageUrls && input.imageUrls.length > 0) {
    for (const url of input.imageUrls) {
      if (typeof url === "string" && url.length > 0) {
        tags.push(["image", url]);
      }
    }
  }

  const createdAt =
    typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
      ? Math.floor(input.createdAt)
      : Math.floor(Date.now() / 1000);

  return {
    kind: 1,
    created_at: createdAt,
    tags,
    content: input.content,
  };
}
