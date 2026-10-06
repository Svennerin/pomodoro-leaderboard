import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "./db.js";
import { weekBounds } from "./leaderboard.js";
import {
  createFakeClock,
  createLoggedInAgent,
  createTestApp,
  createUser,
  resetDatabase,
} from "./test/helpers.js";

// The fake clock starts on Wednesday 2026-01-07 12:00 UTC, so the current
// week is Monday 2026-01-05 00:00 UTC up to Monday 2026-01-12 00:00 UTC.
const WEEK_START = "2026-01-05T00:00:00.000Z";
const WEEK_END = "2026-01-12T00:00:00.000Z";

// Inserts a finished session directly, with the given completion time.
async function addCompleted(userId: number, completedAt: string) {
  const completed = new Date(completedAt);
  const started = new Date(completed.getTime() - 25 * 60 * 1000);
  await pool.query(
    `INSERT INTO pomodoros (user_id, started_at, completed_at, status)
     VALUES ($1, $2, $3, 'completed')`,
    [userId, started, completed],
  );
}

// Fetches the leaderboard as a logged-out visitor, with the clock on Wednesday.
async function getLeaderboard() {
  const app = createTestApp({ clock: createFakeClock().clock });
  return request(app).get("/api/leaderboard/weekly");
}

describe("weekBounds", () => {
  it("finds the Monday 00:00 UTC that starts the week", () => {
    const { start, end } = weekBounds(new Date("2026-01-07T12:00:00.000Z")); // Wednesday
    expect(start.toISOString()).toBe(WEEK_START);
    expect(end.toISOString()).toBe(WEEK_END);
  });

  it("treats Monday 00:00:00.000 as the first instant of the week", () => {
    expect(weekBounds(new Date(WEEK_START)).start.toISOString()).toBe(WEEK_START);
  });

  it("treats Sunday 23:59:59.999 as the last instant of the week", () => {
    const { start } = weekBounds(new Date("2026-01-11T23:59:59.999Z"));
    expect(start.toISOString()).toBe(WEEK_START);
  });

  it("works across a month and year boundary", () => {
    // Thursday 1 January 2026 belongs to the week starting Monday 29 December 2025.
    const { start } = weekBounds(new Date("2026-01-01T10:00:00.000Z"));
    expect(start.toISOString()).toBe("2025-12-29T00:00:00.000Z");
  });
});

describe("weekly leaderboard", () => {
  beforeEach(resetDatabase);
  afterAll(() => pool.end());

  it("is public and returns an empty list when nobody has completed a session", async () => {
    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.me).toBeNull();
    expect(res.body.weekStartsAt).toBe(WEEK_START);
    expect(res.body.weekEndsAt).toBe(WEEK_END);
  });

  it("counts only completed sessions", async () => {
    const alice = await createUser("alice");
    await addCompleted(alice, "2026-01-06T10:00:00Z");
    // An active and an abandoned session must not count.
    await pool.query("INSERT INTO pomodoros (user_id, started_at) VALUES ($1, $2)", [
      alice,
      "2026-01-06T11:00:00Z",
    ]);
    await pool.query(
      "INSERT INTO pomodoros (user_id, started_at, status) VALUES ($1, $2, 'abandoned')",
      [alice, "2026-01-06T12:00:00Z"],
    );

    const res = await getLeaderboard();
    expect(res.body.entries).toEqual([{ rank: 1, username: "alice", score: 1 }]);
  });

  it("includes only completions inside the week, to the millisecond", async () => {
    const before = await createUser("before");
    const first = await createUser("first");
    const last = await createUser("last");
    const after = await createUser("after");
    await addCompleted(before, "2026-01-04T23:59:59.999Z"); // last ms of previous week
    await addCompleted(first, "2026-01-05T00:00:00.000Z"); // first ms of this week
    await addCompleted(last, "2026-01-11T23:59:59.999Z"); // last ms of this week
    await addCompleted(after, "2026-01-12T00:00:00.000Z"); // first ms of next week

    const res = await getLeaderboard();
    const names = res.body.entries.map((e: { username: string }) => e.username);
    expect(names.sort()).toEqual(["first", "last"]);
  });

  it("starts a fresh board when the clock moves into the next week", async () => {
    const alice = await createUser("alice");
    await addCompleted(alice, "2026-01-06T10:00:00Z");
    const fake = createFakeClock();
    const app = createTestApp({ clock: fake.clock });

    expect((await request(app).get("/api/leaderboard/weekly")).body.entries).toHaveLength(1);
    fake.set(new Date("2026-01-12T00:00:00.000Z")); // the following Monday
    expect((await request(app).get("/api/leaderboard/weekly")).body.entries).toEqual([]);
  });

  it("orders by score, highest first", async () => {
    const [alice, bob, carol] = [
      await createUser("alice"),
      await createUser("bob"),
      await createUser("carol"),
    ];
    for (const t of ["2026-01-06T09:00Z", "2026-01-06T10:00Z", "2026-01-06T11:00Z"]) {
      await addCompleted(alice, t);
    }
    for (const t of ["2026-01-06T09:00Z", "2026-01-06T10:00Z", "2026-01-06T11:00Z", "2026-01-06T12:00Z", "2026-01-06T13:00Z"]) {
      await addCompleted(bob, t);
    }
    await addCompleted(carol, "2026-01-06T09:00Z");

    const res = await getLeaderboard();
    expect(res.body.entries).toEqual([
      { rank: 1, username: "bob", score: 5 },
      { rank: 2, username: "alice", score: 3 },
      { rank: 3, username: "carol", score: 1 },
    ]);
  });

  it("breaks ties in favour of whoever reached the score first", async () => {
    // zed is created first (lower id) and sorts last alphabetically, but
    // amy's latest completion is earlier, so amy must rank higher.
    const zed = await createUser("zed");
    const amy = await createUser("amy");
    await addCompleted(zed, "2026-01-06T08:00:00Z");
    await addCompleted(zed, "2026-01-06T15:00:00Z"); // zed's latest: 15:00
    await addCompleted(amy, "2026-01-06T09:00:00Z");
    await addCompleted(amy, "2026-01-06T10:00:00Z"); // amy's latest: 10:00

    const res = await getLeaderboard();
    expect(res.body.entries).toEqual([
      { rank: 1, username: "amy", score: 2 },
      { rank: 2, username: "zed", score: 2 },
    ]);
  });

  it("shows only the top 20", async () => {
    // 25 users with one completion each, a minute apart: earlier = better rank.
    for (let i = 0; i < 25; i++) {
      const id = await createUser(`user${String(i).padStart(2, "0")}`);
      await addCompleted(id, new Date(Date.UTC(2026, 0, 6, 10, i)).toISOString());
    }

    const res = await getLeaderboard();
    expect(res.body.entries).toHaveLength(20);
    expect(res.body.entries.map((e: { rank: number }) => e.rank)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(res.body.entries[0].username).toBe("user00");
    expect(res.body.entries[19].username).toBe("user19");
  });

  describe("the caller's own standing", () => {
    it("shows rank and score even when outside the top 20", async () => {
      const fake = createFakeClock();
      const app = createTestApp({ clock: fake.clock });
      // 20 users with two completions each fill the top 20.
      for (let i = 0; i < 20; i++) {
        const id = await createUser(`top${i}`);
        await addCompleted(id, "2026-01-06T09:00:00Z");
        await addCompleted(id, "2026-01-06T10:00:00Z");
      }
      const me = await createLoggedInAgent(app, "player");
      const { rows } = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE username = 'player'",
      );
      await addCompleted(Number(rows[0]!.id), "2026-01-06T09:00:00Z");

      const res = await me.get("/api/leaderboard/weekly");
      expect(res.body.entries).toHaveLength(20);
      expect(res.body.entries.some((e: { username: string }) => e.username === "player")).toBe(false);
      expect(res.body.me).toEqual({ rank: 21, score: 1 });
    });

    it("shows the rank of a user who is inside the top 20", async () => {
      const fake = createFakeClock();
      const app = createTestApp({ clock: fake.clock });
      const me = await createLoggedInAgent(app, "player");
      const { rows } = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE username = 'player'",
      );
      await addCompleted(Number(rows[0]!.id), "2026-01-06T09:00:00Z");

      const res = await me.get("/api/leaderboard/weekly");
      expect(res.body.me).toEqual({ rank: 1, score: 1 });
    });

    it("gives a logged-in user with no completions a score of 0 and no rank", async () => {
      const fake = createFakeClock();
      const app = createTestApp({ clock: fake.clock });
      const me = await createLoggedInAgent(app, "player");

      const res = await me.get("/api/leaderboard/weekly");
      expect(res.body.me).toEqual({ rank: null, score: 0 });
    });
  });

  it("exposes only rank, username and score, never ids or hashes", async () => {
    const alice = await createUser("alice");
    await addCompleted(alice, "2026-01-06T10:00:00Z");

    const res = await getLeaderboard();
    expect(Object.keys(res.body).sort()).toEqual(["entries", "me", "weekEndsAt", "weekStartsAt"]);
    expect(Object.keys(res.body.entries[0]).sort()).toEqual(["rank", "score", "username"]);
    expect(JSON.stringify(res.body)).not.toContain("not-a-real-hash");
  });
});
