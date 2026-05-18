/**
 * GridThumbnail (Issue #40)
 *
 * グリッド一覧で各 grid を「縮小したマス目」で視覚化する。
 * セル状態の色分け:
 *   - planting あり (currentPlantingId != null)  : 濃い緑
 *   - VOID (container_type === 'void')           : グレー + 斜線
 *   - 容器あり (container_type 設定済み)         : 薄い緑
 *   - 未設定 (cells に行が無い / container=null) : 白
 *
 * props:
 *   grid: GridRecord
 *   size: "sm" (8px/cell) | "md" (16px/cell)（既定 "sm"）
 *
 * grid.cells はサイズに対して疎（VOID/未設定セルは行が無い場合もある）なので、
 * sizeX × sizeY のループを回して座標で照合する。
 */
import type { CellRecord, GridRecord } from "@farm-in-pocket/shared";
import type { JSX } from "react";

interface GridThumbnailProps {
  grid: GridRecord;
  size?: "sm" | "md";
}

const CELL_PX: Record<"sm" | "md", number> = {
  sm: 8,
  md: 16,
};
const GAP_PX: Record<"sm" | "md", number> = {
  sm: 1,
  md: 2,
};

function cellKey(c: CellRecord): string {
  return `${c.x},${c.y}`;
}

export default function GridThumbnail(props: GridThumbnailProps): JSX.Element {
  const { grid, size = "sm" } = props;
  const cellPx = CELL_PX[size];
  const gapPx = GAP_PX[size];

  const map = new Map<string, CellRecord>();
  for (const c of grid.cells) map.set(cellKey(c), c);

  // ループは y → x。表示も y を行に揃える。
  const rows: JSX.Element[] = [];
  for (let y = 0; y < grid.sizeY; y++) {
    const cols: JSX.Element[] = [];
    for (let x = 0; x < grid.sizeX; x++) {
      const cell = map.get(`${x},${y}`);
      const isVoid = cell?.containerType === "void";
      const hasPlanting = cell?.currentPlantingId != null;
      const hasContainer = !isVoid && cell?.containerType != null;

      let bg = "#ffffff";
      let backgroundImage: string | undefined;
      let kind: "void" | "planting" | "container" | "empty" = "empty";
      if (isVoid) {
        bg = "#d4d4d8"; // neutral-300
        backgroundImage =
          "repeating-linear-gradient(45deg, transparent 0 2px, rgba(0,0,0,0.15) 2px 4px)";
        kind = "void";
      } else if (hasPlanting) {
        bg = "#15803d"; // emerald-700
        kind = "planting";
      } else if (hasContainer) {
        bg = "#a7f3d0"; // emerald-200
        kind = "container";
      }

      cols.push(
        <span
          key={`${x},${y}`}
          data-testid={`fip-grid-thumb-cell-${grid.id}-${x}-${y}`}
          data-kind={kind}
          style={{
            display: "inline-block",
            width: cellPx,
            height: cellPx,
            backgroundColor: bg,
            backgroundImage,
            border: "1px solid rgba(0,0,0,0.08)",
            boxSizing: "border-box",
          }}
        />,
      );
    }
    rows.push(
      <div key={y} style={{ display: "flex", gap: gapPx, lineHeight: 0 }}>
        {cols}
      </div>,
    );
  }

  return (
    <div
      data-testid={`fip-grid-thumb-${grid.id}`}
      data-size={size}
      aria-label={`${grid.name} のサムネイル (${grid.sizeX}×${grid.sizeY})`}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: gapPx,
        padding: gapPx,
        backgroundColor: "rgba(0,0,0,0.04)",
        borderRadius: 4,
      }}
    >
      {rows}
    </div>
  );
}
