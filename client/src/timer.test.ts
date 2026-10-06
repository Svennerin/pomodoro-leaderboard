import { describe, expect, it } from "vitest";
import { formatClock, remainingSeconds } from "./timer";

describe("remainingSeconds", () => {
  const end = 1_000_000 + 25 * 60 * 1000; // a session that started at t = 1,000,000 ms

  it("is the full duration at the start", () => {
    expect(remainingSeconds(end, 1_000_000)).toBe(1500);
  });

  it("rounds a partial second up, so 0 means the time is really over", () => {
    expect(remainingSeconds(end, 1_000_001)).toBe(1500);
    expect(remainingSeconds(end, end - 500)).toBe(1);
  });

  it("is 0 exactly at the end and never goes negative afterwards", () => {
    expect(remainingSeconds(end, end)).toBe(0);
    expect(remainingSeconds(end, end + 60_000)).toBe(0);
  });

  it("depends only on the clock, so a long gap (background tab) is handled", () => {
    // No ticks for 20 minutes, then one tick: still exactly 5 minutes left.
    expect(remainingSeconds(end, 1_000_000 + 20 * 60 * 1000)).toBe(300);
  });
});

describe("formatClock", () => {
  it("formats minutes and seconds with leading zeros", () => {
    expect(formatClock(1500)).toBe("25:00");
    expect(formatClock(61)).toBe("01:01");
    expect(formatClock(59)).toBe("00:59");
    expect(formatClock(0)).toBe("00:00");
  });
});
