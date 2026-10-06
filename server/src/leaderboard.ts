import type { Pool } from "pg";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEADERBOARD_SIZE = 20;

// The current week runs from Monday 00:00 UTC up to (but not including) the
// next Monday 00:00 UTC. "Up to but not including" avoids a gap: a session
// completed at 23:59:59.500 on Sunday still falls inside the week.
export function weekBounds(now: Date): { start: Date; end: Date } {
  const midnightToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  // getUTCDay(): Sunday is 0, Monday is 1. This turns it into days since Monday.
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const start = new Date(midnightToday - daysSinceMonday * DAY_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
}

export interface WeeklyLeaderboard {
  weekStartsAt: Date;
  weekEndsAt: Date;
  entries: LeaderboardEntry[];
  // The caller's own standing; null when nobody is logged in. `rank` is null
  // if they have not completed a session this week.
  me: { rank: number | null; score: number } | null;
}

// The week's top 20, plus the caller's own row even if they are outside it.
export async function getWeeklyLeaderboard(
  pool: Pool,
  now: Date,
  userId: number | null,
): Promise<WeeklyLeaderboard> {
  const { start, end } = weekBounds(now);

  // One query, in two steps:
  //  1. `weekly`: one row per user = their count of completed sessions whose
  //     completed_at falls in this week, plus the time of their latest one.
  //     The score is calculated here every time, never stored.
  //  2. `ranked`: numbers those rows 1, 2, 3... Highest score first. On a tie
  //     the user who reached the score first (earlier latest completion) is
  //     ahead; user_id is a last tie-breaker so the order is always the same.
  // Finally we keep the top 20, plus the caller's row (flagged is_me).
  const { rows } = await pool.query<{
    rank: string;
    username: string;
    score: string;
    is_me: boolean;
  }>(
    `WITH weekly AS (
       SELECT u.id AS user_id,
              u.username,
              COUNT(*) AS score,
              MAX(p.completed_at) AS last_completed_at
         FROM pomodoros p
         JOIN users u ON u.id = p.user_id
        WHERE p.status = 'completed'
          AND p.completed_at >= $1
          AND p.completed_at <  $2
        GROUP BY u.id, u.username
     ),
     ranked AS (
       SELECT user_id, username, score,
              ROW_NUMBER() OVER (
                ORDER BY score DESC, last_completed_at ASC, user_id ASC
              ) AS rank
         FROM weekly
     )
     SELECT rank, username, score,
            COALESCE(user_id = $3::bigint, false) AS is_me
       FROM ranked
      WHERE rank <= $4 OR user_id = $3::bigint
      ORDER BY rank`,
    [start, end, userId, LEADERBOARD_SIZE],
  );

  const entries = rows
    .filter((row) => Number(row.rank) <= LEADERBOARD_SIZE)
    .map((row) => ({
      rank: Number(row.rank),
      username: row.username,
      score: Number(row.score),
    }));

  let me: WeeklyLeaderboard["me"] = null;
  if (userId !== null) {
    const myRow = rows.find((row) => row.is_me);
    me = myRow
      ? { rank: Number(myRow.rank), score: Number(myRow.score) }
      : { rank: null, score: 0 };
  }

  return { weekStartsAt: start, weekEndsAt: end, entries, me };
}
