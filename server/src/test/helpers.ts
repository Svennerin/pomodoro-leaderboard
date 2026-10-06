import type { Express } from "express";
import request from "supertest";
import { type AppOptions, createApp } from "../app.js";
import { pool } from "../db.js";

// Empties the tables so each test starts from a clean slate.
// RESTART IDENTITY resets the id counters; CASCADE also clears tables that
// point at these ones.
export async function resetDatabase() {
  await pool.query(
    'TRUNCATE users, pomodoros, "session" RESTART IDENTITY CASCADE',
  );
}

// An app for tests, with the register/login rate limit set so high that
// ordinary tests never hit it. Tests of the limit itself override it.
export function createTestApp(options: AppOptions = {}) {
  return createApp({
    authRateLimit: { windowMs: 60_000, limit: 1000 },
    ...options,
  });
}

// A clock the test controls. Start time is a Wednesday, mid-week, so tests
// that move a few minutes never cross a week boundary by accident.
export function createFakeClock(start = new Date("2026-01-07T12:00:00.000Z")) {
  let currentMs = start.getTime();
  return {
    clock: () => new Date(currentMs),
    advanceSeconds(seconds: number) {
      currentMs += seconds * 1000;
    },
    advanceMinutes(minutes: number) {
      currentMs += minutes * 60 * 1000;
    },
    set(date: Date) {
      currentMs = date.getTime();
    },
  };
}

// Registers a new user through the API; the returned agent keeps the
// session cookie, so it acts as that logged-in user.
export async function createLoggedInAgent(app: Express, username: string) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ username, password: "test password 123" });
  if (res.status !== 201) throw new Error(`Could not register ${username}`);
  return agent;
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
