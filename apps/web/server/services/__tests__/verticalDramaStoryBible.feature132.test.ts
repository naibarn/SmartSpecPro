/**
 * Feature 132 (Vertical Drama Story & Character Quality Engine) — coverage
 * for the coordinated Section 02/03/04 hot-file pass on
 * `verticalDramaStoryBible.ts`:
 *  - F132A (user premise): `buildPrompts`/`buildDeepDraftPrompts` prepend a
 *    "USER PREMISE (PRIMARY)" block when present, byte-identical when
 *    absent. `generateStoryBibleDeep`'s result-warnings path still uses the
 *    deterministic `evaluatePremiseCoverage` heuristic (unchanged).
 *    `generateStoryBible`'s own result-warnings path was migrated
 *    (`vertical-drama-skill-first-architecture` plan, Phase 4 item 2) to the
 *    generation call's OWN `premise_coverage` self-assessment instead of
 *    that heuristic — see the tests below.
 *  - F132B (ledgers): `appendBreakdownVersion`/`readBreakdownVersionLedgers`
 *    round-trip a version's ledgers and mirror them onto `bible.ledgers`;
 *    `worldRuleSchema`'s upgraded-in-place shape stays back-compatible with
 *    a legacy `{rule, limit_or_cost}`-only row.
 *  - F132C (scene contracts): `shotDraftSchema.contract`, the flag-gated
 *    prompt block, and `meetsPremiumDraftContractFloor`'s deterministic
 *    gate.
 *
 * Mocking convention mirrors `verticalDramaStoryBible.speechBudget.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadEnabledLlmModelRows } = vi.hoisted(() => ({
  mockLoadEnabledLlmModelRows: vi.fn(async () => [] as unknown[]),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mockLoadEnabledLlmModelRows,
}));

vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockCalculateCreditsForLLM: vi.fn(() => 3),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  calculateCreditsForLLM: mockCalculateCreditsForLLM,
}));

const { mockExecuteWithFallback } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
}));
vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 2) — its
// own override/fallback contract is covered by
// `verticalDramaLlmModelPolicy.test.ts`; here it's mocked as a pure
// passthrough to `autoFallback` (`resolveStoryBibleModel`, which is REAL in
// this file and resolves via the mocked `loadEnabledLlmModelRows`/
// `selectBestLlmModel` above) so this file's pre-existing "no override
// configured" behavior/assertions are unaffected and no real DB access
// happens.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import {
  generateStoryBible,
  generateStoryBibleDeep,
  appendBreakdownVersion,
  readBreakdownVersionLedgers,
  readItemWorldRules,
  meetsPremiumDraftContractFloor,
  type StoredEpisodeBreakdownItem,
  type VdDeepDraftShotDraft,
} from "../verticalDramaStoryBible";
import { renderCriteriaVersionMarker } from "../verticalDramaQualityCriteria";
import { renderAudienceAgeRatingBlock } from "@shared/verticalDramaSeries/audienceAgeRating";
import { NARRATIVE_ROLE_VALUES, ROLE_TIER_VALUES } from "@shared/verticalDramaSeries/narrativeRole";

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 10,
    title: "Test Series",
    locale: "th" as const,
    genre: "romance",
    tone: "dramatic",
    targetEpisodeCount: 1,
    bible: {},
    ...overrides,
  };
}

function validExpandedResponse() {
  return {
    expandedSeasonArc: "A grand season arc",
    refinedCharacters: [{ name: "Aria", role: "lead", description: "The protagonist" }],
    episodeBreakdown: [
      { episodeNumber: 1, workingTitle: "Ep1", logline: "Logline 1", keyBeats: ["Beat 1"] },
    ],
  };
}

function mockLlmResponse(payload: unknown) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(payload) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadEnabledLlmModelRows.mockResolvedValue([]);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

/* -------------------------------------------------------------------------- */
/* F132A — user premise threading (generateStoryBible)                       */
/* -------------------------------------------------------------------------- */

describe("generateStoryBible — user premise (F132A)", () => {
  it("byte-identical (no USER PREMISE block) when userPremise is absent", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams());
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("USER PREMISE");
  });

  it("byte-identical (no USER PREMISE block) when userPremise is an empty/whitespace string", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ userPremise: "   " }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("USER PREMISE");
  });

  it("prepends a USER PREMISE (PRIMARY) block ahead of Series title: when present", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ userPremise: "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล" }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("USER PREMISE (PRIMARY)");
    expect(userPrompt).toContain("ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล");
    expect(userPrompt.indexOf("USER PREMISE")).toBeLessThan(userPrompt.indexOf("Series title:"));
  });

  it("embeds the criteria version marker in the system prompt", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams());
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain(renderCriteriaVersionMarker());
  });

  it("requests a premise_coverage self-assessment in the system prompt only when userPremise is present", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ userPremise: "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล" }));
    const systemPromptWithPremise = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPromptWithPremise).toContain("premise_coverage");

    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams());
    const systemPromptWithoutPremise = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPromptWithoutPremise).not.toContain("premise_coverage");
  });

  it("wires the generation call's OWN premise_coverage self-assessment into the result's warnings (vertical-drama-skill-first-architecture Phase 4 item 2 — replaces the deterministic evaluatePremiseCoverage heuristic for this call site)", async () => {
    mockLlmResponse({
      expandedSeasonArc: "A season about competitive baking contests",
      refinedCharacters: [{ name: "Aria", role: "lead", description: "A baker" }],
      episodeBreakdown: [
        { episodeNumber: 1, workingTitle: "Bake Off", logline: "Cakes everywhere", keyBeats: ["Beat 1"] },
      ],
      premise_coverage: {
        sufficient: false,
        note: "เนื้อเรื่องกลายเป็นการแข่งขันทำขนม ไม่เกี่ยวกับคดีฆาตกรรมที่โจทย์ระบุไว้เลย",
      },
    });
    const result = await generateStoryBible(
      baseParams({ userPremise: "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาลลับ องค์กรอาชญากรรม" }),
    );
    expect(result.warnings?.[0]?.code).toBe("premise_coverage_low");
    expect(result.warnings?.[0]?.message).toBe(
      "เนื้อเรื่องกลายเป็นการแข่งขันทำขนม ไม่เกี่ยวกับคดีฆาตกรรมที่โจทย์ระบุไว้เลย",
    );
  });

  it("omits warnings when the generation call self-reports sufficient premise coverage", async () => {
    mockLlmResponse({
      ...validExpandedResponse(),
      premise_coverage: { sufficient: true, note: "ครอบคลุมโจทย์ครบถ้วน" },
    });
    const result = await generateStoryBible(
      baseParams({ userPremise: "ตำรวจสาวสืบคดีฆาตกรรมในโรงพยาบาล" }),
    );
    expect(result.warnings).toBeUndefined();
  });

  it("omits warnings entirely when userPremise is absent", async () => {
    mockLlmResponse(validExpandedResponse());
    const result = await generateStoryBible(baseParams());
    expect(result.warnings).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Genre pollution guard (Stage 1.5,                                         */
/* `planning/vd-series-memory-and-lineage/plan.md`) — `buildPrompts`'s       */
/* `Genre:` line now routes through `buildGenrePromptLine`. A CLEAN genre    */
/* (the only case a new series can be created with, per                     */
/* `createSeriesInput`'s guard) must render byte-identically to before this  */
/* change; only a genre that is a duplicate/logline copy of `title` may     */
/* differ (by omitting the line entirely). Extracting the exact `Genre:`    */
/* line and asserting `.toBe()` on it (never `.not.toContain`) is the       */
/* proof this feature's brief calls for.                                    */
/* -------------------------------------------------------------------------- */

describe("generateStoryBible — genre pollution guard (Stage 1.5)", () => {
  function genreLineOf(userPrompt: string): string | undefined {
    return userPrompt.split("\n").find(line => line.startsWith("Genre:"));
  }

  it("renders the EXACT same `Genre: ...` line as the pre-fix inline expression for a clean genre (byte-identity)", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ genre: "romance", title: "Test Series" }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;

    // The exact pre-fix inline expression this test guards against
    // regressing (`params.genre ? \`Genre: ${params.genre}\` : null`) —
    // a genuine two-build `.toBe()` comparison, not a substring check.
    const preFixGenreLine = "romance" ? `Genre: romance` : null;
    expect(genreLineOf(userPrompt)).toBe(preFixGenreLine);
  });

  it("produces a byte-identical full prompt across two calls with the same clean genre (determinism)", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ genre: "โรแมนติกดราม่าย้อนเวลา", title: "รักข้ามเวลา" }));
    const firstUserPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;

    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ genre: "โรแมนติกดราม่าย้อนเวลา", title: "รักข้ามเวลา" }));
    const secondUserPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;

    expect(secondUserPrompt).toBe(firstUserPrompt);
  });

  it("omits the `Genre:` line entirely — never emits it — when genre is a byte-for-byte copy of title (real series-5 shape)", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(
      baseParams({ title: "สวมรอยดาราสองชีวิต…", genre: "สวมรอยดาราสองชีวิต…" }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(genreLineOf(userPrompt)).toBe(undefined);
  });

  it("omits the `Genre:` line when genre is a colon-shaped alt-title (real series-17 shape)", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(
      baseParams({
        title: "รักข้ามเวลา",
        genre: "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา",
      }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(genreLineOf(userPrompt)).toBe(undefined);
  });

  it("still renders `Series title:` and the rest of the prompt normally when the Genre line is suppressed", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(
      baseParams({ title: "สวมรอยดาราสองชีวิต…", genre: "สวมรอยดาราสองชีวิต…" }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("Series title: สวมรอยดาราสองชีวิต…");
  });
});

/* -------------------------------------------------------------------------- */
/* Lenient narrativeRole/roleTier (2026-07-14 recurring failure fix — same   */
/* root cause as preset synthesis: `buildPrompts` never listed the allowed   */
/* enum values, so gpt-5.4-nano title-cased/invented labels like             */
/* "Protagonist"/"Tier-1"/"Love Interest" and schema validation failed the   */
/* whole response).                                                          */
/* -------------------------------------------------------------------------- */

describe("generateStoryBible — lenient narrativeRole/roleTier", () => {
  it("prompt rules list every NARRATIVE_ROLE_VALUES and ROLE_TIER_VALUES value so the model never has to guess", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams());
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;

    for (const value of NARRATIVE_ROLE_VALUES) {
      expect(systemPrompt).toContain(value);
    }
    expect(systemPrompt).toContain("roleTier");
    for (const value of ROLE_TIER_VALUES) {
      expect(systemPrompt).toContain(value);
    }
  });

  it("succeeds and normalizes a title-cased/invented enum response instead of failing schema validation (matches the observed production failure: 'Protagonist'/'Tier-1'/'Love Interest')", async () => {
    mockLlmResponse({
      expandedSeasonArc: "A grand season arc",
      refinedCharacters: [
        {
          name: "Aria",
          role: "นางเอก",
          description: "The protagonist",
          narrativeRole: "Protagonist",
          roleTier: "Tier-1",
        },
        {
          name: "Nate",
          role: "พระรอง",
          description: "Her ally",
          narrativeRole: "Love Interest",
          roleTier: "second_lead_male",
        },
      ],
      episodeBreakdown: [
        { episodeNumber: 1, workingTitle: "Ep1", logline: "Logline 1", keyBeats: ["Beat 1"] },
      ],
    });

    const result = await generateStoryBible(baseParams());

    const aria = result.expanded.refinedCharacters.find(c => c.name === "Aria")!;
    // "Protagonist" -> lowercase-preprocess recovery -> "protagonist" (kept, not overridden).
    expect(aria.narrativeRole).toBe("protagonist");
    // "Tier-1" is not a valid roleTier even lowercased -> undefined -> backfilled
    // from the free-text role "นางเอก" via normalizeExpandedCharacterRoles/normalizeLegacyRole.
    expect(aria.roleTier).toBe("lead_female");

    const nate = result.expanded.refinedCharacters.find(c => c.name === "Nate")!;
    // "Love Interest" is not a valid narrativeRole even lowercased -> undefined
    // -> backfilled from the free-text role "พระรอง".
    expect(nate.narrativeRole).toBe("secondary_lead");
    // Already a valid lowercase value -> kept as-is.
    expect(nate.roleTier).toBe("second_lead_male");

    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* F132A — user premise threading (generateStoryBibleDeep)                   */
/* -------------------------------------------------------------------------- */

function deepDraftItem(episodeNumber: number): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: ["Beat A"],
  } as StoredEpisodeBreakdownItem;
}

function nineShots(): Record<string, unknown>[] {
  return Array.from({ length: 9 }, (_, i) => ({
    shot_number: i + 1,
    summary: `Shot ${i + 1}`,
    characters: [{ name: "A", emotion: "calm" }],
    location_key: "loc-default",
    dialogue_lines: [{ speaker: "A", line: "สวัสดีเพื่อนที่รักของฉัน" }],
  }));
}

function deepDraftResponse(episodeNumber: number) {
  return {
    episodeBreakdown: [
      {
        episodeNumber,
        workingTitle: `Episode ${episodeNumber}`,
        logline: `Logline ${episodeNumber}`,
        keyBeats: ["Beat A"],
        shotDrafts: nineShots(),
      },
    ],
    open_threads: [],
  };
}

describe("generateStoryBibleDeep — user premise (F132A)", () => {
  it("byte-identical (no USER PREMISE block) when userPremise is absent", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(baseParams({ episodes: [deepDraftItem(1)] }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("USER PREMISE");
  });

  it("prepends a USER PREMISE (PRIMARY) block ahead of Series title: when present", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(
      baseParams({ episodes: [deepDraftItem(1)], userPremise: "ตำรวจสาวสืบคดีฆาตกรรม" }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("USER PREMISE (PRIMARY)");
    expect(userPrompt.indexOf("USER PREMISE")).toBeLessThan(userPrompt.indexOf("Series title:"));
  });

  it("embeds the criteria version marker in the system prompt", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(baseParams({ episodes: [deepDraftItem(1)] }));
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain(renderCriteriaVersionMarker());
  });
});

/* -------------------------------------------------------------------------- */
/* Series-level audience age rating (Phase 1 of a 2-phase feature)           */
/* -------------------------------------------------------------------------- */

describe("generateStoryBible — audience age rating (Phase 1)", () => {
  it("always includes the AUDIENCE AGE RATING block, defaulting to 18plus when audienceAgeRating is omitted", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams());
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain(renderAudienceAgeRatingBlock("18plus"));
  });

  it("includes the tier-specific block for a given audienceAgeRating", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ audienceAgeRating: "under13" }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain(renderAudienceAgeRatingBlock("under13"));
    expect(userPrompt).not.toContain(renderAudienceAgeRatingBlock("18plus"));
  });

  it("adds a firm HARD CONSTRAINT instruction to the system prompt", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams());
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain("AUDIENCE AGE RATING (HARD CONSTRAINT)");
  });
});

describe("generateStoryBibleDeep — audience age rating (Phase 1)", () => {
  it("always includes the AUDIENCE AGE RATING block, defaulting to 18plus when audienceAgeRating is omitted", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(baseParams({ episodes: [deepDraftItem(1)] }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain(renderAudienceAgeRatingBlock("18plus"));
  });

  it("includes the tier-specific block for a given audienceAgeRating", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(
      baseParams({ episodes: [deepDraftItem(1)], audienceAgeRating: "13plus" }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain(renderAudienceAgeRatingBlock("13plus"));
    expect(userPrompt).not.toContain(renderAudienceAgeRatingBlock("18plus"));
  });

  it("adds a firm HARD CONSTRAINT instruction to the system prompt", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(baseParams({ episodes: [deepDraftItem(1)] }));
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain("AUDIENCE AGE RATING (HARD CONSTRAINT)");
  });
});

/* -------------------------------------------------------------------------- */
/* F132C — scene contracts prompt threading                                  */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — scene contracts prompt (F132C)", () => {
  it("byte-identical (no contract instruction/JSON-shape) when sceneContractsEnabled is absent/false", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(baseParams({ episodes: [deepDraftItem(1)] }));
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).not.toContain('"contract"');
    expect(systemPrompt).not.toContain("anchorLine");
  });

  it("adds the contract instruction + JSON-shape suffix when sceneContractsEnabled is true", async () => {
    mockLlmResponse(deepDraftResponse(1));
    await generateStoryBibleDeep(
      baseParams({ episodes: [deepDraftItem(1)], sceneContractsEnabled: true }),
    );
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain('"contract"');
    expect(systemPrompt).toContain("storyFunction");
    expect(systemPrompt).toContain(
      "no run of 3 or more consecutive shots without anchorLine: true",
    );
  });

  it("shotDraftSchema accepts a shot with a well-shaped contract object", async () => {
    const withContract = {
      episodeBreakdown: [
        {
          episodeNumber: 1,
          workingTitle: "Episode 1",
          logline: "Logline 1",
          keyBeats: ["Beat A"],
          shotDrafts: nineShots().map((shot, i) => ({
            ...shot,
            contract:
              i === 0
                ? {
                    storyFunction: "reveal",
                    emotionalBeat: "dread",
                    audienceTakeaway: "the note is fake",
                    tensionSource: "time pressure",
                    newClueIds: ["clue-1"],
                    dialoguePurpose: "confront",
                    anchorLine: true,
                  }
                : undefined,
          })),
        },
      ],
      open_threads: [],
    };
    mockLlmResponse(withContract);
    const result = await generateStoryBibleDeep(
      baseParams({ episodes: [deepDraftItem(1)], sceneContractsEnabled: true }),
    );
    expect(result.draftedItems[0].shotDrafts[0].contract?.storyFunction).toBe("reveal");
  });

  it("shotDraftSchema still parses a legacy shot with no contract key at all", async () => {
    mockLlmResponse(deepDraftResponse(1));
    const result = await generateStoryBibleDeep(baseParams({ episodes: [deepDraftItem(1)] }));
    expect(result.draftedItems[0].shotDrafts[0].contract).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* F132C — meetsPremiumDraftContractFloor (deterministic gate)                */
/* -------------------------------------------------------------------------- */

function contractShot(
  shotNumber: number,
  overrides: Partial<NonNullable<VdDeepDraftShotDraft["contract"]>> = {},
): VdDeepDraftShotDraft {
  return {
    shot_number: shotNumber,
    summary: `Shot ${shotNumber}`,
    dialogue_lines: [],
    contract: {
      storyFunction: "advance plot",
      emotionalBeat: "tension",
      audienceTakeaway: "something changed",
      tensionSource: "time pressure",
      newClueIds: [],
      dialoguePurpose: "reveal",
      ...overrides,
    },
  } as unknown as VdDeepDraftShotDraft;
}

describe("meetsPremiumDraftContractFloor (F132C deterministic gate)", () => {
  it("fails when any shot is missing a contract", () => {
    const shots = [
      contractShot(1, { characterDecision: "left" }),
      { shot_number: 2, summary: "no contract", dialogue_lines: [] } as unknown as VdDeepDraftShotDraft,
    ];
    expect(meetsPremiumDraftContractFloor(shots)).toBe(false);
  });

  it("fails when a shot has more than 2 newClueIds", () => {
    const shots = [
      contractShot(1, { characterDecision: "left", newClueIds: ["a", "b", "c"] }),
    ];
    expect(meetsPremiumDraftContractFloor(shots)).toBe(false);
  });

  it("fails on a run of 3+ consecutive shots without anchorLine: true", () => {
    const shots = Array.from({ length: 9 }, (_, i) =>
      contractShot(i + 1, { characterDecision: "left", anchorLine: i === 0 }),
    );
    // shots 2-9 (8 in a row) never set anchorLine — must fail.
    expect(meetsPremiumDraftContractFloor(shots)).toBe(false);
  });

  it("passes with anchor lines at 1, 4, 7 (gaps of exactly 3, never 4)", () => {
    const shots = Array.from({ length: 9 }, (_, i) =>
      contractShot(i + 1, {
        characterDecision: i === 3 ? "made a choice" : undefined,
        anchorLine: [0, 3, 6].includes(i),
      }),
    );
    expect(meetsPremiumDraftContractFloor(shots)).toBe(true);
  });

  it("fails the want/obstacle/choice/cost coverage check when no shot has a characterDecision", () => {
    const shots = Array.from({ length: 9 }, (_, i) =>
      contractShot(i + 1, { anchorLine: [0, 3, 6].includes(i) }),
    );
    expect(meetsPremiumDraftContractFloor(shots)).toBe(false);
  });

  it("fails on an empty shot list", () => {
    expect(meetsPremiumDraftContractFloor([])).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* F132B — ledgers mirror (appendBreakdownVersion/readBreakdownVersionLedgers)*/
/* -------------------------------------------------------------------------- */

describe("appendBreakdownVersion / readBreakdownVersionLedgers (F132B)", () => {
  it("returns emptyQualityLedgers() when no version carries ledgers (flag off/legacy)", () => {
    const bible = appendBreakdownVersion(null, {
      source: "generate_story",
      items: [deepDraftItem(1)],
      createdByUserId: 1,
    });
    const ledgers = readBreakdownVersionLedgers(bible);
    expect(ledgers.evidenceLedger).toEqual([]);
    expect((bible as Record<string, unknown>).ledgers).toBeUndefined();
  });

  it("mirrors the new active version's ledgers onto bible.ledgers, and readBreakdownVersionLedgers reads them back", () => {
    const ledgers = {
      evidenceLedger: [{ id: "e1", label: "note", introducedEpisode: 1, usedEpisodes: [], changesDecisionEpisodes: [], status: "open" as const }],
      characterActivationLedger: [],
      threatLadder: [],
      consequenceLedger: [],
      threadLedger: [],
      worldRuleLedger: [],
      causalChainMap: [],
    };
    const bible = appendBreakdownVersion(null, {
      source: "generate_story",
      items: [deepDraftItem(1)],
      createdByUserId: 1,
      ledgers,
    });
    expect((bible as Record<string, unknown>).ledgers).toEqual(ledgers);
    expect(readBreakdownVersionLedgers(bible).evidenceLedger).toHaveLength(1);
  });

  it("a SECOND appended version without ledgers still leaves the mirror pointing at the (now active) version's own ledgers state", () => {
    const ledgers = {
      evidenceLedger: [{ id: "e1", label: "note", introducedEpisode: 1, usedEpisodes: [], changesDecisionEpisodes: [], status: "open" as const }],
      characterActivationLedger: [],
      threatLadder: [],
      consequenceLedger: [],
      threadLedger: [],
      worldRuleLedger: [],
      causalChainMap: [],
    };
    const firstBible = appendBreakdownVersion(null, {
      source: "generate_story",
      items: [deepDraftItem(1)],
      createdByUserId: 1,
      ledgers,
    });
    const secondBible = appendBreakdownVersion(firstBible, {
      source: "arc_replan",
      items: [deepDraftItem(1), deepDraftItem(2)],
      createdByUserId: 1,
    });
    // Second version carries no ledgers of its own -> mirror key is omitted
    // entirely on this new bible object (never a stale copy of version 1's).
    expect((secondBible as Record<string, unknown>).ledgers).toBeUndefined();
    expect(readBreakdownVersionLedgers(secondBible).evidenceLedger).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* F132B — worldRuleSchema upgrade-in-place back-compat                      */
/* -------------------------------------------------------------------------- */

describe("readItemWorldRules — worldRuleSchema §5.2 upgrade-in-place back-compat (F132B)", () => {
  it("still parses a legacy {rule, limit_or_cost}-only row", () => {
    const item = {
      episodeNumber: 1,
      workingTitle: "Ep1",
      logline: "l",
      keyBeats: ["b"],
      world_rules: [{ rule: "curses transfer at midnight", limit_or_cost: "one year of life" }],
    } as unknown as StoredEpisodeBreakdownItem;
    const rules = readItemWorldRules(item);
    expect(rules).toHaveLength(1);
    expect(rules[0].rule).toBe("curses transfer at midnight");
    expect(rules[0].limit_or_cost).toBe("one year of life");
  });

  it("parses the richer §5.2 shape with defaults applied", () => {
    const item = {
      episodeNumber: 1,
      workingTitle: "Ep1",
      logline: "l",
      keyBeats: ["b"],
      world_rules: [
        {
          id: "w1",
          rule: "curses transfer at midnight",
          introducedEpisode: 2,
          usedAgainEpisodes: [4],
          createsChoice: true,
          verdict: "revise",
        },
      ],
    } as unknown as StoredEpisodeBreakdownItem;
    const rules = readItemWorldRules(item);
    expect(rules[0].id).toBe("w1");
    expect(rules[0].verdict).toBe("revise");
    expect(rules[0].usedAgainEpisodes).toEqual([4]);
  });

  it("rejects a row missing the always-required rule field", () => {
    const item = {
      episodeNumber: 1,
      workingTitle: "Ep1",
      logline: "l",
      keyBeats: ["b"],
      world_rules: [{ limit_or_cost: "one year of life" }],
    } as unknown as StoredEpisodeBreakdownItem;
    expect(readItemWorldRules(item)).toEqual([]);
  });
});
