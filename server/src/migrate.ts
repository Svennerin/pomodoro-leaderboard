import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

// server/migrations, found relative to this file so it works both from
// src/ (tsx) and from dist/ (compiled build).
export const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");

// Applies every .sql file in `dir` that has not been applied yet, in
// filename order (hence the zero-padded numbers: 001, 002, ...).
// Returns the names of the files it applied.
export async function runMigrations(
  pool: Pool,
  dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  // This table is how we remember which files have already run.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  const alreadyApplied = new Set(rows.map((row) => row.filename));

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    const sql = await readFile(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      // The file's SQL and the "this file ran" record share one transaction:
      // if any statement fails, nothing is applied and nothing is recorded,
      // so the migration can be fixed and re-run cleanly.
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return applied;
}
