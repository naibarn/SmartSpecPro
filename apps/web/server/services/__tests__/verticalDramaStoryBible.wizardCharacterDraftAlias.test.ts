/**
 * `planning/vd-character-identity-repair/plan.md` Phase 6.1 — the bible-
 * expansion prompt (`generateStoryBible`/`buildPrompts`) must tell the model
 * to declare the wizard's ORIGINAL `charactersDraft` name as an alias when it
 * refines/renames that character (series 7's `ผู้บงการ(คนร้าย)` -> bible
 * `ผู้บงการ` reproduced this exact gap: no alias was declared back to the
 * original, so `reconcileCharactersFromStoryBible` couldn't find the roster
 * row and the next deep draft would mint a genuine duplicate).
 *
 * Mocking convention mirrors `verticalDramaStoryBible.feature132.test.ts`.
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

vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import { generateStoryBible } from "../verticalDramaStoryBible";

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 7,
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
    refinedCharacters: [
      { name: "ผู้บงการ", role: "villain", description: "The mastermind", aliases: ["ผู้บงการ(คนร้าย)"] },
    ],
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

describe("generateStoryBible — WIZARD CHARACTER DRAFT block (Phase 6.1)", () => {
  it("renders a WIZARD CHARACTER DRAFT block containing bible.charactersDraft verbatim when present", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(
      baseParams({
        bible: {
          charactersDraft:
            "ผู้บงการ(คนร้าย) — วายร้ายลึกลับผู้อยู่เบื้องหลังทุกแผนการ",
        },
      }),
    );
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("WIZARD CHARACTER DRAFT");
    expect(userPrompt).toContain("ผู้บงการ(คนร้าย) — วายร้ายลึกลับผู้อยู่เบื้องหลังทุกแผนการ");
    expect(userPrompt).toContain('you MUST include that original line\'s name string, verbatim, in that character\'s "aliases" array');
  });

  it("omits the block entirely when charactersDraft is absent (byte-identical to before this field existed)", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ bible: {} }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("WIZARD CHARACTER DRAFT");
  });

  it("omits the block when charactersDraft is an empty/whitespace-only string", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ bible: { charactersDraft: "   " } }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("WIZARD CHARACTER DRAFT");
  });

  it("omits the block when charactersDraft is present but not a string (tolerant, never throws)", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams({ bible: { charactersDraft: 12345 } }));
    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).not.toContain("WIZARD CHARACTER DRAFT");
  });

  it("system prompt instructs the model to declare the original wizard name as an alias when it refines/renames a character", async () => {
    mockLlmResponse(validExpandedResponse());
    await generateStoryBible(baseParams());
    const systemPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain("WIZARD CHARACTER DRAFT");
    expect(systemPrompt).toContain('"aliases" array — this is the ONLY way the rest of the pipeline can tell your refined name and the creator\'s original name are the same person');
  });

  it("still parses a response whose refinedCharacters include the wizard-declared alias (aliases survive parsing intact)", async () => {
    mockLlmResponse(validExpandedResponse());
    const result = await generateStoryBible(
      baseParams({ bible: { charactersDraft: "ผู้บงการ(คนร้าย) — วายร้าย" } }),
    );
    expect(result.expanded.refinedCharacters[0].aliases).toEqual(["ผู้บงการ(คนร้าย)"]);
  });
});
