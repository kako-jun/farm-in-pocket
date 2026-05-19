// Issue: kako-jun/farm-in-pocket#87
// 統合テスト用ヘルパ。pubkey 生成と fetch ラッパ。

// Hono の fetch シグネチャは Bindings ジェネリックに依存して `(req, env, ctx?) => Response | Promise<Response>`
// と細分化される。テストヘルパでは Bindings の中身を知らないため、`unknown` 経由で渡せる
// 緩いインタフェースを定義し、内部で fetch を呼ぶときだけ型をキャストして橋渡しする。
//
// `Env extends object` 制約に該当しない（unknown）形を許容するため、ここでは fetch を
// `(req, env) => Promise<Response>` と単純化したダックタイプにしている。
interface AnyHono {
  // biome-ignore lint/suspicious/noExplicitAny: Hono の Bindings ジェネリックを跨ぐためのダックタイプ
  fetch: (req: Request, env?: any) => Promise<Response> | Response;
}

/**
 * 64 hex の Nostr pubkey を seed から決定的に生成する。
 * テストごとに「user A / user B」を分けたいときに `pubkeyHex("a")` のように呼ぶ。
 */
export function pubkeyHex(seed: string | number): string {
  const raw = String(seed);
  // seed を 64 hex に伸ばす: ASCII を 2 hex に並べ、足りなければ "0" を埋め、長すぎれば切る。
  let hex = "";
  for (const ch of raw) {
    hex += ch.charCodeAt(0).toString(16).padStart(2, "0");
  }
  if (hex.length >= 64) return hex.slice(0, 64).toLowerCase();
  return (hex + "0".repeat(64 - hex.length)).toLowerCase();
}

interface RequestOpts {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Hono app に対する fetch ラッパ。
 *   await request(app, "GET", "/api/grids", { query: { pubkey } });
 *   await request(app, "POST", "/api/grids", { body: { ... } });
 */
export async function request<T = unknown>(
  app: AnyHono,
  method: string,
  path: string,
  opts: RequestOpts = {},
  env?: unknown,
): Promise<{ status: number; body: T }> {
  const url = new URL(`http://localhost${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    if (!headers["content-type"] && !headers["Content-Type"]) {
      headers["content-type"] = "application/json";
    }
  }
  const req = new Request(url.toString(), { method, headers, body });
  const res = await app.fetch(req, env);
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed as T };
}
