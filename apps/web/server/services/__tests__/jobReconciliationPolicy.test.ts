import { describe, expect, it } from "vitest";

import {
  classifyWaitingExternal,
  type WaitingExternalEvidence,
} from "../jobReconciliationPolicy";

function evidence(
  overrides: Partial<WaitingExternalEvidence> = {}
): WaitingExternalEvidence {
  return {
    operationKey: "provider:op-1",
    runStatus: null,
    providerReference: null,
    resumeAfter: new Date(Date.now() + 60_000).toISOString(),
    now: new Date(),
    ...overrides,
  };
}

describe("job reconciliation policy", () => {
  it("cancels internal storyboard waits when the domain run is cancelling or cancelled", () => {
    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "storyboard.pause:run-1",
          runStatus: "cancel_requested",
        })
      )
    ).toMatchObject({
      action: "cancel",
      reasonCode: "domain_run_cancel_requested",
    });

    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "storyboard.pause:run-1:provider:2",
          runStatus: "cancelled",
        })
      )
    ).toMatchObject({ action: "cancel", reasonCode: "domain_run_cancelled" });
  });

  it("keeps a verified user pause as an intentional hold", () => {
    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "storyboard.pause:run-1:incomplete",
          runStatus: "paused",
        })
      )
    ).toMatchObject({ action: "hold", reasonCode: "domain_run_paused" });
  });

  it("resumes an internal pause once the domain run is active again", () => {
    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "storyboard.pause:run-1",
          runStatus: "running",
        })
      )
    ).toMatchObject({ action: "resume", reasonCode: "domain_run_active" });
  });

  it("cancels an internal wait when its domain run is gone", () => {
    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "storyboard.pause:missing-run",
          runStatus: null,
        })
      )
    ).toMatchObject({ action: "cancel", reasonCode: "domain_run_missing" });
  });

  it("does not auto-retry ambiguous provider submissions", () => {
    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "storyboard.pause:run-1:ambiguous:2",
          runStatus: "partial",
        })
      )
    ).toMatchObject({
      action: "fail_review",
      reasonCode: "ambiguous_provider_submission",
    });
  });

  it("waits for a real provider operation before its deadline", () => {
    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "provider:op-1",
          providerReference: "provider-job-1",
        })
      )
    ).toMatchObject({
      action: "wait",
      reasonCode: "external_operation_pending",
    });
  });

  it("fails an expired external wait when there is no evidence that it is still running", () => {
    expect(
      classifyWaitingExternal(
        evidence({
          operationKey: "provider:op-1",
          resumeAfter: new Date(Date.now() - 60_000).toISOString(),
        })
      )
    ).toMatchObject({
      action: "fail_review",
      reasonCode: "external_wait_unknown",
    });
  });
});
