import { describe, expect, it } from "vitest";
import { decideVideoEditorResultReview } from "./videoEditorResultReview";

describe("video editor result review", () => {
  it("requires explicit apply and rejects old revision overwrite", () => {
    expect(decideVideoEditorResultReview({ resultRevision: 2, currentRevision: 2, explicitApply: false }).kind).toBe("review_required");
    expect(decideVideoEditorResultReview({ resultRevision: 2, currentRevision: 3, explicitApply: true }).kind).toBe("stale_conflict");
    expect(decideVideoEditorResultReview({ resultRevision: 2, currentRevision: 2, explicitApply: true })).toEqual({ kind: "apply", expectedRevision: 2 });
  });
});
