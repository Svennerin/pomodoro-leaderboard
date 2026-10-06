import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "./db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createTestApp, resetDatabase } from "./test/helpers.js";

describe("security", () => {
  beforeEach(resetDatabase);
  afterAll(() => pool.end());

  describe("headers and CORS", () => {
    it("sends helmet's protective headers and hides that we use Express", async () => {
      const res = await request(createTestApp()).get("/api/health");

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBeDefined();
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("sends no CORS headers, so other websites cannot read API responses", async () => {
      const res = await request(createTestApp())
        .get("/api/leaderboard/weekly")
        .set("Origin", "https://evil.example");

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("request bodies", () => {
    it("rejects a body over 10 KB with 413", async () => {
      const res = await request(createTestApp())
        .post("/api/auth/register")
        .send({ username: "alice", password: "x".repeat(20_000) });

      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: "Request body too large" });
    });

    it("rejects malformed JSON with 400 and no internal details", async () => {
      const res = await request(createTestApp())
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send("{ this is not json");

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Bad request" });
    });

    it("returns a JSON 404 for an unknown API path", async () => {
      const res = await request(createTestApp()).get("/api/nothing-here");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Not found" });
    });
  });

  describe("cookies in production", () => {
    it("marks the session cookie Secure when the request arrived over HTTPS", async () => {
      // In production the host's proxy terminates HTTPS and tells us so with
      // the X-Forwarded-Proto header; `trust proxy` makes Express believe it.
      const app = createTestApp({ production: true });
      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-Proto", "https")
        .send({ username: "alice", password: "test password 123" });

      const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
        c.startsWith("sid="),
      );
      expect(res.status).toBe(201);
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
    });

    it("refuses to send a Secure cookie over plain HTTP", async () => {
      const app = createTestApp({ production: true });
      const res = await request(app)
        .post("/api/auth/register")
        .send({ username: "alice", password: "test password 123" });

      expect(res.headers["set-cookie"]).toBeUndefined();
    });
  });

  describe("errors and injection", () => {
    it("hides the details of an unexpected error from the client", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const app = express();
      app.get("/boom", () => {
        throw new Error("secret internal detail");
      });
      app.use(errorHandler);

      const res = await request(app).get("/boom");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Internal server error" });
      expect(JSON.stringify(res.body)).not.toContain("secret");
      // The detail was logged for us instead.
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("treats SQL in a username as plain text (parameterized queries)", async () => {
      const app = createTestApp();
      await request(app)
        .post("/api/auth/register")
        .send({ username: "alice", password: "test password 123" });

      const injected = await request(app)
        .post("/api/auth/login")
        .send({ username: "alice' OR '1'='1", password: "anything at all" });
      expect(injected.status).toBe(401);

      const dropAttempt = await request(app)
        .post("/api/auth/register")
        .send({ username: "x'; DROP TABLE users; --", password: "test password 123" });
      expect(dropAttempt.status).toBe(400);

      // The users table is still there, with exactly one row.
      const { rows } = await pool.query("SELECT 1 FROM users");
      expect(rows).toHaveLength(1);
    });
  });
});
