// Whole seconds left until `endsAtMs`, never negative. The countdown is
// worked out from the current time on every tick, not by subtracting 1 from a
// counter: browsers slow down timers in background tabs, so a counter would
// drift, but "end time minus now" is always right.
export function remainingSeconds(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

// 1500 -> "25:00", 59 -> "00:59"
export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
