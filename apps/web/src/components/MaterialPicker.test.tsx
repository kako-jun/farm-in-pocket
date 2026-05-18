// MaterialPicker テスト (Issue: kako-jun/farm-in-pocket#35)

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MaterialPicker from "./MaterialPicker";

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

describe("MaterialPicker", () => {
  it("初回ロードで category 絞り込みの GET を叩き、結果一覧を表示する", async () => {
    routes.push({
      match: (u, init) =>
        /\/api\/materials\?/.test(u) && (init?.method ?? "GET").toUpperCase() === "GET",
      response: {
        materials: [
          {
            id: 1,
            name: "ハイポネックス",
            brand: "ハイポネックスジャパン",
            category: "fertilizer_liquid",
            subcategory: null,
            targetTags: null,
            tags: null,
            dilution: null,
            description: null,
            thumbnailUrl: null,
            affiliateLinks: null,
            useCount: 9,
            userCount: 3,
          },
          {
            id: 2,
            name: "花工場",
            brand: "ハイポネックスジャパン",
            category: "fertilizer_liquid",
            subcategory: null,
            targetTags: null,
            tags: null,
            dilution: null,
            description: null,
            thumbnailUrl: null,
            affiliateLinks: null,
            useCount: 4,
            userCount: 2,
          },
        ],
      },
    });

    render(
      <MaterialPicker
        pubkey={PUBKEY}
        category="fertilizer_liquid"
        onPick={() => undefined}
        onCancel={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fip-material-pick-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-material-pick-2")).toBeInTheDocument();
    const firstCall = fetchCalls[0];
    expect(firstCall?.url ?? "").toContain("category=fertilizer_liquid");
  });

  it("項目クリックで onPick が呼ばれる", async () => {
    routes.push({
      match: (u) => /\/api\/materials\?/.test(u),
      response: {
        materials: [
          {
            id: 11,
            name: "培養土",
            brand: null,
            category: "soil",
            subcategory: null,
            targetTags: null,
            tags: null,
            dilution: null,
            description: null,
            thumbnailUrl: null,
            affiliateLinks: null,
            useCount: 0,
            userCount: 0,
          },
        ],
      },
    });

    const onPick = vi.fn();
    render(
      <MaterialPicker pubkey={PUBKEY} category="soil" onPick={onPick} onCancel={() => undefined} />,
    );

    const btn = await screen.findByTestId("fip-material-pick-11");
    await userEvent.click(btn);
    expect(onPick).toHaveBeenCalledTimes(1);
    const firstPick = onPick.mock.calls[0]?.[0];
    expect(firstPick).toMatchObject({ id: 11, name: "培養土" });
  });

  it("検索結果ゼロ件のとき empty メッセージと新規登録ボタンを出す", async () => {
    routes.push({
      match: (u) => /\/api\/materials\?/.test(u),
      response: { materials: [] },
    });

    render(
      <MaterialPicker
        pubkey={PUBKEY}
        category="pesticide"
        onPick={() => undefined}
        onCancel={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fip-material-picker-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-material-picker-create")).toBeInTheDocument();
  });

  it("新規登録フォームから POST → onPick で新レコードを返す", async () => {
    // 1) 初回 GET → 0 件
    routes.push({
      match: (u, init) =>
        /\/api\/materials\?/.test(u) && (init?.method ?? "GET").toUpperCase() === "GET",
      response: { materials: [] },
    });
    // 2) POST → 新レコード
    routes.push({
      match: (u, init) =>
        u.endsWith("/api/materials") && (init?.method ?? "GET").toUpperCase() === "POST",
      response: {
        material: {
          id: 88,
          name: "オルトラン",
          brand: "住友化学園芸",
          category: "pesticide",
          subcategory: "insecticide",
          targetTags: null,
          tags: null,
          dilution: null,
          description: null,
          thumbnailUrl: null,
          affiliateLinks: null,
          useCount: 0,
          userCount: 0,
        },
        duplicated: false,
      },
      status: 201,
    });

    const onPick = vi.fn();
    render(
      <MaterialPicker
        pubkey={PUBKEY}
        category="pesticide"
        onPick={onPick}
        onCancel={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fip-material-picker-empty")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("fip-material-picker-create"));

    expect(screen.getByTestId("fip-material-create-form")).toBeInTheDocument();

    await userEvent.type(screen.getByTestId("fip-material-create-name"), "オルトラン");
    await userEvent.type(screen.getByTestId("fip-material-create-brand"), "住友化学園芸");
    await userEvent.selectOptions(
      screen.getByTestId("fip-material-create-subcategory"),
      "insecticide",
    );
    await userEvent.click(screen.getByTestId("fip-material-create-submit"));

    await waitFor(() => {
      expect(onPick).toHaveBeenCalledTimes(1);
    });
    const firstPick = onPick.mock.calls[0]?.[0];
    expect(firstPick).toMatchObject({ id: 88, name: "オルトラン", category: "pesticide" });

    const postCall = fetchCalls.find((c) => c.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall?.body ?? "{}");
    expect(body).toMatchObject({
      pubkey: PUBKEY,
      name: "オルトラン",
      brand: "住友化学園芸",
      category: "pesticide",
      subcategory: "insecticide",
    });
  });
});
