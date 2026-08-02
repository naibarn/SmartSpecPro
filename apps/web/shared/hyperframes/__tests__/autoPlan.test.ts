import { describe, expect, it } from "vitest";

import {
  applyHyperframesAutoPlanOverrides,
  buildDefaultHyperframesAutoPlanDefaults,
  buildHyperframesAutoStoryboardReviewPlan,
  buildHyperframesAutoOverrideDiff,
  HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES,
  normalizeHyperframesAutoPlanOverrides,
} from "../autoPlan";
import { buildHyperframesFeatureAccessProjection } from "../featureAccess";

function readyAccess() {
  return buildHyperframesFeatureAccessProjection({
    tenantId: "tenant_1",
    userId: 1,
    flags: {
      enabled: true,
      tenantAllowed: true,
      workerEnabled: true,
      librarySaveEnabled: false,
      operatorEnabled: false,
      templateAllowlist: [],
    },
  });
}

describe("HyperFrames auto plan contract", () => {
  it("resolves defaults without caller template/platform/render customization", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();

    expect(defaults).toMatchObject({
      outputMode: "storyboard_images",
      frameStrategy: "storyboard_3x3_split",
      audioStrategy: "native_video_audio",
      shotCount: 9,
      renderEngine: "hyperframes_composition",
      compositionMode: "storyboard_motion_preview",
      renderIntent: "preview",
      templateId: "marketplace_storyboard_motion_9x9_v1",
    });
  });

  it("keeps exported base override values in sync with backend defaults", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();

    expect(HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES).toEqual({
      // Feature 136 section 09 (§5.2) — `outputMode` became overridable
      // (previously hardcoded with no override path) so the start-frame
      // capability blocker can ever be reachable at plan time.
      outputMode: defaults.outputMode,
      platformPresetId: defaults.platformPreset.presetId,
      frameStrategy: defaults.frameStrategy,
      audioStrategy: defaults.audioStrategy,
      shotCount: String(defaults.shotCount),
      overlayTextMode: defaults.overlayTextMode,
      imageModel: defaults.imageModel,
      videoModel: defaults.videoModel,
      videoStructureMode: defaults.videoStructureMode,
      manualVideoGroupSize: String(defaults.manualVideoGroupSize),
      speechLanguage: defaults.speechLanguage,
      creativeBrief: defaults.creativeBrief,
      motionDirection: defaults.motionDirection,
      characterPresenceMode: defaults.characterPresenceMode,
      qualityMode: defaults.qualityMode,
      visionQaModel: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.visionQaModel,
      // Feature 136 — these five keys are decorative-only (required by the
      // `satisfies Record<...>` constraint) and intentionally NOT derived
      // from `defaults`, since `buildDefaultHyperframesAutoPlanDefaults()`
      // never sets them (they stay absent-by-default; binding decision
      // §3.4, section-01-flags-and-schemas.md).
      confirmedAttributes: "",
      forbiddenClaims: "",
      targetAudience: "",
      userRequirements: "",
      sequentialImagePromptMaxChars: "4000",
      // Feature 136 section 13 — same decorative-only rationale as the five
      // keys above (`buildDefaultHyperframesAutoPlanDefaults()` never sets
      // it; stays absent-by-default).
      startFramePromptStyle: "evidence_product",
      // Creation-time drama casting (W2) — same decorative-only rationale as
      // the keys above.
      characterCast: "",
      // Story/skill LLM (`planning/marketplace-four-character-cast/plan.md`) —
      // same decorative-only rationale: absent-by-default so "แนะนำ
      // (อัตโนมัติ)" stays the resolved-server-side behavior.
      storyPlanningModel: "",
    });
  });

  it("builds one primary Auto action while preserving Standard Order availability", () => {
    const plan = buildHyperframesAutoStoryboardReviewPlan({
      productId: "product_1",
      tenantId: "tenant_1",
      userId: 1,
      access: readyAccess(),
      now: new Date("2026-06-04T00:00:00.000Z"),
    });

    expect(plan.launchMode).toBe("auto_storyboard_review");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.canStart).toBe(true);
    expect(plan.standardOrderAvailable).toBe(true);
    expect(plan.resetToAutoAvailable).toBe(false);
  });

  it("reset-to-auto tracks only Auto override diff fields", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    const diff = buildHyperframesAutoOverrideDiff({
      defaults,
      overrides: {
        shotCount: 7,
        qualityMode: "high",
        standardOrderOutputMode: "full_video",
      },
    });

    expect(diff.active).toBe(true);
    expect(diff.fields).toEqual(["shotCount", "qualityMode"]);
    expect(diff.values).not.toHaveProperty("standardOrderOutputMode");
  });

  it("applies safe Auto overrides without exposing template or engine selection", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    const overridden = applyHyperframesAutoPlanOverrides({
      defaults,
      overrides: {
        shotCount: 7,
        qualityMode: "high",
        imageModel: "google-banana-2",
        videoModel: "kling3/generate-kling-3-video",
        videoStructureMode: "adaptive_multi_shot",
        speechLanguage: "th",
        creativeBrief: "Make it concise and proof-first.",
        platformPresetId: "tiktok_reels_shorts_9_16",
        renderEngine: "existing_ffmpeg_timeline",
      },
    });

    expect(overridden).toMatchObject({
      shotCount: 7,
      qualityMode: "high",
      imageModel: "google-banana-2",
      videoModel: "kling3/generate-kling-3-video",
      videoStructureMode: "adaptive_multi_shot",
      speechLanguage: "th",
      creativeBrief: "Make it concise and proof-first.",
      renderEngine: "hyperframes_composition",
      templateId: "marketplace_storyboard_motion_9x9_v1",
    });
    expect(overridden.platformPreset.presetId).toBe("tiktok_reels_shorts_9_16");
  });

  it("keeps valid normalized override fields when another field is invalid", () => {
    const normalized = normalizeHyperframesAutoPlanOverrides({
      qualityMode: "high",
      shotCount: 99,
      renderEngine: "existing_ffmpeg_timeline",
    });

    expect(normalized).toMatchObject({ qualityMode: "high" });
    expect(normalized).not.toHaveProperty("shotCount");
    expect(normalized).not.toHaveProperty("renderEngine");
  });

  it("accepts video structure overrides and prunes invalid manual group sizes", () => {
    const normalized = normalizeHyperframesAutoPlanOverrides({
      videoStructureMode: "manual_group_size",
      manualVideoGroupSize: 4,
      speechLanguage: "zh",
      creativeBrief: "Warm proof-first review.",
      invalidVideoStructure: "nope",
    });

    expect(normalized).toMatchObject({
      videoStructureMode: "manual_group_size",
      manualVideoGroupSize: 4,
      speechLanguage: "zh",
      creativeBrief: "Warm proof-first review.",
    });

    expect(
      normalizeHyperframesAutoPlanOverrides({
        manualVideoGroupSize: 99,
      })
    ).not.toHaveProperty("manualVideoGroupSize");
    expect(
      normalizeHyperframesAutoPlanOverrides({
        speechLanguage: "klingon",
      })
    ).not.toHaveProperty("speechLanguage");
  });

  it("carries an optional motionDirection override through normalize and apply", () => {
    const normalized = normalizeHyperframesAutoPlanOverrides({
      motionDirection: "  Pump, pour, lather, then showcase the product.  ",
    });
    expect(normalized.motionDirection).toBe(
      "Pump, pour, lather, then showcase the product."
    );

    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    expect(defaults.motionDirection).toBe("");

    const applied = applyHyperframesAutoPlanOverrides({
      defaults,
      overrides: {
        motionDirection: "Pump, pour, lather, then showcase the product.",
      },
    });
    expect(applied.motionDirection).toBe(
      "Pump, pour, lather, then showcase the product."
    );
  });

  it("drops an empty/whitespace-only motionDirection override (min 1 after trim)", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({ motionDirection: "   " })
    ).not.toHaveProperty("motionDirection");
    const applied = applyHyperframesAutoPlanOverrides({
      defaults: buildDefaultHyperframesAutoPlanDefaults(),
      overrides: { motionDirection: "   " },
    });
    expect(applied.motionDirection).toBe("");
  });

  it("defaults characterPresenceMode to auto", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    expect(defaults.characterPresenceMode).toBe("auto");
    expect(HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.characterPresenceMode).toBe(
      "auto"
    );
  });

  it("carries an optional characterPresenceMode override through normalize and apply", () => {
    const normalized = normalizeHyperframesAutoPlanOverrides({
      characterPresenceMode: "every_frame",
    });
    expect(normalized.characterPresenceMode).toBe("every_frame");

    const applied = applyHyperframesAutoPlanOverrides({
      defaults: buildDefaultHyperframesAutoPlanDefaults(),
      overrides: { characterPresenceMode: "most_frames" },
    });
    expect(applied.characterPresenceMode).toBe("most_frames");
  });

  it("ignores an invalid characterPresenceMode override (enum-guarded)", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({
        characterPresenceMode: "sometimes",
      })
    ).not.toHaveProperty("characterPresenceMode");
    const applied = applyHyperframesAutoPlanOverrides({
      defaults: buildDefaultHyperframesAutoPlanDefaults(),
      overrides: { characterPresenceMode: "sometimes" },
    });
    expect(applied.characterPresenceMode).toBe("auto");
  });
});
