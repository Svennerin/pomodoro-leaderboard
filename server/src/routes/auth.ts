import argon2 from "argon2";
import { type Request, type RequestHandler, Router } from "express";
import { isUniqueViolation, pool } from "../db.js";
import { requireLogin } from "../middleware/requireLogin.js";
import { SESSION_COOKIE_NAME } from "../session.js";
import { readCredentials, validateNewCredentials } from "../validation.js";

// One message for every kind of login failure, so an attacker cannot tell
// "no such user" from "wrong password".
const INVALID_LOGIN = { error: "Invalid username or password" };

// A real argon2 hash of a throwaway string. When the username does not
// exist we still verify against this, so the response takes about as long as
// a real check and timing does not reveal which usernames exist.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash("not-a-real-password", { type: argon2.argon2id });
  return dummyHash;
}

// Gives the visitor a brand-new session ID and stores who they are in it.
// Replacing the ID at login stops "session fixation", where an attacker plants
// a known ID in the victim's browser before they log in.
function logIn(req: Request, userId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      resolve();
    });
  });
}

export function authRouter(authLimiter: RequestHandler) {
  const router = Router();

  router.post("/register", authLimiter, async (req, res) => {
    const credentials = readCredentials(req.body);
    if (!credentials) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }
    const problem = validateNewCredentials(credentials);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }

    // argon2id is a deliberately slow, memory-hungry hash. The salt is
    // generated and stored inside the resulting string by the library.
    const passwordHash = await argon2.hash(credentials.password, {
      type: argon2.argon2id,
    });

    let userId: number;
    try {
      const { rows } = await pool.query<{ id: string }>(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
        [credentials.username, passwordHash],
      );
      userId = Number(rows[0]!.id);
    } catch (err) {
      // The unique index on lower(username) rejected a duplicate. Letting
      // the database decide avoids a race between "check" and "insert".
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Username is already taken" });
        return;
      }
      throw err;
    }

    await logIn(req, userId);
    res.status(201).json({ username: credentials.username });
  });

  router.post("/login", authLimiter, async (req, res) => {
    const credentials = readCredentials(req.body);
    if (!credentials) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const { rows } = await pool.query<{
      id: string;
      username: string;
      password_hash: string;
    }>(
      "SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1)",
      [credentials.username],
    );
    const user = rows[0];

    const passwordMatches = await argon2.verify(
      user?.password_hash ?? (await getDummyHash()),
      credentials.password,
    );
    if (!user || !passwordMatches) {
      res.status(401).json(INVALID_LOGIN);
      return;
    }

    await logIn(req, Number(user.id));
    res.json({ username: user.username });
  });

  router.post("/logout", requireLogin, (req, res, next) => {
    // Deletes the session row from Postgres. The old cookie is now useless.
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(204).end();
    });
  });

  router.get("/me", requireLogin, async (req, res) => {
    const { rows } = await pool.query<{ username: string }>(
      "SELECT username FROM users WHERE id = $1",
      [res.locals.userId],
    );
    const user = rows[0];
    if (!user) {
      // The session points at a user that no longer exists.
      req.session.destroy(() => {
        res.status(401).json({ error: "Not logged in" });
      });
      return;
    }
    res.json({ username: user.username });
  });

  return router;
}
