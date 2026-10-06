# Architecture

## Components and where they run

```mermaid
flowchart LR
    subgraph Browser
        SPA["React single-page app<br/>(client/)"]
    end
    subgraph Host["One deployed service (Node.js)"]
        Static["Static files<br/>(client/dist)"]
        API["Express API<br/>(server/src)"]
    end
    DB[("PostgreSQL<br/>users, pomodoros, session")]

    SPA -- "loads page and scripts" --> Static
    SPA -- "fetch /api/... (same origin, session cookie)" --> API
    API -- "SQL via pg" --> DB
```

| Component | Runs in | Responsibility |
|---|---|---|
| React app (`client/`) | The visitor's browser | Shows the forms, timer and leaderboard. Counts down locally. Holds no secrets and makes no decisions about what counts. |
| Express server (`server/`) | One Node.js process on the host | Validates input, hashes passwords, manages sessions, enforces the timing rule, computes the leaderboard. Also serves the built React files, so the page and API share one origin. |
| PostgreSQL | A managed database service | The only place state lives: `users`, `pomodoros`, and `session` (login sessions). |

In development the React app is served by Vite on port 5173, which forwards `/api` to Express on
port 3000, so the browser still sees a single origin, like production.

### Inside the server

```
src/index.ts          starts listening (and finds client/dist)
src/app.ts            createApp(): wires middleware and routes together
src/session.ts        session middleware (cookie + Postgres store)
src/routes/*.ts       thin HTTP handlers: auth, pomodoros, leaderboard
src/pomodoros.ts      the timing rule and the start transaction (no Express in here)
src/leaderboard.ts    the weekly SQL query and week boundaries
src/middleware/*.ts   requireLogin, errorHandler
src/validation.ts     username / password rules
src/db.ts, migrate.ts connection pool, migration runner
migrations/*.sql      the schema, applied in order
```

## Data flows

### (a) Sign-up and login

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Express
    participant D as PostgreSQL

    B->>S: POST /api/auth/register {username, password}
    S->>S: rate limit check, validate input
    S->>S: argon2id hash of the password
    S->>D: INSERT INTO users (username, password_hash)
    alt username already taken (unique index on lower(username))
        D-->>S: unique violation
        S-->>B: 409 Username is already taken
    else created
        S->>D: INSERT session row (new random session id, userId)
        S-->>B: 201 {username} + Set-Cookie sid (httpOnly, SameSite=Lax, Secure in production)
    end

    Note over B,S: Later requests carry the cookie automatically
    B->>S: GET /api/auth/me (Cookie: sid)
    S->>D: SELECT session by id
    S-->>B: 200 {username}  (or 401 if no valid session)

    B->>S: POST /api/auth/logout
    S->>D: DELETE session row
    S-->>B: 204 (old cookie is now useless)
```

Login is the same shape: look the user up (case-insensitively), verify the password against the
stored argon2id hash (against a dummy hash if the user does not exist, so timing does not leak
which usernames exist), and answer with one generic error on any failure. The session id is
replaced at every login to prevent session fixation.

### (b) Start and complete a session

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Express
    participant D as PostgreSQL

    B->>S: POST /api/pomodoros/start (cookie)
    S->>D: BEGIN
    S->>D: SELECT ... FROM users WHERE id=$1 FOR UPDATE (queue concurrent starts)
    S->>D: UPDATE pomodoros SET status='abandoned' WHERE user_id=$1 AND status='active'
    S->>D: INSERT INTO pomodoros (user_id, started_at = server clock)
    S->>D: COMMIT
    S-->>B: 201 {id, durationSeconds: 1500}

    Note over B: Counts down 25:00 on its own clock,<br/>from the moment this response arrived

    B->>S: POST /api/pomodoros/:id/complete (at 0:00)
    S->>D: UPDATE ... SET status='completed', completed_at = server clock<br/>WHERE id, user_id, status='active'<br/>AND 24 min <= now - started_at <= 40 min
    alt one row updated
        S-->>B: 200
        B->>S: GET /api/leaderboard/weekly (refresh)
    else no row updated
        S-->>B: 404 / 409 / 400 (not yours, not active, too early or too late)
    end
```

The browser never sends a time or a duration. Both timestamps come from the server's clock, and the
accept/reject decision is a single atomic `UPDATE`, so two simultaneous complete calls cannot both succeed.

### (c) Loading the leaderboard

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Express
    participant D as PostgreSQL

    B->>S: GET /api/leaderboard/weekly (cookie optional)
    S->>S: week = Monday 00:00 UTC up to next Monday 00:00 UTC (server clock)
    S->>D: one query: count completed sessions per user in the week,<br/>rank them, return top 20 + the caller's own row
    D-->>S: rows
    S-->>B: 200 {weekStartsAt, weekEndsAt, entries[{rank, username, score}], me}
```

The route is public. If the visitor happens to be logged in, their own rank and score are included
(`me`); otherwise `me` is `null`. Scores are never stored: they are counted from `pomodoros` on every request.

## Data model

- `users(id, username, password_hash, created_at)`: unique index on `lower(username)`.
- `pomodoros(id, user_id, started_at, completed_at, status)`: `status` is `active`, `completed` or
  `abandoned`; a check constraint ties `completed_at` to the completed status; a partial unique
  index allows at most one `active` row per user.
- `session(sid, sess, expire)`: managed by `connect-pg-simple`.
- `schema_migrations(filename, applied_at)`: which migration files have run.
