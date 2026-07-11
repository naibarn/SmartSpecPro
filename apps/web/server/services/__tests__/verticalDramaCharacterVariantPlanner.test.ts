/**
 * Coverage for `verticalDramaCharacterVariantPlanner.ts`
 * (`planning/vertical-drama-character-variants/plan.md` Phase B) — mirrors
 * `verticalDramaShotImageAction.test.ts`'s mocking convention (LLM call layer
 * + skill-file loading mocked; `executeJsonPlanningCallWithRetry` itself runs
 * for REAL, from the real `verticalDramaStoryBible.ts`).
 *
 * `../verticalDramaImproveScript` is FULLY mocked (only
 * `resolveQualityLargeContextModelId` is used by this file) rather than
 * partially mocked via `vi.importActual` — the real module and this one are
 * an established circular pair (see this file's own doc comment), and a full
 * mock here avoids re-triggering that cycle's other, unrelated dependencies
 * (skillRegistry/skillExecutionPolicy/enabledLlmModels/creditService) during
 * this file's own test run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
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
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 3) — its
// own override/fallback contract is covered by
// `verticalDramaLlmModelPolicy.test.ts`; here it's mocked to replicate the
// real resolver's "auto-fallback, then resolveStoryBibleModel() as the last
// resort" contract (this call site's `autoFallback` is
// `resolveQualityLargeContextModelId`, which CAN resolve to `null`, unlike
// the single-tier call sites Phase 2 wired) using the already-mocked
// `resolveStoryBibleModel` above, so this file's pre-existing "no override
// configured" behavior/assertions (including the "falls back to
// resolveStoryBibleModel" test) are unaffected and no real DB access happens.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    async (_seriesId: number, autoFallback: () => Promise<string | null>) => {
      const auto = await autoFallback();
      if (auto) return auto;
      const { resolveStoryBibleModel } = await import("../verticalDramaStoryBible");
      return resolveStoryBibleModel();
    },
  ),
}));

const hoisted = vi.hoisted(() => ({
  characterRows: [] as Record<string, unknown>[],
  nextId: 100,
  updateCalls: [] as Array<{ id: number; patch: Record<string, unknown> }>,
  pendingUpdateTargetId: undefined as number | undefined,
}));

vi.mock("../../db", () => {
  function makeSelectBuilder() {
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.where = () => builder;
    builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve([...hoisted.characterRows]);
      } catch (err) {
        reject?.(err);
      }
    };
    return builder;
  }
  function makeInsertBuilder() {
    const builder: Record<string, unknown> = {};
    let values: Record<string, unknown> = {};
    builder.values = (v: Record<string, unknown>) => {
      values = v;
      return builder;
    };
    builder.returning = () => {
      const row = {
        id: hoisted.nextId++,
        createdAt: new Date(),
        updatedAt: new Date(),
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: null,
        ...values,
      };
      hoisted.characterRows.push(row);
      return Promise.resolve([row]);
    };
    return builder;
  }
  function makeUpdateBuilder() {
    const builder: Record<string, unknown> = {};
    let patch: Record<string, unknown> = {};
    builder.set = (p: Record<string, unknown>) => {
      patch = p;
      return builder;
    };
    builder.where = () => {
      // Best-effort: this file's tests only ever update ONE row per call in
      // a given `reconcileCharacterVariantPlan` invocation set up so its
      // `where(eq(id, existing.id))` targets a known fixture row — record the
      // patch keyed by whichever row's id was passed as the last `eq(...)`
      // filter argument captured via `hoisted.pendingUpdateTargetId` (set by
      // the test itself before calling reconcile, see the "updates an
      // existing" test below) so assertions stay simple without needing to
      // introspect drizzle's `SQL` condition object.
      hoisted.updateCalls.push({ id: hoisted.pendingUpdateTargetId ?? -1, patch });
      return Promise.resolve([]);
    };
    return builder;
  }
  return {
    db: {
      select: vi.fn(() => makeSelectBuilder()),
      insert: vi.fn(() => makeInsertBuilder()),
      update: vi.fn(() => makeUpdateBuilder()),
    },
  };
});

import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { parseSkillFile } from "@smartspec/skills";
import fs from "fs";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "../verticalDramaImproveScript";
import {
  buildCharacterVariantPlannerUserPrompt,
  generateCharacterVariantPlan,
  reconcileCharacterVariantPlan,
  extractCharacterRosterDescription,
  InsufficientCreditsError,
  VdSchemaValidationError,
  type GenerateCharacterVariantPlanParams,
  type CharacterVariantPlan,
} from "../verticalDramaCharacterVariantPlanner";
import type { StoryScriptEpisodeInput } from "@shared/verticalDramaSeries/storyScriptText";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockResolveQualityModel = vi.mocked(resolveQualityLargeContextModelId);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function episode(overrides: Partial<StoryScriptEpisodeInput> = {}): StoryScriptEpisodeInput {
  return {
    episodeNumber: 1,
    workingTitle: "เช้าวันธรรมดา",
    logline: "หนูนาตื่นนอนในชุดนอน ช่วยแม่จัดโต๊ะอาหารเช้า",
    keyBeats: ["หนูนาตื่นนอน ใส่ชุดนอน ลงมาช่วยแม่ที่ครัว"],
    shotDrafts: null,
    ...overrides,
  };
}

function baseParams(
  overrides: Partial<GenerateCharacterVariantPlanParams> = {},
): GenerateCharacterVariantPlanParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 6,
    lang: "th",
    characters: [
      { characterKey: "character-1", name: "หนูนา", role: "protagonist", description: "หญิงสาววัย 22 ปี" },
    ],
    episodes: [episode()],
    ...overrides,
  };
}

function validOutput(overrides: Partial<CharacterVariantPlan> = {}): CharacterVariantPlan {
  return {
    contract_version: 1,
    character_plans: [
      {
        character_key: "character-1",
        variants: [
          {
            variant_label: "ชุดนักเรียน",
            variant_type: "outfit",
            description: "school uniform, hair in braids",
            applies_to_episodes: [2, 3],
          },
        ],
      },
    ],
    twin_detections: [],
    ...overrides,
  } as CharacterVariantPlan;
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 500, completion_tokens: 150 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

function makeCharacterRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    tenantId: "tenant-1",
    userId: 1,
    seriesId: 6,
    characterKey: "character-1",
    name: "หนูนา",
    role: "protagonist",
    data: { description: "หญิงสาววัย 22 ปี" },
    voiceConfig: null,
    parentCharacterId: null,
    variantLabel: null,
    variantType: null,
    sharesFaceWithCharacterId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.characterRows = [];
  hoisted.nextId = 100;
  hoisted.updateCalls = [];
  hoisted.pendingUpdateTargetId = undefined;

  mockResolveModel.mockResolvedValue("gpt-4o-mini");
  mockResolveQualityModel.mockResolvedValue(null);
  mockCalculateCredits.mockReturnValue(4);
  mockDeductCredits.mockResolvedValue(undefined as any);
  mockResolveSkillDirCandidates.mockReturnValue([
    "/fake/skills/vertical-drama-character-variant-planner",
  ]);
  mockResolveSkillManifestPath.mockReturnValue(
    "/fake/skills/vertical-drama-character-variant-planner/skill.md",
  );
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
  mockParseSkillFile.mockReturnValue({
    metadata: {} as any,
    content: "System prompt body",
  });
});

/* -------------------------------------------------------------------------- */
/* buildCharacterVariantPlannerUserPrompt                                     */
/* -------------------------------------------------------------------------- */

describe("buildCharacterVariantPlannerUserPrompt", () => {
  it("assembles only data facts — character roster lines + whole-season episode text, no authored instruction prose", () => {
    const prompt = buildCharacterVariantPlannerUserPrompt(baseParams());

    expect(prompt).toContain("contract_version: 1");
    expect(prompt).toContain("locale: th");
    expect(prompt).toContain(
      "- character_key=character-1 name=หนูนา role=protagonist description=หญิงสาววัย 22 ปี",
    );
    expect(prompt).toContain("ตอนที่ 1: เช้าวันธรรมดา");
    expect(prompt).toContain("เรื่องย่อ: หนูนาตื่นนอนในชุดนอน ช่วยแม่จัดโต๊ะอาหารเช้า");

    // No code-authored creative/instructional sentences — those live only in
    // skill.md, never in the assembled facts.
    expect(prompt).not.toMatch(/propose an "outfit" variant/i);
    expect(prompt).not.toMatch(/twin\/lookalike/i);
    expect(prompt).not.toMatch(/never invent a variant/i);
  });

  it("falls back to labeled placeholders when characters/episodes are empty", () => {
    const prompt = buildCharacterVariantPlannerUserPrompt(baseParams({ characters: [], episodes: [] }));

    expect(prompt).toContain("character_roster:\n(none)");
    expect(prompt).toContain("season_script:\n(no drafted episodes)");
  });

  it("defaults locale to th when omitted", () => {
    const prompt = buildCharacterVariantPlannerUserPrompt(baseParams({ lang: undefined }));
    expect(prompt).toContain("locale: th");
  });

  it("appends existing_parent_character_key/existing_variant_label markers for a variant roster entry", () => {
    const prompt = buildCharacterVariantPlannerUserPrompt(
      baseParams({
        characters: [
          {
            characterKey: "character-1-school-uniform",
            name: "หนูนา",
            role: "protagonist",
            description: "school uniform",
            existingParentCharacterKey: "character-1",
            existingVariantLabel: "ชุดนักเรียน",
          },
        ],
      }),
    );

    expect(prompt).toContain(
      "- character_key=character-1-school-uniform name=หนูนา role=protagonist description=school uniform existing_parent_character_key=character-1 existing_variant_label=ชุดนักเรียน",
    );
  });

  it("appends existing_shares_face_with_character_key marker for a twin roster entry", () => {
    const prompt = buildCharacterVariantPlannerUserPrompt(
      baseParams({
        characters: [
          {
            characterKey: "character-4-twin",
            name: "ใบตอง",
            role: "supporting",
            description: "wears glasses",
            existingSharesFaceWithCharacterKey: "character-4",
          },
        ],
      }),
    );

    expect(prompt).toContain(
      "- character_key=character-4-twin name=ใบตอง role=supporting description=wears glasses existing_shares_face_with_character_key=character-4",
    );
  });

  it("does not append any existing_* marker for a base character roster entry", () => {
    const prompt = buildCharacterVariantPlannerUserPrompt(baseParams());
    expect(prompt).not.toContain("existing_parent_character_key");
    expect(prompt).not.toContain("existing_variant_label");
    expect(prompt).not.toContain("existing_shares_face_with_character_key");
  });
});

/* -------------------------------------------------------------------------- */
/* generateCharacterVariantPlan                                               */
/* -------------------------------------------------------------------------- */

describe("generateCharacterVariantPlan", () => {
  it("happy path: returns the validated plan, deducts credits once, prefers the quality large-context model", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveQualityModel.mockResolvedValue("quality/large-context-model");
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVariantPlan(baseParams());

    expect(result.plan.character_plans).toHaveLength(1);
    expect(result.plan.character_plans[0].character_key).toBe("character-1");
    expect(result.model).toBe("quality/large-context-model");
    expect(result.creditsUsed).toBe(4);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        tenantId: "tenant-1",
        sourceType: "skill",
        metadata: expect.objectContaining({ operation: "character_variant_planner" }),
      }),
    );
  });

  it("falls back to resolveStoryBibleModel when no quality large-context model is eligible", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveQualityModel.mockResolvedValue(null);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVariantPlan(baseParams());

    expect(result.model).toBe("gpt-4o-mini");
  });

  it("returns an empty plan as a valid (non-error) result when the skill proposes nothing", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ contract_version: 1, character_plans: [], twin_detections: [] }),
    );

    const result = await generateCharacterVariantPlan(baseParams());

    expect(result.plan.character_plans).toEqual([]);
    expect(result.plan.twin_detections).toEqual([]);
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateCharacterVariantPlan(baseParams())).rejects.toThrow(InsufficientCreditsError);

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed output (shares_face_with not matching source_character_key)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse(
        validOutput({
          character_plans: [],
          twin_detections: [
            {
              description: "twin",
              source_character_key: "character-1",
              new_characters: [
                {
                  name: "ใบตอง",
                  shares_face_with: "character-999", // must equal source_character_key
                },
              ],
            },
          ],
        } as any),
      ),
    );

    await expect(generateCharacterVariantPlan(baseParams())).rejects.toThrow(VdSchemaValidationError);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* extractCharacterRosterDescription                                          */
/* -------------------------------------------------------------------------- */

describe("extractCharacterRosterDescription", () => {
  it("returns an empty string for null data", () => {
    expect(extractCharacterRosterDescription(null)).toBe("");
  });

  it("combines description + wardrobeRules when both present", () => {
    const text = extractCharacterRosterDescription({
      description: "หญิงสาววัย 22 ปี",
      wardrobeRules: ["always wears a red scarf", ""],
    });
    expect(text).toBe("หญิงสาววัย 22 ปี | Wardrobe: always wears a red scarf");
  });
});

/* -------------------------------------------------------------------------- */
/* reconcileCharacterVariantPlan                                              */
/* -------------------------------------------------------------------------- */

describe("reconcileCharacterVariantPlan", () => {
  const owner = { tenantId: "tenant-1", userId: 1, seriesId: 6 };

  it("creates a new outfit variant row when none exists (characterKey derived from parent + slug, data.wardrobeRules populated)", async () => {
    hoisted.characterRows = [makeCharacterRow({ id: 1, characterKey: "character-1", name: "หนูนา" })];

    const plan: CharacterVariantPlan = validOutput();
    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([{ name: "หนูนา", variantLabel: "ชุดนักเรียน" }]);
    expect(summary.updatedCharacters).toEqual([]);

    const created = hoisted.characterRows.find((row) => row.variantLabel === "ชุดนักเรียน");
    expect(created).toBeDefined();
    expect(created?.parentCharacterId).toBe(1);
    expect(created?.variantType).toBe("outfit");
    expect(created?.name).toBe("หนูนา");
    expect(created?.role).toBe("protagonist");
    expect((created?.data as any).description).toBe("school uniform, hair in braids");
    expect((created?.data as any).wardrobeRules).toEqual(["school uniform, hair in braids"]);
    // characterKey never collides with the parent's own key.
    expect(created?.characterKey).not.toBe("character-1");
  });

  it("updates an existing variant row (matched by parentCharacterId + variantLabel) instead of duplicating it", async () => {
    hoisted.characterRows = [
      makeCharacterRow({ id: 1, characterKey: "character-1", name: "หนูนา" }),
      makeCharacterRow({
        id: 2,
        characterKey: "character-1-school-uniform",
        name: "หนูนา",
        role: "protagonist",
        parentCharacterId: 1,
        variantLabel: "ชุดนักเรียน",
        variantType: "outfit",
        data: { description: "old description" },
      }),
    ];
    hoisted.pendingUpdateTargetId = 2;

    const plan: CharacterVariantPlan = validOutput({
      character_plans: [
        {
          character_key: "character-1",
          variants: [
            {
              variant_label: "ชุดนักเรียน",
              variant_type: "outfit",
              description: "updated description with new details",
              applies_to_episodes: [],
            },
          ],
        },
      ],
    });

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([]);
    expect(summary.updatedCharacters).toEqual([{ name: "หนูนา", variantLabel: "ชุดนักเรียน" }]);
    // No new row was inserted — still exactly 2 rows.
    expect(hoisted.characterRows).toHaveLength(2);
    expect(hoisted.updateCalls).toHaveLength(1);
    expect(hoisted.updateCalls[0].id).toBe(2);
    expect((hoisted.updateCalls[0].patch.data as any).description).toBe(
      "updated description with new details",
    );
  });

  it("creates an identical twin row with sharesFaceWithCharacterId set to the source row's id", async () => {
    hoisted.characterRows = [makeCharacterRow({ id: 1, characterKey: "character-1", name: "ใบเฟิร์น" })];

    const plan: CharacterVariantPlan = {
      contract_version: 1,
      character_plans: [],
      twin_detections: [
        {
          description: "identical twin",
          source_character_key: "character-1",
          new_characters: [
            {
              character_key_suggestion: "character-1-twin",
              name: "ใบตอง",
              role: "supporting",
              shares_face_with: "character-1",
              distinguishing_notes: "always wears glasses, short hair",
            },
          ],
        },
      ],
    } as CharacterVariantPlan;

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([{ name: "ใบตอง", variantLabel: null }]);
    const twinRow = hoisted.characterRows.find((row) => row.name === "ใบตอง");
    expect(twinRow?.sharesFaceWithCharacterId).toBe(1);
    expect(twinRow?.parentCharacterId).toBeNull();
    expect((twinRow?.data as any).description).toBe("always wears glasses, short hair");
  });

  it("creates a fraternal twin row with sharesFaceWithCharacterId left null", async () => {
    hoisted.characterRows = [makeCharacterRow({ id: 1, characterKey: "character-1", name: "ใบเฟิร์น" })];

    const plan: CharacterVariantPlan = {
      contract_version: 1,
      character_plans: [],
      twin_detections: [
        {
          description: "fraternal sibling",
          source_character_key: "character-1",
          new_characters: [
            {
              name: "กันต์",
              role: "supporting",
              distinguishing_notes: "looks nothing alike, different bone structure",
            },
          ],
        },
      ],
    } as CharacterVariantPlan;

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([{ name: "กันต์", variantLabel: null }]);
    const siblingRow = hoisted.characterRows.find((row) => row.name === "กันต์");
    expect(siblingRow?.sharesFaceWithCharacterId).toBeNull();
  });

  it("leaves an already-existing identical twin row untouched (never re-created, never re-inserted)", async () => {
    hoisted.characterRows = [
      makeCharacterRow({ id: 1, characterKey: "character-1", name: "ใบเฟิร์น" }),
      makeCharacterRow({
        id: 2,
        characterKey: "character-1-twin",
        name: "ใบตอง",
        sharesFaceWithCharacterId: 1,
      }),
    ];

    const plan: CharacterVariantPlan = {
      contract_version: 1,
      character_plans: [],
      twin_detections: [
        {
          description: "identical twin",
          source_character_key: "character-1",
          new_characters: [{ name: "ใบตอง", shares_face_with: "character-1" }],
        },
      ],
    } as CharacterVariantPlan;

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([]);
    expect(summary.updatedCharacters).toEqual([]);
    expect(hoisted.characterRows).toHaveLength(2);
  });

  it("silently skips a plan entry whose character_key/source_character_key isn't in the current roster (best-effort, never throws)", async () => {
    hoisted.characterRows = [makeCharacterRow({ id: 1, characterKey: "character-1", name: "หนูนา" })];

    const plan: CharacterVariantPlan = validOutput({
      character_plans: [
        {
          character_key: "character-999-unknown",
          variants: [
            { variant_label: "ชุดพิเศษ", variant_type: "outfit", description: "unknown", applies_to_episodes: [] },
          ],
        },
      ],
      twin_detections: [
        {
          description: "unknown source",
          source_character_key: "character-888-unknown",
          new_characters: [{ name: "ใครสักคน" }],
        },
      ],
    } as any);

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([]);
    expect(summary.updatedCharacters).toEqual([]);
    expect(hoisted.characterRows).toHaveLength(1);
  });

  /* ------------------------------------------------------------------ */
  /* W3 stable-ID reconcile                                              */
  /* (planning/vertical-drama-twin-variant-completeness/plan.md W3)      */
  /* ------------------------------------------------------------------ */

  it("matches/updates an existing variant row via existing_character_key even when variant_label text differs from what's stored", async () => {
    hoisted.characterRows = [
      makeCharacterRow({ id: 1, characterKey: "character-1", name: "หนูนา" }),
      makeCharacterRow({
        id: 2,
        characterKey: "character-1-school-uniform",
        name: "หนูนา",
        role: "protagonist",
        parentCharacterId: 1,
        variantLabel: "ชุดนักเรียน (เก่า)", // stored label differs from the plan's phrasing below
        variantType: "outfit",
        data: { description: "old description" },
      }),
    ];
    hoisted.pendingUpdateTargetId = 2;

    const plan: CharacterVariantPlan = validOutput({
      character_plans: [
        {
          character_key: "character-1",
          variants: [
            {
              variant_label: "ชุดไปโรงเรียน", // deliberately different phrasing from the stored label
              variant_type: "outfit",
              description: "updated description via stable ID",
              applies_to_episodes: [],
              existing_character_key: "character-1-school-uniform",
            },
          ],
        },
      ],
    } as any);

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    // Matched via existing_character_key, not the (now-mismatched) text
    // comparison — no duplicate row created.
    expect(summary.createdCharacters).toEqual([]);
    expect(summary.updatedCharacters).toEqual([{ name: "หนูนา", variantLabel: "ชุดไปโรงเรียน" }]);
    expect(hoisted.characterRows).toHaveLength(2);
    expect(hoisted.updateCalls).toHaveLength(1);
    expect(hoisted.updateCalls[0].id).toBe(2);
    expect((hoisted.updateCalls[0].patch.data as any).description).toBe(
      "updated description via stable ID",
    );
  });

  it("falls through gracefully (no crash) to the text-match path when existing_character_key on a variant doesn't resolve to any known row", async () => {
    hoisted.characterRows = [
      makeCharacterRow({ id: 1, characterKey: "character-1", name: "หนูนา" }),
      makeCharacterRow({
        id: 2,
        characterKey: "character-1-school-uniform",
        name: "หนูนา",
        role: "protagonist",
        parentCharacterId: 1,
        variantLabel: "ชุดนักเรียน",
        variantType: "outfit",
        data: { description: "old description" },
      }),
    ];
    hoisted.pendingUpdateTargetId = 2;

    const plan: CharacterVariantPlan = validOutput({
      character_plans: [
        {
          character_key: "character-1",
          variants: [
            {
              variant_label: "ชุดนักเรียน", // matches stored label — text-match fallback succeeds
              variant_type: "outfit",
              description: "updated via text-match fallback",
              applies_to_episodes: [],
              existing_character_key: "character-does-not-exist",
            },
          ],
        },
      ],
    } as any);

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([]);
    expect(summary.updatedCharacters).toEqual([{ name: "หนูนา", variantLabel: "ชุดนักเรียน" }]);
    expect(hoisted.characterRows).toHaveLength(2);
  });

  it("matches an existing IDENTICAL twin row via existing_character_key even when name text differs, leaving it untouched (never re-created)", async () => {
    hoisted.characterRows = [
      makeCharacterRow({ id: 1, characterKey: "character-1", name: "ใบเฟิร์น" }),
      makeCharacterRow({
        id: 2,
        characterKey: "character-1-twin",
        name: "ใบตอง (เดิม)", // stored name differs from the plan's phrasing below
        sharesFaceWithCharacterId: 1,
      }),
    ];

    const plan: CharacterVariantPlan = {
      contract_version: 1,
      character_plans: [],
      twin_detections: [
        {
          description: "identical twin",
          source_character_key: "character-1",
          new_characters: [
            {
              name: "ใบตอง", // different phrasing from stored "ใบตอง (เดิม)"
              shares_face_with: "character-1",
              existing_character_key: "character-1-twin",
            },
          ],
        },
      ],
    } as any;

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([]);
    expect(summary.updatedCharacters).toEqual([]);
    expect(hoisted.characterRows).toHaveLength(2);
  });

  it("matches an existing FRATERNAL twin row via existing_character_key even when name text differs, leaving it untouched (never re-created)", async () => {
    hoisted.characterRows = [
      makeCharacterRow({ id: 1, characterKey: "character-1", name: "ใบเฟิร์น" }),
      makeCharacterRow({
        id: 2,
        characterKey: "character-1-sibling",
        name: "กันต์ (เดิม)", // stored name differs from the plan's phrasing below
      }),
    ];

    const plan: CharacterVariantPlan = {
      contract_version: 1,
      character_plans: [],
      twin_detections: [
        {
          description: "fraternal sibling",
          source_character_key: "character-1",
          new_characters: [
            {
              name: "กันต์", // different phrasing from stored "กันต์ (เดิม)"
              existing_character_key: "character-1-sibling",
            },
          ],
        },
      ],
    } as any;

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    expect(summary.createdCharacters).toEqual([]);
    expect(summary.updatedCharacters).toEqual([]);
    expect(hoisted.characterRows).toHaveLength(2);
  });

  it("falls through gracefully (no crash) to the text-match path when existing_character_key on a twin doesn't resolve to any known row", async () => {
    hoisted.characterRows = [makeCharacterRow({ id: 1, characterKey: "character-1", name: "ใบเฟิร์น" })];

    const plan: CharacterVariantPlan = {
      contract_version: 1,
      character_plans: [],
      twin_detections: [
        {
          description: "identical twin",
          source_character_key: "character-1",
          new_characters: [
            {
              character_key_suggestion: "character-1-twin",
              name: "ใบตอง",
              role: "supporting",
              shares_face_with: "character-1",
              distinguishing_notes: "always wears glasses, short hair",
              existing_character_key: "character-does-not-exist",
            },
          ],
        },
      ],
    } as any;

    const summary = await reconcileCharacterVariantPlan(owner, plan);

    // No existing row matched (neither stable-ID nor text-match, since no
    // row exists yet at all) — falls through to a normal INSERT, same as the
    // no-marker case. Never throws.
    expect(summary.createdCharacters).toEqual([{ name: "ใบตอง", variantLabel: null }]);
    const twinRow = hoisted.characterRows.find((row) => row.name === "ใบตอง");
    expect(twinRow?.sharesFaceWithCharacterId).toBe(1);
  });
});
