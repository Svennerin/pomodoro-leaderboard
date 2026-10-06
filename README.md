# Pomodoro Leaderboard

A small public web app. Create an account, run 25-minute Pomodoro sessions, and appear on a
weekly leaderboard based on how many sessions you completed. The **server**, not the browser,
decides whether a session counts.

**Live site:** _not deployed yet: add the URL here after deploying (see [Deploying](#deploying))_

![Screenshot of the app: a 25:00 timer above the weekly leaderboard](docs/screenshot.jpg)

_(Screenshot from a local development copy; replace it with one from the live site.)_

## What it does

- Sign up and log in with a username and password (no email, no third-party login).
- Start a 25-minute timer. When it reaches 0:00 the browser asks the server to complete the
  session, and the server accepts it only if the timing is plausible.
- A public leaderboard shows the top 20 for the current week (Monday 00:00 UTC to Sunday
  23:59:59 UTC), plus your own rank if you are outside the top 20.

## Tech

React + TypeScript + Vite (frontend), Node.js + Express 5 + TypeScript (backend), PostgreSQL
with plain SQL through the `pg` driver (no ORM), Vitest + Supertest for tests, GitHub Actions
for CI. See [DEPENDENCIES.md](DEPENDENCIES.md) for every package and why it is there, and
[ARCHITECTURE.md](ARCHITECTURE.md) and [DECISIONS.md](DECISIONS.md) for how and why it is built
this way.

## Run it locally

You need **Node.js 24** and **PostgreSQL** (any recent version) installed.

1. Create two empty databases and a user that can use them, for example `pomodoro_dev` and
   `pomodoro_test`. The test database name **must end in `_test`**: the tests empty its tables.
2. Set up the server's environment and install packages:

   ```bash
   cd server
   cp .env.example .env     # then edit .env: your database URLs and a random SESSION_SECRET
   npm install
   npm run migrate          # creates the tables in the dev database
   ```

3. Install the client's packages:

   ```bash
   cd ../client
   npm install
   ```

4. Run both servers (two terminals):

   ```bash
   cd server && npm run dev      # API on http://localhost:3000
   ```

   ```bash
   cd client && npm run dev      # page on http://localhost:5173 (forwards /api to the API)
   ```

   Open http://localhost:5173.

## Run the tests

```bash
cd server && npm test      # needs the *_test database from step 1
cd client && npm test
```

The server tests run against a real PostgreSQL database. They never wait 24 minutes: the code
that makes timing decisions asks an injected clock for the time, and the tests use a fake one.

Other checks (run in CI on every push): `npm run lint`, `npm run typecheck`, `npm run build`.

## Deploying

One service serves both the built page and the API, plus a managed PostgreSQL database.

- **Build command:**
  `npm ci --include=dev --prefix client && npm run build --prefix client && npm ci --include=dev --prefix server && npm run build --prefix server`
- **Start command:** `npm run migrate:prod --prefix server && npm start --prefix server`
- **Environment variables:** `DATABASE_URL`, `SESSION_SECRET` (a long random string),
  `NODE_ENV=production`. Most hosts set `PORT` themselves.
- **Health check path:** `/api/health`

`--include=dev` is needed because the build uses TypeScript and Vite, which are dev dependencies,
and `NODE_ENV=production` would otherwise make `npm ci` skip them.

## Known limitations

- **The timer cannot be made fully cheat-proof.** The server only accepts a completion between
  24 and 40 minutes after it recorded the start, so calling the API directly (for example with
  curl) right after starting is rejected. But a determined user can write a script that starts a
  session, waits 24 real minutes and completes it. The check blocks trivial abuse only. Making
  it stronger would need things like focus detection or activity proofs, which are out of scope.
- Usernames are public and there is no moderation, so inappropriate names are possible.
- No password reset: no email is collected, so a forgotten password cannot be recovered.
- Refreshing the page during a session does not resume it; the old session is abandoned when a
  new one starts (by design).
- Rate limiting is in memory, per server process, so it resets when the server restarts. That is
  fine for one instance.
