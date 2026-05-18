// UsageBadge テスト (Issue: kako-jun/farm-in-pocket#37)

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UsageBadge from "./UsageBadge";

describe("UsageBadge", () => {
  it("両方 0 のときは「まだ記録なし」", () => {
    render(<UsageBadge useCount={0} userCount={0} />);
    expect(screen.getByTestId("fip-usage-badge-empty")).toHaveTextContent("まだ記録なし");
  });

  it("通常の数値表示は「N人が使っています ／ M回記録されています」", () => {
    render(<UsageBadge useCount={34} userCount={12} />);
    expect(screen.getByTestId("fip-usage-badge-users")).toHaveTextContent("12人");
    expect(screen.getByTestId("fip-usage-badge-uses")).toHaveTextContent("34回");
    const badge = screen.getByTestId("fip-usage-badge");
    expect(badge).toHaveTextContent("12人が使っています");
    expect(badge).toHaveTextContent("34回記録されています");
  });

  it("大きな数値・小数や負値は整数に丸めて表示する", () => {
    render(<UsageBadge useCount={12345.7} userCount={-3} />);
    expect(screen.getByTestId("fip-usage-badge-uses")).toHaveTextContent("12345回");
    // 負値は 0 にクランプされる
    expect(screen.getByTestId("fip-usage-badge-users")).toHaveTextContent("0人");
  });
});
