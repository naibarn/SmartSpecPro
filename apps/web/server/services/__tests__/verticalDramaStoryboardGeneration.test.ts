import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(),
    getResetTime: vi.fn(),
  },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(),
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<
    typeof import("../verticalDramaStoryBible")
  >("../verticalDramaStoryBible");
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateStoryboardShotgrid,
  RateLimitExceededError,
} from "../verticalDramaStoryboardGeneration";
import { executeWithFallback } from "../llmRouter";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "../skillFiles";
import {
  resolveStoryBibleModel,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaStoryBible";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function baseParams(
  overrides: Partial<Parameters<typeof generateStoryboardShotgrid>[0]> = {}
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    episodeTitle: "Episode 1",
    episodeNumber: 1,
    locale: "en" as const,
    durationSeconds: 90,
    storySource: {
      logline: "l",
      keyBeats: ["b1"],
      mainPlot: "p",
      seasonArc: "a",
      tone: "t",
    },
    characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
    ...overrides,
  };
}

function validShot(n: number) {
  return {
    shot_number: n,
    timecode: `00:0${n}`,
    duration_seconds: 10,
    narrative_purpose: "advance plot",
    characters: ["char-1"],
    required_character_refs: ["char-1"],
    camera: {
      shot_type: "medium",
      angle: "eye-level",
      lens_feel: "50mm",
      movement: "static",
      composition: "rule of thirds",
    },
    visual_description: "A scene",
    image_prompt: "A vivid image prompt",
  };
}

function validOutput(shotCount = 9) {
  return {
    storyboard_summary: {},
    canonical_style_bible: {},
    shot_grid_plan: {},
    shots: Array.from({ length: shotCount }, (_, i) => validShot(i + 1)),
    plain_text_storyboard: "Full storyboard text",
    storyboard_handoff_json: {},
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [
        {
          message: { content: JSON.stringify(payload) },
          index: 0,
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("generateStoryboardShotgrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-storyboard-shotgrid",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-storyboard-shotgrid/skill.md"
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "---\nname: test\n---\nSystem prompt body" as any
    );
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
  });

  it("happy path: valid LLM response validates, deducts credits once, checks rate limiter", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateStoryboardShotgrid(baseParams());

    expect(result.storyboard.shots).toHaveLength(9);
    expect(result.creditsUsed).toBe(8);
    expect(result.model).toBe("gpt-4o-mini");
    expect(mockIsAllowed).toHaveBeenCalledWith("user:1");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(30_000);

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      RateLimitExceededError
    );

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      InsufficientCreditsError
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (wrong shot count) and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(3))); // schema requires exactly 9

    await expect(generateStoryboardShotgrid(baseParams())).rejects.toThrow(
      VdSchemaValidationError
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("rebuilds character_attachment_manifest from referenceImageUrl (identity-lock, upstream parity) instead of trusting the LLM's guess", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        ...validOutput(),
        // The LLM has no way to know a real URL — assert we overwrite this.
        storyboard_handoff_json: {
          schema_version: "1",
          handoff_type: "storyboard_shot_prompts",
        },
      })
    );

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [
          {
            characterId: "char-1",
            name: "Alice",
            role: "lead",
            referenceImageUrl: "https://cdn.example/alice.png",
          },
          {
            characterId: "char-2",
            name: "Bob",
            role: "support",
            referenceImageUrl: null,
          },
        ],
      })
    );

    const manifest = (result.storyboard.storyboard_handoff_json as any)
      .character_attachment_manifest;
    expect(manifest).toEqual([
      {
        character_id: "char-1",
        name: "Alice",
        reference_image_url: "https://cdn.example/alice.png",
      },
    ]);
    // Pre-existing fields on storyboard_handoff_json survive the merge.
    expect(
      (result.storyboard.storyboard_handoff_json as any).schema_version
    ).toBe("1");
  });

  it("leaves storyboard_handoff_json untouched when no character has a reference image", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateStoryboardShotgrid(
      baseParams({
        characters: [{ characterId: "char-1", name: "Alice", role: "lead" }],
      })
    );

    expect(
      (result.storyboard.storyboard_handoff_json as any)
        .character_attachment_manifest
    ).toBeUndefined();
  });
});
