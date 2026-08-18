import { describe, expect, it } from "vitest";
import {
  appendAssuranceEvent,
  beginCorrectionAttempt,
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
});
