// Issue: kako-jun/farm-in-pocket#87
// D1Database 互換ラッパ（in-memory sqlite, better-sqlite3 ベース）。
//
// 目的:
//   apps/api のハンドラを Hono の `app.fetch(req, env)` で in-process テストするため、
//   本物の Cloudflare D1 と同じインタフェース (`prepare(sql).bind(...).first()/.all()/.run()`,
//   `.exec(sql)`) を満たすシンを用意する。
//   `:memory:` sqlite を毎テストで作り、`apps/api/migrations/*.sql` を sort 順に流して
//   実環境とほぼ同じスキーマを再現する。
//
// 制限事項（D1 仕様との差分メモ）:
//   - D1 は外部キーをセッション単位でしか有効化しないが、ここでは PRAGMA foreign_keys = ON で
//     有効化したまま走る（migration 0001 にも明記されている）。アプリ層で手動カスケードしている
//     コードと衝突しないよう、テストでは依存テーブルへ INSERT する順序に注意する。
//   - better-sqlite3 は同期 API。`first()` / `all()` / `run()` は Promise でラップして
//     D1 と同じ async シグネチャに揃える。
//   - meta.changes / meta.last_row_id を実装している（apps/api の use カウントや
//     INSERT 後の id 取得で参照される）。
//   - PRAGMA を含む複数文 SQL は `.exec()` 経由でのみ受け付け、prepare は単文限定。
//
// 使い方:
//   const { db, sqlite, close } = createMockD1();
//   // db は D1Database 互換、sqlite は better-sqlite3 の Database (テストで直叩き用)。
//   afterEach(() => close());

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

// このファイル: apps/api/src/test/d1-mock.ts
// migrations: apps/api/migrations/
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = resolve(__dirname, "../../migrations");

export interface MockD1Result<T> {
  results?: T[];
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
    served_by: string;
    changed_db: boolean;
    rows_read: number;
    rows_written: number;
  };
}

/** D1PreparedStatement 互換のラッパ。 */
class MockD1PreparedStatement {
  private boundValues: unknown[] = [];

  constructor(
    private readonly sqlite: BetterSqliteDatabase,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): MockD1PreparedStatement {
    // D1 は `.bind(...args).bind(...moreArgs)` で上書きする実装ではなく
    // 単発で全部渡す前提なので、ここでも単純に置き換える。
    const stmt = new MockD1PreparedStatement(this.sqlite, this.sql);
    stmt.boundValues = values.map(normalizeBindValue);
    return stmt;
  }

  async first<T = unknown>(): Promise<T | null> {
    const stmt = this.sqlite.prepare(this.sql);
    // SELECT 以外（INSERT...RETURNING など）でも .get() を試して結果が無ければ null。
    try {
      const row = stmt.get(...(this.boundValues as never[])) as T | undefined;
      return (row ?? null) as T | null;
    } catch (e) {
      // .get() は SELECT 以外で落ちることがある。その場合は run へフォールバック。
      const info = stmt.run(...(this.boundValues as never[]));
      void info;
      void e;
      return null;
    }
  }

  async all<T = unknown>(): Promise<MockD1Result<T>> {
    const stmt = this.sqlite.prepare(this.sql);
    const rows = stmt.all(...(this.boundValues as never[])) as T[];
    return {
      results: rows,
      success: true,
      meta: emptyMeta(),
    };
  }

  async run(): Promise<MockD1Result<never>> {
    const stmt = this.sqlite.prepare(this.sql);
    const info = stmt.run(...(this.boundValues as never[]));
    return {
      success: true,
      meta: {
        changes: info.changes,
        // better-sqlite3 は bigint を返すケースがあるので Number 化する。
        last_row_id: Number(info.lastInsertRowid),
        duration: 0,
        served_by: "mock-d1",
        changed_db: info.changes > 0,
        rows_read: 0,
        rows_written: info.changes,
      },
    };
  }
}

function emptyMeta(): MockD1Result<never>["meta"] {
  return {
    changes: 0,
    last_row_id: 0,
    duration: 0,
    served_by: "mock-d1",
    changed_db: false,
    rows_read: 0,
    rows_written: 0,
  };
}

/**
 * D1 と better-sqlite3 の値型のすり合わせ:
 *   - boolean → 1 / 0
 *   - undefined → null（D1 は undefined を bind に渡せないが、保険）
 *   - Date → ISO 文字列（D1 はサポートしないが、テストでうっかり渡したら見やすく落ちるように）
 */
function normalizeBindValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** D1Database 互換のラッパクラス。 */
class MockD1Database {
  constructor(private readonly sqlite: BetterSqliteDatabase) {}

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.sqlite, sql);
  }

  async exec(sql: string): Promise<MockD1Result<never>> {
    this.sqlite.exec(sql);
    return { success: true, meta: emptyMeta() };
  }

  /** テスト用: 生 sqlite ハンドルにアクセス（factory.ts での直 INSERT 用）。 */
  getRawSqlite(): BetterSqliteDatabase {
    return this.sqlite;
  }
}

/**
 * migrations/*.sql を sort 順に読み込んで in-memory sqlite に適用する。
 * 0002_seed_initial_plants.sql / 0005_expand_plants_seed.sql の seed もそのまま流れる。
 */
function applyMigrations(sqlite: BetterSqliteDatabase): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    sqlite.exec(sql);
  }
}

export interface MockD1Handle {
  /** Hono ハンドラに渡す D1Database 互換オブジェクト。 */
  db: MockD1Database;
  /** テストから直接 INSERT/SELECT する用の生 sqlite。 */
  sqlite: BetterSqliteDatabase;
  /** afterEach で呼ぶ。in-memory なので保留不要だが、明示クローズ。 */
  close: () => void;
}

/** :memory: sqlite を起こして migrations を流したハンドルを返す。 */
export function createMockD1(): MockD1Handle {
  const sqlite = new Database(":memory:");
  // 外部キーは migration の意図に合わせて有効化（INSERT 順序の不備をテストで早期発見する）。
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);
  const db = new MockD1Database(sqlite);
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

// D1Database 型に as キャストして使うため、構造のみ named export しておく。
export type { MockD1Database, MockD1PreparedStatement };
