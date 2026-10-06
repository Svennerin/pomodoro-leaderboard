import { useCallback, useEffect, useState } from "react";
import { api, type Leaderboard as LeaderboardData } from "./api";
import { AuthForm } from "./components/AuthForm";
import { Leaderboard } from "./components/Leaderboard";
import { Timer } from "./components/Timer";

export function App() {
  // undefined = still checking whether we are logged in; null = logged out.
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const refreshLeaderboard = useCallback(async () => {
    try {
      setLeaderboard(await api.weeklyLeaderboard());
      setLeaderboardError(null);
    } catch {
      setLeaderboardError("Could not load the leaderboard.");
    }
  }, []);

  // On page load, ask the server whether our cookie is a valid session.
  // (We never try to resume an old pomodoro, only the login.)
  useEffect(() => {
    api
      .me()
      .then((user) => setUsername(user.username))
      .catch(() => setUsername(null));
  }, []);

  // The leaderboard includes "your rank" when logged in, so reload it whenever
  // the login state is known or changes.
  useEffect(() => {
    if (username !== undefined) void refreshLeaderboard();
  }, [username, refreshLeaderboard]);

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setUsername(null);
  }

  return (
    <div className="page">
      <header>
        <h1>🍅 Pomodoro Leaderboard</h1>
        {username && (
          <p className="who">
            {username}{" "}
            <button type="button" className="link" onClick={handleLogout}>
              Log out
            </button>
          </p>
        )}
      </header>

      <main>
        {username === undefined ? (
          <p className="hint">Loading…</p>
        ) : username === null ? (
          <AuthForm onAuthenticated={setUsername} />
        ) : (
          <Timer onCompleted={refreshLeaderboard} />
        )}

        <Leaderboard
          data={leaderboard}
          error={leaderboardError}
          currentUsername={username ?? null}
        />
      </main>
    </div>
  );
}
