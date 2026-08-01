import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAG_DEFAULTS,
  ALLOWED_FEATURE_FLAGS,
} from "@shared/featureFlags";
import {
  buildStartFrameRenderPlanUserPrompt,
  buildStartFrameShotPromptUserPrompt,
  buildDeterministicPolicySafeImagePrompt,
} from "../verticalDramaStartFrameGeneration";
import { buildTargetVideoModelFactBlock } from "../verticalDramaVideoMotionPromptGeneration";
import { mergeAndTrimReferenceImageUrls } from "../verticalDramaProductTieIn";
import {
  VD_IMAGE_PROMPT_ABSOLUTE_MAX,
  resolveVdImagePromptBudgetForModel,
} from "../modelPromptBudget";
import { VD_SCENE_CONTINUITY_LOCK_HEADER } from "@shared/verticalDramaSeries/sceneContinuity";

const SCENE_LOCK = `${VD_SCENE_CONTINUITY_LOCK_HEADER}\n- Lighting: warm evening light`;

const batchParams = (motionContractsEnabled?: boolean) => ({
  userId: 7,
  tenantId: "tenant-1",
  seriesId: 3,
  episodeId: 11,
  episodeTitle: "Episode 1",
  durationSeconds: 60,
  storyboardShots: [
    {
      shotNumber: 1,
      description: "Hero enters the hall",
      cameraSetup: "medium shot",
      characterIds: ["hero"],
      durationSeconds: 5,
      sceneContinuityLockBlock: SCENE_LOCK,
    },
    {
      shotNumber: 2,
      description: "Hero waits in the hall",
      cameraSetup: "medium shot",
      characterIds: ["hero"],
      durationSeconds: 5,
      sceneContinuityLockBlock: SCENE_LOCK,
    },
  ],
  ...(motionContractsEnabled === undefined ? {} : { motionContractsEnabled }),
});

describe("VD P1 joint flag interactions", () => {
  it("keeps the motion and scene flags registered and dark by default", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("verticalDramaMotionContracts")).toBe(
      true
    );
    expect(ALLOWED_FEATURE_FLAGS.has("verticalDramaSceneContinuity")).toBe(
      true
    );
    expect(FEATURE_FLAG_DEFAULTS.verticalDramaMotionContracts).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.verticalDramaSceneContinuity).toBe(false);
  });

  it("adds exactly one grouped scene-lock block to the batch prompt", () => {
    const off = buildStartFrameRenderPlanUserPrompt(batchParams(false));
    const on = buildStartFrameRenderPlanUserPrompt(batchParams(true));
    expect(off).toContain(VD_SCENE_CONTINUITY_LOCK_HEADER);
    expect(
      on.match(new RegExp(`${VD_SCENE_CONTINUITY_LOCK_HEADER}\\n`, "g"))
    ).toHaveLength(1);
    expect(on.match(/SCENE CONTINUITY LOCKS/g)).toHaveLength(1);
    expect(on).toContain("Shots 1, 2:");
    expect(on).toContain("warm evening light");
  });

  it("keeps same-scene shot authoring deterministic and separates video motion facts", () => {
    const first = buildStartFrameShotPromptUserPrompt({
      userId: 7,
      tenantId: "tenant-1",
      seriesId: 3,
      episodeId: 11,
      episodeTitle: "Episode 1",
      currentPrompt: "Hero enters the hall",
      currentNegativePrompt: "blurry",
      characterReferenceManifest: [],
      sceneContinuityLockBlock: SCENE_LOCK,
    });
    const second = buildStartFrameShotPromptUserPrompt({
      userId: 7,
      tenantId: "tenant-1",
      seriesId: 3,
      episodeId: 11,
      episodeTitle: "Episode 1",
      currentPrompt: "Hero waits in the hall",
      currentNegativePrompt: "blurry",
      characterReferenceManifest: [],
      sceneContinuityLockBlock: SCENE_LOCK,
    });
    expect(first).toContain(SCENE_LOCK);
    expect(second).toContain(SCENE_LOCK);

    const motionOff = buildTargetVideoModelFactBlock({
      family: "veo",
      modelId: "veo-test",
      frameAnalysisRequested: true,
      frameObservabilityRequested: true,
      motionContractsEnabled: false,
    });
    const motionOn = buildTargetVideoModelFactBlock({
      family: "veo",
      modelId: "veo-test",
      frameAnalysisRequested: true,
      frameObservabilityRequested: true,
      motionContractsEnabled: true,
    });
    expect(motionOn).toContain("MOTION PROFILE + MOTION CONTRACT");
    expect(motionOff).not.toContain("MOTION PROFILE + MOTION CONTRACT");
  });

  it("keeps the Feature 139 look register separate when all three authoring flags are on", () => {
    const prompt = buildStartFrameShotPromptUserPrompt({
      userId: 7,
      tenantId: "tenant-1",
      seriesId: 3,
      episodeId: 11,
      shotNumber: 1,
      currentPrompt: "Hero enters the hall",
      currentNegativePrompt: "blurry",
      characterReferenceManifest: [],
      imagePromptMode: "cinematic_narrative",
      sceneContinuityLockBlock: SCENE_LOCK,
      seriesLookRegister: {
        styleName: "grounded drama",
        palette: ["amber", "teal"],
        lighting: "soft practicals",
        cameraGrammar: "still observational",
      },
    });
    expect(prompt.match(/SCENE CONTINUITY LOCK/g)).toHaveLength(1);
    expect(prompt.match(/SERIES LOOK REGISTER/g)).toHaveLength(1);
    expect(prompt.indexOf("SERIES LOOK REGISTER")).toBeLessThan(
      prompt.indexOf(VD_SCENE_CONTINUITY_LOCK_HEADER)
    );
  });

  it("keeps policy-safe lock ordering stable when both reference and scene facts exist", () => {
    const prompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis: "Hero stands in the hall.",
      characterReferenceManifest: [
        { index: 1, name: "Hero", characterKey: "hero" },
      ],
      sceneContinuityLockBlock: SCENE_LOCK,
    });
    expect(prompt.indexOf("REFERENCE MAPPING:")).toBeLessThan(
      prompt.indexOf(VD_SCENE_CONTINUITY_LOCK_HEADER)
    );
    expect(prompt.indexOf(VD_SCENE_CONTINUITY_LOCK_HEADER)).toBeLessThan(
      prompt.indexOf("Hero stands in the hall.")
    );
  });

  it("preserves the reference attach cap and keeps character/location refs ahead of products", () => {
    const result = mergeAndTrimReferenceImageUrls(
      ["character-1", "character-2"],
      ["location"],
      ["product-1"],
      4
    );
    expect(result.urls).toEqual([
      "character-1",
      "character-2",
      "location",
      "product-1",
    ]);
    expect(result.trimmedCount).toBe(0);
  });

  it("honors the image prompt absolute budget when both lock blocks are long", () => {
    expect(
      resolveVdImagePromptBudgetForModel({
        modelId: "gpt-image-2",
        configJson: { maxPromptLength: 999999 },
      })
    ).toBe(VD_IMAGE_PROMPT_ABSOLUTE_MAX);
  });
});
