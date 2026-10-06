// All communication with the server lives in this file. Components call
// these functions and never use fetch directly.

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
}

export interface Leaderboard {
  weekStartsAt: string;
  weekEndsAt: string;
  entries: LeaderboardEntry[];
  // The logged-in user's own standing; null when logged out. `rank` is null
  // if they have no completed session this week.
  me: { rank: number | null; score: number } | null;
}

// An error response from the server (non-2xx), carrying its HTTP status.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Same-origin requests send the session cookie automatically.
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? "Something went wrong");
  }
  return data as T;
}

export const api = {
  me: () => request<{ username: string }>("GET", "/auth/me"),
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),

  startPomodoro: () =>
    request<{ id: number; durationSeconds: number }>("POST", "/pomodoros/start"),
  completePomodoro: (id: number) => request<{ id: number }>("POST", `/pomodoros/${id}/complete`),
  abandonPomodoro: (id: number) => request<{ id: number }>("POST", `/pomodoros/${id}/abandon`),

  weeklyLeaderboard: () => request<Leaderboard>("GET", "/leaderboard/weekly"),
};
