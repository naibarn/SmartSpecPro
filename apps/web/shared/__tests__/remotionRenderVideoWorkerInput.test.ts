import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { RemotionTemplateConfigSchema } from "../remotion/layerTemplateSchemas";
import {
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  remotionRenderVideoWorkerInputSchema,
} from "../workerRuntime";

function readFixture<T = unknown>(fileName: string): T {
  const filePath = path.resolve(import.meta.dirname, "..", "__fixtures__", fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

describe("remotionRenderVideoWorkerInputSchema (Feature 133 section-03 golden fixtures)", () => {
  it("accepts remotionRenderVideoWorkerInput-valid.json", () => {
    const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json");
    const parsed = remotionRenderVideoWorkerInputSchema.safeParse(validFixture);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.kind).toBe("remotion_render_video");
    expect(parsed.data.compositionId).toBe("GenericTemplate");
    expect(parsed.data.videoProjectId).toBe("vp-goldenfixture-001");
    expect(parsed.data.durationInFrames).toBe(300);
    expect(parsed.data.remotionTemplate.layers).toHaveLength(5);
    expect(parsed.data.assetManifest.sources).toHaveLength(4);
    expect(parsed.data.segmentPlan).toBeNull();
  });

  it("rejects remotionRenderVideoWorkerInput-invalid.json with a stable error", () => {
    const invalidFixture = readFixture("remotionRenderVideoWorkerInput-invalid.json");
    const parsed = remotionRenderVideoWorkerInputSchema.safeParse(invalidFixture);

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const issueCodes = parsed.error.issues.map((issue) => issue.code);
    const issuePaths = parsed.error.issues.map((issue) => issue.path.join("."));

    // A renamed/unknown field must be a hard failure (the drift guard) ...
    expect(issueCodes).toContain("unrecognized_keys");
    // ... and the now-missing required field must also fail.
    expect(issuePaths).toContain("compositionId");
  });

  it("embeds a schema-valid RemotionTemplateConfig", () => {
    // NOTE (worker-app-remotion-render-video P1, 2026-07-30): this no longer
    // asserts the SAME schema instance as `apps/web/shared/remotion/
    // layerTemplateSchemas.ts`'s `RemotionTemplateConfigSchema` — the
    // `remotion_render_video` job contract (this schema) moved to
    // `@smartspec/remotion-render` (see `../workerRuntime.ts`'s doc comment)
    // so the `apps/worker-app` sidecar can import it without depending on
    // `apps/web` at all. `apps/web`'s own `layerTemplateSchemas.ts` was
    // independently updated (as part of that move) to keep the SAME layer
    // shapes (including the `audio` layer variant), so both schemas still
    // accept/reject the same fixtures — asserted below via cross-parse
    // rather than reference identity.
    const validFixture = readFixture<{ remotionTemplate: unknown }>(
      "remotionRenderVideoWorkerInput-valid.json",
    );
    expect(RemotionTemplateConfigSchema.safeParse(validFixture.remotionTemplate).success).toBe(
      true,
    );
    expect(
      remotionRenderVideoWorkerInputSchema.shape.remotionTemplate.safeParse(
        validFixture.remotionTemplate,
      ).success,
    ).toBe(true);
  });

  it("requires a non-empty capabilityFamilies-relevant contract (compositionId literal)", () => {
    // The anti-mis-claim safety mechanism: this list must never be empty.
    expect(REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES.length).toBeGreaterThan(0);
    expect(REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES).toContain("remotion-render");

    const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json");
    const withWrongComposition = { ...(validFixture as object), compositionId: "OtherComposition" };
    expect(remotionRenderVideoWorkerInputSchema.safeParse(withWrongComposition).success).toBe(
      false,
    );

    expect(REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION.length).toBeGreaterThan(0);
    expect(REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION.length).toBeGreaterThan(0);
    expect(REMOTION_RENDER_VIDEO_PROGRESS_STAGES.length).toBeGreaterThan(0);
    expect(REMOTION_RENDER_VIDEO_FAILURE_CODES.length).toBeGreaterThan(0);
  });

  it("normalizes deterministically", () => {
    const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json");
    const first = remotionRenderVideoWorkerInputSchema.parse(validFixture);
    const second = remotionRenderVideoWorkerInputSchema.parse(validFixture);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  describe("captionLines (implementation-progress.md gap #3 — additive, optional)", () => {
    it("still accepts the golden fixture with no captionLines field at all", () => {
      const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json");
      const parsed = remotionRenderVideoWorkerInputSchema.safeParse(validFixture);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.captionLines).toBeUndefined();
    });

    it("accepts real caption lines with absolute-timeline seconds", () => {
      const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json") as object;
      const withCaptions = {
        ...validFixture,
        captionLines: [
          { startSec: 0, endSec: 2.5, text: "สินค้านี้ดีที่สุด" },
          { startSec: 2.5, endSec: 5, text: "ลองใช้ดูสิ" },
        ],
      };
      const parsed = remotionRenderVideoWorkerInputSchema.safeParse(withCaptions);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.captionLines).toEqual([
        { startSec: 0, endSec: 2.5, text: "สินค้านี้ดีที่สุด" },
        { startSec: 2.5, endSec: 5, text: "ลองใช้ดูสิ" },
      ]);
    });

    it("rejects a caption line with an unknown key (strict, same drift guard as the rest of the schema)", () => {
      const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json") as object;
      const withBadCaptions = {
        ...validFixture,
        captionLines: [{ startSec: 0, endSec: 1, text: "hi", speakerName: "narrator" }],
      };
      expect(remotionRenderVideoWorkerInputSchema.safeParse(withBadCaptions).success).toBe(false);
    });
  });

  describe("captionPresetId (implementation-progress.md gap #3 follow-up — additive, optional)", () => {
    it("still accepts the golden fixture with no captionPresetId field at all", () => {
      const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json");
      const parsed = remotionRenderVideoWorkerInputSchema.safeParse(validFixture);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.captionPresetId).toBeUndefined();
    });

    it("accepts a valid caption preset id (one of the shared 10-value enum)", () => {
      const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json") as object;
      const withPreset = { ...validFixture, captionPresetId: "classic_box" };
      const parsed = remotionRenderVideoWorkerInputSchema.safeParse(withPreset);

      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect(parsed.data.captionPresetId).toBe("classic_box");
    });

    it("rejects an invalid/unknown caption preset id", () => {
      const validFixture = readFixture("remotionRenderVideoWorkerInput-valid.json") as object;
      const withBadPreset = { ...validFixture, captionPresetId: "not_a_real_preset" };
      expect(remotionRenderVideoWorkerInputSchema.safeParse(withBadPreset).success).toBe(false);
    });
  });
});
