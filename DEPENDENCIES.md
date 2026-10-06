# Dependencies

Every package the project installs, with what it does and why it was chosen. Versions are in
each `package.json`. The project avoids optional extras on purpose: if a task is small enough to
write by hand clearly (input validation, the migration runner), it is written by hand.

## Server runtime (`server/package.json`, `dependencies`)

| Package | What it does | Why this one |
|---|---|---|
| `express` | The web framework: routing, middleware, JSON bodies, static files. | The most widely used Node framework, so it is easy to explain. Version 5 forwards errors from `async` handlers automatically. |
| `pg` | The PostgreSQL driver: connection pool and parameterized queries. | The standard driver. Using it directly (no ORM) keeps every SQL query visible. |
| `argon2` | Hashes and verifies passwords with argon2id. | Vetted library (no hand-written cryptography). argon2id is the current recommended password hash, and unlike bcrypt it has no 72-byte input limit. |
| `express-session` | Server-side login sessions with a cookie holding only a random session id. | The standard session middleware. Server-side sessions can be revoked instantly on logout. |
| `connect-pg-simple` | Stores `express-session` sessions in a PostgreSQL table. | Reuses the database we already have, so no extra service such as Redis. |
| `express-rate-limit` | Limits how many register/login requests one IP can make in a time window. | Small, well-known, and enough for the spec's rate limiting requirement. |
| `helmet` | Sets protective HTTP response headers (Content-Security-Policy and others). | One line of setup for a set of defaults maintained by security-minded people. |

## Server development (`devDependencies`)

| Package | What it does | Why this one |
|---|---|---|
| `typescript` | The TypeScript compiler; also used for type-checking (`tsc --noEmit`). | Catches mistakes before running; required by the stack. |
| `tsx` | Runs TypeScript files directly during development, with auto-restart. | Simplest way to run TS in Node without a build step while developing. |
| `vitest` | The test runner. | Fast, TypeScript-friendly, and shares one tool with the client's tests. |
| `supertest` | Sends HTTP requests to the Express app inside tests, without opening a port. | The standard companion for testing Express apps. |
| `eslint`, `@eslint/js`, `typescript-eslint` | Static analysis that flags suspicious code patterns. | The usual lint setup for TypeScript projects; CI runs it on every push. |
| `@types/node`, `@types/express`, `@types/pg`, `@types/express-session`, `@types/connect-pg-simple`, `@types/supertest` | Type declarations so TypeScript understands libraries written in plain JavaScript. | Needed for type-checking; they add no runtime code. |

## Client runtime (`client/package.json`, `dependencies`)

| Package | What it does | Why this one |
|---|---|---|
| `react`, `react-dom` | Builds the user interface from components and renders it in the browser. | Part of the chosen stack; the single page has a few small components. |

## Client development (`devDependencies`)

| Package | What it does | Why this one |
|---|---|---|
| `vite` | Dev server (with hot reload and the `/api` proxy) and production bundler. | The standard modern build tool for React; very little configuration. |
| `@vitejs/plugin-react` | Lets Vite compile React's JSX syntax. | Required to use React with Vite. |
| `typescript`, `eslint`, `@eslint/js`, `typescript-eslint` | Type-checking and linting, same as the server. | Consistency between the two halves. |
| `vitest` | Test runner for the client's small pure-logic tests (the countdown maths). | Same tool as the server. No DOM-testing libraries were added, to keep the dependency count down. |
| `@types/react`, `@types/react-dom` | Type declarations for React. | Needed for type-checking. |

## Not used, on purpose

An ORM (raw SQL is the point of the project), a validation library such as zod (only three
endpoints take input), JWT libraries (sessions instead), a CORS package (same-origin design),
Tailwind (plain CSS is enough for one page), dotenv (Node's built-in `--env-file` flag is used).
