/**
 * Coverage for `verticalDramaImproveScript.ts`'s 2026-07-10 per-episode
 * rewrite (fixes the "shallow whole-season output" + "wrong model selected"
 * production incident on series 6 — see the plan doc + the source file's own
 * header comment for full incident context).
 *
 * Everything DB/LLM/credit-related is mocked (`../db`, `../skillRegistry`,
 * `../skillExecutionPolicy`, `../skillModelFallback`, `../enabledLlmModels`,
 * `../creditService`) — mirrors this codebase's own `skillCatalog.internal
 * .test.ts` convention for mocking `../db` with a minimal `vi.fn()` stub.
 * `verticalDramaStoryBible.ts`'s pure helpers (`getActiveBreakdown`,
 * `readItemShotDrafts`, `enforceEpisodeShotDraftSpeakability`, ...) and
 * `@shared/verticalDramaSeries/storyScriptText`'s formatter/parser are used
 * for real (no DB/network access), so the mocked LLM responses are built via
 * the REAL `formatStoryScriptEpisode` — guaranteeing they round-trip through
 * the REAL `parseStoryScriptEpisodeBlock` exactly like a genuine skill
 * response would.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatStoryScriptEpisode, type StoryScriptShotDraft } from "@shared/verticalDramaSeries/storyScriptText";

const hoisted = vi.hoisted(() => ({
  seriesRows: [] as unknown[],
  characterRows: [] as unknown[],
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
      select: vi.fn((columns?: unknown) =>
        columns ? makeBuilder(() => hoisted.characterRows) : makeBuilder(() => hoisted.seriesRows),
      ),
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
  resolveCheapestEligibleLargeContextModelId,
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

function buildSuccessResponseContent(episodeNumber: number): string {
  const block = formatStoryScriptEpisode("th", {
    episodeNumber,
    workingTitle: `ตอนปรับปรุง ${episodeNumber}`,
    logline: `เรื่องย่อปรับปรุงตอน ${episodeNumber}`,
    keyBeats: [`จุดปรับปรุง ${episodeNumber}`],
    shotDrafts: buildNineShots(`ปรับปรุง${episodeNumber}`),
    cliffhangerLine: `จุดค้างตอน ${episodeNumber}`,
  });
  return [
    "# ผลลัพธ์สุดท้าย",
    "",
    "**คะแนนหลังปรับปรุง: 8.5/10**",
    `สรุป: ปรับปรุงตอน ${episodeNumber} ดีขึ้น`,
    "",
    "---",
    "",
    block,
  ].join("\n");
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

let failingEpisodeNumbers: Set<number>;

beforeEach(() => {
  // `vi.clearAllMocks()` (not `resetAllMocks()`) — the `../../db` mock's
  // `select` implementation is set once in the `vi.mock` factory above (not
  // re-assigned per test), and `resetAllMocks()` would strip that
  // implementation along with every other mock's.
  vi.clearAllMocks();
  hoisted.seriesRows = [];
  hoisted.characterRows = [];
  failingEpisodeNumbers = new Set();

  mockGetSkillByIdAsync.mockResolvedValue(makeSkillDefinition() as never);
  // Explicit pin — `resolveImproveScriptExecutionPolicy` returns this as-is,
  // so `loadEnabledLlmModelRows` is never consulted for tests (a)-(d) (only
  // the dedicated `resolveCheapestEligibleLargeContextModelId` tests below
  // exercise that path directly).
  mockResolveSkillExecutionPolicy.mockResolvedValue({
    modelId: "pinned/model",
    allowFreeModels: false,
    modelSource: "skill_llmModelId",
  });
  mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 1, wasFree: false });

  mockExecuteSkillLlmWithFallback.mockImplementation(async (request) => {
    const userContent = String(request.messages[1]?.content ?? "");
    const episodeNumber = extractEpisodeNumberFromUserContent(userContent);
    if (failingEpisodeNumbers.has(episodeNumber)) {
      return {
        success: false,
        error: `simulated failure for episode ${episodeNumber}`,
        attempts: [],
        totalDurationMs: 1,
      };
    }
    return {
      success: true,
      content: buildSuccessResponseContent(episodeNumber),
      modelId: "pinned/model",
      provider: { providerName: "test-provider" } as never,
      inputTokens: 100,
      outputTokens: 200,
      rawData: { choices: [{ finish_reason: "stop" }] },
      attempts: [],
      totalDurationMs: 1,
    };
  });
});

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("runImproveScriptJob — per-episode generation", () => {
  it("(a) makes one skill call per drafted episode, not one whole-season call", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2, 3])];

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalledTimes(3);
    expect(result.expectedEpisodeNumbers).toEqual([1, 2, 3]);
    expect(result.improvedItems.map((item) => item.episodeNumber)).toEqual([1, 2, 3]);
    expect(result.needsReview).toBe(false);
  });

  it("(b) includes the season reference block in every episode's SYSTEM message", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2, 3])];

    await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(mockExecuteSkillLlmWithFallback.mock.calls.length).toBeGreaterThan(0);
    for (const [request] of mockExecuteSkillLlmWithFallback.mock.calls) {
      const systemContent = String(request.messages[0]?.content ?? "");
      expect(systemContent).toContain("season_reference_context");
      // Never part of the USER message (skill.md §2's two-field contract).
      const userContent = String(request.messages[1]?.content ?? "");
      expect(userContent).not.toContain("season_reference_context");
    }
  });

  it("(c) gracefully degrades — one episode's LLM failure doesn't discard the others' good results", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2, 3])];
    failingEpisodeNumbers = new Set([2]);

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(result.improvedItems.map((item) => item.episodeNumber)).toEqual([1, 3]);
    expect(result.partialFailureEpisodeNumbers).toEqual([2]);
    expect(result.needsReview).toBe(false);
    expect(result.needsReviewReasons).toEqual([]);
    expect(result.perEpisodeWarnings).toHaveLength(1);
    expect(result.perEpisodeWarnings[0]).toMatchObject({ episodeNumber: 2 });
    expect(result.perEpisodeWarnings[0].reasons.join(" ")).toContain("2");
    // Every episode (success or failure) still appears in rawText.
    expect(result.rawText).toContain("ตอนที่ 1 ");
    expect(result.rawText).toContain("ตอนที่ 2 ");
    expect(result.rawText).toContain("ตอนที่ 3 ");
  });

  it("(d) needsReview is true only when ALL episodes fail (zero successes)", async () => {
    hoisted.seriesRows = [buildSeriesRow([1, 2, 3])];
    failingEpisodeNumbers = new Set([1, 2, 3]);

    const result = await runImproveScriptJob(
      { tenantId: "tenant-1", userId: 1, seriesId: 6, userRevisionRequest: "ทำให้ดีขึ้น" },
      vi.fn(),
    );

    expect(result.improvedItems).toEqual([]);
    expect(result.needsReview).toBe(true);
    expect(result.needsReviewReasons.length).toBeGreaterThan(0);
    expect(result.partialFailureEpisodeNumbers).toEqual([1, 2, 3]);
    expect(result.perEpisodeWarnings).toHaveLength(3);
  });
});

describe("resolveCheapestEligibleLargeContextModelId", () => {
  it("(e) picks the cheapest eligible, non-free, >=1M-context model — skipping a cheaper-but-ineligible and a cheaper-but-free row", async () => {
    const rows: EnabledLlmModelRow[] = [
      makeModelRow({
        modelId: "ineligible-cheap",
        contextLength: 2_000_000,
        pricingInput: "0.10",
        pricingOutput: "0.10",
        catalogEligibility: "manual-only",
      }),
      makeModelRow({
        modelId: "free-cheap",
        contextLength: 2_000_000,
        pricingInput: "0.01",
        pricingOutput: "0.01",
        isFree: true,
      }),
      makeModelRow({
        modelId: "too-small-context",
        contextLength: 500_000,
        pricingInput: "0.05",
        pricingOutput: "0.05",
      }),
      makeModelRow({
        modelId: "eligible-expensive",
        contextLength: 1_050_000,
        pricingInput: "5.00",
        pricingOutput: "30.00",
      }),
      makeModelRow({
        modelId: "eligible-cheapest",
        contextLength: 1_050_000,
        pricingInput: "2.50",
        pricingOutput: "15.00",
      }),
    ];
    // Mirrors the REAL `loadEnabledLlmModelRows({ autoSelectionOnly: true })`
    // contract: catalog-ineligible rows are filtered out BEFORE they ever
    // reach this function, not by this function itself.
    mockLoadEnabledLlmModelRows.mockImplementation(async (options) =>
      options?.autoSelectionOnly ? rows.filter((row) => row.catalogEligibility === "public-chat") : rows,
    );

    const modelId = await resolveCheapestEligibleLargeContextModelId();

    expect(mockLoadEnabledLlmModelRows).toHaveBeenCalledWith({ autoSelectionOnly: true });
    expect(modelId).toBe("eligible-cheapest");
  });

  it("returns null when nothing meets the eligibility + context + non-free bar", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);

    const modelId = await resolveCheapestEligibleLargeContextModelId();

    expect(modelId).toBeNull();
  });
});
