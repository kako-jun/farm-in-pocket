// offline-cache.ts のテスト (Issue: kako-jun/farm-in-pocket#42)

import type { GridRecord, PlantSummary } from "@farm-in-pocket/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CACHE_PREFIX,
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
});
