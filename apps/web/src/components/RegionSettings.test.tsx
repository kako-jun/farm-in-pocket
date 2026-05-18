// RegionSettings テスト (Issue kako-jun/farm-in-pocket#32)

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegionSettings from "./RegionSettings";

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

describe("RegionSettings", () => {
  it("既存プロフィールの region を読み込み input に表示する", async () => {
    routes.push({
      match: (u) => /\/api\/profiles\/me\?/.test(u),
      response: {
        profile: { pubkey: PUBKEY, displayName: null, region: "石川県金沢市", locale: "ja" },
      },
    });
    render(<RegionSettings pubkey={PUBKEY} />);
    await waitFor(() => {
      const input = screen.getByTestId("fip-region-settings-input") as HTMLInputElement;
      expect(input.value).toBe("石川県金沢市");
    });
  });

  it("入力して「設定する」を押すと PUT /api/profiles/me が呼ばれて region が保存される", async () => {
    routes.push({
      match: (u) => /\/api\/profiles\/me\?/.test(u),
      response: { profile: null },
    });
    routes.push({
      match: (u, i) => /\/api\/profiles\/me$/.test(u) && i?.method === "PUT",
      response: {
        ok: true,
        profile: { pubkey: PUBKEY, displayName: null, region: "東京都港区", locale: "ja" },
      },
    });

    render(<RegionSettings pubkey={PUBKEY} />);
    const input = (await screen.findByTestId("fip-region-settings-input")) as HTMLInputElement;

    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, "東京都港区");
    await user.click(screen.getByTestId("fip-region-settings-save"));

    await waitFor(() => {
      expect(screen.getByTestId("fip-region-settings-saved")).toBeInTheDocument();
    });

    const putCall = fetchCalls.find(
      (c) => c.method === "PUT" && c.url.endsWith("/api/profiles/me"),
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(String(putCall?.body));
    expect(body).toMatchObject({ pubkey: PUBKEY, region: "東京都港区" });
  });
});
