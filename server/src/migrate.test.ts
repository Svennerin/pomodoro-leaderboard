import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";

describe("migration runner", () => {
  afterAll(() => pool.end());

  it("records every migration file it has applied", async () => {
    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY filename",
    );
    expect(rows.map((r) => r.filename)).toEqual([
      "001_create_users_and_pomodoros.sql",
      "002_create_session_table.sql",
    ]);
  });

  it("applies nothing when everything is already applied", async () => {
    // The test setup already migrated the database, so a second run is a no-op.
    expect(await runMigrations(pool)).toEqual([]);
  });

  it("rolls back a failing migration and does not record it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "migrations-"));
    try {
      // The first statement is valid, the second is not. Because the file
      // runs in one transaction, the table from the first statement must
      // not survive.
      await writeFile(
        path.join(dir, "999_broken.sql"),
        "CREATE TABLE rollback_probe (id INT); SELECT * FROM table_that_does_not_exist;",
      );
      await expect(runMigrations(pool, dir)).rejects.toThrow();

      const probe = await pool.query("SELECT to_regclass('rollback_probe') AS t");
      expect(probe.rows[0].t).toBeNull();
      const recorded = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE filename = '999_broken.sql'",
      );
      expect(recorded.rowCount).toBe(0);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
