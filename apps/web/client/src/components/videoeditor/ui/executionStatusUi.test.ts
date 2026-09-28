import { describe, expect, it } from "vitest";

import { projectExecutionStatus } from "./executionStatusUi";

describe("projectExecutionStatus", () => {
  it("treats successful domain jobs without artifact refs as terminal", () => {
    expect(
      projectExecutionStatus({
        jobType: "vertical_drama.episode_stage",
        status: "succeeded",
        statusReason: "claimed:postgres-pull",
        outputRefs: [],
        operatorReviewRequired: false,
      })
    ).toMatchObject({
      state: "completed",
      outputReady: true,
      isTerminal: true,
    });
  });

  it("still requires verified output for artifact-producing jobs", () => {
    expect(
      projectExecutionStatus({
        jobType: "hyperframes_final_composite",
        status: "succeeded",
        outputRefs: [],
        operatorReviewRequired: false,
      })
    ).toMatchObject({
      state: "degraded",
      outputReady: false,
      isTerminal: false,
    });
  });

  it("does not hide an explicit operator review gate", () => {
    expect(
      projectExecutionStatus({
        jobType: "vertical_drama.episode_stage",
        status: "succeeded",
        outputRefs: [],
        operatorReviewRequired: true,
      })
    ).toMatchObject({
      state: "degraded",
      outputReady: false,
    });
  });
});
