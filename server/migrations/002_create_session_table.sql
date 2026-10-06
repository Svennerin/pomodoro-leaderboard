-- Login sessions, stored server-side. This is the table layout that the
-- connect-pg-simple library expects (we create it here, in a migration, so
-- that all schema changes live in one place instead of being created by the
-- library at runtime).
CREATE TABLE "session" (
  "sid"    VARCHAR      NOT NULL PRIMARY KEY,
  "sess"   JSON         NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);

-- Lets the library delete expired sessions quickly.
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
