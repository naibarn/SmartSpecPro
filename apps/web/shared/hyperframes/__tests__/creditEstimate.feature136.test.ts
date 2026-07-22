/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 10 §4.1. Pure schema + resolver tests, no server imports.
 *
 * Covers:
 *  - `HyperframesCreditEstimateSchema.imageJobCount` optional field bounds.
 *  - Byte-identity round-trip: an estimate object that omits `imageJobCount`
 *    parses to an object where the key does not exist at all (not merely
 *    `undefined`), so `JSON.stringify` never emits it.
 *  - `resolveHyperframesAutoPlanImageJobCount` — sequential strategy resolves
 *    to the fixed constant 9, every other strategy resolves to 1, and the
 *    result never depends on `shotCount`.
 *  - `HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR` pinned at 1.1.
 */
import { describe, expect, it } from "vitest";

import {
  HyperframesCreditEstimateSchema,
  type HyperframesCreditEstimate,
} from "../contracts";
import {
  HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR,
  HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT,
  resolveHyperframesAutoPlanImageJobCount,
} from "../autoPlan";

function baseEstimate(): HyperframesCreditEstimate {
  return {
    estimateRef: "hf_estimate_hf_input_preview",
    tenantId: "tenant_1",
    userId: 1,
    runId: "mar_1",
    renderIntent: "preview",
    compositionMode: "storyboard_motion_preview",
    costClass: "composition_preview",
    width: 1080,
    height: 1920,
    fps: 24,
    durationSeconds: 15,
    estimatedFrameCount: 360,
    estimatedRenderPixels: 746_496_000,
    estimatedStorageBytes: 12_000_000,
    profileMultiplier: 1,
    costClassMultiplier: 0.65,
    workerComplexityMultiplier: 1,
    estimatedCredits: 1,
    freePreviewApplied: true,
    quotaDecision: "free_preview_allowed",
    idempotencyKey:
      "hyperframes-credit:tenant_1:mar_1:preview:hf_input:1.0.0:generic_vertical_9_16",
    compositionEstimateRef:
      "hyperframes-credit:tenant_1:mar_1:preview:hf_input:1.0.0:generic_vertical_9_16",
    compositionReservationRef: null,
    compositionChargeRef: null,
    compositionRefundRef: null,
  };
}

describe("HyperframesCreditEstimateSchema — imageJobCount (Feature 136 §5.2)", () => {
  it("parses a valid estimate with imageJobCount: 9", () => {
    const parsed = HyperframesCreditEstimateSchema.parse({
      ...baseEstimate(),
      imageJobCount: 9,
    });
    expect(parsed.imageJobCount).toBe(9);
  });

  it("parses a valid estimate without imageJobCount (optional)", () => {
    const parsed = HyperframesCreditEstimateSchema.parse(baseEstimate());
    expect(parsed.imageJobCount).toBeUndefined();
  });

  it.each([0, -1, 2.5, "9", 65])(
    "rejects imageJobCount = %p",
    invalidValue => {
      expect(() =>
        HyperframesCreditEstimateSchema.parse({
          ...baseEstimate(),
          imageJobCount: invalidValue,
        })
      ).toThrow();
    }
  );

  it("stays .strict(): an unrelated unknown key is rejected", () => {
    expect(() =>
      HyperframesCreditEstimateSchema.parse({
        ...baseEstimate(),
        somethingUnrelated: "nope",
      })
    ).toThrow();
  });

  it("round-trips byte-identically: omitting imageJobCount means the key never exists on the parsed object", () => {
    const parsed = HyperframesCreditEstimateSchema.parse(baseEstimate());
    expect(Object.prototype.hasOwnProperty.call(parsed, "imageJobCount")).toBe(
      false
    );
    expect(JSON.stringify(parsed)).not.toContain("imageJobCount");
  });
});

describe("resolveHyperframesAutoPlanImageJobCount (Feature 136 §5.1)", () => {
  it("resolves the sequential strategy to the fixed constant 9", () => {
    expect(
      resolveHyperframesAutoPlanImageJobCount({
        frameStrategy: "sequential_shot_storyboard",
      })
    ).toBe(9);
    expect(
      resolveHyperframesAutoPlanImageJobCount({
        frameStrategy: "sequential_shot_storyboard",
      })
    ).toBe(HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT);
  });

  it.each(["storyboard_3x3_split", "auto", "video_shot_start_stop"] as const)(
    "resolves %s to 1",
    frameStrategy => {
      expect(resolveHyperframesAutoPlanImageJobCount({ frameStrategy })).toBe(
        1
      );
    }
  );

  it("is independent of shotCount — only frameStrategy is read", () => {
    const withShotCount7 = resolveHyperframesAutoPlanImageJobCount({
      frameStrategy: "sequential_shot_storyboard",
    } as never);
    // Pass an object that also carries a shotCount field the resolver must
    // ignore per its `Pick<..., "frameStrategy">` contract.
    const withExtraShotCount = resolveHyperframesAutoPlanImageJobCount({
      frameStrategy: "sequential_shot_storyboard",
      shotCount: 7,
    } as never);
    expect(withShotCount7).toBe(9);
    expect(withExtraShotCount).toBe(9);
  });
});

describe("HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR", () => {
  it("is pinned at 1.1", () => {
    expect(HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR).toBe(1.1);
  });
});
