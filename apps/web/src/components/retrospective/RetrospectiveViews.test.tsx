// 振り返り 4 ビューのコンポーネントテスト (Issue: kako-jun/farm-in-pocket#30)

import { bytesToHex, generateSecretKey } from "@farm-in-pocket/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_KEY_STORAGE_KEY } from "../../lib/keys";
import ByPlantView from "./ByPlantView";
import CalendarView from "./CalendarView";
import CellHistoryView from "./CellHistoryView";
import FailureLogView from "./FailureLogView";

interface MockRoute {
  match: (url: string) => boolean;
  response: unknown;
  status?: number;
}

let routes: MockRoute[] = [];

function setupFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const r of routes) {
      if (r.match(url)) {
        return new Response(JSON.stringify(r.response), {
          status: r.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "no route" }), { status: 500 });
  }) as typeof fetch;
}

function seedKey(): void {
  const sk = generateSecretKey();
  localStorage.setItem(SECRET_KEY_STORAGE_KEY, bytesToHex(sk));
}

beforeEach(() => {
  localStorage.clear();
  routes = [];
  setupFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CalendarView", () => {
  it("鍵未保存なら no-key 表示", async () => {
    render(<CalendarView />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-retro-cal-no-key")).toBeInTheDocument();
    });
  });

  it("鍵があれば月グリッドが描画される", async () => {
    seedKey();
    routes.push({
      match: (u) => /\/activity\?/.test(u),
      response: { days: {} },
    });
    render(<CalendarView />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-retro-cal")).toBeInTheDocument();
    });
    // 月送りボタンが表示される
    expect(screen.getByLabelText("前の月")).toBeInTheDocument();
    expect(screen.getByLabelText("次の月")).toBeInTheDocument();
  });
});

describe("ByPlantView", () => {
  it("鍵があれば作物グループを描画する", async () => {
    seedKey();
    routes.push({
      match: (u) => /\/plantings-by-plant/.test(u),
      response: {
        groups: [
          {
            plantId: 1,
            plantName: "トマト",
            plantFamily: "Solanaceae",
            plantings: [
              {
                id: 10,
                cellId: 1,
                plantId: 1,
                seedProductId: null,
                state: "growing",
                seedingDate: null,
                germinationDate: null,
                plantingDate: "2026-04-15",
                endDate: null,
                endTag: null,
                seedingDepthCm: null,
                plantSpacingCm: null,
                rowSpacingCm: null,
                failureMemo: null,
                note: null,
              },
            ],
          },
        ],
      },
    });
    render(<ByPlantView />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-retro-by-plant-group-1")).toBeInTheDocument();
    });
    expect(screen.getByText("トマト")).toBeInTheDocument();
  });

  it("クリックでアコーディオンが開いて planting 行が見える", async () => {
    seedKey();
    routes.push({
      match: (u) => /\/plantings-by-plant/.test(u),
      response: {
        groups: [
          {
            plantId: 2,
            plantName: "ナス",
            plantFamily: "Solanaceae",
            plantings: [
              {
                id: 99,
                cellId: 1,
                plantId: 2,
                seedProductId: null,
                state: "ended",
                seedingDate: null,
                germinationDate: null,
                plantingDate: "2026-03-01",
                endDate: "2026-04-01",
                endTag: "died",
                seedingDepthCm: null,
                plantSpacingCm: null,
                rowSpacingCm: null,
                failureMemo: "枯れた",
                note: null,
              },
            ],
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ByPlantView />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-retro-by-plant-group-2")).toBeInTheDocument();
    });
    await user.click(screen.getByText("ナス"));
    expect(screen.getByText("2026-03-01")).toBeInTheDocument();
    expect(screen.getByText("原因: 枯れた")).toBeInTheDocument();
  });
});

describe("CellHistoryView", () => {
  it("鍵があれば grid タブと縦表を描画する", async () => {
    seedKey();
    routes.push({
      match: (u) => /\/cell-histories/.test(u),
      response: {
        records: [
          {
            id: 1,
            gridId: "grid-1",
            x: 0,
            y: 0,
            plantId: 2,
            plantName: "ナス",
            plantNameEn: null,
            plantFamily: "Solanaceae",
            year: 2026,
            season: "summer",
            plantedAt: "2026-05-01",
            endedAt: null,
          },
        ],
      },
    });
    render(<CellHistoryView />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-retro-cellhist")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-retro-cellhist-row-1")).toBeInTheDocument();
    expect(screen.getByText("ナス")).toBeInTheDocument();
  });
});

describe("FailureLogView", () => {
  it("鍵未保存なら no-key 表示", async () => {
    render(<FailureLogView />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-retro-fail-no-key")).toBeInTheDocument();
    });
  });

  it("失敗 plantings を end_tag ラベル付きで一覧表示する", async () => {
    seedKey();
    routes.push({
      match: (u) => /\/failures/.test(u),
      response: {
        failures: [
          {
            id: 50,
            cellId: 1,
            plantId: 2,
            seedProductId: null,
            state: "ended",
            seedingDate: null,
            germinationDate: null,
            plantingDate: "2026-04-01",
            endDate: "2026-04-30",
            endTag: "died",
            seedingDepthCm: null,
            plantSpacingCm: null,
            rowSpacingCm: null,
            failureMemo: "水切れ",
            note: null,
            plantName: "トマト",
            plantFamily: "Solanaceae",
          },
        ],
      },
    });
    render(<FailureLogView />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-retro-fail-row-50")).toBeInTheDocument();
    });
    expect(screen.getByText("枯れた")).toBeInTheDocument();
    expect(screen.getByText("原因: 水切れ")).toBeInTheDocument();
    expect(screen.getByText(/2026-04-01 〜 2026-04-30/)).toBeInTheDocument();
  });
});
