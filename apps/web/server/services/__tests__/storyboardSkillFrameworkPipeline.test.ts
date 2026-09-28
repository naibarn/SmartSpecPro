import { describe, expect, it, vi } from "vitest";
import { normalizeStoryboardGlobalInput } from "../storyboardSkillFrameworkContracts";
import {
  buildStoryboardShotActivity,
  buildStoryboardContinuationImagePrompt,
  buildCuteChildPromptOnlyRequest,
  buildStoryboardVideoPrompt,
  ensureStoryboardSingleImagePrompt,
  planStoryboardShots,
  runStoryboardPromptPipeline,
  STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK,
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
  it("varies the activity instructions by shot while preserving the activity family", () => {
    const first = buildStoryboardShotActivity({
      baseActivity: "taste food, share food, and laugh",
      beat: "setup",
      shotNumber: 1,
      totalShots: 9,
    });
    const turningPoint = buildStoryboardShotActivity({
      baseActivity: "taste food, share food, and laugh",
      beat: "turning_point",
      shotNumber: 6,
      totalShots: 9,
    });
    expect(first).toContain("taste food, share food, and laugh");
    expect(turningPoint).toContain("taste food, share food, and laugh");
    expect(first).not.toBe(turningPoint);
    expect(turningPoint).toContain("change the direction of the story");
  });

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
    expect(result.result.generation_prompt).toContain(
      STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK
    );
    expect(result.result.generation_request.aspect_ratio).toBe("9:16");
    expect(result.result.generation_request.reference_images).toEqual([
      { asset_id: "asset-1", url: null, role: "identity_reference" },
    ]);

    const second = buildCuteChildPromptOnlyRequest(
      withReference,
      planStoryboardShots(withReference)[1]
    );
    expect(second.result.generation_prompt).not.toBe(
      result.result.generation_prompt
    );
    expect(result.result.generation_prompt).toContain("Shot 1");
    expect(second.result.generation_prompt).toContain("Shot 2");
  });

  it("calls the skill only for Shot 1 and builds compact continuation prompts", async () => {
    const promptOnly = vi.fn(async (_input, shot) =>
      buildCuteChildPromptOnlyRequest(input, shot)
    );
    const result = await runStoryboardPromptPipeline(
      { ...input, totalShots: 9 },
      { promptOnly }
    );
    expect(promptOnly).toHaveBeenCalledTimes(1);
    expect(result.map(item => item.shot.shotNumber)).toEqual(
      Array.from({ length: 9 }, (_, index) => index + 1)
    );
    expect(result[0].imageAssetId).toBeUndefined();
    expect(result[1].response.result.generation_prompt).toContain(
      "attached Shot 1 image"
    );
    expect(result[1].response.result.generation_prompt).not.toContain(
      input.idea
    );
  });

  it("uses the first generated image as the reference for every continuation shot", async () => {
    const promptOnly = vi.fn(async (_input, shot) =>
      buildCuteChildPromptOnlyRequest(input, shot)
    );
    const generateImage = vi.fn(
      async ({ referenceAssetIds }: { referenceAssetIds: string[] }) => ({
        assetId: `asset-${generateImage.mock.calls.length + 1}-${referenceAssetIds.join("-") || "none"}`,
      })
    );
    const result = await runStoryboardPromptPipeline(
      { ...input, totalShots: 3 },
      { promptOnly, generateImage }
    );

    expect(promptOnly).toHaveBeenCalledTimes(1);
    expect(generateImage.mock.calls[0]?.[0].referenceAssetIds).toEqual([]);
    expect(generateImage.mock.calls[1]?.[0].referenceAssetIds).toEqual([
      result[0].imageAssetId,
    ]);
    expect(generateImage.mock.calls[2]?.[0].referenceAssetIds).toEqual([
      result[0].imageAssetId,
    ]);
    expect(result[1].videoPrompt).toContain(result[1].imageAssetId);
  });

  it("keeps continuation image prompts limited to the shot change", () => {
    const shot = planStoryboardShots({ ...input, totalShots: 2 })[1];
    const prompt = buildStoryboardContinuationImagePrompt(input, shot);
    expect(prompt).toContain("canonical identity and scene reference");
    expect(prompt).toContain("Shot 2");
    expect(prompt).not.toContain(input.idea);
  });

  it("re-locks image prompts supplied by an alternate prompt provider", async () => {
    const result = await runStoryboardPromptPipeline(
      { ...input, totalShots: 2 },
      {
        promptOnly: async (_input, shot) => {
          const response = buildCuteChildPromptOnlyRequest(input, shot);
          return {
            ...response,
            result: {
              ...response.result,
              generation_prompt: "alternate image prompt",
              generation_request: {
                ...response.result.generation_request,
                prompt: "alternate image prompt",
              },
            },
          };
        },
      }
    );
    expect(result[0].response.result.generation_prompt).toContain(
      STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK
    );
    expect(result[0].response.result.generation_request.prompt).toContain(
      STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK
    );
  });

  it("builds a video prompt from the generated image reference", () => {
    const videoPrompt = buildStoryboardVideoPrompt({
      shot: planStoryboardShots(input)[0],
      imageAssetId: "asset-1",
      videoModelId: "veo-3",
      language: "th",
    });
    expect(videoPrompt).toContain("asset-1");
    expect(videoPrompt).not.toContain(STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK);
  });

  it("appends the image-only lock once without changing an existing locked prompt", () => {
    const prompt = "Describe one child in a room.";
    const locked = ensureStoryboardSingleImagePrompt(prompt);
    expect(locked).toContain(STORYBOARD_SINGLE_IMAGE_PROMPT_LOCK);
    expect(ensureStoryboardSingleImagePrompt(locked)).toBe(locked);
  });

  it("keeps shot numbering and dialogue bound to the selected shot", () => {
    const shots = planStoryboardShots({ ...input, totalShots: 9 });
    expect(shots).toHaveLength(9);
    expect(shots[0].shotNumber).toBe(1);
    expect(shots[8].shotNumber).toBe(9);
    expect(
      buildStoryboardVideoPrompt({
        shot: {
          ...shots[1],
          dialogueLines: [
            { speaker: "เด็ก", text: "ช่วยด้วย", language: "th" },
          ],
        },
        imageAssetId: "42",
        videoModelId: "video-model",
        language: "th",
      })
    ).toContain("เด็ก: ช่วยด้วย");
  });
});
