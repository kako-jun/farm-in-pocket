import { type GridRecord, bytesToHex, generateSecretKey } from "@farm-in-pocket/shared";
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
                lastFertilizedAt: null,
                lastPesticideAt: null,
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

  it("セルタップで詳細モーダルが開き、編集アクションへ遷移できる (Issue #15)", async () => {
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
    // 履歴 fetch を空で返す
    routes.push({
      match: (u, i) =>
        /\/api\/grids\/g1\/cells\/1\/1\/records/.test(u) && (i?.method ?? "GET") === "GET",
      response: { nutrients: [], pesticides: [] },
    });
    // Issue #22: 過去履歴 fetch も空で返す
    routes.push({
      match: (u, i) =>
        /\/api\/grids\/g1\/cells\/1\/1\/history/.test(u) && (i?.method ?? "GET") === "GET",
      response: { records: [] },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await user.click(await screen.findByTestId("fip-grid-cell-1-1"));
    expect(screen.getByTestId("fip-cell-detail-modal")).toBeInTheDocument();
    // 詳細モーダル内の「VOID にする」リンクは存在する（旧 menu 相当の操作はここから）
    expect(screen.getByTestId("fip-cell-detail-edit-void")).toBeInTheDocument();
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
          lastFertilizedAt: null,
          lastPesticideAt: null,
        },
      },
    });
    // 詳細モーダルが履歴を fetch するので、空で返すルートを足す
    routes.push({
      match: (u, i) =>
        /\/api\/grids\/g1\/cells\/0\/0\/records/.test(u) && (i?.method ?? "GET") === "GET",
      response: { nutrients: [], pesticides: [] },
    });
    // Issue #22: 過去履歴 fetch も空で返す
    routes.push({
      match: (u, i) =>
        /\/api\/grids\/g1\/cells\/0\/0\/history/.test(u) && (i?.method ?? "GET") === "GET",
      response: { records: [] },
    });

    const user = userEvent.setup();
    render(<GridEditor />);
    await user.click(await screen.findByTestId("fip-grid-cell-0-0"));
    // Issue #15: タップで詳細モーダルが開く。VOID 操作は詳細モーダル内の編集リンクから。
    await user.click(await screen.findByTestId("fip-cell-detail-edit-void"));

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

  // -------------------------------------------------------------------------
  // Issue #14: 複数グリッド管理（タブ・追加・削除・並び替え・命名）
  // -------------------------------------------------------------------------

  function gridFixture(over: Partial<GridRecord>): GridRecord {
    return {
      id: over.id ?? "g1",
      userPubkey: over.userPubkey ?? "x".repeat(64),
      name: over.name ?? "畑",
      environment: over.environment ?? "outdoor_sunny",
      lighting: over.lighting ?? null,
      sizeX: over.sizeX ?? 2,
      sizeY: over.sizeY ?? 2,
      sortOrder: over.sortOrder ?? 0,
      cells: over.cells ?? [],
    } as GridRecord;
  }

  function seedThreeGrids(): void {
    seedSecretKey();
    routes.push({
      match: (u, i) => u.includes("/api/grids?pubkey=") && (i?.method ?? "GET") === "GET",
      response: {
        grids: [
          gridFixture({ id: "g1", name: "南側プランター", sortOrder: 0 }),
          gridFixture({ id: "g2", name: "ベランダ左", sortOrder: 1 }),
          gridFixture({ id: "g3", name: "祖母の畑", sortOrder: 2 }),
        ],
      },
    });
  }

  it("複数グリッドがあればタブが grid 件数分レンダリングされる", async () => {
    seedThreeGrids();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    expect(screen.getByTestId("fip-grid-tab-g1")).toBeInTheDocument();
    expect(screen.getByTestId("fip-grid-tab-g2")).toBeInTheDocument();
    expect(screen.getByTestId("fip-grid-tab-g3")).toBeInTheDocument();
    // 先頭が active
    expect(screen.getByTestId("fip-grid-tab-g1").getAttribute("data-active")).toBe("1");
  });

  it("タブクリックでアクティブグリッドが切り替わり、localStorage に永続化される", async () => {
    seedThreeGrids();
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    await user.click(screen.getByTestId("fip-grid-tab-g2"));
    expect(screen.getByTestId("fip-grid-tab-g2").getAttribute("data-active")).toBe("1");
    expect(localStorage.getItem("fip:active-grid-id-v1")).toBe("g2");
  });

  it("ロード時に localStorage の active grid を復元する。存在しなければ先頭にフォールバック", async () => {
    // 存在する ID
    localStorage.setItem("fip:active-grid-id-v1", "g3");
    seedThreeGrids();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    expect(screen.getByTestId("fip-grid-tab-g3").getAttribute("data-active")).toBe("1");
  });

  it("「+」ボタンクリックで新規作成モーダルが出る", async () => {
    seedThreeGrids();
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    await user.click(screen.getByTestId("fip-grid-tab-add"));
    expect(screen.getByTestId("fip-grid-create-modal")).toBeInTheDocument();
  });

  it("タブをダブルクリックして名前編集 → Enter で PATCH /api/grids/:id が呼ばれる", async () => {
    seedThreeGrids();
    routes.push({
      match: (u, i) => u.endsWith("/api/grids/g2") && i?.method === "PATCH",
      response: {
        grid: gridFixture({ id: "g2", name: "新ベランダ", sortOrder: 1 }),
        cropHistoryResetWarning: false,
      },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    await user.dblClick(screen.getByTestId("fip-grid-tab-g2"));
    const input = await screen.findByTestId("fip-grid-tab-name-input-g2");
    await user.clear(input);
    await user.type(input, "新ベランダ");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      const patch = fetchCalls.find((c) => c.method === "PATCH" && c.url.endsWith("/api/grids/g2"));
      expect(patch).toBeDefined();
      const body = JSON.parse(patch?.body ?? "{}");
      expect(body.name).toBe("新ベランダ");
    });
  });

  it("並び替え・削除モードで ↓ ボタンを押すと sortOrder 入れ替えの PATCH が 2 件発生する", async () => {
    seedThreeGrids();
    routes.push({
      match: (u, i) => /\/api\/grids\/g[12]$/.test(u) && i?.method === "PATCH",
      response: {
        grid: gridFixture({ id: "g1", sortOrder: 1 }),
        cropHistoryResetWarning: false,
      },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    await user.click(screen.getByTestId("fip-grid-tab-manage"));
    await user.click(screen.getByTestId("fip-grid-manage-down-g1"));
    await waitFor(() => {
      const patches = fetchCalls.filter(
        (c) => c.method === "PATCH" && /\/api\/grids\/g[12]$/.test(c.url),
      );
      expect(patches.length).toBeGreaterThanOrEqual(2);
      // 両方に sortOrder が含まれる
      for (const p of patches) {
        const body = JSON.parse(p.body ?? "{}");
        expect(typeof body.sortOrder).toBe("number");
      }
    });
  });

  it("並び替えモードで削除ボタン → 確認 → DELETE /api/grids/:id が呼ばれる", async () => {
    seedThreeGrids();
    routes.push({
      match: (u, i) => u.includes("/api/grids/g2") && i?.method === "DELETE",
      response: { ok: true },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    await user.click(screen.getByTestId("fip-grid-tab-manage"));
    await user.click(screen.getByTestId("fip-grid-manage-delete-g2"));
    expect(screen.getByTestId("fip-grid-delete-confirm")).toBeInTheDocument();
    await user.click(screen.getByTestId("fip-grid-delete-ok"));
    await waitFor(() => {
      const del = fetchCalls.find((c) => c.method === "DELETE" && c.url.includes("/api/grids/g2"));
      expect(del).toBeDefined();
    });
    // g2 タブが消えること
    await waitFor(() => {
      expect(screen.queryByTestId("fip-grid-tab-g2")).not.toBeInTheDocument();
    });
  });

  it("active grid を削除したら次のグリッドにフォールバックする", async () => {
    seedThreeGrids();
    routes.push({
      match: (u, i) => u.includes("/api/grids/g1") && i?.method === "DELETE",
      response: { ok: true },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    // 初期 active は g1
    expect(screen.getByTestId("fip-grid-tab-g1").getAttribute("data-active")).toBe("1");
    await user.click(screen.getByTestId("fip-grid-tab-manage"));
    await user.click(screen.getByTestId("fip-grid-manage-delete-g1"));
    await user.click(screen.getByTestId("fip-grid-delete-ok"));
    await waitFor(() => {
      expect(screen.queryByTestId("fip-grid-tab-g1")).not.toBeInTheDocument();
    });
    // g2 が active になっている
    expect(screen.getByTestId("fip-grid-tab-g2").getAttribute("data-active")).toBe("1");
  });

  it("削除確認ダイアログに cells / plantings 件数が表示される", async () => {
    seedSecretKey();
    routes.push({
      match: (u, i) => u.includes("/api/grids?pubkey=") && (i?.method ?? "GET") === "GET",
      response: {
        grids: [
          gridFixture({
            id: "g1",
            name: "ロード済",
            sortOrder: 0,
            cells: [
              {
                id: 1,
                gridId: "g1",
                x: 0,
                y: 0,
                containerType: "planter",
                soilType: null,
                currentPlantingId: 10,
                currentPlantId: 5,
                currentPlantName: "トマト",
                lastFertilizedAt: null,
                lastPesticideAt: null,
              },
              {
                id: 2,
                gridId: "g1",
                x: 1,
                y: 0,
                containerType: "planter",
                soilType: null,
                currentPlantingId: null,
                currentPlantId: null,
                currentPlantName: null,
                lastFertilizedAt: null,
                lastPesticideAt: null,
              },
            ],
          }),
          gridFixture({ id: "g2", name: "もう1個", sortOrder: 1 }),
        ],
      },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    await user.click(screen.getByTestId("fip-grid-tab-manage"));
    await user.click(screen.getByTestId("fip-grid-manage-delete-g1"));
    const dialog = screen.getByTestId("fip-grid-delete-confirm");
    expect(dialog.textContent).toContain("cells 2 個");
    expect(dialog.textContent).toContain("plantings 1 個");
  });

  it("「+」モーダルから作成 → 新グリッドが追加 active になる", async () => {
    seedThreeGrids();
    routes.push({
      match: (u, i) => u.endsWith("/api/grids") && i?.method === "POST",
      response: { grid: gridFixture({ id: "g99", name: "追加畑", sortOrder: 3 }) },
      status: 201,
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await screen.findByTestId("fip-grid-view");
    await user.click(screen.getByTestId("fip-grid-tab-add"));
    const nameInput = screen.getByTestId("fip-grid-create-name");
    await user.clear(nameInput);
    await user.type(nameInput, "追加畑");
    await user.click(screen.getByTestId("fip-grid-create-submit"));
    await waitFor(() => {
      expect(screen.queryByTestId("fip-grid-create-modal")).not.toBeInTheDocument();
    });
    // 新タブ追加 + active
    expect(screen.getByTestId("fip-grid-tab-g99")).toBeInTheDocument();
    expect(screen.getByTestId("fip-grid-tab-g99").getAttribute("data-active")).toBe("1");
    expect(localStorage.getItem("fip:active-grid-id-v1")).toBe("g99");

    // POST /api/grids のリクエスト body が想定値で送られていること
    const post = fetchCalls.find((c) => c.method === "POST" && c.url.endsWith("/api/grids"));
    expect(post).toBeDefined();
    const body = JSON.parse(post?.body ?? "{}");
    expect(body.name).toBe("追加畑");
    expect(body.environment).toBeDefined();
    expect(body.sizeX).toBe(5);
    expect(body.sizeY).toBe(5);
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
    // 詳細モーダルの履歴 fetch
    routes.push({
      match: (u, i) =>
        /\/api\/grids\/g1\/cells\/0\/0\/records/.test(u) && (i?.method ?? "GET") === "GET",
      response: { nutrients: [], pesticides: [] },
    });
    // Issue #22: 過去履歴 fetch
    routes.push({
      match: (u, i) =>
        /\/api\/grids\/g1\/cells\/0\/0\/history/.test(u) && (i?.method ?? "GET") === "GET",
      response: { records: [] },
    });
    const user = userEvent.setup();
    render(<GridEditor />);
    await user.click(await screen.findByTestId("fip-grid-cell-0-0"));
    // Issue #15: 詳細モーダルから「容器を変える」で旧 container-list へ遷移する
    await user.click(await screen.findByTestId("fip-cell-detail-edit-container"));
    expect(screen.getByTestId("fip-cell-container-list")).toBeInTheDocument();
    // 屋外: jiue (地植え) は出る
    expect(screen.getByTestId("fip-cell-container-jiue")).toBeInTheDocument();
    // 室内専用の board_mounted は出ない（屋外リストには無い）
    expect(screen.queryByTestId("fip-cell-container-board_mounted")).not.toBeInTheDocument();
  });
});
