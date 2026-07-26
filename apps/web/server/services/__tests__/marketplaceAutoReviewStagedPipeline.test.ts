import { describe, expect, it } from "vitest";

import {
  buildStagedCheckpoint,
  buildStagedImagePrompt,
  buildStagedStoryArcPlan,
  buildStagedVideoPrompt,
} from "../marketplaceAutoReviewStoryArcPlanner";
import { stagedCheckpointExpectationForTest } from "../marketplaceAutoReviewStagedPipelineService";

describe("marketplace staged storyboard pipeline contracts", () => {
  const plan = buildStagedStoryArcPlan({
    runId: "run-141",
    product: {
      productId: "product-1",
      productName: "แก้วน้ำตัวอย่าง",
      description: "สินค้าสำหรับทดสอบ",
      imageUrls: ["https://example.test/product.png"],
    },
    referenceManifestHash: "refs-1",
  });

  it("creates exactly nine ten-second reviewable shots", () => {
    expect(plan.shots).toHaveLength(9);
    expect(plan.shots.map(shot => shot.shotId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.shots.every(shot => shot.durationSeconds === 10)).toBe(true);
  });

  it("keeps approved story/dialogue exact in downstream prompts", () => {
    const imagePrompt = buildStagedImagePrompt({ plan, shot: plan.shots[0] });
    const videoPrompt = buildStagedVideoPrompt({ plan, shot: plan.shots[0] });
    expect(imagePrompt).toContain(plan.storySummary);
    expect(videoPrompt).toContain(plan.shots[0].dialogue);
    expect(videoPrompt).toContain("10-second");
    expect(imagePrompt).toContain("@Image1");
  });

  it("builds a spend expectation from immutable checkpoint evidence", () => {
    const checkpoint = buildStagedCheckpoint({
      checkpointId: "image-prompt:run-141:shot-1:r1",
      kind: "image_prompt",
      shotId: 1,
      revision: 1,
      contentHash: "hash-1",
      model: "image-model",
      provider: "image-provider",
      estimatedCredits: 12,
      referenceManifestHash: "refs-1",
    });
    expect(stagedCheckpointExpectationForTest(checkpoint)).toMatchObject({
      revision: 1,
      contentHash: "hash-1",
      model: "image-model",
      provider: "image-provider",
      estimatedCredits: 12,
    });
  });
});
