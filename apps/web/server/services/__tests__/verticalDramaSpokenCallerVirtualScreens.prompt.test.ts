import { describe, expect, it } from "vitest";
import {
  buildStartFrameRenderPlanUserPrompt,
  buildStartFrameShotPromptUserPrompt,
} from "../verticalDramaStartFrameGeneration";
import {
  buildShotVideoPromptUserPrompt,
  type GenerateVerticalDramaShotVideoPromptParams,
} from "../verticalDramaVideoMotionPromptGeneration";

describe("spoken caller virtual-screen prompt contract", () => {
  it("makes the start-frame plan use one vertical screen per spoken caller", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt({
      userId: 1,
      seriesId: 2,
      episodeId: 3,
      episodeTitle: "Caller test",
      durationSeconds: 8,
      storyboardShots: [
        {
          shotNumber: 1,
          description: "A person answers the phone",
          cameraSetup: "medium shot",
          characterIds: ["inside"],
          screenCallerCharacterIds: ["caller-a", "caller-b"],
          speakingOrder: ["caller-b", "caller-a"],
          spokenCallerCharacterRefs: ["caller-b", "caller-a"],
          durationSeconds: 8,
        },
      ],
    });

    expect(prompt).toContain("physical_scene_refs: inside");
    expect(prompt).toContain("screen_1=caller-b");
    expect(prompt).toContain("screen_2=caller-a");
    expect(prompt).toContain("vertical phone screen");
    expect(prompt).toContain("throughout the entire shot");
    expect(prompt).toContain("Never merge multiple callers into one screen");
    expect(prompt).not.toContain("physical_scene_refs: inside, caller-a");
  });

  it("makes the single-shot video prompt preserve separate caller screens", () => {
    const params: GenerateVerticalDramaShotVideoPromptParams = {
      userId: 1,
      seriesId: 2,
      episodeId: 3,
      shotNumber: 1,
      imageUrl: "https://example.com/start.png",
      imagePrompt: "A person answers a phone",
      shotContext: {
        description: "A person answers a phone",
        screenCallerCharacterRefs: ["caller-a", "caller-b"],
        speakingOrder: ["caller-a", "caller-b"],
        dialogueLines: [
          { characterKey: "caller-a", lineTh: "Hello" },
          { characterKey: "caller-b", lineTh: "I am here" },
        ],
      },
      selectedVideoModelId: "test-video",
      selectedVideoModel: {
        type: "video",
        aspectRatios: [],
        configJson: {},
        provider: "test",
        aliases: [],
      },
      locale: "th",
    };

    const prompt = buildShotVideoPromptUserPrompt(
      params,
      false,
      false,
      "TARGET VIDEO MODEL: test-video",
    );

    expect(prompt).toContain("screen_1=caller-a");
    expect(prompt).toContain("screen_2=caller-b");
    expect(prompt).toContain("dedicated vertical virtual phone screen");
    expect(prompt).toContain("Never show a spoken caller physically in the room");
  });

  it("applies the same contract to single-shot start-frame repair prompts", () => {
    const prompt = buildStartFrameShotPromptUserPrompt({
      userId: 1,
      seriesId: 2,
      episodeId: 3,
      shotNumber: 1,
      currentPrompt: "A person answers a phone",
      currentNegativePrompt: "",
      requiredCharacterRefs: ["inside"],
      screenCallerCharacterRefs: ["caller-a"],
      speakingOrder: ["caller-a"],
      characterReferenceManifest: [
        { index: 1, characterId: "inside", name: "Inside", presence: "scene" },
        { index: 2, characterId: "caller-a", name: "Caller A", presence: "screen_caller" },
      ],
    });

    expect(prompt).toContain("screen_1=caller-a");
    expect(prompt).toContain("caller face clearly visible and readable");
    expect(prompt).toContain("Never show a spoken caller physically in the room");
  });

  it("matches a dialogue display name to its explicit caller key", () => {
    const prompt = buildStartFrameShotPromptUserPrompt({
      userId: 1,
      seriesId: 2,
      episodeId: 3,
      shotNumber: 1,
      currentPrompt: "A person answers a phone",
      currentNegativePrompt: "",
      requiredCharacterRefs: ["inside"],
      screenCallerCharacterRefs: ["caller-krit"],
      speakingOrder: ["คุณกฤต"],
      characters: [
        {
          characterKey: "caller-krit",
          name: "กฤต",
          role: "supporting",
          description: "A man calling by phone",
        },
      ],
      characterReferenceManifest: [
        { index: 1, characterId: "inside", name: "Inside", presence: "scene" },
      ],
    });

    expect(prompt).toContain("screen_1=caller-krit");
    expect(prompt).toContain("vertical phone screen");
  });
});
