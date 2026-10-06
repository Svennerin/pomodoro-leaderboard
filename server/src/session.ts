import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { config } from "./config.js";
import { pool } from "./db.js";

// Tells TypeScript what we store inside a session.
declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const PgSession = connectPgSimple(session);

// ASSUMPTION: a login lasts 7 days. The spec did not say.
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = "sid";

// Server-side sessions: the browser only holds a random session ID in a
// cookie; the data (who is logged in) lives in the Postgres `session` table.
// Logging out deletes that row, so the cookie becomes useless immediately,
// which a self-contained token (JWT) could not do.
export function createSessionMiddleware(production: boolean) {
  return session({
    store: new PgSession({ pool, tableName: "session" }),
    secret: config.sessionSecret,
    name: SESSION_COOKIE_NAME,
    // Don't re-save a session that did not change.
    resave: false,
    // Don't create a session (or set a cookie) for visitors who never log in.
    saveUninitialized: false,
    cookie: {
      // JavaScript in the page cannot read the cookie, which limits the
      // damage of a cross-site scripting bug.
      httpOnly: true,
      // The browser does not send the cookie on cross-site POST requests,
      // which blocks most cross-site request forgery.
      sameSite: "lax",
      // In production the cookie is only sent over HTTPS.
      secure: production,
      maxAge: SESSION_LIFETIME_MS,
    },
  });
}
