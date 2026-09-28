import { describe, expect, it } from "vitest";
import { storyGenerationRowToSummary } from "../verticalDramaStoryGenerationRuntime";

describe("vertical drama story generation runtime", () => {
  it("maps persisted partial state to a resumable non-success summary", () => {
    const summary = storyGenerationRowToSummary({
      runId: "run-1", seriesId: 3, status: "partial", stage: "generation",
      checkpointJson: { episode: 4 }, validationReportJson: null, eventCursor: 2,
      reservedCredits: 10, errorCode: null,
    } as never);
    expect(summary.status).toBe("partial");
    expect(summary.transportOutcome).toBe("resumable");
    expect(summary.resumable).toBe(true);
  });
});
