import { pool } from "../db.js";

// Empties the tables so each test starts from a clean slate.
// RESTART IDENTITY resets the id counters; CASCADE also clears tables that
// point at these ones.
export async function resetDatabase() {
  await pool.query("TRUNCATE users, pomodoros RESTART IDENTITY CASCADE");
}

// Inserts a user directly (bypassing the API) and returns its id.
export async function createUser(username: string): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, 'not-a-real-hash') RETURNING id",
    [username],
  );
  // BIGSERIAL comes back from pg as a string; ids here are small.
  return Number(rows[0]!.id);
}
