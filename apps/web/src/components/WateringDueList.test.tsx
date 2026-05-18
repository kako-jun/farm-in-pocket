// WateringDueList テスト (Issue kako-jun/farm-in-pocket#31)

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_QUEUE_STORAGE_KEY } from "../lib/offline-queue";
import WateringDueList from "./WateringDueList";

interface MockRoute {
  match: (url: string, init?: RequestInit) => boolean;
  response: unknown;
  status?: number;
}

let routes: MockRoute[] = [];
const fetchCalls: { url: string; method: string; body: string | null }[] = [];

function setupFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    fetchCalls.push({ url, method, body });
    for (const r of routes) {
      if (r.match(url, init)) {
        return new Response(JSON.stringify(r.response), {
          status: r.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "no route" }), { status: 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  routes = [];
  fetchCalls.length = 0;
  setupFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const PUBKEY = "a".repeat(64);

describe("WateringDueList", () => {
  it("0 件のときは「今日は予定なし」を表示する", async () => {
    routes.push({
      match: (u) => /\/api\/users\/.+\/watering-due\?/.test(u),
      response: { records: [] },
    });
    render(<WateringDueList pubkey={PUBKEY} />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-watering-due-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-watering-due-empty").textContent).toBe("今日は予定なし");
  });

  it("複数件あるとき各行に grid 名 + (x,y) + 作物名 + 「💧 やった」ボタンが出る", async () => {
    routes.push({
      match: (u) => /\/api\/users\/.+\/watering-due\?/.test(u),
      response: {
        records: [
          {
            plantingId: 7,
            cellId: 11,
            gridId: "g1",
            gridName: "南プランター",
            x: 1,
            y: 2,
            plantId: 1,
            plantName: "トマト",
            intervalDays: 2,
            lastWateredAt: "2026-05-16",
            nextDueAt: "2026-05-18",
            daysOverdue: 0,
          },
          {
            plantingId: 8,
            cellId: 12,
            gridId: "g1",
            gridName: "南プランター",
            x: 0,
            y: 0,
            plantId: 2,
            plantName: "バジル",
            intervalDays: 1,
            lastWateredAt: "2026-05-17",
            nextDueAt: "2026-05-18",
            daysOverdue: 0,
          },
        ],
      },
    });
    render(<WateringDueList pubkey={PUBKEY} />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-watering-due-records")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-watering-due-row-7").textContent).toContain("南プランター");
    expect(screen.getByTestId("fip-watering-due-row-7").textContent).toContain("(1, 2)");
    expect(screen.getByTestId("fip-watering-due-row-7").textContent).toContain("トマト");
    expect(screen.getByTestId("fip-watering-due-water-7")).toBeInTheDocument();
    expect(screen.getByTestId("fip-watering-due-row-8").textContent).toContain("バジル");

    // 「💧 やった」を押す → POST /water → 行が消える
    routes.push({
      match: (u, i) => /\/api\/plantings\/7\/water$/.test(u) && i?.method === "POST",
      response: {
        ok: true,
        wateredAt: "2026-05-18",
        settings: {
          plantingId: 7,
          intervalDays: 2,
          lastWateredAt: "2026-05-18",
          nextDueAt: "2026-05-20",
        },
      },
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("fip-watering-due-water-7"));
    await waitFor(() => {
      expect(screen.queryByTestId("fip-watering-due-row-7")).not.toBeInTheDocument();
    });
    // 残りの 1 件は残る
    expect(screen.getByTestId("fip-watering-due-row-8")).toBeInTheDocument();
  });

  it("region 設定済みなら天気バナーを表示し、雨なら「屋外不要」サジェストを出す (Issue #32)", async () => {
    routes.push({
      match: (u) => /\/api\/users\/.+\/watering-due\?/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/api\/profiles\/me\?/.test(u),
      response: {
        profile: { pubkey: PUBKEY, displayName: null, region: "石川県金沢市", locale: "ja" },
      },
    });
    routes.push({
      match: (u) => /\/api\/weather\?/.test(u),
      response: {
        record: {
          region: "石川県金沢市",
          date: "2026-05-18",
          tempMax: 18,
          tempMin: 12,
          tempAvg: 15,
          weatherCode: "61", // 雨
          sunshineHours: 1.2,
          fetchedAt: "2026-05-18 03:00:00",
        },
      },
    });
    render(<WateringDueList pubkey={PUBKEY} />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-watering-due-weather")).toBeInTheDocument();
    });
    const banner = screen.getByTestId("fip-watering-due-weather");
    expect(banner.textContent).toContain("石川県金沢市");
    expect(banner.textContent).toContain("雨");
    expect(screen.getByTestId("fip-watering-due-rain-suggest")).toBeInTheDocument();
  });

  it("region 未設定なら設定誘導リンクを出す (Issue #32)", async () => {
    routes.push({
      match: (u) => /\/api\/users\/.+\/watering-due\?/.test(u),
      response: { records: [] },
    });
    routes.push({
      match: (u) => /\/api\/profiles\/me\?/.test(u),
      response: {
        profile: { pubkey: PUBKEY, displayName: null, region: null, locale: "ja" },
      },
    });
    render(<WateringDueList pubkey={PUBKEY} />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-watering-due-region-prompt")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("fip-watering-due-weather")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fip-watering-due-rain-suggest")).not.toBeInTheDocument();
  });

  it("daysOverdue > 0 の行には「期日超過 N日」赤バッジが表示される", async () => {
    routes.push({
      match: (u) => /\/api\/users\/.+\/watering-due\?/.test(u),
      response: {
        records: [
          {
            plantingId: 9,
            cellId: 13,
            gridId: "g1",
            gridName: "南プランター",
            x: 2,
            y: 2,
            plantId: 3,
            plantName: "ねぎ",
            intervalDays: 3,
            lastWateredAt: "2026-05-10",
            nextDueAt: "2026-05-13",
            daysOverdue: 5,
          },
        ],
      },
    });
    render(<WateringDueList pubkey={PUBKEY} />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-watering-due-row-9")).toBeInTheDocument();
    });
    const overdue = screen.getByTestId("fip-watering-due-overdue-9");
    expect(overdue).toBeInTheDocument();
    expect(overdue.textContent).toContain("5");
  });

  it("圏外で「💧 やった」を押すとオフラインキューに積まれ、UI 上は完了に見える (Issue #42)", async () => {
    routes.push({
      match: (u) => /\/api\/users\/.+\/watering-due\?/.test(u),
      response: {
        records: [
          {
            plantingId: 11,
            cellId: 21,
            gridId: "g1",
            gridName: "南プランター",
            x: 0,
            y: 1,
            plantId: 2,
            plantName: "ピーマン",
            intervalDays: 2,
            lastWateredAt: "2026-05-16",
            nextDueAt: "2026-05-18",
            daysOverdue: 0,
          },
        ],
      },
    });
    const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    try {
      const user = userEvent.setup();
      render(<WateringDueList pubkey={"a".repeat(64)} />);
      await waitFor(() => {
        expect(screen.getByTestId("fip-watering-due-row-11")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("fip-watering-due-water-11"));

      // 楽観 update で行が消える
      await waitFor(() => {
        expect(screen.queryByTestId("fip-watering-due-row-11")).toBeNull();
      });

      // キューに recordWatering が積まれている
      const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
      const queue = JSON.parse(raw ?? "[]") as { kind: string; plantingId: number }[];
      expect(queue).toHaveLength(1);
      expect(queue[0]?.kind).toBe("recordWatering");
      expect(queue[0]?.plantingId).toBe(11);

      // POST /water は飛ばしていない
      expect(fetchCalls.find((c) => /\/water$/.test(c.url))).toBeUndefined();
    } finally {
      if (original) {
        Object.defineProperty(window.navigator, "onLine", original);
      }
    }
  });
});
