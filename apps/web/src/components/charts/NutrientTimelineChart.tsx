// NutrientTimelineChart: 養分投入の時系列タイムライン (Issue kako-jun/farm-in-pocket#25)
//
// 設計方針:
//   - 外部ライブラリ非依存。SVG だけで描く。Astro + React 19 と互換、バンドル軽量。
//   - 養分タイプ (nutrient_type) ごとに「段」を割り当て、その段に投入イベントを ● で打つ。
//     量を積み上げる累積グラフではなく、「いつ何を入れたか」が一目で分かるドットマップ。
//   - 同じ nutrient_type の点は薄い線で繋ぐ（最終投入が縦軸位置の端から目で追える）。
//   - 横軸は applied_at の最小〜最大。1 件しかなければ中央に置く。
//   - props: data (NutrientRecord[]、順不同で渡されてもよい。内部で applied_at 昇順に並べる)
//   - 0 件なら「データなし」placeholder。
//   - responsive: width 100% / viewBox + preserveAspectRatio="none"。

import type { NutrientRecord, NutrientType } from "@farm-in-pocket/shared";
import { NUTRIENT_COLORS, daysSince, fadeOpacity } from "@farm-in-pocket/shared";
import type { JSX } from "react";

export interface NutrientTimelineChartProps {
  data: NutrientRecord[];
  height?: number;
}

// 段順 (左に並ぶ凡例の上から下への並び順)。NUTRIENT_COLORS と一致させる。
// CellDetail の NUTRIENT_LABELS と同じ順を採用すると視線移動が安定する。
const NUTRIENT_ORDER: readonly NutrientType[] = [
  "nitrogen",
  "phosphorus",
  "potassium",
  "calcium",
  "magnesium",
  "sulfur",
  "iron",
  "manganese",
  "zinc",
  "boron",
  "organic",
  "other",
];

const NUTRIENT_SHORT_LABELS: Record<NutrientType, string> = {
  nitrogen: "N",
  phosphorus: "P",
  potassium: "K",
  calcium: "Ca",
  magnesium: "Mg",
  sulfur: "S",
  iron: "Fe",
  manganese: "Mn",
  zinc: "Zn",
  boron: "B",
  organic: "有機",
  other: "他",
};

// viewBox 設計。x: 0..VB_W, y: 0..VB_H。
const VB_W = 600;
const VB_PADDING_LEFT = 44; // 左の凡例 (N/P/K…) を置くスペース
const VB_PADDING_RIGHT = 12;
const VB_PADDING_TOP = 12;
const VB_PADDING_BOTTOM = 28; // x 軸日付ラベル

const POINT_RADIUS = 6;

function dateMs(s: string): number {
  // appliedAt が "YYYY-MM-DD" でも "YYYY-MM-DDTHH:MM:SSZ" でも数値に倒す
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function dateLabel(s: string): string {
  return s.slice(0, 10);
}

export default function NutrientTimelineChart(props: NutrientTimelineChartProps): JSX.Element {
  const { data, height = 220 } = props;

  if (data.length === 0) {
    return (
      <div
        data-testid="fip-nutrient-chart-empty"
        className="flex h-32 items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-400"
        aria-label="養分タイムライン 0 件"
      >
        データなし
      </div>
    );
  }

  // applied_at 昇順に並べたコピー (呼び出し側の配列を変更しない)
  const sorted = [...data].sort((a, b) => dateMs(a.appliedAt) - dateMs(b.appliedAt));
  const firstRec = sorted[0];
  const lastRec = sorted[sorted.length - 1];
  if (!firstRec || !lastRec) {
    // data.length === 0 はすでに上で弾いているので実質ここには来ない
    return (
      <div data-testid="fip-nutrient-chart-empty" aria-label="養分タイムライン 0 件">
        データなし
      </div>
    );
  }

  // 出現した nutrient_type だけを段として使う (使わない種類で段を消費しない)。
  // NUTRIENT_ORDER の順で並べる → 安定した順序になる。
  const usedTypesSet = new Set<NutrientType>();
  for (const rec of sorted) {
    usedTypesSet.add(rec.nutrientType);
  }
  const usedTypes: NutrientType[] = NUTRIENT_ORDER.filter((t) => usedTypesSet.has(t));

  // 段ごとの y 座標を均等配置。1 段なら中央 1 行。
  const VB_H = Math.max(120, VB_PADDING_TOP + VB_PADDING_BOTTOM + usedTypes.length * 24);
  const plotLeft = VB_PADDING_LEFT;
  const plotRight = VB_W - VB_PADDING_RIGHT;
  const plotTop = VB_PADDING_TOP;
  const plotBottom = VB_H - VB_PADDING_BOTTOM;

  const rowYFor = (typeIdx: number): number => {
    if (usedTypes.length === 1) return (plotTop + plotBottom) / 2;
    return plotTop + (typeIdx / (usedTypes.length - 1)) * (plotBottom - plotTop);
  };

  // 横軸: applied_at の最小〜最大の範囲。同日なら中央に集める。
  const minMs = dateMs(firstRec.appliedAt);
  const maxMs = dateMs(lastRec.appliedAt);
  const span = maxMs - minMs;
  const xFor = (ms: number): number => {
    if (span <= 0) return (plotLeft + plotRight) / 2;
    return plotLeft + ((ms - minMs) / span) * (plotRight - plotLeft);
  };

  // 各 type → その type の点列 (時系列昇順)
  const pointsByType: Record<string, { x: number; y: number; rec: NutrientRecord }[]> = {};
  for (const rec of sorted) {
    const typeIdx = usedTypes.indexOf(rec.nutrientType);
    if (typeIdx < 0) continue;
    const x = xFor(dateMs(rec.appliedAt));
    const y = rowYFor(typeIdx);
    const bucket = pointsByType[rec.nutrientType] ?? [];
    bucket.push({ x, y, rec });
    pointsByType[rec.nutrientType] = bucket;
  }

  // x 軸ラベル: 最初・中央・最後 (1 件なら最初のみ)
  const xLabelEntries: { x: number; date: string }[] = (() => {
    if (sorted.length === 1) {
      return [{ x: xFor(minMs), date: dateLabel(firstRec.appliedAt) }];
    }
    if (sorted.length === 2) {
      return [
        { x: xFor(minMs), date: dateLabel(firstRec.appliedAt) },
        { x: xFor(maxMs), date: dateLabel(lastRec.appliedAt) },
      ];
    }
    const mid = sorted[Math.floor(sorted.length / 2)];
    if (!mid) {
      return [
        { x: xFor(minMs), date: dateLabel(firstRec.appliedAt) },
        { x: xFor(maxMs), date: dateLabel(lastRec.appliedAt) },
      ];
    }
    return [
      { x: xFor(minMs), date: dateLabel(firstRec.appliedAt) },
      { x: xFor(dateMs(mid.appliedAt)), date: dateLabel(mid.appliedAt) },
      { x: xFor(maxMs), date: dateLabel(lastRec.appliedAt) },
    ];
  })();

  return (
    <svg
      data-testid="fip-nutrient-chart"
      role="img"
      aria-label={`養分タイムライン ${sorted.length} 件`}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      style={{ display: "block" }}
    >
      {/* 段ごとのガイドライン + 左凡例 */}
      {usedTypes.map((t, i) => {
        const y = rowYFor(i);
        const color = NUTRIENT_COLORS[t] ?? "#525252";
        return (
          <g key={`row-${t}`} data-testid={`fip-nutrient-chart-row-${t}`}>
            <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="#f1f5f9" strokeWidth={1} />
            <text
              x={plotLeft - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fontWeight={600}
              fill={color}
            >
              {NUTRIENT_SHORT_LABELS[t]}
            </text>
          </g>
        );
      })}

      {/* y / x ベースライン */}
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

      {/* 同じ nutrient_type の点を線で繋ぐ (2 点以上のときだけ) */}
      {usedTypes.map((t) => {
        const pts = pointsByType[t] ?? [];
        if (pts.length < 2) return null;
        const color = NUTRIENT_COLORS[t] ?? "#525252";
        const d = pts
          .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
          .join(" ");
        return (
          <path
            key={`path-${t}`}
            data-testid={`fip-nutrient-chart-line-${t}`}
            d={d}
            fill="none"
            stroke={color}
            strokeOpacity={0.45}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {/* 投入点 ● (Issue #26: fadeOpacity("fertilize") で古い投入ほど薄く) */}
      {sorted.map((rec, i) => {
        const typeIdx = usedTypes.indexOf(rec.nutrientType);
        if (typeIdx < 0) return null;
        const cx = xFor(dateMs(rec.appliedAt));
        const cy = rowYFor(typeIdx);
        const color = NUTRIENT_COLORS[rec.nutrientType] ?? "#525252";
        const date = dateLabel(rec.appliedAt);
        const amountStr = rec.amount != null ? ` ${rec.amount}${rec.amountUnit ?? "g"}` : "";
        const label = `${date} ${rec.nutrientType}${amountStr}`;
        const opacity = fadeOpacity(daysSince(rec.appliedAt), "fertilize");
        return (
          <circle
            key={`pt-${rec.id}`}
            data-testid={`fip-nutrient-chart-point-${i}`}
            data-type={rec.nutrientType}
            data-opacity={opacity.toFixed(2)}
            cx={cx}
            cy={cy}
            r={POINT_RADIUS}
            fill={color}
            opacity={opacity}
            aria-label={label}
          >
            <title>{label}</title>
          </circle>
        );
      })}

      {/* x 軸ラベル */}
      {xLabelEntries.map((e, idx) => (
        <text
          key={`xlabel-${e.date}-${idx}`}
          data-testid={`fip-nutrient-chart-xlabel-${idx}`}
          x={e.x}
          y={plotBottom + 16}
          textAnchor="middle"
          fontSize={10}
          fill="#737373"
        >
          {e.date}
        </text>
      ))}
    </svg>
  );
}
