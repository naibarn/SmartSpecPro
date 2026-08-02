import { describe, expect, it } from "vitest";

import { resolveStagedModelDurationOptionsForTest } from "../marketplaceAutoReviewStagedPipelineService";
import { resolveDbModelDurations } from "../modelRegistry";

/**
 * Field incident 2026-07-30 — run `mar_341efe636f0e6d11fc938a37dd4b19a1`,
 * shot 2. The staged pipeline submitted a 10-second veo3-lite video and
 * Kie.ai rejected the whole task with:
 *
 *   500: Video generation failed: Kie.ai task submission failed:
 *        Duration must be 4, 6 or 8 seconds
 *
 * Two independent gaps let an unsupported duration through:
 *
 * 1. `STATIC_MODEL_REGISTRY` declares `durations` for veo3-lite, but a
 *    DB-backed catalog REPLACES the static registry, and the live row had a
 *    NULL `durations` column — erasing the constraint (56 of 111 enabled
 *    video rows were in that state).
 * 2. Supported durations are also expressible as
 *    `configJson.inputFields[key=duration].options` (which is what the media
 *    router's request validator reads), and the staged fitter ignored that
 *    source entirely.
 *
 * Neither gate fired, so the fitter passed 10s straight to the provider.
 */
describe("staged video duration — both declaration sources are honoured", () => {
  describe("resolveDbModelDurations (DB row ← static registry backfill)", () => {
    it("keeps operator-entered DB durations verbatim", () => {
      expect(
        resolveDbModelDurations({
          modelId: "veo3/generate-veo-3-video-lite",
          durations: [4, 6, 8],
        })
      ).toEqual([4, 6, 8]);
    });

    it("backfills from the static registry when the DB column is NULL", () => {
      // The regression itself: a NULL column used to erase the static value.
      expect(
        resolveDbModelDurations({
          modelId: "veo3/generate-veo-3-video-lite",
          durations: null,
        })
      ).toEqual([8]);
    });

    it("backfills when the DB column is an empty array", () => {
      expect(
        resolveDbModelDurations({
          modelId: "veo3/generate-veo-3-video-lite",
          durations: [],
        })
      ).toEqual([8]);
    });

    it("returns undefined when neither the row nor the static registry declares anything", () => {
      expect(
        resolveDbModelDurations({
          modelId: "no-such-model-in-any-registry",
          durations: null,
        })
      ).toBeUndefined();
    });
  });

  describe("resolveStagedModelDurationOptions (column ← configJson fallback)", () => {
    it("prefers the durations column when present", () => {
      expect(
        resolveStagedModelDurationOptionsForTest({
          durations: [4, 6, 8],
          configJson: {
            inputFields: [
              { key: "duration", options: [{ value: "99" }] },
            ],
          },
        } as never)
      ).toEqual([4, 6, 8]);
    });

    it("falls back to configJson duration options when the column is empty", () => {
      expect(
        resolveStagedModelDurationOptionsForTest({
          configJson: {
            inputFields: [
              { key: "resolution", options: [{ value: "720p" }] },
              {
                key: "duration",
                options: [{ value: "4" }, { value: "6" }, { value: 8 }],
              },
            ],
          },
        } as never)
      ).toEqual([4, 6, 8]);
    });

    it("ignores non-numeric and non-positive option values", () => {
      expect(
        resolveStagedModelDurationOptionsForTest({
          configJson: {
            inputFields: [
              {
                key: "duration",
                options: [
                  { value: "auto" },
                  { value: "0" },
                  { value: "-5" },
                  { value: "8" },
                  null,
                ],
              },
            ],
          },
        } as never)
      ).toEqual([8]);
    });

    it("returns an empty list when no source declares durations (model stays unconstrained)", () => {
      expect(
        resolveStagedModelDurationOptionsForTest({
          configJson: { inputFields: [{ key: "resolution", options: [] }] },
        } as never)
      ).toEqual([]);
      expect(resolveStagedModelDurationOptionsForTest(undefined as never)).toEqual(
        []
      );
    });
  });
});
