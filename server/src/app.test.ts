import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { pool } from "./db.js";

describe("health check", () => {
  afterAll(() => pool.end());

  it("returns ok", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("serving the built frontend", () => {
  it("serves the page at / and still answers /api paths with JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "client-dist-"));
    try {
      await writeFile(path.join(dir, "index.html"), "<h1>the page</h1>");
      const app = createApp({ clientDir: dir });

      const page = await request(app).get("/");
      expect(page.status).toBe(200);
      expect(page.text).toContain("the page");

      // An unknown API path must not fall through to the page.
      const missing = await request(app).get("/api/nothing-here");
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: "Not found" });
      expect((await request(app).get("/api/health")).status).toBe(200);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("serves no page when no frontend folder is configured", async () => {
    expect((await request(createApp()).get("/")).status).toBe(404);
  });
});
