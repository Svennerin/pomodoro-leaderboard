import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "./db.js";
import { createUser, resetDatabase } from "./test/helpers.js";

// Postgres error codes for the constraint violations we expect.
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

describe("database schema", () => {
  beforeEach(resetDatabase);
  afterAll(() => pool.end());

  it("rejects usernames that differ only by case", async () => {
    await createUser("Alice");
    await expect(createUser("alice")).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it("rejects a second active session for the same user", async () => {
    const userId = await createUser("alice");
    await pool.query("INSERT INTO pomodoros (user_id) VALUES ($1)", [userId]);
    await expect(
      pool.query("INSERT INTO pomodoros (user_id) VALUES ($1)", [userId]),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("allows a new active session once the old one is abandoned", async () => {
    const userId = await createUser("alice");
    await pool.query("INSERT INTO pomodoros (user_id) VALUES ($1)", [userId]);
    await pool.query(
      "UPDATE pomodoros SET status = 'abandoned' WHERE user_id = $1",
      [userId],
    );
    await pool.query("INSERT INTO pomodoros (user_id) VALUES ($1)", [userId]);
  });

  it("lets different users each have an active session", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    await pool.query("INSERT INTO pomodoros (user_id) VALUES ($1)", [alice]);
    await pool.query("INSERT INTO pomodoros (user_id) VALUES ($1)", [bob]);
  });

  it("requires completed_at exactly when the status is completed", async () => {
    const userId = await createUser("alice");
    // completed without a completed_at
    await expect(
      pool.query(
        "INSERT INTO pomodoros (user_id, status) VALUES ($1, 'completed')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    // active but with a completed_at
    await expect(
      pool.query(
        "INSERT INTO pomodoros (user_id, completed_at) VALUES ($1, now())",
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("rejects an unknown status", async () => {
    const userId = await createUser("alice");
    await expect(
      pool.query(
        "INSERT INTO pomodoros (user_id, status) VALUES ($1, 'paused')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });
});
