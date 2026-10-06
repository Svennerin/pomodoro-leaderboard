import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the page comes from Vite (port 5173) and the API from
    // Express (port 3000). Forwarding /api through Vite makes the browser see
    // one origin, exactly like production, so session cookies just work.
    proxy: { "/api": "http://localhost:3000" },
  },
  test: { environment: "node" },
});
