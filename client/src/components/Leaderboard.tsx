import type { Leaderboard as LeaderboardData } from "../api";

interface Props {
  data: LeaderboardData | null;
  error: string | null;
  currentUsername: string | null;
}

function sessions(count: number) {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}

// "Monday, Jan 12, 00:00 UTC", and the same moment in the viewer's own zone.
function describeReset(weekEndsAt: string) {
  const when = new Date(weekEndsAt);
  const utc = when.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  const local = when.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return { utc: `${utc} UTC`, local };
}

export function Leaderboard({ data, error, currentUsername }: Props) {
  if (error) {
    return (
      <section className="card">
        <h2>This week's leaderboard</h2>
        <p className="error">{error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="card">
        <h2>This week's leaderboard</h2>
        <p className="hint">Loading…</p>
      </section>
    );
  }

  const reset = describeReset(data.weekEndsAt);
  const meIsListed = data.entries.some((entry) => entry.username === currentUsername);

  return (
    <section className="card">
      <h2>This week's leaderboard</h2>
      <p className="hint">
        Resets {reset.utc} (your time: {reset.local})
      </p>

      {data.entries.length === 0 ? (
        <p>No completed sessions yet this week. Be the first!</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>User</th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr key={entry.rank} className={entry.username === currentUsername ? "me" : undefined}>
                <td>{entry.rank}</td>
                <td>{entry.username}</td>
                <td>{entry.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.me && !meIsListed && (
        <p className="yourself">
          {data.me.rank === null
            ? "You have no completed sessions this week yet."
            : `You: rank ${data.me.rank} with ${sessions(data.me.score)}.`}
        </p>
      )}
    </section>
  );
}
