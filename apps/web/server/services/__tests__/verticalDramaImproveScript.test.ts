/**
 * Coverage for `verticalDramaImproveScript.ts`'s 2026-07-10 WHOLE-BLOCK
 * RESTORATION (whole-season primary pass -> bounded per-episode straggler
 * redo) — see `/home/dev/.claude/plans/polished-toasting-gadget.md` for the
 * full incident history and validation that justified this rewrite. This
 * file replaces the earlier per-episode-primary era's test suite.
 *
 * Everything DB/LLM/credit-related is mocked (`../db`, `../skillRegistry`,
 * `../skillExecutionPolicy`, `../skillModelFallback`, `../enabledLlmModels`,
 * `../creditService`) — mirrors this codebase's own `skillCatalog.internal
 * .test.ts` convention for mocking `../db` with a minimal `vi.fn()` stub.
 * `verticalDramaStoryBible.ts`'s pure helpers (`getActiveBreakdown`,
 * `readItemShotDrafts`, `enforceEpisodeShotDraftSpeakability`, ...) and
 * `@shared/verticalDramaSeries/storyScriptText`'s formatter/parser are used
 * for real (no DB/network access), so the mocked LLM responses are built via
 * the REAL `formatStoryScriptEpisode`/`buildStoryScriptText` — guaranteeing
 * they round-trip through the REAL parser exactly like a genuine skill
 * response would.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStoryScriptText,
  formatStoryScriptEpisode,
  type StoryScriptEpisodeInput,
  type StoryScriptShotDraft,
} from "@shared/verticalDramaSeries/storyScriptText";

const hoisted = vi.hoisted(() => ({
  seriesRows: [] as unknown[],
  // `planning/vertical-drama-character-variants/plan.md` Phase B — the
  // job's new final phase queries `vertical_drama_characters` directly (see
  // `runImproveScriptJob`'s step (g)). Defaults to `[]` so every PRE-EXISTING
  // test in this file (none of which set this) never triggers the new
  // phase's `generateCharacterVariantPlan`/`reconcileCharacterVariantPlan`
  // calls at all (both empty-guarded on `characterInputs.length > 0`) —
  // zero behavior change for this file's original whole-block/straggler
  // coverage.
  characterRows: [] as unknown[],
}));

vi.mock("../../db", async () => {
  const { verticalDramaCharacters } = await vi.importActual<typeof import("../../../drizzle/schema")>(
    "../../../drizzle/schema",
  );
  return {
    db: {
      // Table-aware: `.from(verticalDramaCharacters)` resolves to
      // `hoisted.characterRows`, everything else (only `verticalDramaSeries`
      // in this file) resolves to `hoisted.seriesRows`, same as before this
      // Phase B addition.
      select: vi.fn(() => {
        const builder: Record<string, unknown> = {};
        let table: unknown = null;
        builder.from = (t: unknown) => {
          table = t;
          return builder;
        };
        builder.where = () => builder;
        builder.limit = () => builder;
        builder.orderBy = () => builder;
        builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
          try {
            resolve(table === verticalDramaCharacters ? hoisted.characterRows : hoisted.seriesRows);
          } catch (err) {
            reject?.(err);
          }
        };
        return builder;
      }),
    },
  };
});

vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(),
}));
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: vi.fn(),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../creditService", () => ({
  deductCreditsForModel: vi.fn(),
}));
// Phase B's final-phase wiring — fully mocked (never real) in this
// JOB-LEVEL test file; the service's own detailed reconciliation/prompt
// behavior is covered by `verticalDramaCharacterVariantPlanner.test.ts`.
// `extractCharacterRosterDescription` gets a small real-ish stand-in (not
// `vi.importActual`, to avoid re-entering the real
// `verticalDramaCharacterVariantPlanner.ts` <-> `verticalDramaImproveScript.ts`
// circular pair during this file's own module load) since it's called
// directly inside `runImproveScriptJob`'s wiring code, not just by the
// mocked `generateCharacterVariantPlan`.
vi.mock("../verticalDramaCharacterVariantPlanner", () => ({
  generateCharacterVariantPlan: vi.fn(),
  reconcileCharacterVariantPlan: vi.fn(),
  extractCharacterRosterDescription: vi.fn((data: Record<string, unknown> | null) =>
    data && typeof data.description === "string" ? data.description : "",
  ),
  logCharacterVariantPlanningFailure: vi.fn(),
}));

import { db } from "../../db";
import { getSkillByIdAsync } from "../skillRegistry";
import { resolveSkillExecutionPolicy } from "../skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "../skillModelFallback";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import type { EnabledLlmModelRow } from "../enabledLlmModels";
import { deductCreditsForModel } from "../creditService";
import {
  generateCharacterVariantPlan,
  reconcileCharacterVariantPlan,
} from "../verticalDramaCharacterVariantPlanner";
import {
  runImproveScriptJob,
  resolveQualityLargeContextModelId,
  selectQualityLargeContextEligibleModels,
  selectPremiumLargeContextEligibleModels,
  resolvePremiumLargeContextModelId,
  resolveStartFramePlanModel,
  resolveStoryboardModel,
  VD_IMPROVE_SCRIPT_SKILL_ID,
} from "../verticalDramaImproveScript";

const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);
const mockResolveSkillExecutionPolicy = vi.mocked(resolveSkillExecutionPolicy);
const mockExecuteSkillLlmWithFallback = vi.mocked(executeSkillLlmWithFallback);
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockDeductCreditsForModel = vi.mocked(deductCreditsForModel);
const mockGenerateCharacterVariantPlan = vi.mocked(generateCharacterVariantPlan);
const mockReconcileCharacterVariantPlan = vi.mocked(reconcileCharacterVariantPlan);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function buildNineShots(prefix: string): StoryScriptShotDraft[] {
  return Array.from({ length: 9 }, (_, i) => ({
    shot_number: i + 1,
    summary: `${prefix} สรุปช็อต ${i + 1}`,
    dialogue_lines: [{ speaker: "แม่", line: `${prefix} บทพูดช็อต ${i + 1} สวัสดีจ้ะลูก` }],
  }));
}

function buildStoredItem(episodeNumber: number): Record<string, unknown> {
  return {
    episodeNumber,
    workingTitle: `ตอนเดิม ${episodeNumber}`,
    logline: `เรื่องย่อเดิมตอน ${episodeNumber}`,
    keyBeats: [`จุดเดิม ${episodeNumber}`],
    shotDrafts: buildNineShots("เดิม"),
    draftCompleteness: {
      dialogueEveryShot: true,
      allSpeakable: true,
      estimatedSpeechSeconds: 40,
      coverageStatus: "ok",
    },
  };
}

function buildBible(episodeNumbers: number[]): Record<string, unknown> {
  return {
    breakdownVersions: [
      {
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdByUserId: 1,
        source: "generate_story",
        items: episodeNumbers.map(buildStoredItem),
      },
    ],
    activeBreakdownVersionId: "v1",
    expandedSeasonArc: "อาร์คซีซันทดสอบ",
  };
}

function buildSeriesRow(episodeNumbers: number[]) {
  return {
    id: 6,
    tenantId: "tenant-1",
    userId: 1,
    title: "ซีรีส์ทดสอบ",
    genre: "ดราม่า",
    tone: "อบอุ่น",
    locale: "th",
    bible: buildBible(episodeNumbers),
  };
}

function improvedEpisodeInput(episodeNumber: number, shotCount = 9): StoryScriptEpisodeInput {
  return {
    episodeNumber,
    workingTitle: `ตอนปรับปรุง ${episodeNumber}`,
    logline: `เรื่องย่อปรับปรุงตอน ${episodeNumber}`,
    keyBeats: [`จุดปรับปรุง ${episodeNumber}`],
    shotDrafts: buildNineShots(`ปรับปรุง${episodeNumber}`).slice(0, shotCount),
    cliffhangerLine: `จุดค้างตอน ${episodeNumber}`,
  };
}

/** Builds a well-formed whole-season body (score/summary header + every requested episode block, all 9 shots) — round-trips cleanly through the real parser. */
function buildWholeSeasonBody(episodeNumbers: number[]): string {
  const built = buildStoryScriptText({
    lang: "th",
    title: "ซีรีส์ทดสอบ",
    episodes: episodeNumbers.map((n) => improvedEpisodeInput(n)),
    fromEpisode: Math.min(...episodeNumbers),
    toEpisode: Math.max(...episodeNumbers),
  });
  return [
    "# ผลลัพธ์สุดท้าย",
    "",
    "**คะแนนหลังปรับปรุง: 8.5/10**",
    "สรุป: ปรับปรุงทั้งซีซันดีขึ้น",
    "",
    "---",
    "",
    built.text,
  ].join("\n");
}

function makeSuccessResult(content: string, modelId = "pinned/model") {
  return {
    success: true as const,
    content,
    modelId,
    provider: { providerName: "test-provider" } as never,
    inputTokens: 100,
    outputTokens: 200,
    rawData: { choices: [{ finish_reason: "stop" }] },
    attempts: [],
    totalDurationMs: 1,
  };
}

function extractEpisodeNumberFromUserContent(content: string): number {
  const match = content.match(/ตอนที่\s+(\d+):/);
  if (!match) {
    throw new Error("test setup error: could not find an episode header in the user message content");
  }
  return Number(match[1]);
}

function makeSkillDefinition() {
  return {
    id: VD_IMPROVE_SCRIPT_SKILL_ID,
    name: "Drama Script Evaluate & Improve",
    description: "test skill",
    icon: "sparkles",
    type: "chat-assistant" as const,
    triggers: [],
    requiresExplicit: true,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    systemPrompt: "SKILL_SYSTEM_PROMPT_MARKER",
  };
}

function makeModelRow(overrides: Partial<EnabledLlmModelRow>): EnabledLlmModelRow {
  return {
    providerId: 1,
    providerName: "test-provider",
    modelId: "test/model",
    providerModelId: "test/model",
    defaultModel: null,
    apiStyle: "chat-completions",
    supportsVision: null,
    supportsThinking: null,
    supportsFunctionTools: null,
    supportsStructuredOutputs: null,
    supportsJsonMode: null,
    supportsStrictToolSchema: null,
    supportsWebSearch: null,
    supportsCodeExecution: null,
    supportsComputerUse: null,
    supportsBackground: null,
    supportsResponses: null,
    contextLength: 2_000_000,
    priority: 50,
    priorityLocked: null,
    isFree: false,
    pricingInput: "1.00",
    pricingOutput: "2.00",
    catalogEligibility: "public-chat",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                       */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.seriesRows = [];
  hoisted.characterRows = [];

  mockGetSkillByIdAsync.mockResolvedValue(makeSkillDefinition() as never);
  // Explicit pin — `resolveImproveScriptExecutionPolicy` returns this as-is,
  // so `loadEnabledLlmModelRows` is never consulted unless a test overrides
  // this (only the dedicated `resolveQualityLargeContextModelId` tests below
  // exercise that path directly).
  mockResolveSkillExecutionPolicy.mockResolvedValue({
    modelId: "pinned/model",
    allowFreeModels: false,
    modelSource: "skill_llmModelId",
  });
  mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 1, wasFree: false });
});

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("runImproveScriptJob — whole-block primary pass", () => {
  it("(a) parses all episodes cleanly from a single whole-season call — no stragglers, no extra calls", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2, 3])];
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(buildWholeSeasonBody([1, 2, 3])));

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    // Exactly ONE call — the whole-season primary pass; no straggler redo needed.
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(1);
    const [request] = mockExecuteSkillLlmWithFallback.mock.calls[0];
    const userContent = String(request.messages[1]?.content ?? "");
    // The whole season is sent as ONE `original_script`, containing every episode.
    expect(userContent).toContain("ตอนที่ 1:");
    expect(userContent).toContain("ตอนที่ 2:");
    expect(userContent).toContain("ตอนที่ 3:");

    expect(result.expectedEpisodeNumbers).toEqual([1, 2, 3]);
    expect(result.improvedItems.map((item) => item.episodeNumber)).toEqual([1, 2, 3]);
    expect(result.needsReview).toBe(false);
    expect(result.partialFailureEpisodeNumbers).toEqual([]);
    expect(result.scoreSummary).toContain("คะแนนหลังปรับปรุง");
  });

  it("a leftover continuation marker trailing an otherwise-valid episode block does NOT force a straggler redo (real series-6 re-validation, 2026-07-10)", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2])];

    const episode1Block = formatStoryScriptEpisode("th", improvedEpisodeInput(1));
    const episode2Block = formatStoryScriptEpisode("th", improvedEpisodeInput(2));
    // The model sometimes emits the "more content follows" marker as a
    // natural episode-transition cue even when NOT actually truncated at
    // the API level (confirmed on real series-6 output) — episode 1's own
    // content here is fully valid and complete despite the trailing marker.
    const primaryBody = [
      "# ผลลัพธ์สุดท้าย",
      "",
      "**คะแนนหลังปรับปรุง: 8.5/10**",
      "",
      "---",
      "",
      episode1Block,
      "",
      "--- ต่อจากนี้เป็นเนื้อหาตอนถัดไป ---",
      "",
      episode2Block,
    ].join("\n");
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(primaryBody));

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    // Exactly ONE call — no straggler redo triggered by the harmless leftover marker.
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(1);
    expect(result.improvedItems.map((item) => item.episodeNumber).sort()).toEqual([1, 2]);
    expect(result.partialFailureEpisodeNumbers).toEqual([]);
    expect(result.needsReview).toBe(false);
  });

  it("(b) an episode returning 8 (not 9) shots in the primary pass becomes a straggler, then is fixed by the straggler redo", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2])];

    // Primary whole-season body: episode 2 malformed (8 shots).
    const built = buildStoryScriptText({
      lang: "th",
      episodes: [improvedEpisodeInput(1), improvedEpisodeInput(2, 8)],
      fromEpisode: 1,
      toEpisode: 2,
    });
    const primaryBody = ["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 8.0/10**", "", "---", "", built.text].join("\n");

    let callCount = 0;
    mockExecuteSkillLlmWithFallback.mockImplementation(async (request) => {
      callCount += 1;
      if (callCount === 1) {
        return makeSuccessResult(primaryBody);
      }
      // Straggler redo call — scoped to episode 2 only, corrected to 9 shots.
      const userContent = String(request.messages[1]?.content ?? "");
      const episodeNumber = extractEpisodeNumberFromUserContent(userContent);
      const block = formatStoryScriptEpisode("th", improvedEpisodeInput(episodeNumber, 9));
      return makeSuccessResult(["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 9.0/10**", "", "---", "", block].join("\n"));
    });

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(2);
    expect(result.improvedItems.map((item) => item.episodeNumber).sort()).toEqual([1, 2]);
    expect(result.needsReview).toBe(false);
    expect(result.partialFailureEpisodeNumbers).toEqual([]);
    const fixedEpisode2 = result.improvedItems.find((item) => item.episodeNumber === 2)!;
    expect((fixedEpisode2.shotDrafts ?? []).length).toBe(9);
  });

  it("(c) a duplicated episode header in the primary body marks that episode a straggler (dedup guard)", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2])];

    const episode1Block = formatStoryScriptEpisode("th", improvedEpisodeInput(1));
    const episode2Block = formatStoryScriptEpisode("th", improvedEpisodeInput(2));
    // Episode 1's header/body appears TWICE — simulates a continuation-round
    // repeat drift that the dedup-header guard must catch (never trust
    // `splitStoryScriptTextIntoEpisodeBlocks`' silent last-wins here).
    const primaryBody = [
      "# ผลลัพธ์สุดท้าย",
      "",
      "**คะแนนหลังปรับปรุง: 8.0/10**",
      "",
      "---",
      "",
      episode1Block,
      "",
      episode1Block,
      "",
      episode2Block,
    ].join("\n");

    let callCount = 0;
    mockExecuteSkillLlmWithFallback.mockImplementation(async (request) => {
      callCount += 1;
      if (callCount === 1) return makeSuccessResult(primaryBody);
      const userContent = String(request.messages[1]?.content ?? "");
      const episodeNumber = extractEpisodeNumberFromUserContent(userContent);
      const block = formatStoryScriptEpisode("th", improvedEpisodeInput(episodeNumber));
      return makeSuccessResult(["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 9.0/10**", "", "---", "", block].join("\n"));
    });

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    // Call 1 = primary whole-season pass; call 2 = straggler redo for episode 1 only.
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(2);
    const stragglerCallUserContent = String(mockExecuteSkillLlmWithFallback.mock.calls[1][0].messages[1]?.content ?? "");
    expect(extractEpisodeNumberFromUserContent(stragglerCallUserContent)).toBe(1);
    expect(result.improvedItems.map((item) => item.episodeNumber).sort()).toEqual([1, 2]);
    expect(result.needsReview).toBe(false);
  });

  it("(e) graceful degradation: a straggler that never fixes ends up in partialFailureEpisodeNumbers, needsReview stays false when others succeed", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2])];

    const built = buildStoryScriptText({
      lang: "th",
      episodes: [improvedEpisodeInput(1), improvedEpisodeInput(2, 8)],
      fromEpisode: 1,
      toEpisode: 2,
    });
    const primaryBody = ["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 8.0/10**", "", "---", "", built.text].join("\n");

    let callCount = 0;
    mockExecuteSkillLlmWithFallback.mockImplementation(async (request) => {
      callCount += 1;
      if (callCount === 1) return makeSuccessResult(primaryBody);
      // Every straggler-redo attempt for episode 2 keeps failing (still 8 shots).
      const userContent = String(request.messages[1]?.content ?? "");
      const episodeNumber = extractEpisodeNumberFromUserContent(userContent);
      const block = formatStoryScriptEpisode("th", improvedEpisodeInput(episodeNumber, 8));
      return makeSuccessResult(["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 8.0/10**", "", "---", "", block].join("\n"));
    });

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    // Call 1 (primary) + VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS (2) redo attempts for episode 2.
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(3);
    expect(result.improvedItems.map((item) => item.episodeNumber)).toEqual([1]);
    expect(result.partialFailureEpisodeNumbers).toEqual([2]);
    expect(result.needsReview).toBe(false);
    expect(result.needsReviewReasons).toEqual([]);
    expect(result.perEpisodeWarnings).toHaveLength(1);
    expect(result.perEpisodeWarnings[0]).toMatchObject({ episodeNumber: 2 });
  });

  it("needsReview is true when the whole-season pass AND every straggler redo fail (zero successes)", async () => {
    hoisted.seriesRows = [buildSeriesRow([1])];

    const built = buildStoryScriptText({
      lang: "th",
      episodes: [improvedEpisodeInput(1, 8)],
      fromEpisode: 1,
      toEpisode: 1,
    });
    const primaryBody = ["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 5.0/10**", "", "---", "", built.text].join("\n");

    // Every call (primary pass AND every straggler-redo attempt) returns a
    // malformed (8-shot) episode 1 — nothing ever verifies.
    mockExecuteSkillLlmWithFallback.mockImplementation(async (request) => {
      const userContent = String(request.messages[1]?.content ?? "");
      const episodeNumber = extractEpisodeNumberFromUserContent(userContent);
      const block = formatStoryScriptEpisode("th", improvedEpisodeInput(episodeNumber, 8));
      return makeSuccessResult(["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 5.0/10**", "", "---", "", block].join("\n"));
    });
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult(primaryBody));

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(result.improvedItems).toEqual([]);
    expect(result.needsReview).toBe(true);
    expect(result.needsReviewReasons.length).toBeGreaterThan(0);
    expect(result.partialFailureEpisodeNumbers).toEqual([1]);
  });
});

describe("resolveQualityLargeContextModelId", () => {
  it("(d) picks the cheapest THINKING-capable eligible model, skipping a cheaper non-thinking one", async () => {
    const rows: EnabledLlmModelRow[] = [
      makeModelRow({
        modelId: "cheaper-non-thinking",
        contextLength: 2_000_000,
        pricingInput: "0.10",
        pricingOutput: "0.10",
        supportsThinking: false,
      }),
      makeModelRow({
        modelId: "cheaper-thinking-unset",
        contextLength: 2_000_000,
        pricingInput: "0.15",
        pricingOutput: "0.15",
        supportsThinking: null,
      }),
      makeModelRow({
        modelId: "ineligible-cheap-thinking",
        contextLength: 2_000_000,
        pricingInput: "0.05",
        pricingOutput: "0.05",
        supportsThinking: true,
        catalogEligibility: "manual-only",
      }),
      makeModelRow({
        modelId: "free-cheap-thinking",
        contextLength: 2_000_000,
        pricingInput: "0.01",
        pricingOutput: "0.01",
        supportsThinking: true,
        isFree: true,
      }),
      makeModelRow({
        modelId: "too-small-context-thinking",
        contextLength: 500_000,
        pricingInput: "0.02",
        pricingOutput: "0.02",
        supportsThinking: true,
      }),
      makeModelRow({
        modelId: "eligible-expensive-thinking",
        contextLength: 1_050_000,
        pricingInput: "5.00",
        pricingOutput: "30.00",
        supportsThinking: true,
      }),
      makeModelRow({
        modelId: "eligible-cheapest-thinking",
        contextLength: 1_050_000,
        pricingInput: "0.25",
        pricingOutput: "1.50",
        supportsThinking: true,
      }),
    ];
    // Mirrors the REAL `loadEnabledLlmModelRows({ autoSelectionOnly: true })`
    // contract: catalog-ineligible rows are filtered out BEFORE they ever
    // reach this function, not by this function itself.
    mockLoadEnabledLlmModelRows.mockImplementation(async (options) =>
      options?.autoSelectionOnly ? rows.filter((row) => row.catalogEligibility === "public-chat") : rows,
    );

    const modelId = await resolveQualityLargeContextModelId();

    expect(mockLoadEnabledLlmModelRows).toHaveBeenCalledWith({ autoSelectionOnly: true });
    // "cheaper-non-thinking" (0.20 total) and "cheaper-thinking-unset"
    // (0.30 total, supportsThinking not `true`) are both cheaper than
    // "eligible-cheapest-thinking" (1.75 total) but must be skipped.
    expect(modelId).toBe("eligible-cheapest-thinking");
  });

  it("returns null when nothing meets the eligibility + context + non-free + thinking bar", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);

    const modelId = await resolveQualityLargeContextModelId();

    expect(modelId).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* selectQualityLargeContextEligibleModels / resolveStartFramePlanModel /     */
/* resolveStoryboardModel — manual LLM model override, now delegating to the  */
/* centralized `resolveVerticalDramaSeriesModel` resolver                    */
/* (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 1).      */
/* The resolver's own detailed override/fallback contract is covered by      */
/* `verticalDramaLlmModelPolicy.test.ts`; this block only verifies that both  */
/* scoped wrappers still delegate correctly with the same public signature.  */
/* -------------------------------------------------------------------------- */

describe("selectQualityLargeContextEligibleModels", () => {
  it("returns the FULL eligible set, sorted cheapest-first (not just the single winner)", () => {
    const rows: EnabledLlmModelRow[] = [
      makeModelRow({
        modelId: "ineligible-non-thinking",
        contextLength: 2_000_000,
        pricingInput: "0.01",
        pricingOutput: "0.01",
        supportsThinking: false,
      }),
      makeModelRow({
        modelId: "eligible-expensive",
        contextLength: 1_050_000,
        pricingInput: "5.00",
        pricingOutput: "5.00",
        supportsThinking: true,
      }),
      makeModelRow({
        modelId: "eligible-cheapest",
        contextLength: 1_050_000,
        pricingInput: "0.10",
        pricingOutput: "0.10",
        supportsThinking: true,
      }),
    ];

    const eligible = selectQualityLargeContextEligibleModels(rows);

    expect(eligible.map((row) => row.modelId)).toEqual(["eligible-cheapest", "eligible-expensive"]);
  });

  it("is the exact same filter resolveQualityLargeContextModelId delegates to (single source of truth)", async () => {
    const rows: EnabledLlmModelRow[] = [
      makeModelRow({
        modelId: "eligible-cheapest",
        contextLength: 1_050_000,
        pricingInput: "0.10",
        pricingOutput: "0.10",
        supportsThinking: true,
      }),
      makeModelRow({
        modelId: "eligible-expensive",
        contextLength: 1_050_000,
        pricingInput: "5.00",
        pricingOutput: "5.00",
        supportsThinking: true,
      }),
    ];
    mockLoadEnabledLlmModelRows.mockResolvedValue(rows);

    const winner = await resolveQualityLargeContextModelId();

    expect(winner).toBe(selectQualityLargeContextEligibleModels(rows)[0]?.modelId);
  });
});

/* -------------------------------------------------------------------------- */
/* selectPremiumLargeContextEligibleModels / resolvePremiumLargeContextModelId */
/* (2026-07-18, character-portrait lead-beauty-gate incident — FIX B) — the   */
/* mirror-image STRONGEST-first selector used ONLY by                        */
/* `resolveCharacterVisualBibleModel`                                        */
/* (`verticalDramaCharacterImageGeneration.ts`). Proves (1) it picks the      */
/* MOST expensive eligible model, the opposite of the cheapest-first sibling, */
/* and (2) it shares the exact same eligibility bar (never drifts) by        */
/* reusing `selectQualityLargeContextEligibleModels`'s own eligible set.      */
/* -------------------------------------------------------------------------- */

describe("selectPremiumLargeContextEligibleModels / resolvePremiumLargeContextModelId", () => {
  const ROWS: EnabledLlmModelRow[] = [
    makeModelRow({
      modelId: "ineligible-non-thinking-most-expensive",
      contextLength: 2_000_000,
      pricingInput: "50.00",
      pricingOutput: "50.00",
      supportsThinking: false,
    }),
    makeModelRow({
      modelId: "eligible-cheapest",
      contextLength: 1_050_000,
      pricingInput: "0.10",
      pricingOutput: "0.10",
      supportsThinking: true,
    }),
    makeModelRow({
      modelId: "eligible-mid",
      contextLength: 1_050_000,
      pricingInput: "1.00",
      pricingOutput: "1.00",
      supportsThinking: true,
    }),
    makeModelRow({
      modelId: "eligible-most-expensive",
      contextLength: 1_050_000,
      pricingInput: "5.00",
      pricingOutput: "30.00",
      supportsThinking: true,
    }),
  ];

  it("picks the MOST expensive eligible model — the opposite of the cheapest-first sibling", () => {
    const premiumOrder = selectPremiumLargeContextEligibleModels(ROWS).map((row) => row.modelId);
    const cheapOrder = selectQualityLargeContextEligibleModels(ROWS).map((row) => row.modelId);

    expect(premiumOrder).toEqual(["eligible-most-expensive", "eligible-mid", "eligible-cheapest"]);
    // Exact reverse of the cheapest-first sibling — same 3 eligible rows,
    // opposite order, proving the two selectors share one eligibility bar.
    expect(premiumOrder).toEqual([...cheapOrder].reverse());
    // The ineligible (non-thinking) row is excluded from BOTH regardless of
    // its price — being expensive never substitutes for eligibility.
    expect(premiumOrder).not.toContain("ineligible-non-thinking-most-expensive");
  });

  it("resolvePremiumLargeContextModelId resolves to the same winner selectPremiumLargeContextEligibleModels[0] picks", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue(ROWS);

    const winner = await resolvePremiumLargeContextModelId();

    expect(mockLoadEnabledLlmModelRows).toHaveBeenCalledWith({ autoSelectionOnly: true });
    expect(winner).toBe("eligible-most-expensive");
  });

  it("returns null when nothing meets the eligibility bar (best-effort, never throws)", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);

    const winner = await resolvePremiumLargeContextModelId();

    expect(winner).toBeNull();
  });

  it("best-effort: swallows a loadEnabledLlmModelRows rejection and returns null instead of throwing", async () => {
    mockLoadEnabledLlmModelRows.mockRejectedValue(new Error("db down"));

    await expect(resolvePremiumLargeContextModelId()).resolves.toBeNull();
  });
});

describe("resolveStartFramePlanModel / resolveStoryboardModel", () => {
  const ELIGIBLE_ROWS: EnabledLlmModelRow[] = [
    makeModelRow({
      modelId: "auto-cheapest-eligible",
      contextLength: 1_050_000,
      pricingInput: "0.10",
      pricingOutput: "0.10",
      supportsThinking: true,
    }),
    makeModelRow({
      modelId: "override-expensive-eligible",
      contextLength: 1_050_000,
      pricingInput: "5.00",
      pricingOutput: "5.00",
      supportsThinking: true,
    }),
  ];

  it("uses the series' defaultModelId override when it's set and still enabled", async () => {
    hoisted.seriesRows = [
      { llmModelPolicy: { defaultModelId: "override-expensive-eligible" } },
    ];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ELIGIBLE_ROWS);

    const modelId = await resolveStartFramePlanModel(6);

    expect(modelId).toBe("override-expensive-eligible");
  });

  it("applies the SAME defaultModelId override to resolveStoryboardModel too (series-wide, not per-stage)", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "override-expensive-eligible" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ELIGIBLE_ROWS);

    const modelId = await resolveStoryboardModel(6);

    expect(modelId).toBe("override-expensive-eligible");
  });

  it("falls back to automatic selection when the pinned override model is disabled/removed", async () => {
    hoisted.seriesRows = [
      { llmModelPolicy: { defaultModelId: "no-longer-in-catalog" } },
    ];
    // The override id is NOT present in this enabled set (simulating a
    // model that was disabled/removed after being pinned).
    mockLoadEnabledLlmModelRows.mockResolvedValue(ELIGIBLE_ROWS);

    const modelId = await resolveStartFramePlanModel(6);

    expect(modelId).toBe("auto-cheapest-eligible");
  });

  it("uses automatic selection when no override is configured (llmModelPolicy null)", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: null }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ELIGIBLE_ROWS);

    const modelId = await resolveStoryboardModel(6);

    expect(modelId).toBe("auto-cheapest-eligible");
  });

  it("uses automatic selection when the series row itself is missing", async () => {
    hoisted.seriesRows = [];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ELIGIBLE_ROWS);

    const modelId = await resolveStartFramePlanModel(999);

    expect(modelId).toBe("auto-cheapest-eligible");
  });

  it("never throws and falls all the way back to resolveStoryBibleModel's last resort when nothing is eligible at all", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: null }];
    // Empty catalog: resolveQualityLargeContextModelId -> null,
    // resolveStoryBibleModel (LAST_RESORT_MODEL) is the final fallback.
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);

    const modelId = await resolveStoryboardModel(6);

    expect(modelId).toBe("gpt-4o-mini");
  });

  it("never throws and falls back to automatic selection when the DB read itself fails", async () => {
    hoisted.seriesRows = [{ llmModelPolicy: { defaultModelId: "override-expensive-eligible" } }];
    mockLoadEnabledLlmModelRows.mockResolvedValue(ELIGIBLE_ROWS);
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("connection reset");
    });

    const modelId = await resolveStartFramePlanModel(6);

    expect(modelId).toBe("auto-cheapest-eligible");
  });
});

/* -------------------------------------------------------------------------- */
/* `planning/vertical-drama-character-variants/plan.md` Phase B —             */
/* runImproveScriptJob's new FINAL, best-effort character-variant-planning    */
/* phase. `generateCharacterVariantPlan`/`reconcileCharacterVariantPlan` are   */
/* fully mocked (see the top-of-file `vi.mock` block) — this file only        */
/* verifies the JOB-LEVEL wiring (when the phase runs, what it's called with, */
/* how its result merges in, and that a failure never fails the job); the     */
/* service's own prompt/reconciliation behavior is covered by                 */
/* `verticalDramaCharacterVariantPlanner.test.ts`.                            */
/* -------------------------------------------------------------------------- */

describe("runImproveScriptJob — character-variant-planning final phase", () => {
  function characterRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      characterKey: "character-1",
      name: "หนูนา",
      role: "protagonist",
      data: { description: "หญิงสาววัย 22 ปี" },
      parentCharacterId: null,
      ...overrides,
    };
  }

  function planSummary(overrides: Record<string, unknown> = {}) {
    return {
      createdCharacters: [{ name: "หนูนา", variantLabel: "ชุดนักเรียน" }],
      updatedCharacters: [],
      ...overrides,
    };
  }

  it("runs after a successful whole-block pass, sends the standalone roster + merged episode content, and merges the summary + credits into the job result", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2])];
    hoisted.characterRows = [characterRow()];
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(buildWholeSeasonBody([1, 2])));
    mockGenerateCharacterVariantPlan.mockResolvedValue({
      plan: { contract_version: 1, character_plans: [], twin_detections: [] },
      creditsUsed: 2,
      model: "variant-planner-model",
    });
    mockReconcileCharacterVariantPlan.mockResolvedValue(planSummary());

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(mockGenerateCharacterVariantPlan).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateCharacterVariantPlan.mock.calls[0][0];
    expect(callArgs.characters).toEqual([
      { characterKey: "character-1", name: "หนูนา", role: "protagonist", description: "หญิงสาววัย 22 ปี" },
    ]);
    expect(callArgs.episodes.map((e: { episodeNumber: number }) => e.episodeNumber)).toEqual([1, 2]);

    expect(mockReconcileCharacterVariantPlan).toHaveBeenCalledTimes(1);
    expect(mockReconcileCharacterVariantPlan).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 1, seriesId: 6 },
      { contract_version: 1, character_plans: [], twin_detections: [] },
    );

    expect(result.characterVariantSummary).toEqual(planSummary());
    // Baseline job credits (1 whole-block round, mocked at 1 credit) + the
    // variant-planning phase's own 2 credits.
    expect(result.creditsUsed).toBe(3);
  });

  it("does not invoke the phase when the improve pass produced nothing usable (needsReview)", async () => {
    hoisted.seriesRows = [buildSeriesRow([1])];
    hoisted.characterRows = [characterRow()];

    const built = buildStoryScriptText({
      lang: "th",
      episodes: [improvedEpisodeInput(1, 8)],
      fromEpisode: 1,
      toEpisode: 1,
    });
    const primaryBody = ["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 5.0/10**", "", "---", "", built.text].join("\n");
    mockExecuteSkillLlmWithFallback.mockImplementation(async (request) => {
      const userContent = String(request.messages[1]?.content ?? "");
      const episodeNumber = extractEpisodeNumberFromUserContent(userContent);
      const block = formatStoryScriptEpisode("th", improvedEpisodeInput(episodeNumber, 8));
      return makeSuccessResult(["# ผลลัพธ์สุดท้าย", "", "**คะแนนหลังปรับปรุง: 5.0/10**", "", "---", "", block].join("\n"));
    });
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult(primaryBody));

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(result.needsReview).toBe(true);
    expect(mockGenerateCharacterVariantPlan).not.toHaveBeenCalled();
    expect(mockReconcileCharacterVariantPlan).not.toHaveBeenCalled();
    expect(result.characterVariantSummary).toBeNull();
  });

  it("does not invoke the phase when the series has no standalone characters", async () => {
    hoisted.seriesRows = [buildSeriesRow([1])];
    hoisted.characterRows = []; // no roster at all
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(buildWholeSeasonBody([1])));

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(result.needsReview).toBe(false);
    expect(mockGenerateCharacterVariantPlan).not.toHaveBeenCalled();
    expect(result.characterVariantSummary).toBeNull();
  });

  it("includes an existing variant row in the roster sent to the planner, carrying existing_parent_character_key/existing_variant_label markers (W3 stable-ID reconcile)", async () => {
    hoisted.seriesRows = [buildSeriesRow([1])];
    hoisted.characterRows = [
      characterRow(),
      characterRow({
        id: 2,
        characterKey: "character-1-school",
        variantLabel: "ชุดนักเรียน",
        parentCharacterId: 1,
        data: { description: "school uniform" },
      }),
    ];
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(buildWholeSeasonBody([1])));
    mockGenerateCharacterVariantPlan.mockResolvedValue({
      plan: { contract_version: 1, character_plans: [], twin_detections: [] },
      creditsUsed: 0,
      model: "variant-planner-model",
    });
    mockReconcileCharacterVariantPlan.mockResolvedValue(planSummary({ createdCharacters: [], updatedCharacters: [] }));

    await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    const callArgs = mockGenerateCharacterVariantPlan.mock.calls[0][0];
    expect(callArgs.characters).toHaveLength(2);
    expect(callArgs.characters[0]).toEqual({
      characterKey: "character-1",
      name: "หนูนา",
      role: "protagonist",
      description: "หญิงสาววัย 22 ปี",
    });
    expect(callArgs.characters[1]).toEqual({
      characterKey: "character-1-school",
      name: "หนูนา",
      role: "protagonist",
      description: "school uniform",
      existingParentCharacterKey: "character-1",
      existingVariantLabel: "ชุดนักเรียน",
    });
  });

  it("includes an existing twin row in the roster sent to the planner, carrying an existing_shares_face_with_character_key marker (W3 stable-ID reconcile)", async () => {
    hoisted.seriesRows = [buildSeriesRow([1])];
    hoisted.characterRows = [
      characterRow(),
      characterRow({
        id: 3,
        characterKey: "character-1-twin",
        name: "ใบตอง",
        data: { description: "wears glasses" },
        sharesFaceWithCharacterId: 1,
      }),
    ];
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(buildWholeSeasonBody([1])));
    mockGenerateCharacterVariantPlan.mockResolvedValue({
      plan: { contract_version: 1, character_plans: [], twin_detections: [] },
      creditsUsed: 0,
      model: "variant-planner-model",
    });
    mockReconcileCharacterVariantPlan.mockResolvedValue(planSummary({ createdCharacters: [], updatedCharacters: [] }));

    await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    const callArgs = mockGenerateCharacterVariantPlan.mock.calls[0][0];
    expect(callArgs.characters).toHaveLength(2);
    expect(callArgs.characters[1]).toEqual({
      characterKey: "character-1-twin",
      name: "ใบตอง",
      role: "protagonist",
      description: "wears glasses",
      existingSharesFaceWithCharacterKey: "character-1",
    });
  });

  it("best-effort: a failure in generateCharacterVariantPlan never fails the overall job — characterVariantSummary is null, everything else unaffected", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2])];
    hoisted.characterRows = [characterRow()];
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(buildWholeSeasonBody([1, 2])));
    mockGenerateCharacterVariantPlan.mockRejectedValue(new Error("variant planner boom"));

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(result.needsReview).toBe(false);
    expect(result.improvedItems.map((item) => item.episodeNumber)).toEqual([1, 2]);
    expect(result.characterVariantSummary).toBeNull();
    expect(mockReconcileCharacterVariantPlan).not.toHaveBeenCalled();
  });

  it("best-effort: a failure in reconcileCharacterVariantPlan never fails the overall job", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2])];
    hoisted.characterRows = [characterRow()];
    mockExecuteSkillLlmWithFallback.mockResolvedValue(makeSuccessResult(buildWholeSeasonBody([1, 2])));
    mockGenerateCharacterVariantPlan.mockResolvedValue({
      plan: { contract_version: 1, character_plans: [], twin_detections: [] },
      creditsUsed: 1,
      model: "variant-planner-model",
    });
    mockReconcileCharacterVariantPlan.mockRejectedValue(new Error("db write boom"));

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(result.needsReview).toBe(false);
    expect(result.improvedItems.map((item) => item.episodeNumber)).toEqual([1, 2]);
    expect(result.characterVariantSummary).toBeNull();
  });
});
