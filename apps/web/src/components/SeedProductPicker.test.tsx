// SeedProductPicker テスト (Issue: kako-jun/farm-in-pocket#34)

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeedProductPicker from "./SeedProductPicker";

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
const PLANT_ID = 5;

describe("SeedProductPicker", () => {
  it("初回ロードで plantId 絞り込みの GET を叩き、結果一覧を表示する", async () => {
    routes.push({
      match: (u, init) =>
        /\/api\/seed-products\?/.test(u) && (init?.method ?? "GET").toUpperCase() === "GET",
      response: {
        products: [
          {
            id: 1,
            name: "桃太郎",
            brand: "タキイ",
            plantId: PLANT_ID,
            plantName: "トマト",
            type: "seed",
            thumbnailUrl: null,
            affiliateLinks: null,
            useCount: 12,
            userCount: 4,
          },
          {
            id: 2,
            name: "アイコ",
            brand: "サカタ",
            plantId: PLANT_ID,
            plantName: "トマト",
            type: "seed",
            thumbnailUrl: null,
            affiliateLinks: null,
            useCount: 5,
            userCount: 2,
          },
        ],
      },
    });

    render(
      <SeedProductPicker
        pubkey={PUBKEY}
        plantId={PLANT_ID}
        plantName="トマト"
        onPick={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fip-seed-product-pick-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-seed-product-pick-2")).toBeInTheDocument();
    // 初回 GET のクエリには plantId が含まれる
    const firstCall = fetchCalls[0];
    expect(firstCall?.url ?? "").toContain(`plantId=${PLANT_ID}`);
  });

  it("項目クリックで onPick が呼ばれる", async () => {
    routes.push({
      match: (u) => /\/api\/seed-products\?/.test(u),
      response: {
        products: [
          {
            id: 11,
            name: "桃太郎",
            brand: null,
            plantId: PLANT_ID,
            plantName: "トマト",
            type: "seed",
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
      <SeedProductPicker pubkey={PUBKEY} plantId={PLANT_ID} plantName="トマト" onPick={onPick} />,
    );

    const btn = await screen.findByTestId("fip-seed-product-pick-11");
    await userEvent.click(btn);
    expect(onPick).toHaveBeenCalledTimes(1);
    const firstPick = onPick.mock.calls[0]?.[0];
    expect(firstPick).toMatchObject({ id: 11, name: "桃太郎" });
  });

  it("検索結果ゼロ件のとき empty メッセージを出す", async () => {
    routes.push({
      match: (u) => /\/api\/seed-products\?/.test(u),
      response: { products: [] },
    });

    render(
      <SeedProductPicker
        pubkey={PUBKEY}
        plantId={PLANT_ID}
        plantName="トマト"
        onPick={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fip-seed-product-picker-empty")).toBeInTheDocument();
    });
    // 新規登録ボタンが目立つ
    expect(screen.getByTestId("fip-seed-product-picker-create")).toBeInTheDocument();
  });

  it("新規登録モーダルから POST → onPick で新レコードを返す", async () => {
    // 1) 初回 GET → 0 件
    routes.push({
      match: (u, init) =>
        /\/api\/seed-products\?/.test(u) && (init?.method ?? "GET").toUpperCase() === "GET",
      response: { products: [] },
    });
    // 2) POST → 新レコード
    routes.push({
      match: (u, init) =>
        u.endsWith("/api/seed-products") && (init?.method ?? "GET").toUpperCase() === "POST",
      response: {
        product: {
          id: 77,
          name: "新しい種袋",
          brand: "自作",
          plantId: PLANT_ID,
          plantName: "トマト",
          type: "seed",
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
      <SeedProductPicker pubkey={PUBKEY} plantId={PLANT_ID} plantName="トマト" onPick={onPick} />,
    );

    // empty 表示まで待つ
    await waitFor(() => {
      expect(screen.getByTestId("fip-seed-product-picker-empty")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("fip-seed-product-picker-create"));

    // フォームが出る
    expect(screen.getByTestId("fip-seed-product-create-form")).toBeInTheDocument();

    await userEvent.type(screen.getByTestId("fip-seed-product-create-name"), "新しい種袋");
    await userEvent.type(screen.getByTestId("fip-seed-product-create-brand"), "自作");
    await userEvent.click(screen.getByTestId("fip-seed-product-create-submit"));

    await waitFor(() => {
      expect(onPick).toHaveBeenCalledTimes(1);
    });
    const firstPick = onPick.mock.calls[0]?.[0];
    expect(firstPick).toMatchObject({ id: 77, name: "新しい種袋" });

    // POST body 確認
    const postCall = fetchCalls.find((c) => c.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall?.body ?? "{}");
    expect(body).toMatchObject({
      pubkey: PUBKEY,
      name: "新しい種袋",
      brand: "自作",
      plantId: PLANT_ID,
      type: "seed",
    });
  });
});
