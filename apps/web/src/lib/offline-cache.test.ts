// offline-cache.ts のテスト (Issue: kako-jun/farm-in-pocket#42, #80)

import type { GridRecord, PlantSummary } from "@farm-in-pocket/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CACHE_PREFIX,
  CACHE_TTL_MS,
  cacheGrids,
  cachePlants,
  loadCachedGrids,
  loadCachedPlants,
} from "./offline-cache";

const PUBKEY = "a".repeat(64);

function mkGrid(id: string): GridRecord {
  return {
    id,
    userPubkey: PUBKEY,
    name: `grid-${id}`,
    environment: "outdoor_sunny",
    lighting: null,
    sizeX: 3,
    sizeY: 3,
    sortOrder: 0,
    archivedAt: null,
    cells: [],
  };
}

describe("offline-cache (grids / plants)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("cacheGrids → loadCachedGrids でラウンドトリップする (pubkey スコープ)", () => {
    const grids = [mkGrid("g1"), mkGrid("g2")];
    cacheGrids(PUBKEY, grids);
    const loaded = loadCachedGrids(PUBKEY);
    expect(loaded).toEqual(grids);
    // 別 pubkey は分離
    expect(loadCachedGrids("b".repeat(64))).toBeNull();
    // 保存先キーは fip:cache:grids:<pubkey>
    expect(localStorage.getItem(`${CACHE_PREFIX}grids:${PUBKEY}`)).not.toBeNull();
  });

  it("cachePlants → loadCachedPlants でラウンドトリップする (グローバル)", () => {
    const plants: PlantSummary[] = [
      { id: 1, name: "トマト", nameEn: "Tomato", family: "ナス科", category: "vegetable" },
      { id: 2, name: "ナス", nameEn: "Eggplant", family: "ナス科", category: "vegetable" },
    ];
    cachePlants(plants);
    expect(loadCachedPlants()).toEqual(plants);
  });

  it("壊れた JSON は null を返す", () => {
    localStorage.setItem(`${CACHE_PREFIX}grids:${PUBKEY}`, "{not json");
    expect(loadCachedGrids(PUBKEY)).toBeNull();
    localStorage.setItem(`${CACHE_PREFIX}plants`, "[not json");
    expect(loadCachedPlants()).toBeNull();
  });

  // SHOULD-2: TTL（7 日）超過したキャッシュは null を返す
  it("CACHE_TTL_MS を超えたエンベロープは null を返し、該当キーは削除される", () => {
    const oldAt = Date.now() - CACHE_TTL_MS - 1;
    const envelope = { at: oldAt, value: [mkGrid("g1")] };
    const key = `${CACHE_PREFIX}grids:${PUBKEY}`;
    localStorage.setItem(key, JSON.stringify(envelope));
    expect(loadCachedGrids(PUBKEY)).toBeNull();
    // 期限切れは消えている
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("CACHE_TTL_MS ぎりぎり以内のエンベロープは読める", () => {
    const at = Date.now() - (CACHE_TTL_MS - 60_000);
    const grids = [mkGrid("g-fresh")];
    const envelope = { at, value: grids };
    localStorage.setItem(`${CACHE_PREFIX}grids:${PUBKEY}`, JSON.stringify(envelope));
    expect(loadCachedGrids(PUBKEY)).toEqual(grids);
  });

  // SHOULD-2: 旧形式（直接 array）は最初の read で新形式に migration される
  it("旧形式（直接 array）は 1 回読めて、内部で新形式に書き直される", () => {
    const grids = [mkGrid("legacy")];
    // 旧形式: エンベロープを介さず生の array が入っている
    localStorage.setItem(`${CACHE_PREFIX}grids:${PUBKEY}`, JSON.stringify(grids));
    expect(loadCachedGrids(PUBKEY)).toEqual(grids);
    // migration されてエンベロープになっている
    const after = localStorage.getItem(`${CACHE_PREFIX}grids:${PUBKEY}`);
    expect(after).not.toBeNull();
    const parsed = JSON.parse(after ?? "{}");
    expect(typeof parsed.at).toBe("number");
    expect(parsed.value).toEqual(grids);
  });
});
