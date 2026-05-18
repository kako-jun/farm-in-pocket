import type { CellRecord, GridRecord } from "@farm-in-pocket/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GridThumbnail from "./GridThumbnail";

function cell(over: Partial<CellRecord>): CellRecord {
  return {
    id: over.id ?? 0,
    gridId: over.gridId ?? "g1",
    x: over.x ?? 0,
    y: over.y ?? 0,
    containerType: over.containerType ?? null,
    soilType: over.soilType ?? null,
    currentPlantingId: over.currentPlantingId ?? null,
    currentPlantId: over.currentPlantId ?? null,
    currentPlantName: over.currentPlantName ?? null,
    lastFertilizedAt: over.lastFertilizedAt ?? null,
    lastPesticideAt: over.lastPesticideAt ?? null,
  };
}

function grid(over: Partial<GridRecord> = {}): GridRecord {
  return {
    id: over.id ?? "g1",
    userPubkey: over.userPubkey ?? "x".repeat(64),
    name: over.name ?? "畑",
    environment: over.environment ?? "outdoor_sunny",
    lighting: over.lighting ?? null,
    sizeX: over.sizeX ?? 3,
    sizeY: over.sizeY ?? 2,
    sortOrder: over.sortOrder ?? 0,
    archivedAt: over.archivedAt ?? null,
    cells: over.cells ?? [],
  };
}

describe("GridThumbnail", () => {
  it("sizeX × sizeY の枠分のセルマスを描画する（空セルでも data-kind=empty で生成）", () => {
    const { container, getByTestId } = render(
      <GridThumbnail grid={grid({ sizeX: 3, sizeY: 2 })} />,
    );
    // 3 × 2 = 6 マス
    const all = container.querySelectorAll("[data-testid^='fip-grid-thumb-cell-']");
    expect(all.length).toBe(6);
    // 全て data-kind=empty （cells=[]）
    for (const el of Array.from(all)) {
      expect(el.getAttribute("data-kind")).toBe("empty");
    }
    expect(getByTestId("fip-grid-thumb-g1")).toBeInTheDocument();
  });

  it("VOID セルは data-kind='void' になり、planting セルは data-kind='planting' になる", () => {
    const { getByTestId } = render(
      <GridThumbnail
        grid={grid({
          sizeX: 2,
          sizeY: 1,
          cells: [
            cell({ id: 1, x: 0, y: 0, containerType: "void" }),
            cell({
              id: 2,
              x: 1,
              y: 0,
              containerType: "pot",
              currentPlantingId: 99,
              currentPlantId: 1,
              currentPlantName: "トマト",
            }),
          ],
        })}
      />,
    );
    expect(getByTestId("fip-grid-thumb-cell-g1-0-0").getAttribute("data-kind")).toBe("void");
    expect(getByTestId("fip-grid-thumb-cell-g1-1-0").getAttribute("data-kind")).toBe("planting");
  });

  it("planting が無く container だけ設定済みのセルは data-kind='container' になる", () => {
    const { getByTestId } = render(
      <GridThumbnail
        grid={grid({
          sizeX: 1,
          sizeY: 1,
          cells: [cell({ id: 1, x: 0, y: 0, containerType: "planter" })],
        })}
      />,
    );
    expect(getByTestId("fip-grid-thumb-cell-g1-0-0").getAttribute("data-kind")).toBe("container");
  });
});
