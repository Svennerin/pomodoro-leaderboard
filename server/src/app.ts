import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { Clock } from "./pomodoros.js";
import { authRouter } from "./routes/auth.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { pomodorosRouter } from "./routes/pomodoros.js";
import { createSessionMiddleware } from "./session.js";

export interface AppOptions {
  // Folder holding the built frontend (client/dist). When given, Express
  // serves it, so one service delivers both the page and the API.
  clientDir?: string;
  // Source of "now" for every timing decision. Tests inject a fake one.
  clock?: Clock;
  // Whether to behave as in production (Secure cookies, trust the host's
  // proxy). Defaults to the NODE_ENV setting; tests override it.
  production?: boolean;
  // How many register/login requests one IP address may make per window.
  authRateLimit?: { windowMs: number; limit: number };
}

// ASSUMPTION: 10 register/login attempts per IP per 15 minutes. The spec
// asked for rate limiting but gave no numbers.
const DEFAULT_AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 };

// Builds the Express app without starting a server. Keeping this separate
// from index.ts lets tests call the app directly (via Supertest) without
// opening a real network port.
export function createApp(options: AppOptions = {}) {
  const production = options.production ?? config.isProduction;
  const authRateLimit = options.authRateLimit ?? DEFAULT_AUTH_RATE_LIMIT;
  const clock = options.clock ?? (() => new Date());

  const app = express();

  // In production we sit behind the host's reverse proxy. Trusting one proxy
  // hop makes req.ip the visitor's real address (needed for rate limiting)
  // and lets Express see that the original request was HTTPS (needed for
  // Secure cookies).
  if (production) app.set("trust proxy", 1);

  // Adds a standard set of protective response headers (Content-Security-
  // Policy, X-Content-Type-Options, Strict-Transport-Security, ...) and
  // removes the X-Powered-By header that advertises we run Express.
  // There is deliberately no CORS middleware: the frontend and the API are
  // served from the same origin, so browsers never need cross-origin access,
  // and with no CORS headers they refuse it by default.
  app.use(helmet());

  // Lets the host (and us) check that the server is up.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Parse JSON bodies, rejecting anything over 10 KB.
  app.use(express.json({ limit: "10kb" }));
  app.use(createSessionMiddleware(production));

  const authLimiter = rateLimit({
    windowMs: authRateLimit.windowMs,
    limit: authRateLimit.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." },
  });
  app.use("/api/auth", authRouter(authLimiter));
  app.use("/api/pomodoros", pomodorosRouter(clock));
  app.use("/api/leaderboard", leaderboardRouter(clock));

  // Any other /api path does not exist.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Everything that is not an API route is a file of the built frontend
  // (index.html, scripts, styles). This sits after the API routes, so a path
  // starting with /api is never answered with a page.
  if (options.clientDir) {
    app.use(express.static(options.clientDir));
  }

  app.use(errorHandler);

  return app;
}
