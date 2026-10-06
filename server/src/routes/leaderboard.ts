import { Router } from "express";
import { pool } from "../db.js";
import { getWeeklyLeaderboard } from "../leaderboard.js";
import type { Clock } from "../pomodoros.js";

export function leaderboardRouter(clock: Clock) {
  const router = Router();

  // Public: no requireLogin. If the visitor happens to be logged in, the
  // session middleware has already filled req.session.userId and we add
  // their own rank to the response. Only usernames and counts are returned,
  // never ids or anything else about a user.
  router.get("/weekly", async (req, res) => {
    const leaderboard = await getWeeklyLeaderboard(
      pool,
      clock(),
      req.session.userId ?? null,
    );
    res.json(leaderboard);
  });

  return router;
}
