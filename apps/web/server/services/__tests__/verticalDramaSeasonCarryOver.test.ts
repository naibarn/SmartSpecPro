/**
 * Coverage for `verticalDramaSeasonCarryOver.ts` (Stage 2.2,
 * `planning/vd-series-memory-and-lineage/plan.md`) — the AI-proposed
 * season carry-over planner. Mocks the LLM call layer (`executeWithFallback`
 * via `../llmRouter`, same precedent as `verticalDramaPresetSynthesis.test.ts`)
 * so the REAL zod-validation + draft-assembly logic runs against a
 * controlled model response.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "---\nname: vertical-drama-season-carry-over-planner\n---\nSystem prompt body"),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({
    content: "System prompt body for season carry-over planning.",
  })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => [
    "/fake/skills/vertical-drama-season-carry-over-planner",
  ]),
  resolveSkillManifestPath: vi.fn(
    () => "/fake/skills/vertical-drama-season-carry-over-planner/skill.md"
  ),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } =
  vi.hoisted(() => ({
    mockHasEnoughCredits: vi.fn(),
    mockDeductCredits: vi.fn(),
    mockCalculateCreditsForLLM: vi.fn(() => 2),
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

vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible"
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(async () => "gpt-x"),
  };
});

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import {
  synthesizeSeasonCarryOver,
  SeasonCarryOverInputError,
} from "../verticalDramaSeasonCarryOver";
import { InsufficientCreditsError } from "../verticalDramaStoryBible";
import type { VerticalDramaLineageContext } from "../verticalDramaSeriesLineage";

function lineageContext(
  overrides: Partial<VerticalDramaLineageContext> = {}
): VerticalDramaLineageContext {
  return {
    parentSeriesId: 16,
    parentTitle: "Season 1",
    parentGenre: "romance",
    parentTone: "dramatic",
    parentEpisodeCount: 20,
    audienceAgeRating: "18plus",
    visualIdentity: {},
    compactSummary: "RELATIONSHIPS:\n- Aria & Rival: rivals [public]",
    currentState: {
      relationships: [
        {
          pair: ["char_aria", "char_rival"],
          status: "rivals",
          disclosure: "public",
          knownBy: [],
          sinceEpisode: 18,
        },
      ],
      openThreads: [
        {
          threadId: "t1",
          description: "the house renovation still isn't done",
          threadClass: "domestic",
          openedEpisode: 10,
        },
      ],
      canonicalFacts: ["Aria won the merger"],
      characterKnowledge: {},
    },
    hasMemory: true,
    memoryEpisodesRecorded: 18,
    roster: [
      {
        id: 1,
        characterKey: "char_aria",
        name: "Aria",
        role: "lead",
        narrativeRole: "protagonist",
        roleTier: "lead",
        occupation: "CEO",
        data: {},
      },
    ],
    locations: [],
    ...overrides,
  };
}

const VALID_LLM_DRAFT = {
  contract_version: 1,
  characters: [
    {
      characterKey: "char_aria",
      name: "Aria",
      postFinaleStatus: "won the corporate war",
      availability: "returns",
      suggestedStateUpdate: "estranged from her sister",
    },
  ],
  newCharacterSuggestions: ["a new auditor"],
  newConflictDirections: ["the rot she used to win is still there"],
  antagonistStrategy: "introduce a new antagonist",
};

function mockLlmResponse(content: unknown) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockCalculateCreditsForLLM.mockReturnValue(2);
});

describe("synthesizeSeasonCarryOver", () => {
  it("throws SeasonCarryOverInputError when the parent has an empty roster", async () => {
    await expect(
      synthesizeSeasonCarryOver({
        userId: 1,
        locale: "th",
        lineageContext: lineageContext({ roster: [] }),
      })
    ).rejects.toThrow(SeasonCarryOverInputError);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError when the user lacks credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    await expect(
      synthesizeSeasonCarryOver({
        userId: 1,
        locale: "th",
        lineageContext: lineageContext(),
      })
    ).rejects.toThrow(InsufficientCreditsError);
  });

  it("returns the LLM-decided fields PLUS a deterministic TS copy of carriedRelationships/carriedThreads — never LLM-produced", async () => {
    mockLlmResponse(VALID_LLM_DRAFT);
    const ctx = lineageContext();

    const result = await synthesizeSeasonCarryOver({
      userId: 1,
      tenantId: "tenant-1",
      locale: "th",
      premise: "a new heist",
      lineageContext: ctx,
    });

    expect(result.draft.characters).toEqual(VALID_LLM_DRAFT.characters);
    expect(result.draft.newConflictDirections).toEqual(
      VALID_LLM_DRAFT.newConflictDirections
    );
    expect(result.draft.antagonistStrategy).toBe(
      VALID_LLM_DRAFT.antagonistStrategy
    );
    // Deterministic copy, not model output — identical object content to
    // what `loadLineageContext` produced.
    expect(result.draft.carriedRelationships).toEqual(
      ctx.currentState.relationships
    );
    expect(result.draft.carriedThreads).toEqual(ctx.currentState.openThreads);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("normalizes blank/null optional character prose when no return explanation is required", async () => {
    mockLlmResponse({
      ...VALID_LLM_DRAFT,
      characters: [
        {
          ...VALID_LLM_DRAFT.characters[0],
          availability: "returns",
          returnJustification: "",
          suggestedStateUpdate: "",
        },
        {
          characterKey: "char_rival",
          name: "Rival",
          postFinaleStatus: "left the city",
          availability: "write_out",
          returnJustification: null,
          suggestedStateUpdate: null,
        },
      ],
    });

    const result = await synthesizeSeasonCarryOver({
      userId: 1,
      locale: "th",
      lineageContext: lineageContext(),
    });

    expect(result.draft.characters).toEqual([
      expect.not.objectContaining({
        returnJustification: expect.anything(),
        suggestedStateUpdate: expect.anything(),
      }),
      expect.not.objectContaining({
        returnJustification: expect.anything(),
        suggestedStateUpdate: expect.anything(),
      }),
    ]);
  });

  it("still rejects a blank justification for returns_with_explanation", async () => {
    mockLlmResponse({
      ...VALID_LLM_DRAFT,
      characters: [
        {
          ...VALID_LLM_DRAFT.characters[0],
          availability: "returns_with_explanation",
          returnJustification: "",
        },
      ],
    });

    await expect(
      synthesizeSeasonCarryOver({
        userId: 1,
        locale: "th",
        lineageContext: lineageContext(),
      }),
    ).rejects.toThrow(/returnJustification/i);
  });

  it("feeds the LLM ONLY the bounded compactSummary/currentState/roster — never a full episode list", async () => {
    mockLlmResponse(VALID_LLM_DRAFT);
    await synthesizeSeasonCarryOver({
      userId: 1,
      locale: "th",
      lineageContext: lineageContext(),
    });

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find(
      (m: { role: string }) => m.role === "user"
    ).content as string;
    expect(userMessage).toContain("seriesMemorySummary");
    // Bounded facts (a coverage COUNT, a compact summary string) are fine;
    // the raw per-episode `recap`/`episodes[]` array must never appear.
    expect(userMessage).not.toContain('"episodes":[');
    expect(userMessage).not.toContain('"recap"');
  });

  it("throws a schema-validation error when the model omits a required field", async () => {
    mockLlmResponse({ ...VALID_LLM_DRAFT, antagonistStrategy: undefined });
    await expect(
      synthesizeSeasonCarryOver({
        userId: 1,
        locale: "th",
        lineageContext: lineageContext(),
      })
    ).rejects.toThrow();
  });
});
