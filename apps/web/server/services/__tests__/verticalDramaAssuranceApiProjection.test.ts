import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaAssuranceApiError,
  mapStoryGenerationSummaryToAssuranceProjection,
  withVerticalDramaAssuranceProjection,
} from "../verticalDramaAssuranceApiProjection";

describe("Vertical Drama assurance API projection", () => {
  it("preserves legacy fields and adds one canonical envelope", () => {
    const projection = mapStoryGenerationSummaryToAssuranceProjection({ status: "running" });
    expect(withVerticalDramaAssuranceProjection({ status: "running", runId: "run-1" }, projection)).toMatchObject({
      status: "running",
      runId: "run-1",
      assurance: { state: "running", canEdit: true, canContinue: false },
    });
  });

  it("maps uncertain provider outcomes to reconciliation without enabling continue", () => {
    const projection = mapStoryGenerationSummaryToAssuranceProjection({ status: "provider_result_unknown" });
    expect(projection.state).toBe("reconciliation_required");
    expect(projection.canContinue).toBe(false);
    expect(projection.nextAction).toBe("reconcile");
  });

  it("returns a stable browser-safe error payload", () => {
    const projection = mapStoryGenerationSummaryToAssuranceProjection({ status: "failed" });
    const error = buildVerticalDramaAssuranceApiError("VD_ASSURANCE_CONTEXT_STALE", projection);
    expect(error).toMatchObject({
      schemaVersion: 1,
      surface: "vertical_drama_assurance",
      errorCode: "VD_ASSURANCE_CONTEXT_STALE",
      projection: { state: "retryable_failed" },
    });
    expect(JSON.stringify(error)).not.toContain("secret");
  });
});
