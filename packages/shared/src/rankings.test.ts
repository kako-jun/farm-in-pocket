// Issue: kako-jun/farm-in-pocket#39
import { describe, expect, it } from "vitest";
import {
  RANKING_LABELS_JA,
  RANKING_SLUGS,
  RANKING_VOTABLE_SLUGS,
  isRankingSlug,
  plantIdFromRankingName,
  rankingNameForPlant,
} from "./rankings";

describe("rankings", () => {
  it("RANKING_SLUGS は 5 投票テーマ + auto-difficulty の 6 件、全てに日本語ラベルが揃う", () => {
    expect(RANKING_SLUGS).toHaveLength(6);
    expect(RANKING_VOTABLE_SLUGS).toHaveLength(5);
    expect(RANKING_VOTABLE_SLUGS).not.toContain("auto-difficulty");
    for (const slug of RANKING_SLUGS) {
      expect(typeof RANKING_LABELS_JA[slug]).toBe("string");
      expect(RANKING_LABELS_JA[slug].length).toBeGreaterThan(0);
    }
  });

  it("rankingNameForPlant / plantIdFromRankingName は往復する。不正入力は null", () => {
    expect(rankingNameForPlant(42)).toBe("p42");
    expect(plantIdFromRankingName("p42")).toBe(42);
    expect(plantIdFromRankingName("x42")).toBeNull();
    expect(plantIdFromRankingName("p")).toBeNull();
    expect(plantIdFromRankingName("p0")).toBeNull();
    expect(isRankingSlug("fun-to-grow")).toBe(true);
    expect(isRankingSlug("not-a-slug")).toBe(false);
  });
});
