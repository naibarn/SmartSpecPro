import { describe, expect, it } from "vitest";
import {
  createMediaHistoryPollState,
  reserveMediaHistoryPoll,
  setMediaHistoryRateLimit,
} from "./mediaHistoryPolling";

describe("mediaHistoryPolling", () => {
  it("does not reserve the same task again before the minimum interval", () => {
    const state = createMediaHistoryPollState();

    expect(reserveMediaHistoryPoll(state, "task-1", 1_000)).toBe(true);
    expect(reserveMediaHistoryPoll(state, "task-1", 1_001)).toBe(false);
    expect(reserveMediaHistoryPoll(state, "task-1", 15_999)).toBe(false);
    expect(reserveMediaHistoryPoll(state, "task-1", 16_000)).toBe(true);
  });

  it("allows only one in-flight poll across tasks", () => {
    const state = createMediaHistoryPollState();

    expect(reserveMediaHistoryPoll(state, "task-1", 1_000)).toBe(true);
    state.inFlight = true;
    expect(reserveMediaHistoryPoll(state, "task-2", 20_000)).toBe(false);
  });

  it("honors a global server rate-limit cooldown", () => {
    const state = createMediaHistoryPollState();
    setMediaHistoryRateLimit(state, 1_000, 30_000);

    expect(reserveMediaHistoryPoll(state, "task-1", 30_999)).toBe(false);
    expect(reserveMediaHistoryPoll(state, "task-1", 31_000)).toBe(true);
  });
});
