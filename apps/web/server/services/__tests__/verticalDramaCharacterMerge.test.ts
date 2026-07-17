/**
 * Coverage for `verticalDramaCharacterMerge.ts`'s PURE parts — occurrence
 * fact computation, evidence shaping, prompt assembly, the LLM-call layer
 * (mocked, mirroring `verticalDramaLocationDetector.test.ts`'s convention),
 * the LLM-plan-into-roster-partition reconciler, alias derivation, and the
 * `startFramePlan` character-key-swap rewrite core (mirroring
 * `verticalDramaShotCharacterRepair.test.ts`'s plain-object convention).
 *
 * `mergeCharacters`/`analyzeCharacterDuplicates` themselves (the DB
 * orchestrators) are NOT covered here — per this feature's own task brief,
 * only the pure parts are unit-tested without a database, same as
 * `verticalDramaShotCharacterRepair.ts`'s own `repairEpisodeShotCharacterReferences`
 * (DB orchestrator) having no dedicated test of its own, only its pure core.
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

import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { parseSkillFile } from "@smartspec/skills";
import fs from "fs";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "../verticalDramaImproveScript";
import {
  computeCharacterNameOccurrenceStats,
  computeCharacterDuplicateEvidence,
  buildCharacterDuplicateAnalyzerUserPrompt,
  generateCharacterDuplicateAnalysis,
  reconcileCharacterDuplicatePlanIntoGroups,
  deriveAliasesToRecordForGroup,
  computeCharacterKeySwapForShotRefs,
  computeCharacterKeySwapStartFramePlan,
  InsufficientCreditsError,
  VdSchemaValidationError,
  type VdCharacterDuplicateEvidence,
  type CharacterDuplicateAnalysisPlan,
  type GenerateCharacterDuplicateAnalysisParams,
} from "../verticalDramaCharacterMerge";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveModel.mockResolvedValue("gpt-4o-mini");
  mockResolveQualityModel.mockResolvedValue(null);
  mockCalculateCredits.mockReturnValue(4);
  mockDeductCredits.mockResolvedValue(undefined as any);
  mockResolveSkillDirCandidates.mockReturnValue([
    "/fake/skills/vertical-drama-character-identity-reconciler",
  ]);
  mockResolveSkillManifestPath.mockReturnValue(
    "/fake/skills/vertical-drama-character-identity-reconciler/skill.md",
  );
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
  mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
});

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

/* -------------------------------------------------------------------------- */
/* computeCharacterNameOccurrenceStats                                       */
/* -------------------------------------------------------------------------- */

describe("computeCharacterNameOccurrenceStats", () => {
  it("tallies exact-name shot-character and dialogue-speaker occurrences per episode, keeping different spellings distinct", () => {
    const stats = computeCharacterNameOccurrenceStats([
      {
        episodeNumber: 1,
        shots: [
          { characters: [{ name: "คิริน" }], dialogueLines: [{ speaker: "คิริน" }] },
          { characters: [{ name: "ลลิน" }] },
        ],
      },
      {
        episodeNumber: 3,
        shots: [{ characters: [{ name: "Kirin" }], dialogueLines: [{ speaker: "Kirin" }, { speaker: "Kirin" }] }],
      },
    ]);

    expect(stats.get("คิริน")).toEqual({
      shotCharacterOccurrences: 1,
      dialogueSpeakerOccurrences: 1,
      episodeNumbersSeenIn: [1],
    });
    expect(stats.get("Kirin")).toEqual({
      shotCharacterOccurrences: 1,
      dialogueSpeakerOccurrences: 2,
      episodeNumbersSeenIn: [3],
    });
    // Never conflated — a different exact spelling is a different key.
    expect(stats.has("คีริน")).toBe(false);
  });

  it("returns an empty map for no episodes/shots", () => {
    expect(computeCharacterNameOccurrenceStats([]).size).toBe(0);
    expect(computeCharacterNameOccurrenceStats([{ episodeNumber: 1, shots: [] }]).size).toBe(0);
  });

  it("ignores blank/whitespace-only names", () => {
    const stats = computeCharacterNameOccurrenceStats([
      { episodeNumber: 1, shots: [{ characters: [{ name: "  " }] }] },
    ]);
    expect(stats.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* computeCharacterDuplicateEvidence                                          */
/* -------------------------------------------------------------------------- */

describe("computeCharacterDuplicateEvidence", () => {
  it("builds one evidence row per roster row, flagging an exact bible-name match and attaching occurrence/alias facts", () => {
    const stats = computeCharacterNameOccurrenceStats([
      { episodeNumber: 1, shots: [{ characters: [{ name: "คิริน" }] }] },
    ]);
    const evidence = computeCharacterDuplicateEvidence({
      roster: [
        { characterId: 70, characterKey: "kirin", name: "คิริน วัฒนเมธา" },
        { characterId: 71, characterKey: "character-2", name: "คิริน", narrativeRole: null, roleTier: null },
      ],
      bibleCharacterNames: ["คิริน วัฒนเมธา"],
      occurrenceStatsByExactName: stats,
      aliasesByCharacterId: new Map([[71, ["คีริน"]]]),
    });

    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      characterId: 70,
      characterKey: "kirin",
      matchesBibleCharacterExactly: true,
      shotCharacterOccurrences: 0,
      existingAliases: [],
    });
    expect(evidence[1]).toMatchObject({
      characterId: 71,
      matchesBibleCharacterExactly: false,
      shotCharacterOccurrences: 1,
      existingAliases: ["คีริน"],
    });
  });

  it("defaults missing occurrence stats to zero and empty episode list", () => {
    const evidence = computeCharacterDuplicateEvidence({
      roster: [{ characterId: 1, characterKey: "x", name: "ไม่เคยปรากฏ" }],
      bibleCharacterNames: [],
      occurrenceStatsByExactName: new Map(),
      aliasesByCharacterId: new Map(),
    });
    expect(evidence[0].shotCharacterOccurrences).toBe(0);
    expect(evidence[0].dialogueSpeakerOccurrences).toBe(0);
    expect(evidence[0].episodeNumbersSeenIn).toEqual([]);
    expect(evidence[0].existingAliases).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* buildCharacterDuplicateAnalyzerUserPrompt                                  */
/* -------------------------------------------------------------------------- */

describe("buildCharacterDuplicateAnalyzerUserPrompt", () => {
  const evidence: VdCharacterDuplicateEvidence[] = [
    {
      characterId: 70,
      characterKey: "kirin",
      name: "คิริน วัฒนเมธา",
      narrativeRole: "protagonist",
      roleTier: "lead_male",
      roleReviewStatus: "ready",
      dataSource: "wizard_seed",
      matchesBibleCharacterExactly: true,
      shotCharacterOccurrences: 176,
      dialogueSpeakerOccurrences: 190,
      episodeNumbersSeenIn: [1, 2],
      existingAliases: [],
    },
  ];

  it("assembles only data facts — bible cast + roster evidence lines + season script, no authored instruction prose", () => {
    const prompt = buildCharacterDuplicateAnalyzerUserPrompt({
      lang: "th",
      bibleCharacters: [{ name: "คิริน วัฒนเมธา", narrativeRole: "protagonist", roleTier: "lead_male", occupation: "วิศวกร" }],
      evidence,
      episodes: [
        { episodeNumber: 1, workingTitle: "เริ่มต้น", logline: "...", keyBeats: [], shotDrafts: null },
      ],
    });

    expect(prompt).toContain("contract_version: 1");
    expect(prompt).toContain("locale: th");
    expect(prompt).toContain("- name=คิริน วัฒนเมธา narrative_role=protagonist role_tier=lead_male occupation=วิศวกร");
    expect(prompt).toContain(
      "- character_key=kirin name=คิริน วัฒนเมธา narrative_role=protagonist role_tier=lead_male role_review_status=ready data_source=wizard_seed shot_character_occurrences=176 dialogue_speaker_occurrences=190 episodes_seen_in=[1,2] existing_aliases=[]",
    );
    expect(prompt).toContain("ตอนที่ 1: เริ่มต้น");

    // No code-authored creative/instructional sentences — those live only in
    // skill.md.
    expect(prompt).not.toMatch(/cannot be solved by string similarity/i);
    expect(prompt).not.toMatch(/read this first/i);
  });

  it("falls back to labeled placeholders when bibleCharacters/evidence/episodes are empty", () => {
    const prompt = buildCharacterDuplicateAnalyzerUserPrompt({
      bibleCharacters: [],
      evidence: [],
      episodes: [],
    });
    expect(prompt).toContain("bible_characters:\n(none)");
    expect(prompt).toContain("roster:\n(none)");
    expect(prompt).toContain("season_script:\n(no drafted episodes)");
  });
});

/* -------------------------------------------------------------------------- */
/* generateCharacterDuplicateAnalysis                                        */
/* -------------------------------------------------------------------------- */

describe("generateCharacterDuplicateAnalysis", () => {
  function baseParams(
    overrides: Partial<GenerateCharacterDuplicateAnalysisParams> = {},
  ): GenerateCharacterDuplicateAnalysisParams {
    return {
      userId: 1,
      tenantId: "tenant-1",
      seriesId: 18,
      lang: "th",
      bibleCharacters: [{ name: "คิริน วัฒนเมธา" }],
      evidence: [],
      episodes: [],
      ...overrides,
    };
  }

  function validOutput(overrides: Partial<CharacterDuplicateAnalysisPlan> = {}): CharacterDuplicateAnalysisPlan {
    return {
      contract_version: 1,
      groups: [{ canonical_character_key: "kirin", duplicate_character_keys: [], reasoning: "ok", confidence: 0.9 }],
      ...overrides,
    } as CharacterDuplicateAnalysisPlan;
  }

  it("happy path: returns the validated plan, deducts credits once, prefers the quality large-context model", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveQualityModel.mockResolvedValue("quality/large-context-model");
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterDuplicateAnalysis(baseParams());

    expect(result.plan.groups).toHaveLength(1);
    expect(result.model).toBe("quality/large-context-model");
    expect(result.creditsUsed).toBe(4);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        tenantId: "tenant-1",
        sourceType: "skill",
        metadata: expect.objectContaining({ operation: "character_identity_reconciler" }),
      }),
    );
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    await expect(generateCharacterDuplicateAnalysis(baseParams())).rejects.toThrow(InsufficientCreditsError);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed output (empty groups[] fails min(1))", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse({ contract_version: 1, groups: [] }));
    await expect(generateCharacterDuplicateAnalysis(baseParams())).rejects.toThrow(VdSchemaValidationError);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* reconcileCharacterDuplicatePlanIntoGroups                                  */
/* -------------------------------------------------------------------------- */

function ev(overrides: Partial<VdCharacterDuplicateEvidence>): VdCharacterDuplicateEvidence {
  return {
    characterId: 1,
    characterKey: "x",
    name: "x",
    narrativeRole: null,
    roleTier: null,
    roleReviewStatus: null,
    dataSource: null,
    matchesBibleCharacterExactly: false,
    shotCharacterOccurrences: 0,
    dialogueSpeakerOccurrences: 0,
    episodeNumbersSeenIn: [],
    existingAliases: [],
    ...overrides,
  };
}

describe("reconcileCharacterDuplicatePlanIntoGroups", () => {
  it("groups duplicates under the model's chosen canonical when it already matches the bible", () => {
    const evidence = [
      ev({ characterId: 70, characterKey: "kirin", name: "คิริน วัฒนเมธา", matchesBibleCharacterExactly: true }),
      ev({ characterId: 71, characterKey: "character-2", name: "คีริน" }),
    ];
    const plan: CharacterDuplicateAnalysisPlan = {
      groups: [
        { canonical_character_key: "kirin", duplicate_character_keys: ["character-2"], reasoning: "same person", confidence: 0.9 },
      ],
    } as CharacterDuplicateAnalysisPlan;

    const groups = reconcileCharacterDuplicatePlanIntoGroups(plan, evidence);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      canonicalCharacterId: 70,
      canonicalCharacterKey: "kirin",
      duplicateCharacterIds: [71],
      isSingleton: false,
      autoFallback: false,
    });
  });

  it("OVERRIDES the model's canonical pick to whichever member exactly matches the bible name", () => {
    const evidence = [
      ev({ characterId: 71, characterKey: "character-2", name: "คีริน" }),
      ev({ characterId: 70, characterKey: "kirin", name: "คิริน วัฒนเมธา", matchesBibleCharacterExactly: true }),
    ];
    // Model (wrongly) picked the non-bible row as canonical.
    const plan: CharacterDuplicateAnalysisPlan = {
      groups: [
        { canonical_character_key: "character-2", duplicate_character_keys: ["kirin"], reasoning: "...", confidence: 0.7 },
      ],
    } as CharacterDuplicateAnalysisPlan;

    const groups = reconcileCharacterDuplicatePlanIntoGroups(plan, evidence);

    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalCharacterKey).toBe("kirin");
    expect(groups[0].duplicateCharacterIds).toEqual([71]);
  });

  it("drops an unknown/hallucinated character_key (best-effort skip) but keeps the rest of the group", () => {
    const evidence = [ev({ characterId: 70, characterKey: "kirin", name: "คิริน" })];
    const plan: CharacterDuplicateAnalysisPlan = {
      groups: [
        { canonical_character_key: "kirin", duplicate_character_keys: ["ghost-key"], reasoning: "...", confidence: 0.5 },
      ],
    } as CharacterDuplicateAnalysisPlan;

    const groups = reconcileCharacterDuplicatePlanIntoGroups(plan, evidence);

    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalCharacterKey).toBe("kirin");
    expect(groups[0].duplicateCharacterIds).toEqual([]);
    expect(groups[0].isSingleton).toBe(true);
  });

  it("first-occurrence wins when a character_key is double-listed across two group entries", () => {
    const evidence = [
      ev({ characterId: 70, characterKey: "kirin", name: "คิริน", matchesBibleCharacterExactly: true }),
      ev({ characterId: 71, characterKey: "character-2", name: "คีริน" }),
      ev({ characterId: 72, characterKey: "character-3", name: "กิริน" }),
    ];
    const plan: CharacterDuplicateAnalysisPlan = {
      groups: [
        { canonical_character_key: "kirin", duplicate_character_keys: ["character-2"], reasoning: "first", confidence: 0.9 },
        // "character-2" is already claimed — this second entry should only
        // pick up "character-3", not re-litigate "character-2".
        { canonical_character_key: "character-2", duplicate_character_keys: ["character-3"], reasoning: "second", confidence: 0.4 },
      ],
    } as CharacterDuplicateAnalysisPlan;

    const groups = reconcileCharacterDuplicatePlanIntoGroups(plan, evidence);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ canonicalCharacterKey: "kirin", duplicateCharacterIds: [71] });
    // Second entry: its own canonical ("character-2") was already claimed,
    // so its remaining unclaimed member ("character-3") becomes its own
    // group with that member as canonical.
    expect(groups[1]).toMatchObject({ canonicalCharacterKey: "character-3", duplicateCharacterIds: [] });
  });

  it("adds a singleton auto-fallback group for any roster row the plan never mentions", () => {
    const evidence = [
      ev({ characterId: 70, characterKey: "kirin", name: "คิริน" }),
      ev({ characterId: 99, characterKey: "orphan", name: "ไม่ถูกกล่าวถึง" }),
    ];
    const plan: CharacterDuplicateAnalysisPlan = {
      groups: [{ canonical_character_key: "kirin", duplicate_character_keys: [], reasoning: "solo", confidence: 1 }],
    } as CharacterDuplicateAnalysisPlan;

    const groups = reconcileCharacterDuplicatePlanIntoGroups(plan, evidence);

    expect(groups).toHaveLength(2);
    const orphanGroup = groups.find(g => g.canonicalCharacterKey === "orphan")!;
    expect(orphanGroup.autoFallback).toBe(true);
    expect(orphanGroup.isSingleton).toBe(true);
    expect(orphanGroup.confidence).toBe(0);
  });

  it("every roster character_key appears in exactly one returned group (full partition contract)", () => {
    const evidence = [
      ev({ characterId: 1, characterKey: "a", name: "A", matchesBibleCharacterExactly: true }),
      ev({ characterId: 2, characterKey: "b", name: "B" }),
      ev({ characterId: 3, characterKey: "c", name: "C" }),
    ];
    const plan: CharacterDuplicateAnalysisPlan = {
      groups: [{ canonical_character_key: "a", duplicate_character_keys: ["b"], reasoning: "", confidence: 0.6 }],
    } as CharacterDuplicateAnalysisPlan;

    const groups = reconcileCharacterDuplicatePlanIntoGroups(plan, evidence);
    const allKeysAcrossGroups = groups.flatMap(g => [g.canonicalCharacterKey, ...g.duplicates.map(d => d.characterKey)]);
    expect(new Set(allKeysAcrossGroups)).toEqual(new Set(["a", "b", "c"]));
    expect(allKeysAcrossGroups).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* deriveAliasesToRecordForGroup                                             */
/* -------------------------------------------------------------------------- */

describe("deriveAliasesToRecordForGroup", () => {
  it("returns each duplicate's name as an alias to record, excluding the canonical's own name", () => {
    const canonical = ev({ characterId: 70, characterKey: "kirin", name: "คิริน วัฒนเมธา" });
    const duplicates = [ev({ characterId: 71, name: "คิริน" }), ev({ characterId: 72, name: "Kirin" })];
    expect(deriveAliasesToRecordForGroup(canonical, duplicates)).toEqual(["คิริน", "Kirin"]);
  });

  it("excludes a name already recorded as an alias anywhere in the series", () => {
    const canonical = ev({ name: "คิริน วัฒนเมธา", existingAliases: ["คิริน"] });
    const duplicates = [ev({ name: "คิริน" }), ev({ name: "Kirin" })];
    expect(deriveAliasesToRecordForGroup(canonical, duplicates)).toEqual(["Kirin"]);
  });

  it("dedupes duplicates that normalize to the same alias", () => {
    const canonical = ev({ name: "คิริน วัฒนเมธา" });
    const duplicates = [ev({ characterId: 1, name: "คิริน" }), ev({ characterId: 2, name: "คิริน " })];
    expect(deriveAliasesToRecordForGroup(canonical, duplicates)).toEqual(["คิริน"]);
  });

  it("returns an empty array for a singleton group (no duplicates)", () => {
    expect(deriveAliasesToRecordForGroup(ev({ name: "โดดเดี่ยว" }), [])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* computeCharacterKeySwapForShotRefs / computeCharacterKeySwapStartFramePlan */
/* -------------------------------------------------------------------------- */

describe("computeCharacterKeySwapForShotRefs", () => {
  it("renames a merged key to the canonical key in place, marking changed", () => {
    const result = computeCharacterKeySwapForShotRefs(
      ["character-2", "lalin"],
      new Map([["character-2", "kirin"]]),
    );
    expect(result).toEqual({ refs: ["kirin", "lalin"], changed: true });
  });

  it("de-duplicates when a rename collides with an already-present key", () => {
    const result = computeCharacterKeySwapForShotRefs(
      ["kirin", "character-2"],
      new Map([["character-2", "kirin"]]),
    );
    expect(result).toEqual({ refs: ["kirin"], changed: true });
  });

  it("reports no change (and no new array) when no ref maps to a different key", () => {
    const refs = ["kirin", "lalin"];
    const result = computeCharacterKeySwapForShotRefs(refs, new Map([["character-2", "kirin"]]));
    expect(result).toEqual({ refs: ["kirin", "lalin"], changed: false });
  });
});

function startFramePlan(frames: VerticalDramaStartFramePlan["frames"]): VerticalDramaStartFramePlan {
  return { mode: "single_frame_per_shot", selectedImageModelId: "", frames };
}

describe("computeCharacterKeySwapStartFramePlan", () => {
  it("swaps a merged character's key for the canonical's key across every shot and clears the baked prompt", () => {
    const existingPlan = startFramePlan([
      {
        shotNumber: 1,
        imagePrompt: "Image 1 = คีริน",
        negativePrompt: "neg",
        requiredCharacterRefs: ["character-2", "lalin"],
        productReferenceAssetIds: [],
      },
    ]);

    const { updatedPlan, changedShots } = computeCharacterKeySwapStartFramePlan({
      existingPlan,
      keySwapMap: new Map([["character-2", "kirin"]]),
    });

    expect(changedShots).toEqual([
      { shotNumber: 1, beforeRefs: ["character-2", "lalin"], afterRefs: ["kirin", "lalin"], promptReset: true },
    ]);
    const shot1 = updatedPlan.frames[0];
    expect(shot1.requiredCharacterRefs).toEqual(["kirin", "lalin"]);
    expect(shot1.imagePrompt).toBe("");
    expect(shot1.negativePrompt).toBe("");
  });

  it("does not reset an already-empty prompt (promptReset: false) but still swaps the key", () => {
    const existingPlan = startFramePlan([
      {
        shotNumber: 1,
        imagePrompt: "",
        negativePrompt: "",
        requiredCharacterRefs: ["character-2"],
        productReferenceAssetIds: [],
      },
    ]);

    const { changedShots, updatedPlan } = computeCharacterKeySwapStartFramePlan({
      existingPlan,
      keySwapMap: new Map([["character-2", "kirin"]]),
    });

    expect(changedShots).toEqual([
      { shotNumber: 1, beforeRefs: ["character-2"], afterRefs: ["kirin"], promptReset: false },
    ]);
    expect(updatedPlan.frames[0].requiredCharacterRefs).toEqual(["kirin"]);
  });

  it("makes no change (byte-identical plan returned) when no ref uses a merged key", () => {
    const existingPlan = startFramePlan([
      {
        shotNumber: 1,
        imagePrompt: "unchanged",
        negativePrompt: "",
        requiredCharacterRefs: ["kirin"],
        productReferenceAssetIds: [],
      },
    ]);

    const { updatedPlan, changedShots } = computeCharacterKeySwapStartFramePlan({
      existingPlan,
      keySwapMap: new Map([["character-2", "kirin"]]),
    });

    expect(changedShots).toEqual([]);
    expect(updatedPlan).toBe(existingPlan);
  });

  it("handles a null existingPlan by returning an empty plan with no changes", () => {
    const { updatedPlan, changedShots } = computeCharacterKeySwapStartFramePlan({
      existingPlan: null,
      keySwapMap: new Map([["character-2", "kirin"]]),
    });
    expect(changedShots).toEqual([]);
    expect(updatedPlan.frames).toEqual([]);
  });

  it("short-circuits with no changes when keySwapMap is empty (series 18's trivial path — no plans at all either way)", () => {
    const existingPlan = startFramePlan([
      {
        shotNumber: 1,
        imagePrompt: "x",
        negativePrompt: "",
        requiredCharacterRefs: ["kirin"],
        productReferenceAssetIds: [],
      },
    ]);
    const { updatedPlan, changedShots } = computeCharacterKeySwapStartFramePlan({
      existingPlan,
      keySwapMap: new Map(),
    });
    expect(changedShots).toEqual([]);
    expect(updatedPlan).toBe(existingPlan);
  });
});
