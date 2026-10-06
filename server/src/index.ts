import { existsSync } from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { config } from "./config.js";

// The built frontend lives next to the server folder: <repo>/client/dist.
// This path works from both src/ (tsx) and dist/ (compiled build). If the
// frontend has not been built, only the API is served (local development
// uses the Vite dev server for the page instead).
const clientDir = path.join(import.meta.dirname, "..", "..", "client", "dist");

createApp({ clientDir: existsSync(clientDir) ? clientDir : undefined }).listen(
  config.port,
  () => {
    console.log(`Server listening on port ${config.port}`);
  },
);
