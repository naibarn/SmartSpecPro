import { describe, expect, it, vi } from "vitest";
import { normalizeStoryboardGlobalInput } from "../storyboardSkillFrameworkContracts";
import {
  buildCuteChildPromptOnlyRequest,
  buildStoryboardVideoPrompt,
  planStoryboardShots,
  runStoryboardPromptPipeline,
} from "../storyboardSkillFrameworkPipeline";

const input = normalizeStoryboardGlobalInput({
  title: "สวนมหัศจรรย์",
  idea: "เด็กน้อยช่วยลูกนกกลับรัง",
  storyType: "mime",
  totalShots: 12,
  selectedSkillId: "cute_child_image_generator",
  selectedSkillVersion: "3.0.0",
  imageModelSelection: { modelId: "gpt-image-2.5", quality: "xhigh" },
  videoModelSelection: { modelId: "veo-3" },
  skillInputs: { age: 5, scene_mode: "random_all" },
  characterIds: ["asset-1"],
});

describe("Storyboard Skill Framework pipeline", () => {
  it("plans exact 2-12 shots in narrative order", () => {
    expect(planStoryboardShots({ ...input, totalShots: 2 })).toHaveLength(2);
    expect(
      planStoryboardShots({ ...input, totalShots: 2 }).map(shot => shot.beat)
    ).toEqual(["setup", "resolution"]);
    expect(
      planStoryboardShots({ ...input, totalShots: 4 }).map(shot => shot.beat)
    ).toEqual(["setup", "problem", "turning_point", "result"]);
    expect(planStoryboardShots(input)).toHaveLength(12);
    expect(planStoryboardShots(input)[8].beat).toBe("ending");
  });

  it("keeps Cute Child canonical prompt and whole generation request", () => {
    const withReference = {
      ...input,
      totalShots: 2,
      skillInputs: {
        ...input.skillInputs,
        character_reference_images: [{ asset_id: "asset-1" }],
      },
    };
    const result = buildCuteChildPromptOnlyRequest(
      withReference,
      planStoryboardShots(withReference)[0]
    );
    expect(result.result.generation_prompt).toBe(
      result.result.generation_request.prompt
    );
    expect(result.result.generation_request.aspect_ratio).toBe("9:16");
    expect(result.result.generation_request.reference_images).toEqual([
      { asset_id: "asset-1", url: null, role: "identity_reference" },
    ]);
  });

  it("runs prompt, image, and video stages in shot order without provider calls in prompt-only mode", async () => {
    const promptOnly = vi.fn(async (_input, shot) =>
      buildCuteChildPromptOnlyRequest(input, shot)
    );
    const result = await runStoryboardPromptPipeline(
      { ...input, totalShots: 2 },
      { promptOnly }
    );
    expect(promptOnly).toHaveBeenCalledTimes(2);
    expect(result.map(item => item.shot.shotNumber)).toEqual([1, 2]);
    expect(result[0].imageAssetId).toBeUndefined();
  });

  it("builds a video prompt from the generated image reference", () => {
    expect(
      buildStoryboardVideoPrompt({
        shot: planStoryboardShots(input)[0],
        imageAssetId: "asset-1",
        videoModelId: "veo-3",
        language: "th",
      })
    ).toContain("asset-1");
  });
});
