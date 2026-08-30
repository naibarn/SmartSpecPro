/**
 * Production-grade full-story generation
 * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
 * — coverage for the NEW deep-draft shot-completeness contract:
 *  - fresh-generation schema requires `characters`/`location_key` per shot
 *    (rejects a payload missing either, after `executeJsonPlanningCallWithRetry`'s
 *    own single schema retry is also exhausted);
 *  - the deterministic completeness gate
 *    (`computeShotCompletenessViolations`/`computeNewLocationDeclarationViolations`)
 *    detects every violation class described in the plan;
 *  - the read path (`readItemShotDrafts`) stays backward-compatible with a
 *    stored bible that predates these fields.
 *
 * Mocking convention mirrors `verticalDramaStoryBible.deepStoryDrafts.test.ts`
 * exactly (mock `enabledLlmModels`/`intelligentModelSelector`/`creditService`/
 * `llmRouter`/`_core/logger`, import the real service).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadEnabledLlmModelRows } = vi.hoisted(() => ({
  mockLoadEnabledLlmModelRows: vi.fn(async () => [] as unknown[]),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mockLoadEnabledLlmModelRows,
}));

const { mockResolveVerticalDramaSeriesModel, mockResolveVerticalDramaRecommendedDraftModel } = vi.hoisted(() => ({
  mockResolveVerticalDramaSeriesModel: vi.fn(
    async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
  ),
  mockResolveVerticalDramaRecommendedDraftModel: vi.fn(async () => "active-llm-model"),
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: mockResolveVerticalDramaSeriesModel,
  resolveVerticalDramaRecommendedDraftModel: mockResolveVerticalDramaRecommendedDraftModel,
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

import {
  generateStoryBibleDeep,
  computeShotCompletenessViolations,
  computeNewLocationDeclarationViolations,
  buildDeepDraftCompletenessRetryInstruction,
  readItemShotDrafts,
  readBibleRefinedCharacterProfiles,
  VdSchemaValidationError,
  VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  type VdDeepDraftShotDraft,
  type StoredEpisodeBreakdownItem,
} from "../verticalDramaStoryBible";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function existingItem(
  episodeNumber: number,
  overrides: Record<string, unknown> = {},
): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline for episode ${episodeNumber}`,
    keyBeats: ["Beat A", "Beat B"],
    ...overrides,
  } as StoredEpisodeBreakdownItem;
}

function shotDraft(shotNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    shot_number: shotNumber,
    summary: `Shot ${shotNumber} summary`,
    characters: [{ name: "Aria", emotion: "มั่นใจแต่กังวลอยู่ลึกๆ" }],
    location_key: "loc-apartment",
    dialogue_lines: [{ speaker: "Aria", line: `บทพูดช็อต ${shotNumber} ที่ยาวพอสมควรสำหรับการทดสอบ` }],
    ...overrides,
  };
}

function nineShotDrafts(
  overrideFor: (shotNumber: number) => Record<string, unknown> = () => ({}),
) {
  return Array.from({ length: VD_DEEP_DRAFT_SHOTS_PER_EPISODE }, (_, i) =>
    shotDraft(i + 1, overrideFor(i + 1)),
  );
}

function chunkResponsePayload(
  episodeNumbers: number[],
  opts: { shotDraftsFor?: (ep: number) => unknown[]; newLocations?: unknown[] } = {},
) {
  return {
    episodeBreakdown: episodeNumbers.map((ep) => ({
      episodeNumber: ep,
      workingTitle: `Episode ${ep}`,
      logline: `Logline ${ep}`,
      keyBeats: ["Beat A"],
      shotDrafts: opts.shotDraftsFor ? opts.shotDraftsFor(ep) : nineShotDrafts(),
      cliffhanger_line: `Cliffhanger for episode ${ep}`,
    })),
    open_threads: [],
    ...(opts.newLocations ? { new_locations: opts.newLocations } : {}),
  };
}

function mockLlmResponseOnce(payload: unknown, usage = { prompt_tokens: 100, completion_tokens: 200 }) {
  mockExecuteWithFallback.mockResolvedValueOnce({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(payload) } }],
      usage,
    },
  });
}

function baseDeepParams(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 10,
    title: "Test Series",
    locale: "th" as const,
    genre: "romance",
    tone: "dramatic",
    episodes: [existingItem(1)],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadEnabledLlmModelRows.mockResolvedValue([
    { modelId: "active-llm-model", providerId: 1, priority: 1 } as any,
  ]);
  mockResolveVerticalDramaSeriesModel.mockImplementation(
    async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
  );
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

/* -------------------------------------------------------------------------- */
/* (a) Fresh-generation schema — characters/location_key required            */
/* -------------------------------------------------------------------------- */

describe("deep-draft chunk schema — characters/location_key (production-grade full-story generation)", () => {
  it("accepts a complete chunk payload with characters[] (name+emotion) and location_key on every shot", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(result.partial).toBe(false);
    expect(result.draftedItems).toHaveLength(1);
    const shot1 = result.draftedItems[0].shotDrafts[0];
    expect(shot1.characters).toEqual([{ name: "Aria", emotion: "มั่นใจแต่กังวลอยู่ลึกๆ" }]);
    expect(shot1.location_key).toBe("loc-apartment");
  });

  it("accepts an optional emotion_after and an optional new_locations declaration", async () => {
    mockLlmResponseOnce(
      chunkResponsePayload([1], {
        shotDraftsFor: () =>
          nineShotDrafts((shotNumber) =>
            shotNumber === 1
              ? {
                  characters: [
                    { name: "Aria", emotion: "กลัว", emotion_after: "โล่งใจ" },
                  ],
                  location_key: "loc-new-alley",
                }
              : {},
          ),
        newLocations: [
          {
            location_key: "loc-new-alley",
            name: "ตรอกหลังตลาด",
            description: "ตรอกแคบระหว่างตึกสองหลัง เต็มไปด้วยกล่องขยะ",
            environment: "แสงไฟถนนสีเหลืองสลัว กลิ่นอับชื้น",
            time_of_day: "night",
            mood: "eerie",
          },
        ],
      }),
    );

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(result.partial).toBe(false);
    expect(result.newLocations).toEqual([
      expect.objectContaining({ location_key: "loc-new-alley", name: "ตรอกหลังตลาด" }),
    ]);
  });

  it("rejects (throws VdSchemaValidationError) when a shot is missing characters entirely, even after the internal schema retry", async () => {
    const invalidPayload = chunkResponsePayload([1], {
      shotDraftsFor: () =>
        nineShotDrafts((shotNumber) => (shotNumber === 1 ? { characters: undefined } : {})),
    });
    // `executeJsonPlanningCallWithRetry` issues 1 initial + VD_SCHEMA_MAX_RETRIES (2)
    // corrective retries — mock ALL THREE attempts as equally invalid so the stage
    // ultimately fails.
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
  });

  it("rejects when a shot's characters[] is present but empty (min(1) violation)", async () => {
    const invalidPayload = chunkResponsePayload([1], {
      shotDraftsFor: () => nineShotDrafts((shotNumber) => (shotNumber === 1 ? { characters: [] } : {})),
    });
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
  });

  it("rejects when a character is missing emotion", async () => {
    const invalidPayload = chunkResponsePayload([1], {
      shotDraftsFor: () =>
        nineShotDrafts((shotNumber) =>
          shotNumber === 1 ? { characters: [{ name: "Aria" }] } : {},
        ),
    });
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
  });

  it("rejects when a shot is missing location_key", async () => {
    const invalidPayload = chunkResponsePayload([1], {
      shotDraftsFor: () =>
        nineShotDrafts((shotNumber) => (shotNumber === 1 ? { location_key: undefined } : {})),
    });
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
  });

  it("rejects when location_key is an empty string (min(1) violation)", async () => {
    const invalidPayload = chunkResponsePayload([1], {
      shotDraftsFor: () => nineShotDrafts((shotNumber) => (shotNumber === 1 ? { location_key: "" } : {})),
    });
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);
    mockLlmResponseOnce(invalidPayload);

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* (b) Deterministic completeness gate                                       */
/* -------------------------------------------------------------------------- */

function completeShots(): VdDeepDraftShotDraft[] {
  return nineShotDrafts() as unknown as VdDeepDraftShotDraft[];
}

describe("computeShotCompletenessViolations", () => {
  it("returns no violations for a fully complete set of shots (no context)", () => {
    expect(computeShotCompletenessViolations(1, completeShots())).toEqual([]);
  });

  it("flags a shot with no characters at all", () => {
    const shots = completeShots();
    (shots[0] as unknown as Record<string, unknown>).characters = [];
    const violations = computeShotCompletenessViolations(1, shots);
    expect(violations).toContainEqual(
      expect.objectContaining({ episodeNumber: 1, shotNumber: 1 }),
    );
    expect(violations[0].message).toContain("no \"characters\"");
  });

  it("flags a character with a blank emotion", () => {
    const shots = completeShots();
    (shots[2] as unknown as Record<string, unknown>).characters = [{ name: "Aria", emotion: "  " }];
    const violations = computeShotCompletenessViolations(1, shots);
    expect(violations).toContainEqual(
      expect.objectContaining({ episodeNumber: 1, shotNumber: 3 }),
    );
    expect(violations.find((v) => v.shotNumber === 3)?.message).toContain("missing an \"emotion\"");
  });

  it("flags a character name not in the character bible when characterBibleNames is given", () => {
    const shots = completeShots();
    (shots[1] as unknown as Record<string, unknown>).characters = [
      { name: "Someone Invented", emotion: "สงสัย" },
    ];
    const violations = computeShotCompletenessViolations(1, shots, {
      characterBibleNames: new Set(["Aria", "Kai"]),
    });
    expect(violations).toContainEqual(
      expect.objectContaining({ episodeNumber: 1, shotNumber: 2 }),
    );
    expect(violations.find((v) => v.shotNumber === 2)?.message).toContain("not in the character bible");
  });

  it("does NOT flag an unknown character name when characterBibleNames is omitted", () => {
    const shots = completeShots();
    (shots[1] as unknown as Record<string, unknown>).characters = [
      { name: "Someone Invented", emotion: "สงสัย" },
    ];
    expect(computeShotCompletenessViolations(1, shots)).toEqual([]);
  });

  /* ---------------------------------------------------------------------- */
  /* Phase 2.5 (`planning/vd-character-identity-repair/plan.md`) — dialogue */
  /* speaker is now checked against the SAME `characterBibleNames` set, no  */
  /* line-count threshold.                                                  */
  /* ---------------------------------------------------------------------- */

  it("flags a dialogue speaker not in the character bible when characterBibleNames is given (Phase 2.5)", () => {
    const shots = completeShots();
    (shots[5] as unknown as Record<string, unknown>).dialogue_lines = [
      { speaker: "Someone Invented", line: "บทพูดที่ไม่มีใครรู้จักตัวละครนี้เลย" },
    ];
    const violations = computeShotCompletenessViolations(1, shots, {
      characterBibleNames: new Set(["Aria", "Kai"]),
    });
    expect(violations).toContainEqual(
      expect.objectContaining({ episodeNumber: 1, shotNumber: 6 }),
    );
    expect(violations.find((v) => v.shotNumber === 6)?.message).toContain(
      'dialogue speaker "Someone Invented"',
    );
  });

  it("does NOT flag a dialogue speaker that IS a declared alias in characterBibleNames (Phase 2.1/2.5)", () => {
    const shots = completeShots();
    (shots[5] as unknown as Record<string, unknown>).dialogue_lines = [
      { speaker: "Ari", line: "บทพูดที่ใช้ชื่อเล่นของตัวละครหลัก" },
    ];
    // "Ari" is a declared alias of "Aria" — the caller flattens canonical
    // name + aliases into ONE flat set (see `GenerateStoryBibleDeepParams.
    // characterBibleNames`'s own doc comment), so this membership check
    // accepts it exactly like it would accept "Aria" itself.
    const violations = computeShotCompletenessViolations(1, shots, {
      characterBibleNames: new Set(["Aria", "Ari", "Kai"]),
    });
    expect(violations.filter((v) => v.shotNumber === 6)).toEqual([]);
  });

  it("does NOT check dialogue speaker membership when characterBibleNames is omitted", () => {
    const shots = completeShots();
    (shots[5] as unknown as Record<string, unknown>).dialogue_lines = [
      { speaker: "Someone Invented", line: "บทพูดที่ไม่มีใครรู้จักตัวละครนี้เลย" },
    ];
    expect(computeShotCompletenessViolations(1, shots)).toEqual([]);
  });

  it("flags a shot with no location_key", () => {
    const shots = completeShots();
    (shots[3] as unknown as Record<string, unknown>).location_key = undefined;
    const violations = computeShotCompletenessViolations(1, shots);
    expect(violations).toContainEqual(
      expect.objectContaining({ episodeNumber: 1, shotNumber: 4 }),
    );
    expect(violations.find((v) => v.shotNumber === 4)?.message).toContain("no \"location_key\"");
  });

  it("flags a location_key not in knownLocationKeys ∪ declared new_locations when knownLocationKeys is given", () => {
    const shots = completeShots();
    (shots[4] as unknown as Record<string, unknown>).location_key = "loc-unknown";
    const violations = computeShotCompletenessViolations(1, shots, {
      knownLocationKeys: new Set(["loc-apartment"]),
    });
    expect(violations).toContainEqual(
      expect.objectContaining({ episodeNumber: 1, shotNumber: 5 }),
    );
    expect(violations.find((v) => v.shotNumber === 5)?.message).toContain(
      "neither an existing location nor declared",
    );
  });

  it("does NOT flag a location_key that IS in knownLocationKeys", () => {
    const shots = completeShots();
    const violations = computeShotCompletenessViolations(1, shots, {
      knownLocationKeys: new Set(["loc-apartment"]),
    });
    expect(violations).toEqual([]);
  });

  it("does NOT check location_key membership when knownLocationKeys is omitted", () => {
    const shots = completeShots();
    (shots[4] as unknown as Record<string, unknown>).location_key = "loc-totally-unknown";
    expect(computeShotCompletenessViolations(1, shots)).toEqual([]);
  });
});

describe("computeNewLocationDeclarationViolations", () => {
  it("accepts a genuinely new, non-duplicate location key", () => {
    const { violations, acceptedKeys } = computeNewLocationDeclarationViolations(
      [{ location_key: "loc-new-alley" }],
      new Set(["loc-apartment"]),
    );
    expect(violations).toEqual([]);
    expect(acceptedKeys).toEqual(new Set(["loc-new-alley"]));
  });

  it("flags a duplicate key declared twice in the SAME new_locations array", () => {
    const { violations, acceptedKeys } = computeNewLocationDeclarationViolations(
      [{ location_key: "loc-new-alley" }, { location_key: "loc-new-alley" }],
      new Set(),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("more than once");
    expect(acceptedKeys).toEqual(new Set(["loc-new-alley"]));
  });

  it("flags a new_locations key that collides with an ALREADY-EXISTING key", () => {
    const { violations, acceptedKeys } = computeNewLocationDeclarationViolations(
      [{ location_key: "loc-apartment" }],
      new Set(["loc-apartment"]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("already exists");
    expect(acceptedKeys.size).toBe(0);
  });

  it("skips the membership check (never flags a collision) when knownLocationKeys is omitted", () => {
    const { violations, acceptedKeys } = computeNewLocationDeclarationViolations(
      [{ location_key: "loc-apartment" }],
      undefined,
    );
    expect(violations).toEqual([]);
    expect(acceptedKeys).toEqual(new Set(["loc-apartment"]));
  });
});

describe("buildDeepDraftCompletenessRetryInstruction", () => {
  it("joins every violation's message into one instruction, demanding a complete corrected response", () => {
    const instruction = buildDeepDraftCompletenessRetryInstruction([
      { episodeNumber: 1, shotNumber: 1, message: "Issue A." },
      { episodeNumber: 1, shotNumber: 2, message: "Issue B." },
    ]);
    expect(instruction).toContain("Issue A.");
    expect(instruction).toContain("Issue B.");
    expect(instruction).toContain("Return the COMPLETE response again");
  });
});

/* -------------------------------------------------------------------------- */
/* Standard-mode chunk loop — completeness gate wired into the corrective     */
/* retry (reuses the SAME "one retry, then accept + warn" mechanism as the    */
/* missing-episode fix).                                                     */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — standard mode completeness gate wiring", () => {
  it("issues ONE corrective retry when a shot's location_key isn't in the known roster, and accepts the retry's fix", async () => {
    const badPayload = chunkResponsePayload([1], {
      shotDraftsFor: () =>
        nineShotDrafts((shotNumber) => (shotNumber === 1 ? { location_key: "loc-unknown" } : {})),
    });
    const fixedPayload = chunkResponsePayload([1]); // every shot uses "loc-apartment"

    mockLlmResponseOnce(badPayload);
    mockLlmResponseOnce(fixedPayload);

    const result = await generateStoryBibleDeep(
      baseDeepParams({
        existingLocations: [{ locationKey: "loc-apartment", name: "อพาร์ตเมนต์" }],
      }),
    );

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    expect(result.partial).toBe(false);
    expect(result.draftedItems[0].shotDrafts[0].location_key).toBe("loc-apartment");
    // No surviving violation after the retry fixed it.
    expect(
      result.warnings.filter((w) => w.reason === "shot_completeness_violation"),
    ).toHaveLength(0);
  });

  it("accepts the run (with a warning) when the violation SURVIVES the one corrective retry", async () => {
    const badPayload = chunkResponsePayload([1], {
      shotDraftsFor: () =>
        nineShotDrafts((shotNumber) => (shotNumber === 1 ? { location_key: "loc-unknown" } : {})),
    });

    mockLlmResponseOnce(badPayload);
    mockLlmResponseOnce(badPayload); // retry returns the SAME bad location_key

    const result = await generateStoryBibleDeep(
      baseDeepParams({
        existingLocations: [{ locationKey: "loc-apartment", name: "อพาร์ตเมนต์" }],
      }),
    );

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    expect(result.partial).toBe(false); // best-effort accept, never fails the run.
    expect(result.draftedItems[0].shotDrafts[0].location_key).toBe("loc-unknown");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ episodeNumber: 1, shotNumber: 1, reason: "shot_completeness_violation" }),
    );
  });

  it("never triggers a completeness retry when existingLocations/characterBibleNames are both omitted (byte-identical to before this feature)", async () => {
    mockLlmResponseOnce(
      chunkResponsePayload([1], {
        shotDraftsFor: () =>
          nineShotDrafts((shotNumber) =>
            shotNumber === 1 ? { location_key: "loc-anything-goes" } : {},
          ),
      }),
    );

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1); // no retry.
    expect(result.partial).toBe(false);
  });

  it("threads existingLocations into the userPrompt as an EXISTING LOCATIONS fact block", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));

    await generateStoryBibleDeep(
      baseDeepParams({
        existingLocations: [
          { locationKey: "loc-apartment", name: "อพาร์ตเมนต์", description: "ห้องเช่าเล็กๆ ในเมือง" },
        ],
      }),
    );

    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("EXISTING LOCATIONS");
    expect(userPrompt).toContain("loc-apartment");
  });

  it("collects newly-declared locations into result.newLocations", async () => {
    // No `existingLocations` threaded — the location-membership check stays
    // disabled (see the "byte-identical when omitted" test above), so this
    // test isolates JUST the `new_locations` collection behavior.
    mockLlmResponseOnce(
      chunkResponsePayload([1], {
        newLocations: [
          {
            location_key: "loc-rooftop",
            name: "ดาดฟ้า",
            description: "ดาดฟ้าตึกสูง",
            environment: "ลมแรง",
          },
        ],
      }),
    );

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1); // no spurious retry.
    expect(result.newLocations).toEqual([
      expect.objectContaining({ location_key: "loc-rooftop", name: "ดาดฟ้า" }),
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* (b2) CHARACTER BIBLE prompt block                                          */
/* (`planning/vd-character-identity-repair/plan.md` Phase 2.0) — mirrors the  */
/* "threads existingLocations..." tests above exactly (same optional-param /  */
/* honest-empty-block contract).                                             */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — CHARACTER BIBLE prompt block (Phase 2.0, vd-character-identity-repair)", () => {
  it("threads knownCharacters into the userPrompt as a CHARACTER BIBLE fact block with names + aliases", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));

    await generateStoryBibleDeep(
      baseDeepParams({
        knownCharacters: [
          {
            name: "คิริน วัฒนเมธา",
            aliases: ["คิริน"],
            narrativeRole: "protagonist",
            roleTier: "lead_male",
          },
        ],
      }),
    );

    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("CHARACTER BIBLE");
    expect(userPrompt).toContain("คิริน วัฒนเมธา");
    expect(userPrompt).toContain("คิริน");
  });

  it("omits the CHARACTER BIBLE block entirely when knownCharacters is undefined (byte-identical to before this fix)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));

    await generateStoryBibleDeep(baseDeepParams());

    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("CHARACTER BIBLE");
  });

  it("still renders the CHARACTER BIBLE block (stating none declared yet) when knownCharacters is an EMPTY array", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));

    await generateStoryBibleDeep(baseDeepParams({ knownCharacters: [] }));

    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("CHARACTER BIBLE");
    expect(userPrompt).toContain("no established roster to check names against yet");
  });
});

/* -------------------------------------------------------------------------- */
/* (b3) `readBibleRefinedCharacterProfiles` — Phase 2.1 aliases, legacy       */
/* back-compat (a persisted bible with NO aliases field at all — every bible  */
/* predating this feature, including live production data — must still parse */
/* cleanly, never throw).                                                    */
/* -------------------------------------------------------------------------- */

describe("readBibleRefinedCharacterProfiles — Phase 2.1 aliases", () => {
  it("parses a legacy bible whose refinedCharacters have NO aliases field at all", () => {
    const bible = {
      refinedCharacters: [
        { name: "Aria", role: "lead", narrativeRole: "protagonist", roleTier: "lead_female" },
      ],
    };

    const profiles = readBibleRefinedCharacterProfiles(bible);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("Aria");
    expect(profiles[0].aliases).toBeUndefined();
  });

  it("carries declared aliases through when present", () => {
    const bible = {
      refinedCharacters: [
        { name: "คิริน วัฒนเมธา", role: "lead", aliases: ["คิริน"] },
      ],
    };

    const profiles = readBibleRefinedCharacterProfiles(bible);

    expect(profiles[0].aliases).toEqual(["คิริน"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Genre pollution guard (Stage 1.5,                                         */
/* `planning/vd-series-memory-and-lineage/plan.md`) — `buildDeepDraftPrompts` */
/* has a documented byte-identity requirement; its `Genre:` line now routes  */
/* through `buildGenrePromptLine`. A CLEAN genre must render byte-identically */
/* to before this change; only a genre that duplicates/paraphrases `title`   */
/* may differ (by omitting the line). Extracting the exact `Genre:` line and */
/* asserting `.toBe()` on it (never `.not.toContain`) is the proof this      */
/* feature's brief calls for.                                                */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — genre pollution guard (Stage 1.5)", () => {
  function genreLineOf(userPrompt: string): string | undefined {
    return userPrompt.split("\n").find(line => line.startsWith("Genre:"));
  }

  it("renders the EXACT same `Genre: ...` line as the pre-fix inline expression for a clean genre (byte-identity)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams({ genre: "romance", title: "Test Series" }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;

    // The exact pre-fix inline expression this test guards against
    // regressing (`params.genre ? \`Genre: ${params.genre}\` : null`) — a
    // genuine two-build `.toBe()` comparison, not a substring check.
    const preFixGenreLine = "romance" ? `Genre: romance` : null;
    expect(genreLineOf(userPrompt)).toBe(preFixGenreLine);
  });

  it("produces a byte-identical full prompt across two calls with the same clean genre (determinism)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({ genre: "โรแมนติกดราม่าย้อนเวลา", title: "รักข้ามเวลา" }),
    );
    const firstUserPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;

    vi.clearAllMocks();
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "active-llm-model", providerId: 1, priority: 1 } as any,
    ]);
    mockResolveVerticalDramaSeriesModel.mockImplementation(
      async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
    );
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({ genre: "โรแมนติกดราม่าย้อนเวลา", title: "รักข้ามเวลา" }),
    );
    const secondUserPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;

    expect(secondUserPrompt).toBe(firstUserPrompt);
  });

  it("omits the `Genre:` line entirely when genre is a byte-for-byte copy of title (real series-5 shape)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({
        title: "สวมรอยดาราสองชีวิต…",
        genre: "สวมรอยดาราสองชีวิต…",
      }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(genreLineOf(userPrompt)).toBe(undefined);
  });

  it("omits the `Genre:` line when genre is a long, multi-segment paraphrase of title (real series-16 shape)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({
        title: "คาเฟ่ป่วนรัก กับดักพี่ชายตัวแสบ",
        genre: "คาเฟ่ปั่นรัก พี่ชายหวงตัวแสบในตึกเดียวกัน",
      }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(genreLineOf(userPrompt)).toBe(undefined);
  });

  it("still renders `Series title:` and the rest of the prompt normally when the Genre line is suppressed", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({
        title: "สวมรอยดาราสองชีวิต…",
        genre: "สวมรอยดาราสองชีวิต…",
      }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("Series title: สวมรอยดาราสองชีวิต…");
  });
});

/* -------------------------------------------------------------------------- */
/* (d) Read-path backward compatibility — a legacy bible predating this      */
/* feature (no characters/location_key on any stored shot) must still parse. */
/* -------------------------------------------------------------------------- */

describe("readItemShotDrafts — backward compatibility with legacy (pre-feature) stored shots", () => {
  it("parses a stored item whose shots have no characters/location_key at all", () => {
    const legacyItem = {
      episodeNumber: 1,
      workingTitle: "Episode 1",
      logline: "Logline",
      keyBeats: ["Beat"],
      shotDrafts: Array.from({ length: 9 }, (_, i) => ({
        shot_number: i + 1,
        summary: `Shot ${i + 1}`,
        dialogue_lines: [{ speaker: "A", line: "บทพูดเก่าที่ไม่มีตัวละครหรือสถานที่ระบุไว้เลย" }],
      })),
    } as unknown as StoredEpisodeBreakdownItem;

    const parsed = readItemShotDrafts(legacyItem);

    expect(parsed).not.toBeNull();
    expect(parsed).toHaveLength(9);
    expect(parsed?.[0].characters).toBeUndefined();
    expect(parsed?.[0].location_key).toBeUndefined();
  });

  it("still parses when SOME shots have the new fields and others don't (a mid-migration bible)", () => {
    const mixedItem = {
      episodeNumber: 1,
      workingTitle: "Episode 1",
      logline: "Logline",
      keyBeats: ["Beat"],
      shotDrafts: Array.from({ length: 9 }, (_, i) => ({
        shot_number: i + 1,
        summary: `Shot ${i + 1}`,
        dialogue_lines: [{ speaker: "A", line: "บทพูดสำหรับทดสอบการอ่านข้อมูลแบบผสม" }],
        ...(i === 0 ? { characters: [{ name: "Aria", emotion: "ดีใจ" }], location_key: "loc-x" } : {}),
      })),
    } as unknown as StoredEpisodeBreakdownItem;

    const parsed = readItemShotDrafts(mixedItem);

    expect(parsed).not.toBeNull();
    expect(parsed?.[0].characters).toEqual([{ name: "Aria", emotion: "ดีใจ" }]);
    expect(parsed?.[1].characters).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* (e) Series memory — `episode_memory` (Stage 1.2/1.3)                      */
/* -------------------------------------------------------------------------- */

describe("deep-draft chunk `episode_memory` (series memory, Stage 1.2)", () => {
  it("backward compat: an LLM response with NO episode_memory still produces a valid draft, with a deterministic recap-only fallback", async () => {
    // `chunkResponsePayload` never includes `episode_memory` — this is the
    // exact backward-compat case: every existing test/caller predates this
    // field entirely.
    mockLlmResponseOnce(chunkResponsePayload([1]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(result.partial).toBe(false);
    expect(result.draftedItems).toHaveLength(1);
    const item = result.draftedItems[0];
    // The draft itself is completely unaffected.
    expect(item.shotDrafts).toHaveLength(VD_DEEP_DRAFT_SHOTS_PER_EPISODE);
    // `episodeMemory` is ALWAYS populated (never left undefined) via the
    // deterministic fallback — recap built from logline/keyBeats/cliffhanger,
    // no relationship/thread data (none exists without the structured block).
    expect(item.episodeMemory).toBeDefined();
    expect(item.episodeMemory?.episodeNumber).toBe(1);
    expect(item.episodeMemory?.recap).toContain("Logline 1");
    expect(item.episodeMemory?.recap).toContain("Cliffhanger for episode 1");
    expect(item.episodeMemory?.relationshipChanges).toEqual([]);
    expect(item.episodeMemory?.threadsOpened).toEqual([]);
  });

  it("resolves a valid episode_memory block into structured relationship/thread state", async () => {
    mockLlmResponseOnce({
      episodeBreakdown: [
        {
          episodeNumber: 1,
          workingTitle: "Episode 1",
          logline: "Logline 1",
          keyBeats: ["Beat A"],
          shotDrafts: nineShotDrafts(),
          cliffhanger_line: "Cliffhanger for episode 1",
          episode_memory: {
            recap: "Aria and Kane secretly start dating this episode.",
            canonical_facts: ["Aria works at the flower shop"],
            threads_opened: [
              {
                thread_id: "house-reno",
                description: "The apartment renovation still isn't finished",
                thread_class: "domestic",
              },
            ],
            threads_resolved: [],
            relationship_changes: [
              {
                pair: ["aria", "kane"],
                status: "dating",
                disclosure: "secret",
                known_by: ["aria"],
              },
            ],
            knowledge_changes: [
              { character_key: "kane", learned: "Aria's ex is back in town" },
            ],
          },
        },
      ],
      open_threads: [],
    });

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(result.partial).toBe(false);
    const memory = result.draftedItems[0].episodeMemory;
    expect(memory).toBeDefined();
    expect(memory?.recap).toBe(
      "Aria and Kane secretly start dating this episode."
    );
    expect(memory?.threadsOpened).toEqual([
      {
        threadId: "house-reno",
        description: "The apartment renovation still isn't finished",
        threadClass: "domestic",
        openedEpisode: 1,
      },
    ]);
    expect(memory?.relationshipChanges).toEqual([
      {
        pair: ["aria", "kane"],
        status: "dating",
        disclosure: "secret",
        knownBy: ["aria"],
        sinceEpisode: 1,
      },
    ]);
    expect(memory?.knowledgeChanges).toEqual([
      { characterKey: "kane", learned: "Aria's ex is back in town" },
    ]);
  });

  it("a malformed episode_memory block (missing required inner fields) degrades to the deterministic fallback, never fails the draft", async () => {
    mockLlmResponseOnce({
      episodeBreakdown: [
        {
          episodeNumber: 1,
          workingTitle: "Episode 1",
          logline: "Logline 1",
          keyBeats: ["Beat A"],
          shotDrafts: nineShotDrafts(),
          cliffhanger_line: "Cliffhanger for episode 1",
          // Missing required `disclosure` on the relationship entry, and
          // missing required `thread_class` on the thread entry — the WHOLE
          // block fails `episodeMemoryBlockSchema`, not just those entries.
          episode_memory: {
            recap: "A recap the schema will still reject overall.",
            relationship_changes: [{ pair: ["aria", "kane"], status: "dating" }],
            threads_opened: [{ thread_id: "x", description: "y" }],
          },
        },
      ],
      open_threads: [],
    });

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(result.partial).toBe(false);
    expect(result.draftedItems).toHaveLength(1);
    const memory = result.draftedItems[0].episodeMemory;
    expect(memory).toBeDefined();
    // Fallback, not the malformed structured content.
    expect(memory?.relationshipChanges).toEqual([]);
    expect(memory?.recap).toContain("Logline 1");
  });
});

/* -------------------------------------------------------------------------- */
/* (f) Sequel authoring — "SEASON LINEAGE" prompt block (Stage 2.4,           */
/* `planning/vd-series-memory-and-lineage/plan.md`) — mirrors the            */
/* "threads knownLocations/knownCharacters..." tests above exactly (same     */
/* optional-param / byte-identity-when-absent contract).                     */
/* -------------------------------------------------------------------------- */

function seasonLineageFixture(overrides: Record<string, unknown> = {}) {
  return {
    seasonNumber: 2,
    parentTitle: "รักข้ามเวลา",
    priorSeasonSummary: "สรุปภาค 1 แบบย่อ: พิมพ์ดาวและกวินท์คบกันแบบเปิดเผยแล้ว",
    carriedRelationships: [
      {
        pair: ["aria", "kane"] as [string, string],
        status: "คบกันแบบเปิดเผย",
        disclosure: "public" as const,
        knownBy: [],
        sinceEpisode: 30,
      },
    ],
    carriedThreads: [
      {
        threadId: "house-reno",
        description: "การรีโนเวทบ้านยังไม่เสร็จ",
        threadClass: "domestic" as const,
        openedEpisode: 5,
      },
    ],
    carriedCharacters: [{ characterKey: "aria", name: "Aria" }],
    writtenOutCharacters: [],
    antagonistStrategy: "ตัวร้ายเดิมถูกจับแล้ว ต้องหาปมใหม่หรือให้ตัวร้ายใหม่เข้ามา",
    characterKnowledge: { aria: ["รู้ว่ากวินท์เป็นน้องชายแท้ๆ"] },
    ...overrides,
  };
}

function systemAndUserPromptOf(callIndex: number) {
  const args = mockExecuteWithFallback.mock.calls[callIndex][0];
  return {
    systemPrompt: args.messages.find((m: { role: string }) => m.role === "system")
      .content as string,
    userPrompt: args.messages.find((m: { role: string }) => m.role === "user")
      .content as string,
  };
}

describe("generateStoryBibleDeep — SEASON LINEAGE prompt block (Stage 2.4, sequel authoring)", () => {
  it("produces a BYTE-IDENTICAL system AND user prompt whether seasonLineage is omitted entirely or explicitly undefined", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams());
    const omitted = systemAndUserPromptOf(0);

    vi.clearAllMocks();
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "active-llm-model", providerId: 1, priority: 1 } as any,
    ]);
    mockResolveVerticalDramaSeriesModel.mockImplementation(
      async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
    );
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams({ seasonLineage: undefined }));
    const explicitUndefined = systemAndUserPromptOf(0);

    expect(explicitUndefined.systemPrompt).toBe(omitted.systemPrompt);
    expect(explicitUndefined.userPrompt).toBe(omitted.userPrompt);
    expect(omitted.userPrompt).not.toContain("SEASON LINEAGE");
  });

  it("renders a SEASON LINEAGE fact block with the per-call facts in the userPrompt — the systemPrompt (static skill.md content) never embeds per-call facts", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({ seasonLineage: seasonLineageFixture() }),
    );

    const { systemPrompt, userPrompt } = systemAndUserPromptOf(0);
    expect(userPrompt).toContain("SEASON LINEAGE");
    expect(userPrompt).toContain("รักข้ามเวลา");
    expect(userPrompt).toContain("house-reno");
    expect(userPrompt).toContain("public");
    // The system prompt is `buildDeepDraftPrompts`'s static skill.md content
    // (the architect skill's own "SEASON LINEAGE" GUARD prose is always
    // present there, for every call — that is what teaches the model the
    // concept). This assertion is about the DYNAMIC per-call facts
    // specifically: they only ever render into the userPrompt, never
    // hand-embedded into the systemPrompt by `buildDeepDraftPrompts` itself.
    expect(systemPrompt).not.toContain("รักข้ามเวลา");
    expect(systemPrompt).not.toContain("house-reno");
  });
});
