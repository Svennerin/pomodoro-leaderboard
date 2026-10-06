import { useEffect, useState } from "react";
import { api } from "../api";
import { formatClock, remainingSeconds } from "../timer";

interface Props {
  // Called after a session is completed, so the leaderboard can refresh.
  onCompleted: () => void;
}

type Phase =
  | { name: "idle"; message?: string; isError?: boolean }
  | { name: "starting" }
  | { name: "running"; id: number; endsAtMs: number }
  | { name: "completing" };

export function Timer({ onCompleted }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [secondsLeft, setSecondsLeft] = useState(0);

  // While a session is running: recompute the time left every 250 ms, and
  // call "complete" exactly once when it reaches 0.
  useEffect(() => {
    if (phase.name !== "running") return;
    const { id, endsAtMs } = phase;
    let finished = false;

    async function finish() {
      setPhase({ name: "completing" });
      try {
        await api.completePomodoro(id);
        setPhase({ name: "idle", message: "Session complete! It counts toward this week." });
        onCompleted();
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Something went wrong";
        setPhase({ name: "idle", message: `Could not complete the session: ${reason}`, isError: true });
      }
    }

    function tick() {
      const left = remainingSeconds(endsAtMs, Date.now());
      setSecondsLeft(left);
      document.title = `${formatClock(left)} · Pomodoro`;
      if (left === 0 && !finished) {
        finished = true;
        void finish();
      }
    }

    tick();
    const interval = setInterval(tick, 250);
    // Background tabs throttle timers, so also re-check the moment the tab
    // becomes visible again.
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      document.title = "Pomodoro Leaderboard";
    };
  }, [phase, onCompleted]);

  async function start() {
    setPhase({ name: "starting" });
    try {
      const { id, durationSeconds } = await api.startPomodoro();
      // The countdown is measured on THIS computer's clock from the moment the
      // server confirmed the start. The server decides separately, from its
      // own clock, whether the session counts. Because we only begin counting
      // after the server already recorded the start, we never ask to complete
      // too early, whatever this computer's clock says.
      setPhase({ name: "running", id, endsAtMs: Date.now() + durationSeconds * 1000 });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Something went wrong";
      setPhase({ name: "idle", message: `Could not start: ${reason}`, isError: true });
    }
  }

  async function cancel() {
    if (phase.name !== "running") return;
    const { id } = phase;
    setPhase({ name: "idle", message: "Session cancelled." });
    try {
      await api.abandonPomodoro(id);
    } catch {
      // The session simply stays unfinished; starting a new one abandons it.
    }
  }

  return (
    <section className="card timer">
      <h2>Focus timer</h2>

      {phase.name === "running" ? (
        <>
          <p className="clock" aria-live="off">{formatClock(secondsLeft)}</p>
          <button type="button" className="secondary" onClick={cancel}>Cancel</button>
        </>
      ) : (
        <>
          <p className="clock">25:00</p>
          <button type="button" onClick={start} disabled={phase.name !== "idle"}>
            {phase.name === "starting" ? "Starting…" : phase.name === "completing" ? "Saving…" : "Start"}
          </button>
          {phase.name === "idle" && phase.message && (
            <p className={phase.isError ? "error" : "success"} role="status">{phase.message}</p>
          )}
        </>
      )}
    </section>
  );
}
