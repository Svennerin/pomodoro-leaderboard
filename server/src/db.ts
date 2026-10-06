import pg from "pg";

const connectionString = process.env.DATABASE_URL;

// Fail loudly instead of letting pg silently fall back to its own defaults
// (which could connect to the wrong database).
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

// One shared connection pool for the whole app. All queries go through it.
export const pool = new pg.Pool({ connectionString });

// Postgres error code for "a unique index rejected this row".
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === UNIQUE_VIOLATION
  );
}
