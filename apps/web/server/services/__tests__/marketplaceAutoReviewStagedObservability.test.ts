import { describe, expect, it } from "vitest";

import { buildStagedSafeEvidenceEvent } from "../marketplaceAutoReviewStagedObservability";

describe("Feature 141 safe observability", () => {
  it("keeps evidence bounded and excludes provider URLs and raw diagnostics", () => {
    const event = buildStagedSafeEvidenceEvent({
      runId: "run-141",
      operation: "image_submit",
      checkpointKind: "image_prompt",
      shotId: 1,
      state: "approved",
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 3,
      contentHash: "hash-1",
    });
    expect(event).toMatchObject({ runId: "run-141", shotId: 1, contentHash: "hash-1" });
    expect(JSON.stringify(event)).not.toContain("https://");
    expect(JSON.stringify(event)).not.toContain("taskId");
    expect(event.evidenceId).toHaveLength(32);
  });
});
