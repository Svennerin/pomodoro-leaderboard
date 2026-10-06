import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests will share one real Postgres database, so test files must not
    // run at the same time or they would wipe each other's rows.
    fileParallelism: false,
  },
});
