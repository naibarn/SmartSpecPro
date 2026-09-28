import { describe, expect, it } from "vitest";
import {
  appendAssuranceEvent,
  beginCorrectionAttempt,
  replayVerticalDramaAssuranceEvents,
} from "../orchestraEventReplay";

describe("assurance event replay", () => {
  it("rejects duplicate cursors and redacts untrusted prompt fields", () => {
    const first = {
      executionId: "e",
      attemptId: "a",
      sequence: 1,
      state: "verifying",
      payload: { prompt: "secret", safe: "ok" },
    };
    const events = appendAssuranceEvent([], first);
    expect(events[0].payload).toEqual({ prompt: "[redacted]", safe: "ok" });
    expect(() => appendAssuranceEvent(events, first)).toThrow(/cursor/);
  });

  it("creates a new immutable correction attempt", () => {
    expect(beginCorrectionAttempt("a", "b")).toEqual({
      previousAttemptId: "a",
      nextAttemptId: "b",
      immutable: true,
    });
  });

  it("replays only allowed assurance transitions across child attempts and redacts private values", () => {
    const projection = replayVerticalDramaAssuranceEvents([
      {
        executionId: "e",
        attemptId: "a",
        sequence: 1,
        previousState: null,
        nextState: "queued",
        state: "queued",
        payload: { signedUrl: "secret", evidence: "private" },
      },
      {
        executionId: "e",
        attemptId: "a",
        sequence: 2,
        previousState: "queued",
        nextState: "running",
        state: "running",
      },
      {
        executionId: "e",
        attemptId: "a",
        sequence: 3,
        previousState: "running",
        nextState: "retryable_failed",
        state: "retryable_failed",
      },
      {
        executionId: "e",
        attemptId: "b",
        sequence: 4,
        previousState: null,
        nextState: "queued",
        state: "queued",
        parentAttemptId: "a",
      },
    ]);
    expect(projection).toMatchObject({
      state: "queued",
      activeAttemptId: "b",
      eventCursor: 4,
    });
    expect(projection.events[0].payload).toEqual({
      signedUrl: "[redacted]",
      evidence: "[redacted]",
    });
    expect(() =>
      replayVerticalDramaAssuranceEvents([
        {
          executionId: "e",
          attemptId: "a",
          sequence: 1,
          previousState: null,
          nextState: "queued",
          state: "queued",
        },
        {
          executionId: "e",
          attemptId: "a",
          sequence: 2,
          previousState: "queued",
          nextState: "succeeded",
          state: "succeeded",
        },
      ])
    ).toThrow("VD_ASSURANCE_TRANSITION_INVALID");
  });
});
