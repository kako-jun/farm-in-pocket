// FilterPickerModal テスト (Issue: kako-jun/farm-in-pocket#28)

import { FILTER_PRESETS } from "@farm-in-pocket/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilterPickerModal from "./FilterPickerModal";

// happy-dom には URL.createObjectURL がデフォルトで生えていないので雛形だけ用意
beforeEach(() => {
  if (typeof URL.createObjectURL !== "function") {
    URL.createObjectURL = vi.fn(() => "blob:mock");
  }
  if (typeof URL.revokeObjectURL !== "function") {
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeFile(name = "p.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

describe("FilterPickerModal", () => {
  it("マウント時にランダムプリセットが適用され、プレビュー画像へ CSS filter が当たる", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<FilterPickerModal files={[makeFile()]} onConfirm={onConfirm} onCancel={onCancel} />);

    const img = screen.getByTestId("fip-filter-picker-preview-img") as HTMLImageElement;
    // FILTER_PRESETS のいずれかの filter 文字列が当たっているはず
    const allFilters = new Set(FILTER_PRESETS.map((p) => p.filter));
    expect(allFilters.has(img.style.filter)).toBe(true);

    // 表示中のプリセット名も FILTER_PRESETS のいずれか
    const current = screen.getByTestId("fip-filter-picker-current").textContent ?? "";
    const allNames = new Set(FILTER_PRESETS.map((p) => p.name));
    expect(allNames.has(current)).toBe(true);
  });

  it("「もう一回」で別のプリセットに切り替わる (8 回試行で違うものが当たる)", async () => {
    // Math.random をシーケンスで返すことで、最初は idx=0、reroll は idx=1 になるよう誘導
    let call = 0;
    const seq = [0, 0.2]; // 0/7 → Fuji, 0.2*7 ≒ 1.4 → Kodak
    vi.spyOn(Math, "random").mockImplementation(() => {
      const v = seq[call] ?? 0;
      call += 1;
      return v;
    });

    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<FilterPickerModal files={[makeFile()]} onConfirm={onConfirm} onCancel={onCancel} />);

    const before = screen.getByTestId("fip-filter-picker-current").textContent;
    expect(before).toBe("Fuji");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("fip-filter-picker-reroll"));

    const after = screen.getByTestId("fip-filter-picker-current").textContent;
    expect(after).toBe("Kodak");
    expect(after).not.toBe(before);
  });

  it("「なし」を押すと filter='none' に切り替わる", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<FilterPickerModal files={[makeFile()]} onConfirm={onConfirm} onCancel={onCancel} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("fip-filter-picker-none"));

    expect(screen.getByTestId("fip-filter-picker-current").textContent).toBe("なし");
    const img = screen.getByTestId("fip-filter-picker-preview-img") as HTMLImageElement;
    expect(img.style.filter).toBe("none");
  });

  it("「アップロード」で onConfirm が現在の filter と渡された files を返す", async () => {
    // 抽選を固定 (Fuji = idx 0)
    vi.spyOn(Math, "random").mockReturnValue(0);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];
    render(<FilterPickerModal files={files} onConfirm={onConfirm} onCancel={onCancel} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("fip-filter-picker-confirm"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [filterArg, filesArg] = onConfirm.mock.calls[0] ?? [];
    expect(filterArg).toMatchObject({ name: "Fuji" });
    expect(filesArg).toBe(files);

    // 複数枚バッジが出る
    expect(screen.getByTestId("fip-filter-picker-multi-count").textContent).toContain("2");
  });

  it("「キャンセル」で onCancel が呼ばれ、onConfirm は呼ばれない", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<FilterPickerModal files={[makeFile()]} onConfirm={onConfirm} onCancel={onCancel} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("fip-filter-picker-cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
