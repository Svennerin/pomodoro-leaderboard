import express from "express";

// Builds the Express app without starting a server. Keeping this separate
// from index.ts lets tests call the app directly (via Supertest) without
// opening a real network port.
export function createApp() {
  const app = express();

  // Lets the host (and us) check that the server is up.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
