// Server-side input validation. The client may check the same things for
// convenience, but this is the check that counts.

// ASCII only on purpose: it keeps usernames unambiguous (no look-alike
// characters) and makes the case-insensitive uniqueness check reliable.
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN_LENGTH = 8;
// argon2 has no practical limit; this just stops absurdly large inputs.
const PASSWORD_MAX_LENGTH = 128;

export interface Credentials {
  username: string;
  password: string;
}

// Pulls username and password out of a request body, or returns null if the
// body is not an object with two strings.
export function readCredentials(body: unknown): Credentials | null {
  if (typeof body !== "object" || body === null) return null;
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") return null;
  return { username, password };
}

// Returns a message describing the first problem, or null if all is well.
export function validateNewCredentials(credentials: Credentials): string | null {
  if (!USERNAME_PATTERN.test(credentials.username)) {
    return "Username must be 3-20 characters: letters, numbers, or underscore";
  }
  if (credentials.password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (credentials.password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}
