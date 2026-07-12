/**
 * Phase 1 of `planning/polished-toasting-gadget.md` (location visual bible)
 * — coverage for `verticalDramaStoryboardGeneration.ts`'s:
 *  - `distinctLocationSchema` / `storyboardShotgridOutputSchema.distinct_locations`
 *    (validated, not `.passthrough()`-only survival — accepts a valid 1-9
 *    partition, rejects malformed entries);
 *  - `GenerateStoryboardShotgridParams.existingLocations` prompt rendering,
 *    gated purely on presence/absence (no feature flag) — MUST be
 *    byte-identical to before this change when omitted (the #1 safety
 *    guarantee for this round).
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
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStoryboardModel: vi.fn(),
}));

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
import { resolveStoryboardModel } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryboardModel);
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

/** A clean 2-group 1-9 partition mirroring the repro (store -> kitchen). */
function twoGroupDistinctLocations() {
  return [
    {
      location_key: "convenience_store_main",
      location_name: "ร้านสะดวกซื้อ (โซนของเด็ก)",
      description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน",
      shot_numbers: [1, 2, 3],
    },
    {
      location_key: "family_kitchen",
      location_name: "ครัวที่บ้าน",
      description: "ครัวขนาดกลาง โต๊ะไม้ตรงกลาง",
      shot_numbers: [4, 5, 6, 7, 8, 9],
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Schema-level validation — storyboardShotgridOutputSchema.distinct_locations */
/* -------------------------------------------------------------------------- */

describe("storyboardShotgridOutputSchema — distinct_locations (Phase 1 location visual bible)", () => {
  it("accepts a valid 1-9 partition split across 2 contiguous groups", () => {
    const result = storyboardShotgridOutputSchema.safeParse({
      ...validOutput(),
      distinct_locations: twoGroupDistinctLocations(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.distinct_locations).toHaveLength(2);
    }
  });

  it("accepts a valid single group covering all 9 shots (the default one-location case)", () => {
    const result = storyboardShotgridOutputSchema.safeParse({
      ...validOutput(),
      distinct_locations: [
        {
          location_key: "boardroom",
          location_name: "Corporate boardroom",
          description: "Glass-walled conference room, long table",
          shot_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("still validates a legacy payload with no distinct_locations key at all (schema is optional — byte-identical)", () => {
    const result = storyboardShotgridOutputSchema.safeParse(validOutput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.distinct_locations).toBeUndefined();
    }
  });

  it("rejects an entry with an out-of-range shot number (>9)", () => {
    const result = storyboardShotgridOutputSchema.safeParse({
      ...validOutput(),
      distinct_locations: [
        {
          location_key: "boardroom",
          location_name: "Corporate boardroom",
          description: "Glass-walled conference room",
          shot_numbers: [1, 2, 10],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry with an empty location_key/location_name/description", () => {
    const result = storyboardShotgridOutputSchema.safeParse({
      ...validOutput(),
      distinct_locations: [
        {
          location_key: "",
          location_name: "Corporate boardroom",
          description: "Glass-walled conference room",
          shot_numbers: [1],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty distinct_locations array (min(1) on the outer array)", () => {
    const result = storyboardShotgridOutputSchema.safeParse({
      ...validOutput(),
      distinct_locations: [],
    });
    expect(result.success).toBe(false);
  });

  it("preserves unknown per-entry fields via .passthrough()", () => {
    const result = storyboardShotgridOutputSchema.safeParse({
      ...validOutput(),
      distinct_locations: [
        {
          location_key: "boardroom",
          location_name: "Corporate boardroom",
          description: "Glass-walled conference room",
          shot_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          extra_upstream_field: "kept",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.distinct_locations![0] as any).extra_upstream_field).toBe(
        "kept",
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryboardShotgrid — end-to-end pass-through of a valid LLM        */
/* response carrying distinct_locations                                      */
/* -------------------------------------------------------------------------- */

describe("generateStoryboardShotgrid — distinct_locations pass-through", () => {
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
  });

  it("returns the validated distinct_locations groups unchanged when the LLM emits a clean 1-9 partition", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ ...validOutput(), distinct_locations: twoGroupDistinctLocations() }),
    );

    const result = await generateStoryboardShotgrid(baseParams());
    expect(result.storyboard.distinct_locations).toHaveLength(2);
    expect(result.storyboard.distinct_locations![0].location_key).toBe(
      "convenience_store_main",
    );
  });

  it("still succeeds when the LLM omits distinct_locations entirely (legacy/flag-off response)", async () => {
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateStoryboardShotgrid(baseParams());
    expect(result.storyboard.distinct_locations).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* existingLocations — prompt rendering                                      */
/* -------------------------------------------------------------------------- */

describe("generateStoryboardShotgrid — existingLocations prompt rendering (Phase 1 location visual bible)", () => {
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

  it("renders the 'Existing series locations' fact block when existingLocations is supplied", async () => {
    await generateStoryboardShotgrid(
      baseParams({
        existingLocations: [
          {
            locationKey: "convenience_store_main",
            name: "ร้านสะดวกซื้อ (โซนของเด็ก)",
            description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน",
          },
        ],
      }),
    );
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("Existing series locations");
    expect(userPrompt).toContain("convenience_store_main");
    expect(userPrompt).toContain("ร้านสะดวกซื้อ (โซนของเด็ก)");
    expect(userPrompt).toContain("แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน");
    expect(userPrompt).toContain("Location continuity and scene grouping");
  });

  it("omits the 'Existing series locations' fact block entirely when existingLocations is absent", async () => {
    await generateStoryboardShotgrid(baseParams());
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("Existing series locations");
  });

  it("omits the 'Existing series locations' fact block when existingLocations is an empty array", async () => {
    await generateStoryboardShotgrid(baseParams({ existingLocations: [] }));
    const userPrompt = mockExecute.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("Existing series locations");
  });

  it("byte-identical: produces the exact same prompt whether existingLocations is omitted or an empty array", async () => {
    await generateStoryboardShotgrid(baseParams());
    const omitted = mockExecute.mock.calls[0][0].messages[1].content as string;

    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(8);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateStoryboardShotgrid(baseParams({ existingLocations: [] }));
    const emptyArray = mockExecute.mock.calls[0][0].messages[1].content as string;

    expect(emptyArray).toBe(omitted);
  });
});
