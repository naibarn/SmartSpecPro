/**
 * Coverage for `verticalDramaSpecialEdition.ts` (Stage 2.5,
 * `planning/vd-series-memory-and-lineage/plan.md`) — the AI-proposed
 * special-edition planner.
 *
 * Deliberately does NOT mock `fs`, `@smartspec/skills`, or `../skillFiles` —
 * unlike `verticalDramaSeasonCarryOver.test.ts`'s own convention. This is the
 * regression test for the exact failure class a prior review caught: a
 * skill.md that nothing actually loads is dead code (the file existing on
 * disk proves nothing about whether the production loader can find/read
 * it). Running the REAL `resolveSkillDirCandidates` -> `resolveSkillManifestPath`
 * -> `fs.readFileSync` -> `parseSkillFile` chain against the REAL file on
 * disk (vitest's cwd is `apps/web`, matching `resolveSkillDirCandidates`'s
 * own cwd-relative resolution) is the only way to prove the loader — not
 * just the file — actually works. Only the LLM call layer
 * (`executeWithFallback` via `../llmRouter`) and the credit service are
 * mocked, same precedent as `verticalDramaSeasonCarryOver.test.ts` /
 * `verticalDramaPresetSynthesis.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { mockExecuteWithFallback, mockResolveStoryBibleModel } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
  mockResolveStoryBibleModel: vi.fn(async () => "gpt-x"),
}));

const { mockResolveVerticalDramaSeriesModel } = vi.hoisted(() => ({
  mockResolveVerticalDramaSeriesModel: vi.fn(),
}));

const { mockLoadVerticalDramaGenerationSettings } = vi.hoisted(() => ({
  mockLoadVerticalDramaGenerationSettings: vi.fn(),
}));

vi.mock("../verticalDramaLlmPolicy", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaLlmPolicy")>(
    "../verticalDramaLlmPolicy"
  );
  return {
    ...actual,
    loadVerticalDramaGenerationSettings: mockLoadVerticalDramaGenerationSettings,
  };
});

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: mockResolveVerticalDramaSeriesModel,
}));

vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible"
  );
  return {
    ...actual,
    resolveStoryBibleModel: mockResolveStoryBibleModel,
  };
});

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import {
  synthesizeSpecialEditionBrief,
  composeSpecialEditionUserPremise,
  SpecialEditionInputError,
  type VerticalDramaSpecialEditionDraft,
} from "../verticalDramaSpecialEdition";
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
    compactSummary: "RELATIONSHIPS:\n- Meen & Jane: undeclared feelings",
    currentState: {
      relationships: [
        {
          pair: ["char_meen", "char_jane"],
          status: "close friends, unspoken feelings",
          disclosure: "undeclared",
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
      canonicalFacts: ["Meen and Jane work at the same company"],
      characterKnowledge: {},
    },
    hasMemory: true,
    memoryEpisodesRecorded: 18,
    roster: [
      {
        id: 1,
        characterKey: "char_meen",
        name: "Meen",
        role: "lead",
        narrativeRole: "protagonist",
        roleTier: "lead",
        occupation: "office worker",
        data: {},
      },
      {
        id: 2,
        characterKey: "char_jane",
        name: "Jane",
        role: "lead",
        narrativeRole: "protagonist",
        roleTier: "lead",
        occupation: "office worker",
        data: {},
      },
    ],
    locations: [],
    ...overrides,
  };
}

const VALID_LLM_DRAFT: VerticalDramaSpecialEditionDraft = {
  contractVersion: 1,
  storyShape: "tie_in_solution",
  premise: "Meen can't pick Fah's birthday gift, so Jane drags him to a new cafe.",
  charactersUsed: [
    { characterKey: "char_meen", roleInSpecial: "has the actual problem" },
    { characterKey: "char_jane", roleInSpecial: "drags him out, teases him" },
  ],
  episodeBriefs: [
    {
      episodeNumber: 1,
      logline: "An afternoon at the cafe while Meen tries to pick a gift.",
      protagonistStake: "Meen wants to stop embarrassing himself in front of Fah.",
      pricePaid: "He admits, in front of Jane, that he cares more than he lets on.",
    },
  ],
  continuityNotes: "Meen and Jane's relationship is still undeclared — do not resolve it here.",
  disclosureApproach: "Framed as a real outing, not a paid segment.",
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
  mockLoadVerticalDramaGenerationSettings.mockResolvedValue({});
  mockResolveVerticalDramaSeriesModel.mockImplementation(
    async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
  );
});

describe("synthesizeSpecialEditionBrief — real skill.md loader (no fs/skillFiles mocks)", () => {
  it("actually resolves and reads the REAL skill.md from disk — the system prompt sent to the LLM contains real, distinctive skill content", async () => {
    mockLlmResponse(VALID_LLM_DRAFT);
    await synthesizeSpecialEditionBrief({
      userId: 1,
      locale: "th",
      targetEpisodeCount: 1,
      storyFunctionChoice: "tie_in_solution",
      source: { marketplaceProductName: "Riverside Cafe" },
      lineageContext: lineageContext(),
    });

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const systemMessage = callArgs.messages.find(
      (m: { role: string }) => m.role === "system"
    ).content as string;
    // Distinctive strings that only exist in the REAL skill.md body — a stub
    // or a mocked "System prompt body" placeholder would fail these.
    expect(systemMessage).toContain("Vertical Drama Special Edition Planner");
    expect(systemMessage).toMatch(/เนียน/);
    expect(systemMessage).toContain("borrows the cast, not the arc");
    expect(systemMessage).toContain("vertical-drama-product-tie-in-planner");
  });

  it("throws SpecialEditionInputError when the parent has an empty roster (no LLM call)", async () => {
    await expect(
      synthesizeSpecialEditionBrief({
        userId: 1,
        locale: "th",
        targetEpisodeCount: 1,
        storyFunctionChoice: "review",
        source: {},
        lineageContext: lineageContext({ roster: [] }),
      })
    ).rejects.toThrow(SpecialEditionInputError);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError when the user lacks credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    await expect(
      synthesizeSpecialEditionBrief({
        userId: 1,
        locale: "th",
        targetEpisodeCount: 1,
        storyFunctionChoice: "review",
        source: {},
        lineageContext: lineageContext(),
      })
    ).rejects.toThrow(InsufficientCreditsError);
  });

  it("feeds the LLM ONLY the bounded compactSummary/currentState/roster — never a full episode list", async () => {
    mockLlmResponse(VALID_LLM_DRAFT);
    await synthesizeSpecialEditionBrief({
      userId: 1,
      locale: "th",
      targetEpisodeCount: 2,
      storyFunctionChoice: "review",
      source: { uploadedSummary: "A cozy riverside cafe with rooftop seating." },
      lineageContext: lineageContext(),
    });

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find(
      (m: { role: string }) => m.role === "user"
    ).content as string;
    expect(userMessage).toContain("seriesMemorySummary");
    expect(userMessage).toContain("uploadedSummary");
    expect(userMessage).not.toContain('"episodes":[');
    expect(userMessage).not.toContain('"recap"');
  });

  it("returns a validated draft plus a composed suggestedUserPremise, and deducts credits", async () => {
    mockLlmResponse(VALID_LLM_DRAFT);
    const result = await synthesizeSpecialEditionBrief({
      userId: 1,
      tenantId: "tenant-1",
      locale: "th",
      targetEpisodeCount: 1,
      storyFunctionChoice: "tie_in_solution",
      source: { marketplaceProductName: "Riverside Cafe" },
      lineageContext: lineageContext(),
    });

    expect(result.draft).toEqual(VALID_LLM_DRAFT);
    expect(result.suggestedUserPremise).toContain(VALID_LLM_DRAFT.premise);
    expect(result.suggestedUserPremise).toContain("Personal stake:");
    expect(mockLoadVerticalDramaGenerationSettings).toHaveBeenCalledWith({
      seriesId: 16,
      taskClass: "story_architecture",
      userId: 1,
    });
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("passes the parent series pin unchanged to the provider and billing", async () => {
    mockLlmResponse(VALID_LLM_DRAFT);
    mockResolveVerticalDramaSeriesModel.mockResolvedValueOnce("parent-series-model");

    const result = await synthesizeSpecialEditionBrief({
      userId: 1,
      tenantId: "tenant-1",
      locale: "th",
      targetEpisodeCount: 1,
      storyFunctionChoice: "tie_in_solution",
      source: { marketplaceProductName: "Riverside Cafe" },
      lineageContext: lineageContext(),
    });

    expect(mockResolveVerticalDramaSeriesModel).toHaveBeenCalledWith(16, expect.any(Function));
    expect(mockResolveStoryBibleModel).not.toHaveBeenCalled();
    expect(mockExecuteWithFallback.mock.calls[0][0].model).toBe("parent-series-model");
    expect(mockCalculateCreditsForLLM).toHaveBeenCalledWith(100, 50, "parent-series-model");
    expect(mockDeductCredits).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ model: "parent-series-model", llmModel: "parent-series-model" }),
    }));
    expect(result.model).toBe("parent-series-model");
  });

  it("uses the story-bible automatic model only when the series policy resolver requests fallback", async () => {
    mockLlmResponse(VALID_LLM_DRAFT);
    mockResolveVerticalDramaSeriesModel.mockImplementationOnce(
      async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
    );

    const result = await synthesizeSpecialEditionBrief({
      userId: 1,
      locale: "th",
      targetEpisodeCount: 1,
      storyFunctionChoice: "review",
      source: {},
      lineageContext: lineageContext(),
    });

    expect(mockResolveVerticalDramaSeriesModel).toHaveBeenCalledWith(16, expect.any(Function));
    expect(mockResolveStoryBibleModel).toHaveBeenCalledTimes(1);
    expect(mockExecuteWithFallback.mock.calls[0][0].model).toBe("gpt-x");
    expect(mockCalculateCreditsForLLM).toHaveBeenCalledWith(100, 50, "gpt-x");
    expect(mockDeductCredits).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ model: "gpt-x", llmModel: "gpt-x" }),
    }));
    expect(result.model).toBe("gpt-x");
  });

  it("does not call the provider or charge credits when a pinned series model is unavailable", async () => {
    mockResolveVerticalDramaSeriesModel.mockRejectedValueOnce(
      new Error("Selected Vertical Drama model is unavailable: removed-model"),
    );

    await expect(synthesizeSpecialEditionBrief({
      userId: 1,
      locale: "th",
      targetEpisodeCount: 1,
      storyFunctionChoice: "review",
      source: {},
      lineageContext: lineageContext(),
    })).rejects.toThrow("removed-model");

    expect(mockResolveStoryBibleModel).not.toHaveBeenCalled();
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    expect(mockCalculateCreditsForLLM).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws a schema-validation error when the model returns more than 2 episodeBriefs", async () => {
    mockLlmResponse({
      ...VALID_LLM_DRAFT,
      episodeBriefs: [
        VALID_LLM_DRAFT.episodeBriefs[0],
        { ...VALID_LLM_DRAFT.episodeBriefs[0], episodeNumber: 2 },
        { ...VALID_LLM_DRAFT.episodeBriefs[0], episodeNumber: 3 },
      ],
    });
    await expect(
      synthesizeSpecialEditionBrief({
        userId: 1,
        locale: "th",
        targetEpisodeCount: 2,
        storyFunctionChoice: "review",
        source: {},
        lineageContext: lineageContext(),
      })
    ).rejects.toThrow();
  });

  it("throws a schema-validation error when storyShape is not a real enum value", async () => {
    mockLlmResponse({ ...VALID_LLM_DRAFT, storyShape: "hard_sell" });
    await expect(
      synthesizeSpecialEditionBrief({
        userId: 1,
        locale: "th",
        targetEpisodeCount: 1,
        storyFunctionChoice: "review",
        source: {},
        lineageContext: lineageContext(),
      })
    ).rejects.toThrow();
  });
});

describe("composeSpecialEditionUserPremise", () => {
  it("folds premise + per-episode stake/cost + continuity notes into one string, without inventing content", () => {
    const composed = composeSpecialEditionUserPremise(VALID_LLM_DRAFT);
    expect(composed).toContain(VALID_LLM_DRAFT.premise);
    expect(composed).toContain(VALID_LLM_DRAFT.episodeBriefs[0].logline);
    expect(composed).toContain(VALID_LLM_DRAFT.episodeBriefs[0].protagonistStake);
    expect(composed).toContain(VALID_LLM_DRAFT.episodeBriefs[0].pricePaid);
    expect(composed).toContain(VALID_LLM_DRAFT.continuityNotes);
  });
});
