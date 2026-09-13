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
import { generateVerticalDramaShotSceneIntent } from "../verticalDramaShotSceneIntent";

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
  });
});
