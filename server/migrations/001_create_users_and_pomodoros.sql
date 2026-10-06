CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  username       TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: "Alice" and "alice" collide because the index
-- is built on lower(username). The username keeps the case the user typed.
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));

CREATE TABLE pomodoros (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'abandoned')),
  -- completed_at must be set exactly when the status is 'completed'
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

-- At most one active session per user, enforced by the database itself.
-- This is a partial index: only rows with status = 'active' are indexed, so
-- a user can have any number of completed or abandoned rows.
CREATE UNIQUE INDEX one_active_per_user
  ON pomodoros (user_id) WHERE status = 'active';

-- Supports the weekly leaderboard query (only completed rows are indexed).
CREATE INDEX pomodoros_completed_idx
  ON pomodoros (completed_at) WHERE status = 'completed';
