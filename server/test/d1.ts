import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement } from "../src/context.js";

/** An in-memory D1 stand-in backed by node:sqlite, with the real migrations applied. */
export function createTestD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const dir = path.resolve(import.meta.dirname, "../../migrations");
  for (const file of fs.readdirSync(dir).sort()) db.exec(fs.readFileSync(path.join(dir, file), "utf8"));

  const statement = (sql: string, params: SQLInputValue[] = []): D1PreparedStatement => ({
    bind: (...values) => statement(sql, values as SQLInputValue[]),
    first: async <T>() => (db.prepare(sql).get(...params) ?? null) as T | null,
    all: async <T>() => ({ results: db.prepare(sql).all(...params) as T[] }),
    run: async () => db.prepare(sql).run(...params),
  });

  return { prepare: (sql) => statement(sql), raw: db };
}
