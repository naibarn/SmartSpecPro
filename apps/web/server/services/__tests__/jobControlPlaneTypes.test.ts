import { describe, expect, it } from "vitest";

import {
  assertCanonicalJobTransition,
  assertCanonicalLeaseFence,
  canTransitionJobStatus,
} from "../jobControlPlaneTypes";

describe("canonical Job lifecycle contracts", () => {
  it("allows the durable execution path and rejects terminal reopening", () => {
    expect(canTransitionJobStatus("queued", "leased")).toBe(true);
    expect(canTransitionJobStatus("leased", "running")).toBe(true);
    expect(canTransitionJobStatus("running", "succeeded")).toBe(true);
    expect(canTransitionJobStatus("succeeded", "queued")).toBe(false);
    expect(() =>
      assertCanonicalJobTransition("succeeded", "queued")
    ).toThrowError(expect.objectContaining({ code: "JOB_TRANSITION_INVALID" }));
  });

  it("rejects stale attempt identity or fencing version", () => {
    expect(() =>
      assertCanonicalLeaseFence({
        expectedAttemptId: "attempt-1",
        actualAttemptId: "attempt-2",
        expectedFencingVersion: 4,
        actualFencingVersion: 4,
      })
    ).toThrowError(expect.objectContaining({ code: "JOB_LEASE_STALE" }));

    expect(() =>
      assertCanonicalLeaseFence({
        expectedAttemptId: "attempt-1",
        actualAttemptId: "attempt-1",
        expectedFencingVersion: 4,
        actualFencingVersion: 3,
      })
    ).toThrowError(expect.objectContaining({ code: "JOB_LEASE_STALE" }));
  });
});
