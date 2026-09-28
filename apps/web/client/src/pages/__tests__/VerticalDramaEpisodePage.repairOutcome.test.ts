import { describe, expect, it } from "vitest";

import { describeRepairStageOutcome } from "../VerticalDramaEpisodePage";

describe("describeRepairStageOutcome", () => {
  it("does not call a diagnostic artifact a successful repair", () => {
    expect(
      describeRepairStageOutcome(
        {
          status: "failed",
          artifactIds: ["722"],
          errors: [{ message: "continuity still fails" }],
        },
        "Repair failed"
      )
    ).toEqual({
      status: "failed",
      error: "continuity still fails",
    });
  });

  it("returns the new artifact only after a terminal non-failed result", () => {
    expect(
      describeRepairStageOutcome(
        { status: "succeeded", artifactIds: ["723"] },
        "Repair failed"
      )
    ).toEqual({ status: "succeeded", artifactId: "723" });
  });
});
