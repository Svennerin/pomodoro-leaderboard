import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("health check", () => {
  it("returns ok", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
