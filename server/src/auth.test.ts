import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "./db.js";
import { createTestApp, resetDatabase } from "./test/helpers.js";

const PASSWORD = "correct horse battery";

// Reads the Set-Cookie headers of a response as plain strings.
function setCookies(res: request.Response): string[] {
  return (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
}

// Pulls out just the "sid=..." part of the session cookie.
function sessionCookie(res: request.Response): string {
  const cookie = setCookies(res).find((c) => c.startsWith("sid="));
  if (!cookie) throw new Error("No session cookie in response");
  return cookie.split(";")[0]!;
}

async function register(
  agent: ReturnType<typeof request.agent>,
  username: string,
  password = PASSWORD,
) {
  return agent.post("/api/auth/register").send({ username, password });
}

describe("auth", () => {
  beforeEach(resetDatabase);
  afterAll(() => pool.end());

  describe("register", () => {
    it("creates the account, logs the user in, and returns only the username", async () => {
      const agent = request.agent(createTestApp());
      const res = await register(agent, "Alice");

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ username: "Alice" });

      const me = await agent.get("/api/auth/me");
      expect(me.status).toBe(200);
      expect(me.body).toEqual({ username: "Alice" });
    });

    it("stores an argon2id hash, never the plaintext password", async () => {
      await register(request.agent(createTestApp()), "alice");

      const { rows } = await pool.query<{ password_hash: string }>(
        "SELECT password_hash FROM users",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.password_hash).toMatch(/^\$argon2id\$/);
      expect(rows[0]!.password_hash).not.toContain(PASSWORD);
    });

    it("rejects a duplicate username, ignoring case", async () => {
      const app = createTestApp();
      await register(request.agent(app), "Alice");
      const res = await register(request.agent(app), "aLiCe");

      expect(res.status).toBe(409);
      const { rows } = await pool.query("SELECT 1 FROM users");
      expect(rows).toHaveLength(1);
    });

    it.each([
      ["too short", "ab"],
      ["too long", "a".repeat(21)],
      ["contains a space", "bad name"],
      ["contains a hyphen", "bad-name"],
      ["contains a non-ASCII letter", "émile"],
      ["empty", ""],
    ])("rejects a username that is %s", async (_label, username) => {
      const res = await register(request.agent(createTestApp()), username);
      expect(res.status).toBe(400);
    });

    it.each([
      ["3 characters", "abc"],
      ["_a_", "_a_"],
      ["20 characters", "a".repeat(20)],
    ])("accepts the valid username %s", async (_label, username) => {
      const res = await register(request.agent(createTestApp()), username);
      expect(res.status).toBe(201);
    });

    it("enforces the password length limits (8 to 128)", async () => {
      const app = createTestApp();
      const tooShort = await register(request.agent(app), "user_a", "a".repeat(7));
      const shortest = await register(request.agent(app), "user_b", "a".repeat(8));
      const longest = await register(request.agent(app), "user_c", "a".repeat(128));
      const tooLong = await register(request.agent(app), "user_d", "a".repeat(129));

      expect(tooShort.status).toBe(400);
      expect(shortest.status).toBe(201);
      expect(longest.status).toBe(201);
      expect(tooLong.status).toBe(400);
    });

    it("rejects a body that is missing fields or has the wrong types", async () => {
      const app = createTestApp();
      const noBody = await request(app).post("/api/auth/register");
      const noPassword = await request(app)
        .post("/api/auth/register")
        .send({ username: "alice" });
      const wrongTypes = await request(app)
        .post("/api/auth/register")
        .send({ username: 123, password: ["x"] });

      expect(noBody.status).toBe(400);
      expect(noPassword.status).toBe(400);
      expect(wrongTypes.status).toBe(400);
    });
  });

  describe("login", () => {
    it("logs in with the right password, ignoring username case", async () => {
      const app = createTestApp();
      await register(request.agent(app), "Alice");

      const agent = request.agent(app);
      const res = await agent
        .post("/api/auth/login")
        .send({ username: "alice", password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ username: "Alice" });
      expect((await agent.get("/api/auth/me")).status).toBe(200);
    });

    it("gives the same generic error for a wrong password and an unknown user", async () => {
      const app = createTestApp();
      await register(request.agent(app), "alice");

      const wrongPassword = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice", password: "wrong password" });
      const unknownUser = await request(app)
        .post("/api/auth/login")
        .send({ username: "nobody", password: "wrong password" });

      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      expect(wrongPassword.body).toEqual({ error: "Invalid username or password" });
      expect(unknownUser.body).toEqual(wrongPassword.body);
    });

    it("issues a new session ID on every login", async () => {
      const app = createTestApp();
      await register(request.agent(app), "alice");

      const agent = request.agent(app);
      const first = await agent
        .post("/api/auth/login")
        .send({ username: "alice", password: PASSWORD });
      const second = await agent
        .post("/api/auth/login")
        .send({ username: "alice", password: PASSWORD });

      expect(sessionCookie(first)).not.toBe(sessionCookie(second));
    });

    it("sets an httpOnly, SameSite=Lax session cookie", async () => {
      const res = await register(request.agent(createTestApp()), "alice");
      const cookie = setCookies(res).find((c) => c.startsWith("sid="))!;

      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      // Not Secure here because tests run over plain HTTP, not production.
      expect(cookie).not.toContain("Secure");
    });
  });

  describe("protected routes and logout", () => {
    it("returns 401 for /me and /logout when logged out", async () => {
      const app = createTestApp();
      expect((await request(app).get("/api/auth/me")).status).toBe(401);
      expect((await request(app).post("/api/auth/logout")).status).toBe(401);
    });

    it("destroys the session on the server when logging out", async () => {
      const app = createTestApp();
      const agent = request.agent(app);
      const registered = await register(agent, "alice");
      const oldCookie = sessionCookie(registered);

      const before = await pool.query("SELECT 1 FROM session");
      expect(before.rowCount).toBe(1);

      expect((await agent.post("/api/auth/logout")).status).toBe(204);

      // The row is gone from Postgres...
      const after = await pool.query("SELECT 1 FROM session");
      expect(after.rowCount).toBe(0);
      expect((await agent.get("/api/auth/me")).status).toBe(401);
      // ...so even replaying the OLD cookie no longer works.
      const replay = await request(app).get("/api/auth/me").set("Cookie", oldCookie);
      expect(replay.status).toBe(401);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 once an IP exceeds the register/login limit", async () => {
      const app = createTestApp({ authRateLimit: { windowMs: 60_000, limit: 3 } });
      const attempt = () =>
        request(app)
          .post("/api/auth/login")
          .send({ username: "nobody", password: "whatever123" });

      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(429);
    });
  });
});
