/**
 * Coverage for `verticalDramaStoryBible.ts`'s story-density reform additions
 * (spec §7.7.2 Layer 1, section-13, added 2026-07-07):
 *  - `generateStoryBible`'s prompt states the per-episode speech budget and
 *    requires a `contentBudget` per breakdown item ONLY when
 *    `opts.speechBudgetEnabled` is true (flag-off is byte-identical);
 *  - `episodeBreakdownItemSchema` accepts an optional `contentBudget`;
 *  - the pure breakdown-versioning helpers (`readBreakdownVersions`,
 *    `appendBreakdownVersion`, `getActiveBreakdown`, `deriveLegacyContentBudget`).
 *
 * Mirrors `verticalDramaScriptGeneration.memoryBundle.test.ts`'s mocking
 * pattern for the LLM-call-based tests.
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

import {
  generateStoryBible,
  readBreakdownVersions,
  appendBreakdownVersion,
  getActiveBreakdown,
  deriveLegacyContentBudget,
  type StoredEpisodeBreakdownItem,
} from "../verticalDramaStoryBible";
import { deriveDefaultContentBudget } from "@shared/verticalDramaSeries/contentBudget";

/* -------------------------------------------------------------------------- */
/* generateStoryBible — prompt + schema                                       */
/* -------------------------------------------------------------------------- */

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 10,
    title: "Test Series",
    locale: "th" as const,
    genre: "romance",
    tone: "dramatic",
    targetEpisodeCount: 2,
    bible: {},
    ...overrides,
  };
}

function validExpandedResponse(episodeBreakdownOverrides: Record<string, unknown>[] = []) {
  const defaultBreakdown = [
    { episodeNumber: 1, workingTitle: "Ep1", logline: "Logline 1", keyBeats: ["Beat 1"] },
    { episodeNumber: 2, workingTitle: "Ep2", logline: "Logline 2", keyBeats: ["Beat 2"] },
  ];
  return {
    expandedSeasonArc: "A grand season arc",
    refinedCharacters: [{ name: "Aria", role: "lead", description: "The protagonist" }],
    episodeBreakdown:
      episodeBreakdownOverrides.length > 0
        ? episodeBreakdownOverrides
        : defaultBreakdown,
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

describe("generateStoryBible — speech-budget prompt (flag-gated)", () => {
  it("states the per-episode speech budget and requires contentBudget when opts.speechBudgetEnabled is true", async () => {
    mockLlmResponse(validExpandedResponse());

    await generateStoryBible(
      baseParams({ episodeDurationSeconds: 60, opts: { speechBudgetEnabled: true } }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === "system");
    expect(systemMessage.content).toContain("contentBudget");
    expect(systemMessage.content).toContain("beatCount");
    expect(systemMessage.content).toContain("conflictLevel");
    expect(systemMessage.content).toContain("reversalTarget");
    expect(systemMessage.content).toContain("arcThreads");
    // MIN_EPISODE_COVERAGE_RATIO (0.58) * 60s = 34.8 -> ceil -> 35
    expect(systemMessage.content).toContain("35");
  });

  it("omits the speech-budget text entirely when the flag is off (byte-identical to before)", async () => {
    mockLlmResponse(validExpandedResponse());

    await generateStoryBible(baseParams());

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === "system");
    expect(systemMessage.content).not.toContain("contentBudget");
  });

  it("omits the speech-budget text when opts is provided but speechBudgetEnabled is false", async () => {
    mockLlmResponse(validExpandedResponse());

    await generateStoryBible(baseParams({ opts: { speechBudgetEnabled: false } }));

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === "system");
    expect(systemMessage.content).not.toContain("contentBudget");
  });
});

describe("generateStoryBible — episodeBreakdownItemSchema contentBudget superset", () => {
  it("round-trips a NEW breakdown item's contentBudget when the LLM includes it", async () => {
    const contentBudget = {
      beatCount: 6,
      estimatedSpeechSeconds: 36,
      conflictLevel: 2,
      reversalTarget: 2,
      arcThreads: ["romance thread"],
    };
    mockLlmResponse(
      validExpandedResponse([
        { episodeNumber: 1, workingTitle: "Ep1", logline: "Logline 1", keyBeats: ["Beat 1"], contentBudget },
      ]),
    );

    const result = await generateStoryBible(
      baseParams({ targetEpisodeCount: 1, opts: { speechBudgetEnabled: true } }),
    );

    expect(result.expanded.episodeBreakdown[0].contentBudget).toEqual(contentBudget);
  });

  it("still validates a legacy breakdown item that omits contentBudget (byte-identical schema)", async () => {
    mockLlmResponse(
      validExpandedResponse([
        { episodeNumber: 1, workingTitle: "Ep1", logline: "Logline 1", keyBeats: ["Beat 1"] },
      ]),
    );

    const result = await generateStoryBible(baseParams({ targetEpisodeCount: 1 }));

    expect(result.expanded.episodeBreakdown[0].contentBudget).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Breakdown-versioning pure helpers                                          */
/* -------------------------------------------------------------------------- */

function item(episodeNumber: number, withBudget = true): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: ["A beat"],
    ...(withBudget
      ? {
          contentBudget: {
            beatCount: 6,
            estimatedSpeechSeconds: 35,
            conflictLevel: 2,
            reversalTarget: 2,
            arcThreads: [],
          },
        }
      : {}),
  };
}

describe("readBreakdownVersions", () => {
  it("returns [] when bible is null/undefined/empty", () => {
    expect(readBreakdownVersions(null)).toEqual([]);
    expect(readBreakdownVersions(undefined)).toEqual([]);
    expect(readBreakdownVersions({})).toEqual([]);
  });

  it("returns [] when breakdownVersions fails schema validation (never throws)", () => {
    expect(readBreakdownVersions({ breakdownVersions: "not-an-array" })).toEqual([]);
    expect(readBreakdownVersions({ breakdownVersions: [{ missing: "fields" }] })).toEqual([]);
  });

  it("returns parsed versions when present and valid", () => {
    const bible = {
      breakdownVersions: [
        {
          versionId: "v1",
          createdAt: "2026-01-01T00:00:00.000Z",
          createdByUserId: 1,
          source: "generate_story",
          items: [item(1)],
        },
      ],
    };
    const versions = readBreakdownVersions(bible);
    expect(versions).toHaveLength(1);
    expect(versions[0].versionId).toBe("v1");
  });
});

describe("appendBreakdownVersion", () => {
  it("never mutates the input bible and returns a brand-new object", () => {
    const bible = { someField: "value" };
    const snapshot = JSON.parse(JSON.stringify(bible));

    const result = appendBreakdownVersion(bible, {
      source: "generate_story",
      items: [item(1)],
      createdByUserId: 7,
    });

    expect(bible).toEqual(snapshot);
    expect(result).not.toBe(bible);
    expect(result.someField).toBe("value");
  });

  it("appends a version and moves activeBreakdownVersionId to point at it", () => {
    const result = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [item(1)],
        createdByUserId: 7,
        versionId: "fixed-version-id",
        createdAt: "2026-07-07T00:00:00.000Z",
      },
    );

    expect(result.activeBreakdownVersionId).toBe("fixed-version-id");
    expect(result.breakdownVersions).toEqual([
      {
        versionId: "fixed-version-id",
        createdAt: "2026-07-07T00:00:00.000Z",
        createdByUserId: 7,
        source: "generate_story",
        items: [item(1)],
      },
    ]);
  });

  it("is append-only: a second call preserves the first version untouched", () => {
    const afterFirst = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [item(1)],
        createdByUserId: 1,
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    );
    const afterSecond = appendBreakdownVersion(afterFirst, {
      source: "arc_replan",
      items: [item(1), item(2)],
      createdByUserId: 2,
      versionId: "v2",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    const versions = afterSecond.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(2);
    expect(versions[0]).toEqual((afterFirst.breakdownVersions as Array<Record<string, unknown>>)[0]);
    expect(afterSecond.activeBreakdownVersionId).toBe("v2");
  });
});

describe("getActiveBreakdown", () => {
  it("returns [] for an empty/null bible", () => {
    expect(getActiveBreakdown(null)).toEqual([]);
    expect(getActiveBreakdown({})).toEqual([]);
  });

  it("falls back to the legacy flat episodeBreakdown array when no versions exist", () => {
    const bible = { episodeBreakdown: [item(1), item(2)] };
    const active = getActiveBreakdown(bible);
    expect(active.map(i => i.episodeNumber)).toEqual([1, 2]);
  });

  it("returns the version pointed to by activeBreakdownVersionId when versions exist", () => {
    const bible = appendBreakdownVersion(
      { episodeBreakdown: [item(1)] }, // legacy field ignored once versions exist
      { source: "generate_story", items: [item(1), item(2)], createdByUserId: 1 },
    );
    const active = getActiveBreakdown(bible);
    expect(active.map(i => i.episodeNumber)).toEqual([1, 2]);
  });

  it("falls back to the MOST RECENT version when activeBreakdownVersionId is missing/stale", () => {
    let bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [item(1)], createdByUserId: 1, versionId: "v1" },
    );
    bible = appendBreakdownVersion(bible, {
      source: "arc_replan",
      items: [item(1), item(2), item(3)],
      createdByUserId: 1,
      versionId: "v2",
    });
    // Simulate a stale/missing pointer.
    bible = { ...bible, activeBreakdownVersionId: "does-not-exist" };

    const active = getActiveBreakdown(bible);
    expect(active.map(i => i.episodeNumber)).toEqual([1, 2, 3]);
  });

  it("never mutates the input bible", () => {
    const bible = { episodeBreakdown: [item(1)] };
    const snapshot = JSON.parse(JSON.stringify(bible));
    getActiveBreakdown(bible);
    expect(bible).toEqual(snapshot);
  });
});

describe("deriveLegacyContentBudget", () => {
  it("returns the item's own contentBudget when already present", () => {
    const withBudget = item(1, true);
    const result = deriveLegacyContentBudget(withBudget, 60, "th");
    expect(result).toEqual(withBudget.contentBudget);
  });

  it("derives a read-time default (matching deriveDefaultContentBudget) when absent", () => {
    const legacyItem = item(1, false);
    const result = deriveLegacyContentBudget(legacyItem, 60, "th");
    expect(result).toEqual(deriveDefaultContentBudget(60, "th"));
  });

  it("never mutates the input item", () => {
    const legacyItem = item(1, false);
    const snapshot = JSON.parse(JSON.stringify(legacyItem));
    deriveLegacyContentBudget(legacyItem, 60, "th");
    expect(legacyItem).toEqual(snapshot);
  });
});
