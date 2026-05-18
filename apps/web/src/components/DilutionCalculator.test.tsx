// DilutionCalculator テスト (Issue: kako-jun/farm-in-pocket#36)

import type { MaterialDilution } from "@farm-in-pocket/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DilutionCalculator from "./DilutionCalculator";

const SINGLE: MaterialDilution = {
  unit: "倍液",
  ratios: [{ purpose: "通常散布", ratio: 1000 }],
};

const MULTI: MaterialDilution = {
  unit: "倍液",
  ratios: [
    { purpose: "通常散布", ratio: 1000 },
    { purpose: "高濃度", ratio: 500 },
  ],
};

describe("DilutionCalculator", () => {
  it("dilution が単一なら purpose セレクトを出さず、固定行を表示する", () => {
    render(<DilutionCalculator dilution={SINGLE} />);
    expect(screen.getByTestId("fip-dilution-calc")).toBeTruthy();
    expect(screen.queryByTestId("fip-dilution-calc-purpose")).toBeNull();
    expect(screen.getByText(/通常散布/)).toBeTruthy();
  });

  it("初期 1L / 1000倍液 で原液 1ml + 水 999ml を表示する", () => {
    render(<DilutionCalculator dilution={SINGLE} />);
    expect(screen.getByTestId("fip-dilution-calc-concentrate").textContent).toBe("1");
    expect(screen.getByTestId("fip-dilution-calc-water").textContent).toBe("999");
  });

  it("作りたい量を 2L に変えると原液 2ml + 水 1998ml になる", async () => {
    const user = userEvent.setup();
    render(<DilutionCalculator dilution={SINGLE} />);
    const target = screen.getByTestId("fip-dilution-calc-target") as HTMLInputElement;
    await user.clear(target);
    await user.type(target, "2");
    expect(screen.getByTestId("fip-dilution-calc-concentrate").textContent).toBe("2");
    expect(screen.getByTestId("fip-dilution-calc-water").textContent).toBe("1998");
  });

  it("複数 ratios のとき purpose を高濃度に切り替えると計算が変わる", async () => {
    const user = userEvent.setup();
    render(<DilutionCalculator dilution={MULTI} />);
    // 初期は 1000倍液 1L → 原液 1ml
    expect(screen.getByTestId("fip-dilution-calc-concentrate").textContent).toBe("1");
    const select = screen.getByTestId("fip-dilution-calc-purpose") as HTMLSelectElement;
    await user.selectOptions(select, "1"); // 高濃度 = ratio 500
    // 500倍液 1L → 原液 2ml + 水 998ml
    expect(screen.getByTestId("fip-dilution-calc-concentrate").textContent).toBe("2");
    expect(screen.getByTestId("fip-dilution-calc-water").textContent).toBe("998");
  });

  it("onChange は計算結果が変わるたびに呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DilutionCalculator dilution={SINGLE} onChange={onChange} />);
    // 初期描画 1 回
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall?.[0]?.concentrateMl).toBe(1);
    expect(lastCall?.[0]?.waterMl).toBe(999);
    expect(lastCall?.[0]?.ratio).toBe(1000);

    onChange.mockClear();
    const target = screen.getByTestId("fip-dilution-calc-target") as HTMLInputElement;
    await user.clear(target);
    await user.type(target, "2");
    expect(onChange).toHaveBeenCalled();
    const afterCall = onChange.mock.calls.at(-1);
    expect(afterCall).toBeDefined();
    expect(afterCall?.[0]?.concentrateMl).toBe(2);
    expect(afterCall?.[0]?.waterMl).toBe(1998);
  });
});
