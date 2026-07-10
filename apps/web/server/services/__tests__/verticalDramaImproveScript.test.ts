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
}));

vi.mock("../../db", () => {
  function makeBuilder(getData: () => unknown[]) {
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.where = () => builder;
    builder.limit = () => builder;
    builder.orderBy = () => builder;
    builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve(getData());
      } catch (err) {
        reject?.(err);
      }
    };
    return builder;
  }
  return {
    db: {
      select: vi.fn(() => makeBuilder(() => hoisted.seriesRows)),
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

import { getSkillByIdAsync } from "../skillRegistry";
import { resolveSkillExecutionPolicy } from "../skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "../skillModelFallback";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import type { EnabledLlmModelRow } from "../enabledLlmModels";
import { deductCreditsForModel } from "../creditService";
import {
  runImproveScriptJob,
  resolveQualityLargeContextModelId,
  VD_IMPROVE_SCRIPT_SKILL_ID,
} from "../verticalDramaImproveScript";

const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);
const mockResolveSkillExecutionPolicy = vi.mocked(resolveSkillExecutionPolicy);
const mockExecuteSkillLlmWithFallback = vi.mocked(executeSkillLlmWithFallback);
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockDeductCreditsForModel = vi.mocked(deductCreditsForModel);

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
