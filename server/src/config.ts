// Settings that come from environment variables. Reading them in one place
// means the rest of the code never touches process.env directly.

const sessionSecret = process.env.SESSION_SECRET;

// Fail at startup rather than run with no secret.
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is not set (see .env.example)");
}

export const config = {
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 3000),
  // Used to sign the session cookie so it can't be forged.
  sessionSecret,
};
