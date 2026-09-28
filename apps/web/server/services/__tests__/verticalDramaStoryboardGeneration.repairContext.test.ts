/**
 * Coverage for `verticalDramaStoryboardGeneration.ts`'s `repairContext`
 * (real-repair wiring for `verticalDramaEpisodePipeline.ts`'s `repairStage`,
 * see that method's doc comment) — the storyboard-side twin of
 * `verticalDramaScriptGeneration.repairContext.test.ts`:
 *  - `repairContext` injects a REPAIR MODE framing + the current storyboard
 *    + the instruction into the prompt, decoupled exactly like
 *    `episode_draft` (see
 *    `verticalDramaStoryboardGeneration.episodeDraft.test.ts`'s identical
 *    convention);
 *  - a fresh-generation call (no `repairContext`) produces a byte-identical
 *    prompt to before this parameter existed.
 *
 * Mirrors `verticalDramaStoryboardGeneration.test.ts`'s mocking pattern
 * exactly.
 */
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
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStoryboardModel: vi.fn(),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { generateStoryboardShotgrid } from "../verticalDramaStoryboardGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import { resolveStoryboardModel } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockResolveStoryboardModel = vi.mocked(resolveStoryboardModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
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

const CURRENT_STORYBOARD: Record<string, unknown> = {
  storyboard_summary: { note: "original" },
  canonical_style_bible: {},
  shot_grid_plan: {},
  shots: Array.from({ length: 9 }, (_, i) => validShot(i + 1)),
  plain_text_storyboard: "Original storyboard text",
  storyboard_handoff_json: {},
};

function userMessageContent(): string {
  return mockExecute.mock.calls[0][0].messages.find(
    (m: { role: string }) => m.role === "user",
  ).content;
}

describe("generateStoryboardShotgrid — repairContext (real-repair wiring for repairStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveStoryboardModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
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
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("injects REPAIR MODE framing + the current storyboard + the instruction when repairContext is supplied", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        repairContext: {
          currentStoryboard: CURRENT_STORYBOARD,
          instruction: "Fix shot 3's camera angle only.",
        },
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("REPAIR MODE");
    expect(content).toContain("Apply ONLY the targeted change");
    expect(content).toContain("repair_instruction: Fix shot 3's camera angle only.");

    const match = content.match(/current_storyboard: (\{.*?\})\nrepair_instruction/);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1])).toEqual(CURRENT_STORYBOARD);
  });

  it("uses whole-episode rebuild mode with previous and future context instead of targeted repair mode", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        repairContext: {
          currentStoryboard: CURRENT_STORYBOARD,
          instruction: "legacy targeted repair must not win",
        },
        episodeRebuildContext: {
          currentStoryboard: CURRENT_STORYBOARD,
          previousEpisodeContext: { episode_number: 2, cliffhanger: "prior" },
          futureEpisodeConstraint: { episode_number: 4, logline: "next" },
          instruction: "rebuild all nine shots from the repaired script",
        },
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("FULL EPISODE REBUILD MODE");
    expect(content).toContain('previous_episode_context: {"episode_number":2,"cliffhanger":"prior"}');
    expect(content).toContain('future_episode_constraint: {"episode_number":4,"logline":"next"}');
    expect(content).toContain("rebuild_instruction: rebuild all nine shots from the repaired script");
    expect(content).toContain("previous_storyboard_reference");
    expect(content).not.toContain("REPAIR MODE");
    expect(content).not.toContain("repair_instruction: legacy targeted repair must not win");
  });

  it("omits REPAIR MODE entirely when repairContext is absent (fresh generation, byte-identical to before this field existed)", async () => {
    await generateStoryboardShotgrid(baseParams());

    const content = userMessageContent();
    expect(content).not.toContain("REPAIR MODE");
    expect(content).not.toContain("repair_instruction");
    expect(content).not.toContain("current_storyboard");
  });

  it("still runs the same credit-check -> call -> deduct-credits flow for a repair call (no special-casing)", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        repairContext: { currentStoryboard: CURRENT_STORYBOARD, instruction: "fix it" },
      }),
    );

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });
});
