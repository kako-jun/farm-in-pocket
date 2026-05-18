// Nostr リレー読み取り専用クライアント（NIP-01 REQ/EVENT/EOSE/CLOSE のみ）。
//
// Issue: kako-jun/farm-in-pocket#18
//
// 方針:
// - 書き込み（EVENT を publish）は扱わない。投稿は mypace API 経由のため。
// - 各リレーに並列接続し、結果を統合する SimplePool 相当の薄い実装。
// - event.id で dedup し、created_at 降順で返す。
// - timeout / EOSE / AbortSignal いずれかで socket を CLOSE してクリーンアップする。
// - sig 検証は省略する。理由:
//   - 本クライアントは「他人のリレーから読む」用途で、信頼トレードオフは元々低い。
//   - mypace を通すパスは publish 時に検証されている前提で、表示用途では sig 検証コストを掛けない。
//   - 必要になったタイミング（金銭・認証絡み）で別途上位レイヤで検証する。

import type {
  NostrEvent,
  RelayFilter,
  RelayQueryError,
  RelayQueryOptions,
  RelayQueryResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 5000;

// WebSocket の readyState 定数。テストで MockWebSocket を渡しても動くように
// 明示的に number 化して比較する。
const WS_OPEN = 1;

interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}

type WebSocketCtor = new (url: string) => WebSocketLike;

function resolveWebSocketCtor(): WebSocketCtor {
  // ブラウザ / Workers / Node22+ には globalThis.WebSocket がある。
  const ctor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (!ctor) {
    throw new Error("WebSocket is not available in this runtime");
  }
  return ctor;
}

// SubID は短くて衝突しなければなんでもいい。timestamp + random で十分。
function makeSubId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `fip-${Date.now().toString(36)}-${rand}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// EVENT メッセージの中身が NostrEvent として最低限の形か確認する。
// sig 検証はしない（前述）。id / pubkey / kind / created_at / tags / content / sig がある程度の shape check。
function looksLikeNostrEvent(v: unknown): v is NostrEvent {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.pubkey === "string" &&
    typeof v.created_at === "number" &&
    typeof v.kind === "number" &&
    Array.isArray(v.tags) &&
    typeof v.content === "string" &&
    typeof v.sig === "string"
  );
}

interface RelayContext {
  url: string;
  ws: WebSocketLike;
  subId: string;
  closed: boolean;
}

function safeClose(ctx: RelayContext) {
  if (ctx.closed) return;
  ctx.closed = true;
  // close 前に CLOSE フレームを投げる（NIP-01）。socket がまだ OPEN なら送信。
  try {
    if (ctx.ws.readyState === WS_OPEN) {
      ctx.ws.send(JSON.stringify(["CLOSE", ctx.subId]));
    }
  } catch {
    // 送信できなくても socket は強制 close する
  }
  try {
    ctx.ws.close();
  } catch {
    // ignore
  }
  // close 後のイベントは握り潰すために handler を nullify
  ctx.ws.onmessage = null;
  ctx.ws.onerror = null;
  ctx.ws.onopen = null;
  ctx.ws.onclose = null;
}

interface QuerySingleParams {
  url: string;
  filter: RelayFilter;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  onEvent: ((event: NostrEvent, relay: string) => void) | undefined;
  WS: WebSocketCtor;
  collected: Map<string, NostrEvent>;
}

function querySingleRelay(params: QuerySingleParams): Promise<RelayQueryError | null> {
  const { url, filter, timeoutMs, signal, onEvent, WS, collected } = params;

  return new Promise<RelayQueryError | null>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (abortHandler && signal) {
        signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
    };

    const finish = (err: RelayQueryError | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      safeClose(ctx);
      resolve(err);
    };

    let ws: WebSocketLike;
    try {
      ws = new WS(url);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      resolve({ relay: url, error: `ws constructor failed: ${message}` });
      return;
    }

    const ctx: RelayContext = {
      url,
      ws,
      subId: makeSubId(),
      closed: false,
    };

    if (signal?.aborted) {
      finish(null);
      return;
    }

    if (signal) {
      abortHandler = () => finish(null);
      signal.addEventListener("abort", abortHandler);
    }

    timer = setTimeout(() => {
      finish({ relay: url, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(["REQ", ctx.subId, filter]));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        finish({ relay: url, error: `send REQ failed: ${message}` });
      }
    };

    ws.onmessage = (ev) => {
      if (ctx.closed) return;
      const raw = typeof ev.data === "string" ? ev.data : null;
      if (raw === null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // 不正 JSON は当該メッセージだけ無視。subscription 自体は継続。
        return;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const tag = parsed[0];
      if (tag === "EVENT") {
        // ["EVENT", subId, event]
        if (parsed[1] !== ctx.subId) return;
        const evt = parsed[2];
        if (!looksLikeNostrEvent(evt)) return;
        // dedup（同一 id は最新の created_at を残す）
        const existing = collected.get(evt.id);
        if (!existing || existing.created_at < evt.created_at) {
          collected.set(evt.id, evt);
        }
        if (onEvent) {
          try {
            onEvent(evt, url);
          } catch {
            // コールバック側の例外は subscription を壊さない
          }
        }
      } else if (tag === "EOSE") {
        // ["EOSE", subId] — 取り急ぎの「初期取得は以上です」
        if (parsed[1] !== ctx.subId) return;
        finish(null);
      } else if (tag === "NOTICE") {
        // 致命ではない。無視。
      } else if (tag === "CLOSED") {
        // ["CLOSED", subId, reason] — リレー側が subscription を閉じた
        if (parsed[1] !== ctx.subId) return;
        const reason = typeof parsed[2] === "string" ? parsed[2] : "closed by relay";
        finish({ relay: url, error: reason });
      }
    };

    ws.onerror = () => {
      finish({ relay: url, error: "websocket error" });
    };

    ws.onclose = () => {
      // EOSE 前に socket が落ちた場合のみエラー扱い。EOSE 後の close は finish 済み。
      if (!settled) {
        finish({ relay: url, error: "websocket closed before EOSE" });
      }
    };
  });
}

export async function queryRelays(opts: RelayQueryOptions): Promise<RelayQueryResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const collected = new Map<string, NostrEvent>();
  const WS = resolveWebSocketCtor();

  if (opts.relays.length === 0) {
    return { events: [], errors: [] };
  }

  const settled = await Promise.all(
    opts.relays.map((url) =>
      querySingleRelay({
        url,
        filter: opts.filter,
        timeoutMs,
        signal: opts.signal,
        onEvent: opts.onEvent,
        WS,
        collected,
      }),
    ),
  );

  const errors = settled.filter((e): e is RelayQueryError => e !== null);
  const events = [...collected.values()].sort((a, b) => b.created_at - a.created_at);
  return { events, errors };
}
