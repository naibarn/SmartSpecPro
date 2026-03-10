import { describe, expect, it } from "vitest";

import { evaluateBrowserActionRateLimit } from "../browserActionRateLimit";

const entitlement = {
  tenantId: "tenant-1",
  workflowId: 7,
  workflowName: "Rate Limit QA",
  allowedCapabilities: [],
  forbiddenCapabilities: [],
  allowedDataClasses: ["public", "internal"],
  config: {
    approvalTtlSeconds: 300,
    maxExtractedRecords: 100,
    maxExternalSends: 2,
    maxOriginTransitions: 3,
    maxNonReadActions: 5,
  },
} as const;

describe("browser action rate limits", () => {
  it("denies when non-read action limits are exceeded", () => {
    expect(
      evaluateBrowserActionRateLimit({
        actionClass: "commit",
        nonReadActionCount: 6,
        entitlement: entitlement as any,
      }),
    ).toEqual({
      decision: "deny",
      reasonCodes: ["non_read_action_limit_exceeded"],
    });
  });

  it("denies when extraction limits are exceeded", () => {
    expect(
      evaluateBrowserActionRateLimit({
        actionClass: "read",
        extractedRecordCount: 101,
        entitlement: entitlement as any,
      }),
    ).toEqual({
      decision: "deny",
      reasonCodes: ["record_limit_exceeded"],
    });
  });

  it("denies when external-send limits are exceeded", () => {
    expect(
      evaluateBrowserActionRateLimit({
        actionClass: "restricted",
        externalSendCount: 3,
        entitlement: entitlement as any,
      }),
    ).toEqual({
      decision: "deny",
      reasonCodes: ["external_send_limit_exceeded"],
    });
  });

  it("denies when origin-transition limits are exceeded", () => {
    expect(
      evaluateBrowserActionRateLimit({
        actionClass: "read",
        originTransitionCount: 4,
        entitlement: entitlement as any,
      }),
    ).toEqual({
      decision: "deny",
      reasonCodes: ["origin_transition_limit_exceeded"],
    });
  });
});
