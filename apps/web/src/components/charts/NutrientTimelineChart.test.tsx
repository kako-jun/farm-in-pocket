// NutrientTimelineChart テスト (Issue kako-jun/farm-in-pocket#25)

import type { NutrientRecord } from "@farm-in-pocket/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NutrientTimelineChart from "./NutrientTimelineChart";

function makeRecord(
  over: Partial<NutrientRecord> & Pick<NutrientRecord, "appliedAt">,
): NutrientRecord {
  return {
    id: over.id ?? 1,
    cellId: over.cellId ?? 11,
    appliedAt: over.appliedAt,
    nutrientType: over.nutrientType ?? "nitrogen",
    materialId: over.materialId ?? null,
    amount: over.amount ?? null,
    amountUnit: over.amountUnit ?? null,
    note: over.note ?? null,
  };
}

describe("NutrientTimelineChart", () => {
  it("空データの場合は placeholder「データなし」を表示する", () => {
    render(<NutrientTimelineChart data={[]} />);
    const empty = screen.getByTestId("fip-nutrient-chart-empty");
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain("データなし");
    expect(screen.queryByTestId("fip-nutrient-chart")).toBeNull();
  });

  it("1 種類 1 件では点だけ描画され線(path)は出ない", () => {
    const data = [makeRecord({ id: 1, appliedAt: "2026-05-01", nutrientType: "nitrogen" })];
    render(<NutrientTimelineChart data={data} />);
    const svg = screen.getByTestId("fip-nutrient-chart");
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute("aria-label")).toContain("養分タイムライン 1 件");
    // 段は窒素 1 段だけ
    expect(screen.getByTestId("fip-nutrient-chart-row-nitrogen")).toBeInTheDocument();
    // 点 1 個
    expect(screen.getByTestId("fip-nutrient-chart-point-0")).toBeInTheDocument();
    // 1 点しかないので線は出ない
    expect(svg.querySelectorAll('[data-testid^="fip-nutrient-chart-line-"]')).toHaveLength(0);
  });

  it("複数 nutrient_type で段が分かれて表示される", () => {
    const data = [
      makeRecord({ id: 1, appliedAt: "2026-04-01", nutrientType: "nitrogen" }),
      makeRecord({ id: 2, appliedAt: "2026-04-15", nutrientType: "phosphorus" }),
      makeRecord({ id: 3, appliedAt: "2026-05-01", nutrientType: "potassium" }),
    ];
    render(<NutrientTimelineChart data={data} />);
    expect(screen.getByTestId("fip-nutrient-chart-row-nitrogen")).toBeInTheDocument();
    expect(screen.getByTestId("fip-nutrient-chart-row-phosphorus")).toBeInTheDocument();
    expect(screen.getByTestId("fip-nutrient-chart-row-potassium")).toBeInTheDocument();
    // 出現しない calcium 段は描画されない
    expect(screen.queryByTestId("fip-nutrient-chart-row-calcium")).toBeNull();
    // 各点それぞれ別の段 y 座標を持つ → cy を比べる
    const p0 = screen.getByTestId("fip-nutrient-chart-point-0");
    const p1 = screen.getByTestId("fip-nutrient-chart-point-1");
    const p2 = screen.getByTestId("fip-nutrient-chart-point-2");
    const cy0 = Number(p0.getAttribute("cy") ?? "0");
    const cy1 = Number(p1.getAttribute("cy") ?? "0");
    const cy2 = Number(p2.getAttribute("cy") ?? "0");
    // 3 段すべて違う y
    expect(cy0).not.toBe(cy1);
    expect(cy1).not.toBe(cy2);
    expect(cy0).not.toBe(cy2);
    // 各点はそれぞれの type で発色される (data-type で確認できる)
    expect(p0.getAttribute("data-type")).toBe("nitrogen");
    expect(p1.getAttribute("data-type")).toBe("phosphorus");
    expect(p2.getAttribute("data-type")).toBe("potassium");
  });

  it("retro #62/63: 同日同種類の点が 2 つあっても両方とも circle として描画される", () => {
    const data = [
      makeRecord({ id: 1, appliedAt: "2026-05-17", nutrientType: "nitrogen", amount: 10 }),
      makeRecord({ id: 2, appliedAt: "2026-05-17", nutrientType: "nitrogen", amount: 20 }),
    ];
    render(<NutrientTimelineChart data={data} />);
    // 2 点とも描画される (同日でも別 circle として出る)
    expect(screen.getByTestId("fip-nutrient-chart-point-0")).toBeInTheDocument();
    expect(screen.getByTestId("fip-nutrient-chart-point-1")).toBeInTheDocument();
    // 同 type で 2 点なので線が引かれる
    expect(screen.getByTestId("fip-nutrient-chart-line-nitrogen")).toBeInTheDocument();
  });

  it("同種類の点が複数あれば線で繋がる (path 描画)", () => {
    const data = [
      makeRecord({ id: 1, appliedAt: "2026-04-01", nutrientType: "nitrogen", amount: 30 }),
      makeRecord({ id: 2, appliedAt: "2026-04-15", nutrientType: "nitrogen", amount: 20 }),
      makeRecord({ id: 3, appliedAt: "2026-05-01", nutrientType: "nitrogen", amount: 10 }),
      // 別 type は 1 件なので線にならない
      makeRecord({ id: 4, appliedAt: "2026-04-20", nutrientType: "potassium" }),
    ];
    render(<NutrientTimelineChart data={data} />);
    // nitrogen は 3 点 → 線が引かれる
    expect(screen.getByTestId("fip-nutrient-chart-line-nitrogen")).toBeInTheDocument();
    // potassium は 1 点 → 線は無い
    expect(screen.queryByTestId("fip-nutrient-chart-line-potassium")).toBeNull();
    // 投入点は 4 個
    expect(screen.getByTestId("fip-nutrient-chart-point-0")).toBeInTheDocument();
    expect(screen.getByTestId("fip-nutrient-chart-point-3")).toBeInTheDocument();
    // aria-label に YYYY-MM-DD と type と量が入る
    const p0 = screen.getByTestId("fip-nutrient-chart-point-0");
    const label0 = p0.getAttribute("aria-label") ?? "";
    expect(label0).toContain("2026-04-01");
    expect(label0).toContain("nitrogen");
    expect(label0).toContain("30");
  });
});
