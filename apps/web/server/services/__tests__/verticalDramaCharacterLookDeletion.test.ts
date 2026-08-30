import { describe, expect, it } from "vitest";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries/contracts";
import { repairStartFramePlanAfterLookDeletion } from "../verticalDramaCharacterLookDeletion";

function planWithFrames(
  frames: VerticalDramaStartFramePlan["frames"]
): VerticalDramaStartFramePlan {
  return {
    mode: "single_frame_per_shot",
    selectedImageModelId: "test-model",
    frames,
  };
}

describe("repairStartFramePlanAfterLookDeletion", () => {
  it("returns a deleted look's shot refs to the parent and removes duplicate refs", () => {
    const result = repairStartFramePlanAfterLookDeletion({
      plan: planWithFrames([
        {
          shotNumber: 1,
          imagePrompt: "old look prompt",
          negativePrompt: "old negative",
          requiredCharacterRefs: ["character-7-look-casual", "character-7"],
          screenCallerCharacterRefs: ["character-7-look-casual"],
          characterLookAssignments: [
            {
              baseCharacterKey: "character-7",
              selectedLookKey: "character-7-look-casual",
              mode: "matched_existing",
              status: "ready",
              canonicalIntent: "casual_home",
              requestedLabel: "ชุดลำลอง",
              requestedRequestKey: "character-7::casual_home",
              imageBrief: "casual clothes",
              reason: "matched",
              confidence: 0.9,
            },
          ],
          productReferenceAssetIds: [],
        },
      ]),
      deletedLookKey: "character-7-look-casual",
      parentCharacterKey: "character-7",
    });

    expect(result.changedShots).toEqual([1]);
    expect(result.plan.frames[0]).toMatchObject({
      requiredCharacterRefs: ["character-7"],
      screenCallerCharacterRefs: ["character-7"],
      imagePrompt: "",
      negativePrompt: "",
    });
    expect(result.plan.frames[0].characterLookAssignments).toEqual([
      expect.objectContaining({
        baseCharacterKey: "character-7",
        selectedLookKey: "character-7",
        mode: "base",
        status: "ready",
        reason: "ลุคเดิมถูกลบ จึงเปลี่ยนกลับไปใช้ภาพตัวละครหลัก",
        confidence: 1,
      }),
    ]);
    expect(
      result.plan.frames[0].characterLookAssignments?.[0]
    ).not.toHaveProperty("requestedLabel");
  });

  it("does not mutate unrelated frames or plans without the deleted key", () => {
    const plan = planWithFrames([
      {
        shotNumber: 2,
        imagePrompt: "keep",
        negativePrompt: "keep",
        requiredCharacterRefs: ["character-8"],
        productReferenceAssetIds: [],
      },
    ]);

    const result = repairStartFramePlanAfterLookDeletion({
      plan,
      deletedLookKey: "character-7-look-casual",
      parentCharacterKey: "character-7",
    });

    expect(result.changedShots).toEqual([]);
    expect(result.plan).toBe(plan);
  });
});
