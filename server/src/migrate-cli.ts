import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";

// Entry point for `npm run migrate`.
const applied = await runMigrations(pool);
console.log(
  applied.length > 0 ? `Applied: ${applied.join(", ")}` : "No new migrations.",
);
await pool.end();
