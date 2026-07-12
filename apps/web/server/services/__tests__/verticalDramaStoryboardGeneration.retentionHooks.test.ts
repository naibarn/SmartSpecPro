/**
 * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W3,
 * added 2026-07-11) — coverage for `verticalDramaStoryboardGeneration.ts`'s:
 *  - `genre` prompt injection, flag-gated on `opts.retentionHooksEnabled` —
 *    MUST be byte-identical to before this change when the flag is
 *    off/omitted (the #1 safety guarantee for this round);
 *  - `storyboardShotSchema`'s new optional per-shot `change_type[]` field
 *    (backward-compatible, never required).
 *
 * Mirrors `verticalDramaStoryboardGeneration.sceneContracts.test.ts`'s
 * mocking pattern exactly.
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
import {
  generateStoryboardShotgrid,
  storyboardShotgridOutputSchema,
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

/* -------------------------------------------------------------------------- */
/* Flags-off byte-identical (the #1 safety guarantee)                        */
/* -------------------------------------------------------------------------- */

describe("generateStoryboardShotgrid — retention-hooks prompt injection is byte-identical when the flag is off", () => {
  it("omits genre entirely when opts.retentionHooksEnabled is absent, even though genre is supplied", async () => {
    await generateStoryboardShotgrid(baseParams({ genre: "romance" }));
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("genre:");
  });

  it("omits genre when opts.retentionHooksEnabled is explicitly false", async () => {
    await generateStoryboardShotgrid(
      baseParams({ genre: "educational", opts: { retentionHooksEnabled: false } }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("genre:");
  });

  it("produces the exact same prompt with and without genre supplied, when the flag is off (true byte-identical proof)", async () => {
    await generateStoryboardShotgrid(baseParams());
    const withoutGenre = mockExecute.mock.calls[0][0].messages[1].content as string;

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

    await generateStoryboardShotgrid(baseParams({ genre: "drama" }));
    const withGenreButFlagOff = mockExecute.mock.calls[0][0].messages[1].content as string;

    expect(withGenreButFlagOff).toBe(withoutGenre);
  });
});

/* -------------------------------------------------------------------------- */
/* Flags-on rendering                                                        */
/* -------------------------------------------------------------------------- */

describe("generateStoryboardShotgrid — retention-hooks prompt injection (flag on)", () => {
  it("renders the genre fact when opts.retentionHooksEnabled is true and genre is supplied", async () => {
    await generateStoryboardShotgrid(
      baseParams({ genre: "romance", opts: { retentionHooksEnabled: true } }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("genre: romance");
  });

  it("omits genre when the flag is on but genre is absent/null", async () => {
    await generateStoryboardShotgrid(baseParams({ opts: { retentionHooksEnabled: true } }));
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("genre:");
  });

  it("does not disturb the twinPairs (F3)/sceneContracts (F132C) additive sections when combined with retentionHooksEnabled", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        genre: "drama",
        twinPairs: [{ characterKeyA: "char_a", characterKeyB: "char_b" }],
        opts: { retentionHooksEnabled: true, sceneContractsEnabled: true },
      }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("genre: drama");
    expect(userPrompt).toContain("char_a and char_b are twins");
    expect(userPrompt).toContain('"contract"');
  });
});

/* -------------------------------------------------------------------------- */
/* storyboardShotSchema — change_type[] superset (backward-compatible)       */
/* -------------------------------------------------------------------------- */

describe("storyboardShotgridOutputSchema — per-shot change_type[] superset (backward-compatible, never required)", () => {
  it("still parses a legacy shot with no change_type key at all", () => {
    const output = validOutput();
    const result = storyboardShotgridOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it("parses a shot with a well-formed change_type[] array", () => {
    const output = validOutput();
    (output.shots[0] as any).change_type = ["visual", "emotional", "informational"];
    (output.shots[1] as any).change_type = ["none"];
    const result = storyboardShotgridOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shots[0].change_type).toEqual([
        "visual",
        "emotional",
        "informational",
      ]);
      expect(result.data.shots[1].change_type).toEqual(["none"]);
    }
  });

  it("rejects an invalid change_type enum value", () => {
    const output = validOutput();
    (output.shots[0] as any).change_type = ["visual", "narrative"];
    const result = storyboardShotgridOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  it("accepts an empty change_type[] array (Zod does not hard-enforce cadence — enforced by review LLM instead)", () => {
    const output = validOutput();
    (output.shots[0] as any).change_type = [];
    const result = storyboardShotgridOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });
});
