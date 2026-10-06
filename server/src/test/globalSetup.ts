import pg from "pg";
import { runMigrations } from "../migrate.js";

// Runs once before all test files: makes sure the test database is migrated.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  }

  // Safety guard: tests empty tables between runs, so refuse to touch any
  // database that is not clearly a test database.
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against "${databaseName}": the name must end in _test`,
    );
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
