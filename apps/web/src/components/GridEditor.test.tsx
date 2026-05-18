import { bytesToHex, generateSecretKey } from "@farm-in-pocket/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_KEY_STORAGE_KEY } from "../lib/keys";
import GridEditor from "./GridEditor";

function seedSecretKey(): void {
  const sk = generateSecretKey();
  localStorage.setItem(SECRET_KEY_STORAGE_KEY, bytesToHex(sk));
}

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
  localStorage.clear();
  routes = [];
  fetchCalls.length = 0;
  setupFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GridEditor", () => {
  it("鍵未保存なら『先にアカウント設定を行ってください』を表示", async () => {
    render(<GridEditor />);
    expect(await screen.findByTestId("fip-grid-no-key")).toBeInTheDocument();
  });

  it("グリッド0件なら『グリッドを作成』ボタンを表示", async () => {
    seedSecretKey();
    routes.push({
      match: (u, i) => u.includes("/api/grids?pubkey=") && (i?.method ?? "GET") === "GET",
      response: { grids: [] },
    });
    render(<GridEditor />);
    expect(await screen.findByTestId("fip-grid-create-open")).toBeInTheDocument();
  });

  it("グリッドが返ればセル一覧を描画する", async () => {
    seedSecretKey();
    routes.push({
      match: (u) => u.includes("/api/grids?pubkey="),
      response: {
        grids: [
          {
            id: "g1",
            userPubkey: "x".repeat(64),
            name: "テスト畑",
            environment: "outdoor_sunny",
            lighting: null,
            sizeX: 3,
            sizeY: 2,
            sortOrder: 0,
            cells: [
              {
                id: 1,
                gridId: "g1",
                x: 0,
                y: 0,
                containerType: "void",
                soilType: null,
                currentPlantingId: null,
                currentPlantId: null,
                currentPlantName: null,
              },
            ],
          },
        ],
      },
    });
    render(<GridEditor />);
    expect(await screen.findByTestId("fip-grid-view")).toBeInTheDocument();
    // 3x2 = 6 cells
    expect(screen.getAllByTestId(/^fip-grid-cell-/)).toHaveLength(6);
    // (0,0) は VOID
    const c00 = screen.getByTestId("fip-grid-cell-0-0");
    expect(c00.getAttribute("data-void")).toBe("1");
  });

  it("セルタップでメニューモーダルが開く", async () => {
    seedSecretKey();
    routes.push({
      match: (u) => u.includes("/api/grids?pubkey="),
      response: {
        grids: [
          {
            id: "g1",
            userPubkey: "x".repeat(64),
            name: "畑",
            environment: "outdoor_sunny",
            lighting: null,
            sizeX: 2,
            sizeY: 2,
            sortOrder: 0,
            cells: [],
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await user.click(await screen.findByTestId("fip-grid-cell-1-1"));
    expect(screen.getByTestId("fip-cell-modal")).toBeInTheDocument();
    expect(screen.getByTestId("fip-cell-menu-void")).toBeInTheDocument();
  });

  it("VOID ボタンを押すと PUT /cells/:x/:y が呼ばれて containerType: void が送られる", async () => {
    seedSecretKey();
    let putCalled = false;
    routes.push({
      match: (u) => u.includes("/api/grids?pubkey="),
      response: {
        grids: [
          {
            id: "g1",
            userPubkey: "x".repeat(64),
            name: "畑",
            environment: "outdoor_sunny",
            lighting: null,
            sizeX: 2,
            sizeY: 2,
            sortOrder: 0,
            cells: [],
          },
        ],
      },
    });
    routes.push({
      match: (u, i) => u.endsWith("/api/grids/g1/cells/0/0") && i?.method === "PUT",
      response: {
        cell: {
          id: 1,
          gridId: "g1",
          x: 0,
          y: 0,
          containerType: "void",
          soilType: null,
          currentPlantingId: null,
          currentPlantId: null,
          currentPlantName: null,
        },
      },
    });

    const user = userEvent.setup();
    render(<GridEditor />);
    await user.click(await screen.findByTestId("fip-grid-cell-0-0"));
    await user.click(screen.getByTestId("fip-cell-menu-void"));

    await waitFor(() => {
      const putCall = fetchCalls.find(
        (c) => c.method === "PUT" && c.url.endsWith("/api/grids/g1/cells/0/0"),
      );
      expect(putCall).toBeDefined();
      putCalled = true;
      const body = JSON.parse(putCall?.body ?? "{}");
      expect(body.containerType).toBe("void");
    });
    expect(putCalled).toBe(true);
  });

  it("『容器を選ぶ』モーダルでは屋外用の容器一覧が出る（屋外環境）", async () => {
    seedSecretKey();
    routes.push({
      match: (u) => u.includes("/api/grids?pubkey="),
      response: {
        grids: [
          {
            id: "g1",
            userPubkey: "x".repeat(64),
            name: "畑",
            environment: "outdoor_sunny",
            lighting: null,
            sizeX: 1,
            sizeY: 1,
            sortOrder: 0,
            cells: [],
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await user.click(await screen.findByTestId("fip-grid-cell-0-0"));
    await user.click(screen.getByTestId("fip-cell-menu-container"));
    expect(screen.getByTestId("fip-cell-container-list")).toBeInTheDocument();
    // 屋外: jiue (地植え) は出る
    expect(screen.getByTestId("fip-cell-container-jiue")).toBeInTheDocument();
    // 室内専用の board_mounted は出ない（屋外リストには無い）
    expect(screen.queryByTestId("fip-cell-container-board_mounted")).not.toBeInTheDocument();
  });
});
