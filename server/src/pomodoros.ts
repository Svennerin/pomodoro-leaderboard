import type { Pool } from "pg";

// A session is a fixed 25 minutes. The client never sends a duration; it
// only learns this number from the server.
export const POMODORO_SECONDS = 25 * 60;

// The timing rule for completing: between 24 and 40 minutes after the start.
// 24 (not 25) leaves one minute of leeway for network delay; 40 stops a stale
// session from being completed hours later.
const MIN_ELAPSED_MS = 24 * 60 * 1000;
const MAX_ELAPSED_MS = 40 * 60 * 1000;

// Every timing decision asks this function for the current time instead of
// calling `new Date()` directly. Production passes the real clock; tests pass
// a fake one so they can simulate 24 minutes passing instantly.
export type Clock = () => Date;

export type PomodoroFailure =
  | "not_found" // no such session, or it belongs to someone else
  | "not_active" // already completed or abandoned
  | "too_early"
  | "too_late";

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: PomodoroFailure };

// Starts a new session, abandoning the user's current one (if any).
export async function startPomodoro(
  pool: Pool,
  userId: number,
  now: Date,
): Promise<{ id: number }> {
  const client = await pool.connect();
  try {
    // Abandon-then-insert must be one transaction: either both happen or
    // neither does, and no other query ever sees the user with zero or two
    // active sessions in between.
    await client.query("BEGIN");

    // Lock this user's row. If the same user fires two "start" requests at
    // once, the second waits here until the first commits, so the two
    // abandon+insert sequences run one after the other instead of
    // interleaving. (The unique index one_active_per_user would still reject
    // a second active row, but this way nobody gets an error.)
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);

    await client.query(
      "UPDATE pomodoros SET status = 'abandoned' WHERE user_id = $1 AND status = 'active'",
      [userId],
    );
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO pomodoros (user_id, started_at) VALUES ($1, $2) RETURNING id",
      [userId, now],
    );

    await client.query("COMMIT");
    return { id: Number(rows[0]!.id) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Completes a session if, and only if, every rule holds.
export async function completePomodoro(
  pool: Pool,
  userId: number,
  pomodoroId: number,
  now: Date,
): Promise<Outcome<{ completedAt: Date }>> {
  // The whole rule is ONE conditional UPDATE, so the check and the change
  // happen atomically. Two simultaneous "complete" calls cannot both succeed:
  // the second one finds the status is no longer 'active' and matches no row.
  const { rows } = await pool.query<{ completed_at: Date }>(
    `UPDATE pomodoros
        SET status = 'completed', completed_at = $3
      WHERE id = $1
        AND user_id = $2                -- it must be the caller's own session
        AND status = 'active'           -- and still running
        AND $3::timestamptz >= started_at + $4::double precision * interval '1 millisecond'
        AND $3::timestamptz <= started_at + $5::double precision * interval '1 millisecond'
    RETURNING completed_at`,
    [pomodoroId, userId, now, MIN_ELAPSED_MS, MAX_ELAPSED_MS],
  );
  if (rows[0]) {
    return { ok: true, value: { completedAt: rows[0].completed_at } };
  }

  // Nothing was updated. Look the row up only to explain why. This second
  // query cannot change the outcome, it just chooses the error message.
  const { rows: found } = await pool.query<{ status: string; started_at: Date }>(
    "SELECT status, started_at FROM pomodoros WHERE id = $1 AND user_id = $2",
    [pomodoroId, userId],
  );
  const pomodoro = found[0];
  if (!pomodoro) return { ok: false, reason: "not_found" };
  if (pomodoro.status !== "active") return { ok: false, reason: "not_active" };

  const elapsedMs = now.getTime() - pomodoro.started_at.getTime();
  return { ok: false, reason: elapsedMs < MIN_ELAPSED_MS ? "too_early" : "too_late" };
}

// Cancels an active session.
export async function abandonPomodoro(
  pool: Pool,
  userId: number,
  pomodoroId: number,
): Promise<Outcome<null>> {
  const { rowCount } = await pool.query(
    `UPDATE pomodoros SET status = 'abandoned'
      WHERE id = $1 AND user_id = $2 AND status = 'active'`,
    [pomodoroId, userId],
  );
  if (rowCount === 1) return { ok: true, value: null };

  const { rows: found } = await pool.query(
    "SELECT 1 FROM pomodoros WHERE id = $1 AND user_id = $2",
    [pomodoroId, userId],
  );
  return { ok: false, reason: found.length === 0 ? "not_found" : "not_active" };
}
