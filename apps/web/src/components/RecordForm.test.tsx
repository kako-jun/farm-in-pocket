// RecordForm テスト (Issue: kako-jun/farm-in-pocket#16)

import { bytesToHex, generateSecretKey } from "@farm-in-pocket/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFTS_STORAGE_KEY } from "../lib/drafts";
import { SECRET_KEY_STORAGE_KEY } from "../lib/keys";
import RecordForm from "./RecordForm";

interface MockRoute {
  match: (url: string, init?: RequestInit) => boolean;
  response: unknown;
  status?: number;
  /** true なら fetch を reject させる（ネットワーク失敗を模擬） */
  reject?: boolean;
}

let routes: MockRoute[] = [];
let fetchCalls: { url: string; method: string; body: string | null }[] = [];

function setupFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    fetchCalls.push({ url, method, body });
    for (const r of routes) {
      if (r.match(url, init)) {
        if (r.reject) {
          throw new TypeError("fetch failed");
        }
        return new Response(JSON.stringify(r.response), {
          status: r.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "no route" }), { status: 500 });
  }) as typeof fetch;
}

function seedKey(): string {
  const sk = generateSecretKey();
  localStorage.setItem(SECRET_KEY_STORAGE_KEY, bytesToHex(sk));
  return bytesToHex(sk);
}

beforeEach(() => {
  localStorage.clear();
  routes = [];
  fetchCalls = [];
  setupFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecordForm", () => {
  it("鍵未保存ならエラーメッセージと /settings リンクを出す", async () => {
    render(<RecordForm />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form-no-key")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: "設定ページへ" });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("鍵があれば作業種別ボタン 8 個が並び、選択するとハイライトされる", async () => {
    seedKey();
    routes.push({
      match: (u) => /\/api\/grids\?pubkey=/.test(u),
      response: { grids: [] },
    });
    const user = userEvent.setup();
    render(<RecordForm />);

    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fip-record-form-action-seeding")).toBeInTheDocument();
    expect(screen.getByTestId("fip-record-form-action-other")).toBeInTheDocument();

    // 初期は watering が選択
    expect(
      screen.getByTestId("fip-record-form-action-watering").getAttribute("data-selected"),
    ).toBe("true");
    expect(screen.getByTestId("fip-record-form-action-harvest").getAttribute("data-selected")).toBe(
      "false",
    );

    await user.click(screen.getByTestId("fip-record-form-action-harvest"));
    expect(screen.getByTestId("fip-record-form-action-harvest").getAttribute("data-selected")).toBe(
      "true",
    );
    expect(
      screen.getByTestId("fip-record-form-action-watering").getAttribute("data-selected"),
    ).toBe("false");
  });

  it("文字数制限と残文字数表示が機能する", async () => {
    seedKey();
    routes.push({ match: (u) => /\/api\/grids/.test(u), response: { grids: [] } });
    const user = userEvent.setup();
    render(<RecordForm />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form")).toBeInTheDocument();
    });

    const textarea = screen.getByTestId("fip-record-form-content") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(280);
    await user.type(textarea, "こんにちは");
    expect(screen.getByTestId("fip-record-form-remaining").textContent).toBe("残り 275 文字");
  });

  it("グリッド一覧が表示され、選択するとセル選択肢が出る", async () => {
    seedKey();
    routes.push({
      match: (u) => /\/api\/grids/.test(u),
      response: {
        grids: [
          {
            id: "g1",
            userPubkey: "x".repeat(64),
            name: "南プランター",
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
    render(<RecordForm />);

    const select = (await screen.findByTestId("fip-record-form-grid-select")) as HTMLSelectElement;
    // option 数 = 1 (指定しない) + 1 (g1) = 2
    expect(select.options.length).toBe(2);

    await user.selectOptions(select, "g1");
    const cellSelect = await screen.findByTestId("fip-record-form-cell-select");
    // 2x2 = 4 + 1 (指定しない)
    expect((cellSelect as HTMLSelectElement).options.length).toBe(5);
  });

  it("下書き保存ボタンで localStorage に draft が追加される", async () => {
    seedKey();
    routes.push({ match: (u) => /\/api\/grids/.test(u), response: { grids: [] } });
    const user = userEvent.setup();
    render(<RecordForm />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("fip-record-form-content"), "下書きテスト");
    await user.click(screen.getByTestId("fip-record-form-save-draft"));

    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw ?? "[]") as { content: string }[];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.content).toBe("下書きテスト");

    // 下書き一覧 UI にも反映
    expect(screen.getByTestId("fip-record-form-drafts-list")).toBeInTheDocument();
  });

  it("投稿成功で POST /api/publish が呼ばれ、フォームがクリアされる", async () => {
    seedKey();
    routes.push({ match: (u) => /\/api\/grids/.test(u), response: { grids: [] } });
    routes.push({
      match: (u, i) => /\/api\/publish$/.test(u) && i?.method === "POST",
      response: { success: true },
    });

    const user = userEvent.setup();
    render(<RecordForm />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("fip-record-form-action-harvest"));
    await user.type(screen.getByTestId("fip-record-form-content"), "トマト 5 個収穫");
    await user.click(screen.getByTestId("fip-record-form-submit"));

    await waitFor(() => {
      const post = fetchCalls.find((c) => c.method === "POST" && /\/api\/publish$/.test(c.url));
      expect(post).toBeDefined();
      const body = JSON.parse(post?.body ?? "{}") as {
        event: { kind: number; content: string; tags: string[][] };
      };
      expect(body.event.kind).toBe(1);
      expect(body.event.content).toBe("トマト 5 個収穫");
      expect(body.event.tags).toContainEqual(["t", "mypace"]);
      expect(body.event.tags).toContainEqual(["t", "farm-in-pocket"]);
      expect(body.event.tags).toContainEqual(["farm-action", "harvest"]);
    });

    // 成功 status + フォームクリア
    await waitFor(() => {
      const st = screen.getByTestId("fip-record-form-status");
      expect(st.getAttribute("data-status")).toBe("success");
    });
    expect((screen.getByTestId("fip-record-form-content") as HTMLTextAreaElement).value).toBe("");
  });

  it("投稿失敗時は draft に退避され、エラー status が出る", async () => {
    seedKey();
    routes.push({ match: (u) => /\/api\/grids/.test(u), response: { grids: [] } });
    routes.push({
      match: (u, i) => /\/api\/publish$/.test(u) && i?.method === "POST",
      response: null,
      reject: true,
    });

    const user = userEvent.setup();
    render(<RecordForm />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("fip-record-form-content"), "送信失敗テスト");
    await user.click(screen.getByTestId("fip-record-form-submit"));

    await waitFor(() => {
      const st = screen.getByTestId("fip-record-form-status");
      expect(st.getAttribute("data-status")).toBe("error");
    });

    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    const stored = JSON.parse(raw ?? "[]") as { content: string }[];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.content).toBe("送信失敗テスト");
  });

  it("既存 draft の「編集して投稿」でフォームに値が読み込まれる", async () => {
    seedKey();
    routes.push({ match: (u) => /\/api\/grids/.test(u), response: { grids: [] } });

    // 先に draft を localStorage に直接仕込む
    const draft = {
      id: "draft-x",
      action: "fertilize" as const,
      content: "肥料を撒いた",
      gridId: null,
      cellX: null,
      cellY: null,
      cropName: "ナス",
      imageUrls: [],
      createdAt: 1_700_000_000,
    };
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([draft]));

    const user = userEvent.setup();
    render(<RecordForm />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form-draft-draft-x")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("fip-record-form-draft-edit-draft-x"));

    expect((screen.getByTestId("fip-record-form-content") as HTMLTextAreaElement).value).toBe(
      "肥料を撒いた",
    );
    expect((screen.getByTestId("fip-record-form-crop") as HTMLInputElement).value).toBe("ナス");
    expect(
      screen.getByTestId("fip-record-form-action-fertilize").getAttribute("data-selected"),
    ).toBe("true");
  });

  it("写真添付ボタンは disabled（#17 で実装）", async () => {
    seedKey();
    routes.push({ match: (u) => /\/api\/grids/.test(u), response: { grids: [] } });
    render(<RecordForm />);
    await waitFor(() => {
      expect(screen.getByTestId("fip-record-form")).toBeInTheDocument();
    });
    const btn = screen.getByTestId("fip-record-form-attach-photo") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain("#17");
  });
});
