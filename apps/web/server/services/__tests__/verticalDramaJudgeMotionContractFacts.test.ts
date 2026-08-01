import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({ executeWithFallback: vi.fn() }));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(), deductCredits: vi.fn(), calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(), getResetTime: vi.fn() },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(), resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({ parseSkillFile: vi.fn() }));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => "---\nname: test\n---\nSystem prompt body"),
    },
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "---\nname: test\n---\nSystem prompt body"),
  };
});
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => [{ modelId: "vision-model-1" }]),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => "vision-model-1"),
}));
vi.mock("../modelRegistry", () => ({
  resolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: false,
    verticalDramaReady: true,
  })),
}));
vi.mock("../verticalDramaProviderRouting", () => ({ detectProviderFamily: vi.fn() }));
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return { ...actual, resolveStoryBibleModel: vi.fn() };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import { parseSkillFile } from "@smartspec/skills";
import { deductCredits, calculateCreditsForLLM, hasEnoughCredits } from "../creditService";
import { executeWithFallback } from "../llmRouter";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { generateJudgedVerticalDramaShotVideoPrompt } from "../verticalDramaVideoMotionPromptGeneration";

const mockExecute = vi.mocked(executeWithFallback);

function extractUserText(args: any): string {
  const message = args.messages[1];
  if (typeof message.content === "string") return message.content;
  return message.content.map((part: any) => part.text ?? "").join("\n");
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

const motionProfile = {
  characters: [{
    name: "Alice",
    start_facing: "profile",
    end_facing: "frontal",
    turn_magnitude: "large",
    reveals_hidden_side: true,
  }],
  camera_motion: "orbit",
  new_character_enters: false,
  identity_risk: "low",
  risk_reasons: ["hidden side reveal"],
};

function candidate(prompt: string, withFacts: boolean) {
  return {
    prompt,
    dialogue: [],
    ...(withFacts ? {
      frame_analysis: {
        people: [
          {
            name: "Alice",
            position: "left",
            facing: "profile",
            eyes_visible: "partial",
            occlusion: "partial",
            face_size: "medium",
            overlapped_by_other_face: false,
          },
          { name: "Extra", position: "right" },
        ],
        position_source: "attached_image",
        faces_separated: true,
      },
      motion_profile: motionProfile,
    } : {}),
  };
}

function params(motionContractsEnabled: boolean) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    shotNumber: 3,
    imageUrl: "https://cdn.example.com/shot.png",
    imagePrompt: "Alice in a corridor",
    shotContext: { description: "Alice reacts", camera: "medium", dialogueLines: [] },
    characterReferenceImages: motionContractsEnabled
      ? [{ characterKey: "alice", name: "Alice", url: "https://cdn.example.com/alice.png" }]
      : undefined,
    selectedVideoModelId: "higgsfield/veo3_1_lite",
    selectedVideoModel: {
      type: "video" as const,
      aspectRatios: ["9:16"],
      configJson: {},
      provider: "higgsfield",
      aliases: [],
      id: "higgsfield/veo3_1_lite",
    },
    locale: "en" as const,
    motionContractsEnabled,
  };
}

describe("judge motion-contract facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasEnoughCredits).mockResolvedValue(true);
    vi.mocked(deductCredits).mockResolvedValue(undefined as any);
    vi.mocked(calculateCreditsForLLM).mockReturnValue(5);
    vi.mocked(mediaGenerationLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(resolveSkillDirCandidates).mockReturnValue(["/fake/skills"]);
    vi.mocked(resolveSkillManifestPath).mockReturnValue("/fake/skills/skill.md");
    vi.mocked(parseSkillFile).mockReturnValue({ metadata: {} as any, content: "System prompt" });
  });

  it("carries normalized risk and observability facts into each candidate block", async () => {
    let judgePrompt = "";
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        judgePrompt = text;
        return successResponse({ winner_index: 0, verdict: "accept", scores: [] });
      }
      return successResponse(candidate(
        text.includes("VARIATION DIRECTIVE") ? "candidate B" : "candidate A",
        true,
      ));
    });

    const result = await generateJudgedVerticalDramaShotVideoPrompt(params(true));

    expect(result.effectiveRisk).toBe("high");
    expect(judgePrompt.match(/^motion_profile: /gm)).toHaveLength(2);
    expect(judgePrompt).toContain('"effectiveRisk":"high"');
    expect(judgePrompt).toContain('"faceObservability":[{"name":"Alice"');
    expect(judgePrompt).not.toContain('"name":"Extra","facing"');
    expect(judgePrompt).toContain('"facesSeparated":true');
    for (const block of judgePrompt.split(/\n(?=CANDIDATE \d+:)/)) {
      if (!block.startsWith("CANDIDATE")) continue;
      expect(block.indexOf("frame_analysis:")).toBeLessThan(block.indexOf("motion_profile:"));
      expect(block.indexOf("motion_profile:")).toBeLessThan(block.indexOf("FACT SHEET"));
    }
  });

  it("omits every new key and line when the flag is off", async () => {
    let judgePrompt = "";
    mockExecute.mockImplementation(async (args: any) => {
      const text = extractUserText(args);
      if (text.includes("--- CANDIDATES ---")) {
        judgePrompt = text;
        return successResponse({ winner_index: 0, verdict: "accept", scores: [] });
      }
      return successResponse(candidate(
        text.includes("VARIATION DIRECTIVE") ? "candidate B" : "candidate A",
        false,
      ));
    });

    await generateJudgedVerticalDramaShotVideoPrompt(params(false));

    expect(judgePrompt).not.toContain("motion_profile:");
    expect(judgePrompt).not.toContain('"effectiveRisk"');
    expect(judgePrompt).not.toContain('"faceObservability"');
    expect(judgePrompt).not.toContain('"facesSeparated"');
  });
});
