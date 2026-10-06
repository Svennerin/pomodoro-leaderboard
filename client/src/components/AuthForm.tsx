import { type FormEvent, useState } from "react";
import { api } from "../api";

interface Props {
  onAuthenticated: (username: string) => void;
}

// Sign-up / log-in form. The attributes on the inputs (pattern, minLength...)
// give instant feedback in the browser, but they are only a convenience: the
// server validates everything again.
export function AuthForm({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = isRegister
        ? await api.register(username, password)
        : await api.login(username, password);
      onAuthenticated(user.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? "login" : "register");
    setError(null);
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>{isRegister ? "Create an account" : "Log in"}</h2>

      <label>
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          {...(isRegister
            ? {
                pattern: "[A-Za-z0-9_]{3,20}",
                title: "3-20 characters: letters, numbers, or underscore",
              }
            : {})}
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          {...(isRegister ? { minLength: 8, maxLength: 128 } : {})}
        />
      </label>

      {isRegister && <p className="hint">Username: 3-20 letters, numbers or _. Password: 8 or more characters.</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? "Please wait…" : isRegister ? "Sign up" : "Log in"}
      </button>
      <button type="button" className="link" onClick={switchMode}>
        {isRegister ? "Already have an account? Log in" : "New here? Create an account"}
      </button>
    </form>
  );
}
