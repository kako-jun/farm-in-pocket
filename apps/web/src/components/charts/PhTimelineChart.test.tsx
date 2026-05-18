// PhTimelineChart テスト (Issue kako-jun/farm-in-pocket#24)

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PhTimelineChart from "./PhTimelineChart";

describe("PhTimelineChart", () => {
  it("空データの場合は placeholder「データなし」を表示する", () => {
    render(<PhTimelineChart data={[]} />);
    const empty = screen.getByTestId("fip-ph-chart-empty");
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain("データなし");
    // SVG は描画しない
    expect(screen.queryByTestId("fip-ph-chart")).toBeNull();
  });

  it("1 点のデータでは線は描かず点のみ描画する（path 要素なし）", () => {
    render(<PhTimelineChart data={[{ date: "2026-05-17", value: 6.5 }]} />);
    const svg = screen.getByTestId("fip-ph-chart");
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute("aria-label")).toContain("pH 時系列グラフ 1 件");
    // 1 点しか無いので折れ線 (path) は出ない
    expect(svg.querySelectorAll("path")).toHaveLength(0);
    // 点は 1 つ
    expect(screen.getByTestId("fip-ph-chart-point-0")).toBeInTheDocument();
  });

  it("複数点のデータでは折れ線(path)と各点(circle)を描画する", () => {
    const data = [
      { date: "2026-04-01", value: 5.0 },
      { date: "2026-04-15", value: 6.0 },
      { date: "2026-05-01", value: 6.5 },
      { date: "2026-05-17", value: 7.0 },
    ];
    render(<PhTimelineChart data={data} />);
    const svg = screen.getByTestId("fip-ph-chart");
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute("aria-label")).toContain("pH 時系列グラフ 4 件");
    // 折れ線 path が 1 本
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    // 各点が data 長 ぶん描画される
    for (let i = 0; i < data.length; i += 1) {
      expect(screen.getByTestId(`fip-ph-chart-point-${i}`)).toBeInTheDocument();
    }
    // x 軸ラベルは最初・中央・最後 (3 個)
    expect(screen.getByTestId("fip-ph-chart-xlabel-0")).toBeInTheDocument();
    expect(screen.getByTestId("fip-ph-chart-xlabel-3")).toBeInTheDocument();
  });

  it("retro #62: 同日複数点でも SVG circle が複数個描画される (中央に重ねる)", () => {
    const data = [
      { date: "2026-05-17", value: 5.5 },
      { date: "2026-05-17", value: 6.0 },
      { date: "2026-05-17", value: 6.5 },
    ];
    render(<PhTimelineChart data={data} />);
    const svg = screen.getByTestId("fip-ph-chart");
    expect(svg).toBeInTheDocument();
    // 全 3 点描画される
    const p0 = screen.getByTestId("fip-ph-chart-point-0");
    const p1 = screen.getByTestId("fip-ph-chart-point-1");
    const p2 = screen.getByTestId("fip-ph-chart-point-2");
    expect(p0).toBeInTheDocument();
    expect(p1).toBeInTheDocument();
    expect(p2).toBeInTheDocument();
    // 全点同日なので x 座標が一致する (中央に集まる)
    const x0 = Number(p0.getAttribute("cx") ?? "0");
    const x1 = Number(p1.getAttribute("cx") ?? "0");
    const x2 = Number(p2.getAttribute("cx") ?? "0");
    expect(x0).toBeCloseTo(x1, 5);
    expect(x1).toBeCloseTo(x2, 5);
  });

  it("retro #62: 日付差不均等な 3 点では x 位置が index 等間隔にならない", () => {
    // 0 日目 / 1 日目 / 30 日目 → 中央点は左寄り、index 等間隔だと中央に来てしまう
    const data = [
      { date: "2026-04-01", value: 5.0 },
      { date: "2026-04-02", value: 6.0 },
      { date: "2026-05-01", value: 7.0 },
    ];
    render(<PhTimelineChart data={data} />);
    const p0 = screen.getByTestId("fip-ph-chart-point-0");
    const p1 = screen.getByTestId("fip-ph-chart-point-1");
    const p2 = screen.getByTestId("fip-ph-chart-point-2");
    const x0 = Number(p0.getAttribute("cx") ?? "0");
    const x1 = Number(p1.getAttribute("cx") ?? "0");
    const x2 = Number(p2.getAttribute("cx") ?? "0");
    // 端は両端
    expect(x0).toBeLessThan(x1);
    expect(x1).toBeLessThan(x2);
    // index 等間隔なら (x0+x2)/2 == x1 になるはず。日付差ベースなら p1 は左寄り (x0 寄り)
    const midpointIfEvenSpaced = (x0 + x2) / 2;
    expect(x1).toBeLessThan(midpointIfEvenSpaced);
    // 具体的には p1 は p0 にかなり寄る (30 日中 1 日目 → 約 1/30)
    const span = x2 - x0;
    const offset = x1 - x0;
    expect(offset / span).toBeLessThan(0.1);
  });

  it("古い点ほど opacity が低く、最新点が最も濃い", () => {
    const data = [
      { date: "2026-01-01", value: 5.0 }, // 最も古い → 薄い
      { date: "2026-03-01", value: 6.0 },
      { date: "2026-05-17", value: 7.0 }, // 最新 → 濃い
    ];
    render(<PhTimelineChart data={data} />);
    const oldest = screen.getByTestId("fip-ph-chart-point-0");
    const newest = screen.getByTestId("fip-ph-chart-point-2");
    const oldestOpacity = Number(oldest.getAttribute("data-opacity") ?? "0");
    const newestOpacity = Number(newest.getAttribute("data-opacity") ?? "0");
    expect(oldestOpacity).toBeLessThan(newestOpacity);
    // 最新は 1.0 (完全不透明)
    expect(newestOpacity).toBeCloseTo(1, 5);
    // 最古は完全不透明より明確に薄い
    expect(oldestOpacity).toBeLessThan(0.7);
  });
});
