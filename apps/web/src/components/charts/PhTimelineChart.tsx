// PhTimelineChart: pH 測定値の時系列折れ線グラフ (Issue #24 + #26 fade 統一 + retro #62 x 軸時系列)
//
// 設計方針:
//   - 外部ライブラリ非依存。SVG だけで描く。バンドル軽量。Astro + React 19 と互換。
//   - props: data (date, value の配列。呼び出し側で measured_at 昇順を保証する想定)
//   - 古いデータほど点の opacity が低い → Issue #26 の fadeOpacity("ph") に統一。
//     経過日数（now との差）から opacity を決め、index ベースの 0.35〜1.0 補間はやめる。
//   - y 軸は pH 0-14 固定、4 / 7 / 10 にガイドライン
//   - x 軸は **日付差ベース** (retro #62)。配列 index 等間隔だと「3 日間隔」と「30 日間隔」が
//     視覚的に同じになり、時系列の意味が消える。1 点のみ・全点同日は中央に集める。
//   - x 軸ラベルは最初・中央・最後の最大 3 点
//   - データ 0 件なら placeholder「データなし」を表示
//   - responsive: width 100% / viewBox

import { daysSince, fadeOpacity } from "@farm-in-pocket/shared";
import type { JSX } from "react";

export interface PhTimelinePoint {
  date: string;
  value: number;
}

export interface PhTimelineChartProps {
  data: PhTimelinePoint[];
  height?: number;
}

// viewBox の論理座標系。実描画は SVG の preserveAspectRatio で伸縮。
const VB_W = 600;
const VB_PADDING_LEFT = 36; // y 軸ラベル分
const VB_PADDING_RIGHT = 12;
const VB_PADDING_TOP = 12;
const VB_PADDING_BOTTOM = 28; // x 軸ラベル分

const PH_MIN = 0;
const PH_MAX = 14;
const GUIDE_VALUES = [4, 7, 10];

function valueToY(value: number, plotTop: number, plotBottom: number): number {
  const ratio = (value - PH_MIN) / (PH_MAX - PH_MIN);
  return plotBottom - ratio * (plotBottom - plotTop);
}

// retro #62: 日付差ベースで x 座標を決める。
// - data 0/1 件は呼び出し側で除外済み (1 件のみは中央に置きたいので span=0 経路で扱う)
// - 全点同日 (span=0) も中央に集める
function dateToXByMs(
  ms: number,
  minMs: number,
  span: number,
  plotLeft: number,
  plotRight: number,
): number {
  if (span <= 0) return (plotLeft + plotRight) / 2;
  return plotLeft + ((ms - minMs) / span) * (plotRight - plotLeft);
}

function parseDateMs(s: string): number {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/**
 * 古いほど薄く、新しいほど濃い opacity を返す。
 * Issue #26: shared/fade の "ph" スケジュールに統一（1 ヶ月以内 1.0 / 3 ヶ月 0.5 / 6 ヶ月以上 0.2）。
 * date が parse 不能なら最も薄い値に倒れる。
 */
function opacityFor(date: string): number {
  return fadeOpacity(daysSince(date), "ph");
}

export default function PhTimelineChart(props: PhTimelineChartProps): JSX.Element {
  const { data, height = 160 } = props;

  if (data.length === 0) {
    return (
      <div
        data-testid="fip-ph-chart-empty"
        className="flex h-32 items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-400"
        aria-label="pH 時系列グラフ 0 件"
      >
        データなし
      </div>
    );
  }

  // viewBox 高さ: width 600 に対して height/width 比で算出（responsive）
  // ただし viewBox は固定の縦横比にしておく方が SVG として扱いやすい。height は外側で固定 px、内部は preserveAspectRatio="none" で伸縮。
  const VB_H = 200;
  const plotLeft = VB_PADDING_LEFT;
  const plotRight = VB_W - VB_PADDING_RIGHT;
  const plotTop = VB_PADDING_TOP;
  const plotBottom = VB_H - VB_PADDING_BOTTOM;

  const total = data.length;
  // retro #62: x 軸を日付差ベースにする。配列 index 等間隔だと「3 日差」と「30 日差」が同じに見え、
  // 時系列の意味が崩れる。
  const msList = data.map((p) => parseDateMs(p.date));
  const minMs = msList.length > 0 ? Math.min(...msList) : 0;
  const maxMs = msList.length > 0 ? Math.max(...msList) : 0;
  const span = maxMs - minMs;
  const points = data.map((p, i) => ({
    x: dateToXByMs(msList[i] ?? 0, minMs, span, plotLeft, plotRight),
    y: valueToY(p.value, plotTop, plotBottom),
    opacity: opacityFor(p.date),
    date: p.date,
    value: p.value,
  }));

  // 折れ線パス (1 点しかなければ生成しない)
  const pathD =
    points.length >= 2
      ? points
          .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
          .join(" ")
      : null;

  // x 軸ラベル: 最初・中央・最後 (1-2 点なら全部出す)
  const labelIdxs: number[] =
    total === 1 ? [0] : total === 2 ? [0, 1] : [0, Math.floor((total - 1) / 2), total - 1];

  return (
    <svg
      data-testid="fip-ph-chart"
      role="img"
      aria-label={`pH 時系列グラフ ${total} 件`}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      style={{ display: "block" }}
    >
      {/* y 軸ガイドライン (4 / 7 / 10) */}
      {GUIDE_VALUES.map((g) => {
        const y = valueToY(g, plotTop, plotBottom);
        return (
          <g key={`guide-${g}`}>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text x={plotLeft - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
              {g}
            </text>
          </g>
        );
      })}

      {/* x 軸 / y 軸ベースライン */}
      <line
        x1={plotLeft}
        x2={plotRight}
        y1={plotBottom}
        y2={plotBottom}
        stroke="#d4d4d8"
        strokeWidth={1}
      />
      <line
        x1={plotLeft}
        x2={plotLeft}
        y1={plotTop}
        y2={plotBottom}
        stroke="#d4d4d8"
        strokeWidth={1}
      />

      {/* 折れ線 */}
      {pathD && (
        <path
          d={pathD}
          fill="none"
          stroke="#059669"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* 各データ点 */}
      {points.map((pt, i) => (
        <circle
          key={`pt-${i}-${pt.date}`}
          data-testid={`fip-ph-chart-point-${i}`}
          data-opacity={pt.opacity.toFixed(2)}
          cx={pt.x}
          cy={pt.y}
          r={3.5}
          fill="#059669"
          opacity={pt.opacity}
        />
      ))}

      {/* x 軸ラベル */}
      {labelIdxs.map((idx) => {
        const pt = points[idx];
        if (!pt) return null;
        return (
          <text
            key={`xlabel-${idx}`}
            data-testid={`fip-ph-chart-xlabel-${idx}`}
            x={pt.x}
            y={plotBottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill="#737373"
          >
            {pt.date}
          </text>
        );
      })}
    </svg>
  );
}
