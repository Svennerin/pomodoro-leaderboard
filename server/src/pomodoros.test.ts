import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "./db.js";
import {
  createFakeClock,
  createLoggedInAgent,
  createTestApp,
  resetDatabase,
} from "./test/helpers.js";

interface PomodoroRow {
  status: string;
  started_at: Date;
  completed_at: Date | null;
}

async function getRow(id: number): Promise<PomodoroRow> {
  const { rows } = await pool.query<PomodoroRow>(
    "SELECT status, started_at, completed_at FROM pomodoros WHERE id = $1",
    [id],
  );
  return rows[0]!;
}

// A fresh app, fake clock, and one logged-in user per test.
async function setup() {
  const fake = createFakeClock();
  const app = createTestApp({ clock: fake.clock });
  const alice = await createLoggedInAgent(app, "alice");
  return { fake, app, alice };
}

async function startSession(agent: ReturnType<typeof request.agent>) {
  const res = await agent.post("/api/pomodoros/start");
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("pomodoros", () => {
  beforeEach(resetDatabase);
  afterAll(() => pool.end());

  describe("start", () => {
    it("creates an active session stamped with the server clock", async () => {
      const { fake, alice } = await setup();
      const res = await alice.post("/api/pomodoros/start");

      expect(res.status).toBe(201);
      expect(res.body.durationSeconds).toBe(1500);
      const row = await getRow(res.body.id);
      expect(row.status).toBe("active");
      expect(row.started_at.toISOString()).toBe(fake.clock().toISOString());
    });

    it("abandons the previous session, leaving exactly one active", async () => {
      const { alice } = await setup();
      const first = await startSession(alice);
      const second = await startSession(alice);

      expect((await getRow(first)).status).toBe("abandoned");
      expect((await getRow(second)).status).toBe("active");
    });

    it("never leaves two active sessions when starts arrive at the same time", async () => {
      const { alice } = await setup();
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => alice.post("/api/pomodoros/start")),
      );

      expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      const { rows } = await pool.query<{ status: string; count: string }>(
        "SELECT status, count(*) FROM pomodoros GROUP BY status",
      );
      const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
      expect(counts).toEqual({ active: 1, abandoned: 4 });
    });

    it("lets two different users each have an active session", async () => {
      const { app, alice } = await setup();
      const bob = await createLoggedInAgent(app, "bob");
      await startSession(alice);
      await startSession(bob);

      const { rows } = await pool.query(
        "SELECT 1 FROM pomodoros WHERE status = 'active'",
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe("complete: the timing rule", () => {
    // [description, seconds after start, expected HTTP status]
    it.each([
      ["1 second before 24 minutes", 24 * 60 - 1, 400],
      ["exactly 24 minutes", 24 * 60, 200],
      ["25 minutes", 25 * 60, 200],
      ["exactly 40 minutes", 40 * 60, 200],
      ["1 second after 40 minutes", 40 * 60 + 1, 400],
    ])("at %s", async (_label, seconds, expectedStatus) => {
      const { fake, alice } = await setup();
      const id = await startSession(alice);

      fake.advanceSeconds(seconds);
      const res = await alice.post(`/api/pomodoros/${id}/complete`);
      expect(res.status).toBe(expectedStatus);

      const row = await getRow(id);
      if (expectedStatus === 200) {
        expect(row.status).toBe("completed");
        // completed_at comes from the server clock, not the client.
        expect(row.completed_at?.toISOString()).toBe(fake.clock().toISOString());
      } else {
        // A rejected attempt leaves the session untouched.
        expect(row.status).toBe("active");
        expect(row.completed_at).toBeNull();
      }
    });

    it("rejects an immediate complete (like a curl call right after start)", async () => {
      const { alice } = await setup();
      const id = await startSession(alice);
      const res = await alice.post(`/api/pomodoros/${id}/complete`);

      expect(res.status).toBe(400);
      expect((await getRow(id)).status).toBe("active");
    });
  });

  describe("complete: other rules", () => {
    it("rejects completing another user's session and leaves it unchanged", async () => {
      const { fake, app, alice } = await setup();
      const bob = await createLoggedInAgent(app, "bob");
      const alicesId = await startSession(alice);

      fake.advanceMinutes(25);
      const res = await bob.post(`/api/pomodoros/${alicesId}/complete`);

      expect(res.status).toBe(404);
      expect((await getRow(alicesId)).status).toBe("active");
    });

    it("rejects completing a session that is already completed", async () => {
      const { fake, alice } = await setup();
      const id = await startSession(alice);
      fake.advanceMinutes(25);
      expect((await alice.post(`/api/pomodoros/${id}/complete`)).status).toBe(200);

      const again = await alice.post(`/api/pomodoros/${id}/complete`);
      expect(again.status).toBe(409);
    });

    it("rejects completing an abandoned session", async () => {
      const { fake, alice } = await setup();
      const abandoned = await startSession(alice);
      await startSession(alice); // starting again abandons the first
      fake.advanceMinutes(25);

      const res = await alice.post(`/api/pomodoros/${abandoned}/complete`);
      expect(res.status).toBe(409);
      expect((await getRow(abandoned)).status).toBe("abandoned");
    });

    it("lets only one of two simultaneous complete calls succeed", async () => {
      const { fake, alice } = await setup();
      const id = await startSession(alice);
      fake.advanceMinutes(25);

      const results = await Promise.all([
        alice.post(`/api/pomodoros/${id}/complete`),
        alice.post(`/api/pomodoros/${id}/complete`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it("returns 404 for an id that does not exist or is malformed", async () => {
      const { alice } = await setup();
      expect((await alice.post("/api/pomodoros/999999/complete")).status).toBe(404);
      expect((await alice.post("/api/pomodoros/abc/complete")).status).toBe(404);
      expect((await alice.post("/api/pomodoros/1;DROP/complete")).status).toBe(404);
    });
  });

  describe("abandon", () => {
    it("abandons an active session", async () => {
      const { alice } = await setup();
      const id = await startSession(alice);

      expect((await alice.post(`/api/pomodoros/${id}/abandon`)).status).toBe(200);
      expect((await getRow(id)).status).toBe("abandoned");
    });

    it("returns 409 when the session is not active", async () => {
      const { alice } = await setup();
      const id = await startSession(alice);
      await alice.post(`/api/pomodoros/${id}/abandon`);

      expect((await alice.post(`/api/pomodoros/${id}/abandon`)).status).toBe(409);
    });

    it("returns 404 for another user's session and leaves it active", async () => {
      const { app, alice } = await setup();
      const bob = await createLoggedInAgent(app, "bob");
      const alicesId = await startSession(alice);

      expect((await bob.post(`/api/pomodoros/${alicesId}/abandon`)).status).toBe(404);
      expect((await getRow(alicesId)).status).toBe("active");
    });
  });

  describe("authentication", () => {
    it("returns 401 on every pomodoro route when logged out", async () => {
      const app = createTestApp();
      expect((await request(app).post("/api/pomodoros/start")).status).toBe(401);
      expect((await request(app).post("/api/pomodoros/1/complete")).status).toBe(401);
      expect((await request(app).post("/api/pomodoros/1/abandon")).status).toBe(401);
    });
  });
});
