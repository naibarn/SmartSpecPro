import { describe, expect, it } from "vitest";
import {
  SemanticBrowserActionError,
  createSemanticActionPlan,
  commitSemanticAction,
  verifySemanticOutcome,
} from "../semanticBrowserActionService";

const target = {
  targetId: "button-submit",
  domVersion: "v1",
  visible: true,
  occluded: false,
  annotation: "submit-order",
};

describe("semanticBrowserActionService", () => {
  it("keeps discovery hints separate from verified action commit", () => {
    const plan = createSemanticActionPlan({
      sessionId: "session-1",
      idempotencyKey: "action-1",
      action: "click",
      target,
      approvalRequired: true,
    });
    expect(plan).toMatchObject({
      status: "preview",
      targetHint: "submit-order",
    });
    expect(() =>
      commitSemanticAction(plan, { approved: false, currentTarget: target })
    ).toThrowError(new SemanticBrowserActionError("APPROVAL_REQUIRED"));
    expect(
      commitSemanticAction(plan, { approved: true, currentTarget: target })
    ).toMatchObject({ status: "committed" });
    expect(
      commitSemanticAction(plan, { approved: true, currentTarget: target })
    ).toMatchObject({ status: "duplicate" });
  });

  it("fails closed for stale/occluded targets and verification mismatch", () => {
    const plan = createSemanticActionPlan({
      sessionId: "session-1",
      idempotencyKey: "action-2",
      action: "submit",
      target,
      approvalRequired: false,
    });
    expect(() =>
      commitSemanticAction(plan, {
        approved: true,
        currentTarget: { ...target, domVersion: "v2" },
      })
    ).toThrowError(new SemanticBrowserActionError("TARGET_STALE"));
    expect(() =>
      commitSemanticAction(plan, {
        approved: true,
        currentTarget: { ...target, occluded: true },
      })
    ).toThrowError(new SemanticBrowserActionError("TARGET_NOT_ACTIONABLE"));
    expect(
      verifySemanticOutcome({
        expected: { url: "https://example.test/ok" },
        actual: { url: "https://example.test/no" },
      })
    ).toMatchObject({ verified: false, reasonCode: "OUTCOME_MISMATCH" });
  });
});
