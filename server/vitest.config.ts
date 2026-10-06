import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Load server/.env for local runs. In CI there is no .env file; the
// workflow sets TEST_DATABASE_URL directly.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    // Tests share one real Postgres database, so test files must not
    // run at the same time or they would wipe each other's rows.
    fileParallelism: false,
    // Migrates the test database once before any test file runs.
    globalSetup: ["./src/test/globalSetup.ts"],
    // The app code reads DATABASE_URL; during tests that must be the test
    // database, never the dev one.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
  },
});
