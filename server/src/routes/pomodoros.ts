import { Router } from "express";
import { pool } from "../db.js";
import { requireLogin } from "../middleware/requireLogin.js";
import {
  abandonPomodoro,
  type Clock,
  completePomodoro,
  type PomodoroFailure,
  POMODORO_SECONDS,
  startPomodoro,
} from "../pomodoros.js";

// How each failure is reported to the client.
// A session that is missing or belongs to someone else gets the same 404, so
// the API doesn't reveal which ids exist.
const FAILURES: Record<PomodoroFailure, { status: number; error: string }> = {
  not_found: { status: 404, error: "Session not found" },
  not_active: { status: 409, error: "Session is not active" },
  too_early: { status: 400, error: "Too early to complete this session" },
  too_late: { status: 400, error: "Too late to complete this session" },
};

// Ids are database numbers. Anything else cannot match a session.
function parseId(value: string): number | null {
  return /^\d{1,15}$/.test(value) ? Number(value) : null;
}

export function pomodorosRouter(clock: Clock) {
  const router = Router();

  // Every route here needs a logged-in user.
  router.use(requireLogin);

  router.post("/start", async (_req, res) => {
    const { id } = await startPomodoro(pool, res.locals.userId, clock());
    res.status(201).json({ id, durationSeconds: POMODORO_SECONDS });
  });

  router.post("/:id/complete", async (req, res) => {
    const id = parseId(req.params.id);
    const outcome =
      id === null
        ? ({ ok: false, reason: "not_found" } as const)
        : await completePomodoro(pool, res.locals.userId, id, clock());

    if (!outcome.ok) {
      const { status, error } = FAILURES[outcome.reason];
      res.status(status).json({ error });
      return;
    }
    res.json({ id, completedAt: outcome.value.completedAt });
  });

  router.post("/:id/abandon", async (req, res) => {
    const id = parseId(req.params.id);
    const outcome =
      id === null
        ? ({ ok: false, reason: "not_found" } as const)
        : await abandonPomodoro(pool, res.locals.userId, id);

    if (!outcome.ok) {
      const { status, error } = FAILURES[outcome.reason];
      res.status(status).json({ error });
      return;
    }
    res.json({ id });
  });

  return router;
}
