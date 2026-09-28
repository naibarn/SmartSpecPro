import { describe, expect, it } from "vitest";
import {
  reconcileStartFramePlanWithDurableArtifacts,
  type DurableStartFrameArtifact,
} from "../verticalDramaStartFrameReconciliation";

describe("reconcileStartFramePlanWithDurableArtifacts", () => {
  it("promotes completed durable start and stop frame artifacts and clears their pending tasks", () => {
    const plan = {
      mode: "single_frame_per_shot" as const,
      selectedImageModelId: "gpt-image",
      frames: [
        {
          shotNumber: 8,
          imagePrompt: "start",
          negativePrompt: "none",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          imageTask: {
            pendingTaskId: "start-task",
            status: "submitted" as const,
          },
          stopFrameTask: {
            pendingTaskId: "stop-task",
            status: "processing" as const,
          },
        },
      ],
    };
    const artifacts: DurableStartFrameArtifact[] = [
      { sourceTaskId: "start-task", mediaAssetId: 7024 },
      { sourceTaskId: "stop-task", mediaAssetId: 7025 },
    ];

    const result = reconcileStartFramePlanWithDurableArtifacts(plan, artifacts);

    expect(result.repaired).toEqual([
      { shotNumber: 8, frameRole: "start", mediaAssetId: 7024 },
      { shotNumber: 8, frameRole: "stop", mediaAssetId: 7025 },
    ]);
    expect(result.plan.frames[0]).toMatchObject({
      approvedMediaAssetId: "7024",
      approvedStopFrameAssetId: "7025",
    });
    expect(result.plan.frames[0].imageTask).toBeUndefined();
    expect(result.plan.frames[0].stopFrameTask).toBeUndefined();
  });

  it("does not alter a plan when the artifact is not durable", () => {
    const plan = {
      mode: "single_frame_per_shot" as const,
      selectedImageModelId: "gpt-image",
      frames: [
        {
          shotNumber: 8,
          imagePrompt: "start",
          negativePrompt: "none",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          imageTask: {
            pendingTaskId: "missing-task",
            status: "submitted" as const,
          },
        },
      ],
    };

    expect(
      reconcileStartFramePlanWithDurableArtifacts(plan, [
        { sourceTaskId: "other-task", mediaAssetId: 7024 },
      ])
    ).toEqual({ plan, repaired: [] });
  });
});
