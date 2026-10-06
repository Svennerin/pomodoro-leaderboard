# Decisions

Non-obvious choices, and what was rejected. Written so each can be explained in an interview.

## Sessions in Postgres, not JWT
Login state is a random id in an `httpOnly` cookie, stored server-side in the `session` table.
Logging out deletes the row, so a copied cookie stops working immediately. A JWT is valid until it
expires unless a deny-list is added, which brings back the server-side state JWTs are meant to avoid.
Cost: one database read per authenticated request, which is fine at this scale.

## Raw SQL with `pg`, not an ORM
The owner is learning SQL and has to defend every query, so the queries stay visible in the code.
Cost: more boilerplate and manual conversion of types (Postgres `bigint` arrives in JavaScript as a string).

## Score is counted by query, never stored
The weekly score is `COUNT(*)` over completed sessions in the week, computed on each request. It can never
disagree with the sessions themselves, needs no counter to update or reset on Monday, and cannot be
corrupted by a bug that forgets to increment. Cost: a count per request, kept cheap by a partial index.

## argon2id, not bcrypt
argon2id is the currently recommended password hash and accepts long passwords. bcrypt silently ignores
everything after 72 *bytes*. Passwords are limited to 8-128 characters.

## Usernames are ASCII only (3-20 of letters, digits, underscore)
Avoids look-alike Unicode characters (impersonation on a public leaderboard) and makes the
case-insensitive uniqueness index reliable. Uniqueness is enforced by a database index on `lower(username)`.
Registration catches the unique-violation error rather than checking first, because check-then-insert has a race.

## The timing rule is one atomic `UPDATE`
`complete` is a single conditional `UPDATE ... WHERE` (owner, status active, 24-40 minutes elapsed). A separate
"read, check in JavaScript, then write" would let two simultaneous requests both pass. A second query runs only to
choose the error message after the `UPDATE` matched nothing.

## Per-user row lock when starting a session (changed from the first plan)
The first plan was "retry once on a unique-index error". With several simultaneous starts, a single retry can collide
again, so the number of retries would have to match the number of concurrent requests. Starting now locks the user's row
(`SELECT ... FOR UPDATE`) inside the transaction, so concurrent starts for the same user queue up and nobody gets an error.
The unique index `one_active_per_user` stays as the database-level guarantee. Evidence: with the lock removed, the
five-simultaneous-starts test fails with 500 errors (the index still prevents two active rows); with it, all five succeed.

## Injected clock
Every timing decision (`started_at`, `completed_at`, the week boundary) asks a `clock()` function passed into
`createApp`. Tests substitute a fake clock to simulate 24 minutes instantly. The application sets the timestamps
itself, so the database's `DEFAULT now()` on those columns is never relied on.

## Weekly range is half-open: `>= Monday 00:00 UTC` and `< next Monday 00:00 UTC`
"Up to Sunday 23:59:59" would drop a completion at 23:59:59.500. The half-open range has no gaps or overlaps.

## Leaderboard ties
Ordered by score, then earlier latest completion (reached the score first), then `user_id` so the order is deterministic.

## 404 (not 403) for someone else's session
Ids are sequential numbers; a 403 would confirm which ids exist. A session that is missing and one owned by
someone else get the same 404.

## Client timer counts from when the start response arrives (deviates from spec section 3.4)
The spec says to compute the countdown from the server's `started_at`. That compares the server's timestamp with the
browser's clock, so a computer whose clock runs a few minutes ahead would reach 0:00 early and have a legitimate
completion rejected. Instead the client counts 25 minutes on its own clock from the moment the start response arrives.
It always finishes slightly after the server's 25 minutes, whatever the clock says. The countdown is still computed as
"end time minus now", not by decrementing a counter, so background-tab throttling does not matter. Security is
unaffected: only the server's clock decides.

## No CSRF token
`SameSite=Lax` on the session cookie stops browsers sending it on cross-site POSTs, which covers the classic attack.
It does not cover same-site attacks (for example from a malicious subdomain). A CSRF token would add a dependency and
moving parts for little gain on a site with one origin and no subdomains; revisit if that changes.

## No CORS
The page and API share one origin (in development through Vite's proxy). With no CORS headers, browsers refuse
cross-origin reads, which is the desired behaviour.

## Hand-written validation
Only register and login take input, and the rules are two short checks, so a schema library would add more to explain than it saves.

## A ~50-line migration runner, not a migration tool
Numbered `.sql` files plus a `schema_migrations` table. Each file and its record run in one transaction. Easy to read and
explain; a tool like node-pg-migrate would hide the mechanism.

## Plain CSS, not Tailwind
One page with a handful of components. Tailwind would add a build dependency and a second vocabulary to explain.

## Rate limiting: 10 register/login requests per IP per 15 minutes, in memory
The spec gave no numbers (assumption). The limiter's counters live in the server process, so they reset on restart and are not
shared between instances, which is acceptable for a single instance. In production `trust proxy` is set to 1 so the limiter sees
visitors' real addresses instead of the host proxy's.

## One service serves both the page and the API
Express serves `client/dist`. One deployment, one origin (no CORS, cookies just work), and a smaller bill than two services.

## Hosting recommendation
The spec asks for a proposal. A web service on Render (or Railway) plus a managed Postgres such as Neon. Free tiers change
often, so check current terms before choosing. Things to weigh: free web services may sleep when idle (first request is slow);
some free databases expire; paid tiers of a few dollars a month remove both problems.
