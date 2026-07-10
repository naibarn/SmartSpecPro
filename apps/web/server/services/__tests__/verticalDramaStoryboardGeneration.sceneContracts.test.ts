/**
 * Feature 132 §6.1 (F132C, scene contracts, `verticalDramaSceneContracts`,
 * added 2026-07-09) — coverage for `verticalDramaStoryboardGeneration.ts`'s:
 *  - `storyboardShotSchema.contract` (identical shape to
 *    `verticalDramaStoryBible.ts`'s `shotContractSchema`, asserted at
 *    compile-time via `AssertShapesMatch`);
 *  - the flag-gated "copy-verbatim-when-hydrated / emit-fresh-otherwise"
 *    prompt instruction, gated on `opts.sceneContractsEnabled`.
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

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { generateStoryboardShotgrid } from "../verticalDramaStoryboardGeneration";
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
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";

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
  overrides: Partial<Parameters<typeof generateStoryboardShotgrid>[0]> = {},
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

/** A vetted W10-A per-shot draft with a contract on shot 1 (F132C shape). */
function sampleEpisodeDraftWithContract() {
  return {
    shots: [
      {
        shot_number: 1,
        summary: "Aria discovers the clinic-collateral clause mid-signing",
        dialogue_lines: [],
        contract: {
          storyFunction: "reveal",
          emotionalBeat: "dread",
          audienceTakeaway: "the clause is a trap",
          tensionSource: "time pressure",
          newClueIds: ["clue-1"],
          dialoguePurpose: "confront",
          anchorLine: true,
        },
      },
    ],
  };
}

describe("generateStoryboardShotgrid — scene contracts (F132C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-storyboard-shotgrid",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-storyboard-shotgrid/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "---\nname: test\n---\nSystem prompt body" as any,
    );
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("byte-identical: no contract instruction when sceneContractsEnabled is absent", async () => {
    await generateStoryboardShotgrid(baseParams());
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain('"contract"');
    expect(userPrompt).not.toContain("anchorLine");
  });

  it("byte-identical: no contract instruction when sceneContractsEnabled is explicitly false", async () => {
    await generateStoryboardShotgrid(
      baseParams({ opts: { sceneContractsEnabled: false } }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain('"contract"');
  });

  it("adds the fresh-generation contract instruction when sceneContractsEnabled is true and no episodeDraft/hydration is present", async () => {
    await generateStoryboardShotgrid(
      baseParams({ opts: { sceneContractsEnabled: true } }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain('"contract"');
    expect(userPrompt).toContain("storyFunction");
    expect(userPrompt).toContain(
      "no run of 3 or more consecutive shots without anchorLine: true",
    );
    expect(userPrompt).not.toContain("copy it onto that SAME output shot VERBATIM");
  });

  it("adds the copy-verbatim-when-hydrated instruction when both sceneContractsEnabled and episodeDraftHydrationEnabled are true with an episodeDraft supplied", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        opts: { sceneContractsEnabled: true, episodeDraftHydrationEnabled: true },
        episodeDraft: sampleEpisodeDraftWithContract(),
      }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("copy it onto that SAME output shot VERBATIM");
    expect(userPrompt).toContain('"newClueIds":["clue-1"]');
  });

  it("falls back to the fresh-generation instruction when sceneContractsEnabled is true but episodeDraftHydrationEnabled is false (hydration section never rendered)", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        opts: { sceneContractsEnabled: true, episodeDraftHydrationEnabled: false },
        episodeDraft: sampleEpisodeDraftWithContract(),
      }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("episode_draft");
    expect(userPrompt).not.toContain("copy it onto that SAME output shot VERBATIM");
    expect(userPrompt).toContain('"contract"');
  });

  it("validates a storyboardShotgridOutputSchema response where a shot carries a well-shaped contract object", async () => {
    const output = validOutput();
    (output.shots[0] as any).contract = {
      storyFunction: "reveal",
      emotionalBeat: "dread",
      audienceTakeaway: "the clause is a trap",
      tensionSource: "time pressure",
      newClueIds: ["clue-1"],
      dialoguePurpose: "confront",
      anchorLine: true,
    };
    mockExecute.mockResolvedValue(successResponse(output));

    const result = await generateStoryboardShotgrid(
      baseParams({ opts: { sceneContractsEnabled: true } }),
    );
    expect((result.storyboard.shots[0] as any).contract?.storyFunction).toBe("reveal");
  });

  it("still validates a legacy shot with no contract key at all (schema is optional)", async () => {
    const result = await generateStoryboardShotgrid(baseParams());
    expect((result.storyboard.shots[0] as any).contract).toBeUndefined();
  });

  it("produces a fully byte-identical prompt with the flag absent vs. explicitly false (control case)", async () => {
    await generateStoryboardShotgrid(baseParams());
    const withoutAnything = mockExecute.mock.calls[0][0].messages[1].content as string;

    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStoryboardShotgrid(
      baseParams({ opts: { sceneContractsEnabled: false } }),
    );
    const withFlagFalse = mockExecute.mock.calls[0][0].messages[1].content as string;

    expect(withFlagFalse).toBe(withoutAnything);
  });
});
