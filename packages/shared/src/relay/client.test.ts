// Issue: kako-jun/farm-in-pocket#18
// queryRelays の WebSocket 動作を MockWebSocket で検証する。
//
// 検証観点:
// 1. 単一リレーで 1 イベント受信
// 2. 複数リレーで dedup
// 3. EOSE で CLOSE フレーム送信 + socket close
// 4. timeout で強制 close
// 5. AbortSignal で close
// 6. onEvent コールバック発火
// 7. JSON パースエラーで該当メッセージだけ無視（他は受け取る）
// 8. close 後のメッセージは無視

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryRelays } from "./client";
import type { NostrEvent } from "./types";

// ---------- MockWebSocket ----------
// テスト本体から `instance.emit(...)` 経由でメッセージや EOSE を送り込めるようにする。

interface SentFrame {
  op: string;
  payload: unknown[];
}

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static lastByUrl = new Map<string, MockWebSocket>();

  public readyState = 0;
  public onopen: ((ev: unknown) => void) | null = null;
  public onmessage: ((ev: { data: unknown }) => void) | null = null;
  public onerror: ((ev: unknown) => void) | null = null;
  public onclose: ((ev: unknown) => void) | null = null;
  public sent: SentFrame[] = [];
  public closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    MockWebSocket.lastByUrl.set(url, this);
    // 即座に open する（テストは onopen → REQ 送信を期待する）
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(data: string): void {
    const parsed = JSON.parse(data) as unknown[];
    this.sent.push({ op: String(parsed[0]), payload: parsed });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    // close 後の onclose ハンドラ呼び出しは省略（client 側は onclose を nullify 済み）
  }

  // テスト用 helper
  emitEvent(subId: string, event: NostrEvent) {
    this.onmessage?.({ data: JSON.stringify(["EVENT", subId, event]) });
  }
  emitEose(subId: string) {
    this.onmessage?.({ data: JSON.stringify(["EOSE", subId]) });
  }
  emitRaw(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  getReqSubId(): string | undefined {
    const req = this.sent.find((f) => f.op === "REQ");
    return req ? (req.payload[1] as string) : undefined;
  }
}

const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "id-default",
    pubkey: "pk-default",
    created_at: 1000,
    kind: 1,
    tags: [],
    content: "hello",
    sig: "sig",
    ...overrides,
  };
}

// queueMicrotask で onopen が走るので、それを待つヘルパ
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  MockWebSocket.instances = [];
  MockWebSocket.lastByUrl = new Map();
  (globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket;
});

afterEach(() => {
  vi.useRealTimers();
  if (originalWebSocket === undefined) {
    (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
  } else {
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  }
});

describe("queryRelays", () => {
  it("単一リレーで 1 イベントを受信し、EOSE で CLOSE フレームを送って終了する", async () => {
    const promise = queryRelays({
      relays: ["wss://r1"],
      filter: { kinds: [1], "#t": ["farm-in-pocket"] },
    });
    await flush();
    const ws = MockWebSocket.lastByUrl.get("wss://r1");
    expect(ws).toBeDefined();
    const subId = ws?.getReqSubId();
    expect(subId).toBeDefined();
    const evt = makeEvent({ id: "ev1", created_at: 100 });
    if (!ws || !subId) throw new Error("ws/subId missing");
    ws.emitEvent(subId, evt);
    ws.emitEose(subId);

    const result = await promise;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.id).toBe("ev1");
    expect(result.errors).toEqual([]);
    expect(ws.sent.some((f) => f.op === "CLOSE")).toBe(true);
    expect(ws.closed).toBe(true);
  });

  it("複数リレーから同じ event.id が来ても dedup される（最新 created_at を残す）", async () => {
    const promise = queryRelays({
      relays: ["wss://r1", "wss://r2"],
      filter: { kinds: [1] },
    });
    await flush();
    const w1 = MockWebSocket.lastByUrl.get("wss://r1");
    const w2 = MockWebSocket.lastByUrl.get("wss://r2");
    const s1 = w1?.getReqSubId();
    const s2 = w2?.getReqSubId();
    if (!w1 || !w2 || !s1 || !s2) throw new Error("missing");
    w1.emitEvent(s1, makeEvent({ id: "dup", created_at: 100 }));
    w2.emitEvent(s2, makeEvent({ id: "dup", created_at: 200 })); // 新しい方
    w1.emitEvent(s1, makeEvent({ id: "only-r1", created_at: 50 }));
    w1.emitEose(s1);
    w2.emitEose(s2);

    const result = await promise;
    expect(result.events).toHaveLength(2);
    const dup = result.events.find((e) => e.id === "dup");
    expect(dup?.created_at).toBe(200);
    // 降順
    expect(result.events.map((e) => e.id)).toEqual(["dup", "only-r1"]);
  });

  it("EOSE 後に socket は close 済みになる", async () => {
    const promise = queryRelays({ relays: ["wss://r1"], filter: { kinds: [1] } });
    await flush();
    const ws = MockWebSocket.lastByUrl.get("wss://r1");
    const subId = ws?.getReqSubId();
    if (!ws || !subId) throw new Error("missing");
    ws.emitEose(subId);
    await promise;
    expect(ws.closed).toBe(true);
    expect(ws.sent.find((f) => f.op === "CLOSE")).toBeDefined();
  });

  it("timeout で強制 close する", async () => {
    vi.useFakeTimers();
    const promise = queryRelays({
      relays: ["wss://slow"],
      filter: { kinds: [1] },
      timeoutMs: 100,
    });
    // open は queueMicrotask 経由なので fake timer を進めずに待つ
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(150);
    const result = await promise;
    expect(result.events).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.error).toMatch(/timeout/);
    const ws = MockWebSocket.lastByUrl.get("wss://slow");
    expect(ws?.closed).toBe(true);
  });

  it("AbortSignal で即座に終了し socket を閉じる", async () => {
    const controller = new AbortController();
    const promise = queryRelays({
      relays: ["wss://r1"],
      filter: { kinds: [1] },
      signal: controller.signal,
    });
    await flush();
    const ws = MockWebSocket.lastByUrl.get("wss://r1");
    controller.abort();
    const result = await promise;
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([]); // abort はエラー扱いしない
    expect(ws?.closed).toBe(true);
  });

  it("onEvent コールバックが受信ごとに呼ばれる", async () => {
    const seen: Array<{ id: string; relay: string }> = [];
    const promise = queryRelays({
      relays: ["wss://r1"],
      filter: { kinds: [1] },
      onEvent: (e, relay) => seen.push({ id: e.id, relay }),
    });
    await flush();
    const ws = MockWebSocket.lastByUrl.get("wss://r1");
    const subId = ws?.getReqSubId();
    if (!ws || !subId) throw new Error("missing");
    ws.emitEvent(subId, makeEvent({ id: "a", created_at: 1 }));
    ws.emitEvent(subId, makeEvent({ id: "b", created_at: 2 }));
    ws.emitEose(subId);
    await promise;
    expect(seen).toEqual([
      { id: "a", relay: "wss://r1" },
      { id: "b", relay: "wss://r1" },
    ]);
  });

  it("JSON パースエラーは該当メッセージだけ無視し、続く EVENT は拾う", async () => {
    const promise = queryRelays({ relays: ["wss://r1"], filter: { kinds: [1] } });
    await flush();
    const ws = MockWebSocket.lastByUrl.get("wss://r1");
    const subId = ws?.getReqSubId();
    if (!ws || !subId) throw new Error("missing");
    // 不正な生 JSON
    ws.onmessage?.({ data: "not-a-json{" });
    // 続く EVENT は通る
    ws.emitEvent(subId, makeEvent({ id: "ok", created_at: 1 }));
    // EVENT shape が不正なものも無視
    ws.onmessage?.({ data: JSON.stringify(["EVENT", subId, { broken: true }]) });
    ws.emitEose(subId);

    const result = await promise;
    expect(result.events.map((e) => e.id)).toEqual(["ok"]);
    expect(result.errors).toEqual([]);
  });

  it("EOSE 後に届いた EVENT は無視される（close 後の遅延メッセージ）", async () => {
    const promise = queryRelays({ relays: ["wss://r1"], filter: { kinds: [1] } });
    await flush();
    const ws = MockWebSocket.lastByUrl.get("wss://r1");
    const subId = ws?.getReqSubId();
    if (!ws || !subId) throw new Error("missing");
    ws.emitEvent(subId, makeEvent({ id: "before-eose", created_at: 1 }));
    ws.emitEose(subId);
    const result = await promise;
    // 既に close されている。後続の onmessage 呼び出しは handler が nullify されているので
    // 投げても何も増えない。client 側の握り潰し挙動を確認。
    expect(() => {
      ws.onmessage?.({
        data: JSON.stringify(["EVENT", subId, makeEvent({ id: "after-eose", created_at: 2 })]),
      });
    }).not.toThrow();
    expect(result.events.map((e) => e.id)).toEqual(["before-eose"]);
  });

  it("空 relays 配列なら即座に空結果を返す", async () => {
    const result = await queryRelays({ relays: [], filter: { kinds: [1] } });
    expect(result).toEqual({ events: [], errors: [] });
  });
});
