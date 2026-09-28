import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../verticalDramaStoryBible", () => ({
  executeJsonPlanningCallWithRetry: vi.fn(),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
}));
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStoryboardModel: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(),
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

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { executeJsonPlanningCallWithRetry } from "../verticalDramaStoryBible";
import {
  calculateCreditsForLLM,
  deductCredits,
  hasEnoughCredits,
} from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "../skillFiles";
import { resolveStoryboardModel } from "../verticalDramaImproveScript";
import {
  generateVerticalDramaShotSceneIntent,
  VerticalDramaShotSceneIntentSchemaValidationError,
} from "../verticalDramaShotSceneIntent";

const mockExecute = vi.mocked(executeJsonPlanningCallWithRetry);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryboardModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function sceneIntentShot(shotNumber: number) {
  return {
    shot_number: shotNumber,
    scene_intent: {
      contract_version: "vd-shot-scene-intent-v1" as const,
      physical_character_refs: [],
      screen_caller_refs: [],
      offscreen_speaker_refs: [],
      mentioned_only_refs: [],
      supporting_presence: [],
      communication_mode: "none" as const,
      visual_plan: {
        mode: "no_character" as const,
        reason_codes: [],
        primary_character_refs: [],
        secondary_character_refs: [],
      },
      dialogue_routing: [],
      confidence: "high" as const,
      needs_review: false,
      reason_codes: [],
    },
  };
}

describe("generateVerticalDramaShotSceneIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(3);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-scene-intent",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-scene-intent/skill.md"
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "---\nname: test\n---\nScene intent system prompt" as any
    );
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "Scene intent system prompt",
    });
    mockExecute.mockResolvedValue({
      data: {
        contract_version: "vd-shot-scene-intent-v1",
        shots: Array.from({ length: 9 }, (_, index) =>
          sceneIntentShot(index + 1)
        ),
      },
      response: { usage: { prompt_tokens: 100, completion_tokens: 50 } },
    } as any);
  });

  it("supports deferred repair billing without deducting credits in the runner", async () => {
    const result = await generateVerticalDramaShotSceneIntent({
      userId: 7,
      tenantId: "tenant-7",
      seriesId: 8,
      episodeId: 28,
      episodeTitle: "Episode 28",
      currentEpisodeNumber: 28,
      characters: [{ characterId: "alice", name: "Alice" }],
      shots: Array.from({ length: 9 }, (_, index) => ({
        shotNumber: index + 1,
        synopsis: `Shot ${index + 1}`,
      })),
      deferCreditDeduction: true,
    });

    expect(result.intent.shots).toHaveLength(9);
    expect(result.creditsUsed).toBe(3);
    expect(result.creditCharge?.skillSlug).toBe(
      "vertical-drama-shot-scene-intent"
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledOnce();
    const request = mockExecute.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.modelFallbackOnSchema).toBe(true);
    expect(request.modelFallbackPolicy).toBe("recommended");
    expect(request.schemaRetryContract).toContain('"vd-shot-scene-intent-v1"');
    expect(request.schemaRetryContract).toContain("dialogue_routing:object[]");
  });

  it("exposes bounded schema diagnostics instead of returning an opaque storyboard failure", async () => {
    mockExecute.mockRejectedValueOnce(
      Object.assign(new Error("schema mismatch"), {
        code: "VD_SCHEMA_VALIDATION_FAILED",
        issues: {
          issues: [
            {
              path: ["shots", 0, "scene_intent", "dialogue_routing"],
              message: "Expected array, received string",
            },
          ],
        },
      })
    );

    const promise = generateVerticalDramaShotSceneIntent({
      userId: 7,
      tenantId: "tenant-7",
      seriesId: 8,
      episodeId: 28,
      episodeTitle: "Episode 28",
      currentEpisodeNumber: 28,
      characters: [{ characterId: "alice", name: "Alice" }],
      shots: Array.from({ length: 9 }, (_, index) => ({
        shotNumber: index + 1,
        synopsis: `Shot ${index + 1}`,
      })),
      deferCreditDeduction: true,
    });
    await expect(promise).rejects.toBeInstanceOf(
      VerticalDramaShotSceneIntentSchemaValidationError
    );
    await promise.catch(error => {
      const sceneError =
        error as VerticalDramaShotSceneIntentSchemaValidationError;
      expect(sceneError.message).toContain(
        "shots.0.scene_intent.dialogue_routing"
      );
      expect(sceneError.diagnostics[0]).toContain("array of routing objects");
    });
  });

  it("routes semantic call-topology failures through the bounded retry contract", async () => {
    const invalidOutput = {
      contract_version: "vd-shot-scene-intent-v1",
      shots: Array.from({ length: 9 }, (_, index) => ({
        ...sceneIntentShot(index + 1),
        scene_intent: {
          ...sceneIntentShot(index + 1).scene_intent,
          communication_mode: "phone_call",
        },
      })),
    };
    mockExecute.mockImplementationOnce(async request => {
      const validation = request.schema.safeParse(invalidOutput);
      expect(validation.success).toBe(false);
      throw Object.assign(new Error("semantic schema mismatch"), {
        code: "VD_SCHEMA_VALIDATION_FAILED",
        issues: validation.error,
      });
    });

    await expect(
      generateVerticalDramaShotSceneIntent({
        userId: 7,
        tenantId: "tenant-7",
        seriesId: 8,
        episodeId: 28,
        episodeTitle: "Episode 28",
        currentEpisodeNumber: 28,
        characters: [{ characterId: "alice", name: "Alice" }],
        shots: Array.from({ length: 9 }, (_, index) => ({
          shotNumber: index + 1,
          synopsis: `Shot ${index + 1}`,
        })),
        deferCreditDeduction: true,
      })
    ).rejects.toMatchObject({
      code: "VD_SHOT_SCENE_INTENT_SCHEMA_VALIDATION_FAILED",
    });
    expect(mockExecute).toHaveBeenCalledOnce();
  });
});
