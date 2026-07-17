import { describe, it, expect, vi } from "vitest";

/**
 * Unit tests for `resolveEffectiveCharacterFacts` — the roster-row +
 * series-bible `refinedCharacters` merge helper this router's
 * `previewCharacterPrompt` / `generateCharacterImage` / `generateCharacterSheet`
 * mutations now use to fill missing `role`/`occupation`/description facts
 * (traceId Ytrq5TrfJRzyFNRLasyV8;
 * `planning/vd-character-visual-bible-occupation-fix/plan.md`). Root cause:
 * a story-auto-registered character (series 18, character 70) had a roster
 * row with `role`/`occupation` NULL and no `data.description`, so the
 * visual-bible LLM call had nothing but a bare name to work from and
 * guessed "pilot" for an aircraft maintenance engineer.
 *
 * Same "mock every module-level dependency of `../verticalDramaCharacters`
 * purely so the module can be imported for its pure helper functions, no
 * procedure/mutation logic exercised" convention as this directory's
 * existing `verticalDramaCharacters.extractDescription.test.ts`. Does NOT
 * mock `../../services/verticalDramaBibleRefinedCharacters` — that module is
 * a deliberately lightweight (zod + shared-only) extraction that this
 * router now statically imports (see that file's own header doc comment
 * for why it exists as a separate module from the heavy
 * `verticalDramaStoryBible.ts`), so it's safe to let it run for real here.
 */

vi.mock("../../db", () => ({
  db: {
    get instance() {
      return Promise.reject(new Error("database unavailable"));
    },
  },
}));

vi.mock("../../_core/trpc", () => {
  const proc: any = {
    use: () => proc,
    input: () => proc,
    mutation: () => vi.fn(),
    query: () => vi.fn(),
  };
  return {
    router: (routes: unknown) => routes,
    protectedProcedure: proc,
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (opts: unknown) => opts,
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {},
  VerticalDramaCharacterStockError: class extends Error {},
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {},
  DEFAULT_MODELS: { image: "test-model" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(),
}));

vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: vi.fn(),
  generateCharacterPortraitCandidates: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(), getResetTime: vi.fn() },
}));

vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));

import { resolveEffectiveCharacterFacts } from "../verticalDramaCharacters";

function rosterCharacter(overrides: Partial<{
  name: string;
  role: string | null;
  occupation: string | null;
  data: Record<string, unknown> | null;
}> = {}) {
  return {
    name: "Somchai",
    role: null,
    occupation: null,
    data: null,
    ...overrides,
  };
}

function bibleWithRefinedCharacters(
  refinedCharacters: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return { refinedCharacters };
}

describe("resolveEffectiveCharacterFacts", () => {
  it("roster values win when present, even with a matching bible entry", () => {
    const result = resolveEffectiveCharacterFacts(
      rosterCharacter({
        name: "Somchai",
        role: "lead",
        occupation: "aircraft maintenance engineer",
        data: { description: "A steady, dependable presence on the tarmac." },
      }),
      bibleWithRefinedCharacters([
        {
          name: "Somchai",
          role: "second lead",
          occupation: "commercial airline pilot",
          description: "A guessed, wrong occupation.",
        },
      ]),
    );

    expect(result).toEqual({
      role: "lead",
      occupation: "aircraft maintenance engineer",
      description: "Description: A steady, dependable presence on the tarmac.",
    });
  });

  it("fills role/occupation/description from a bible entry matched by exact name when the roster row is empty", () => {
    const bible = bibleWithRefinedCharacters([
      {
        name: "Somchai",
        role: "lead",
        occupation: "aircraft maintenance engineer",
        description: "A perfectionist who trusts his hands more than words.",
      },
    ]);

    const result = resolveEffectiveCharacterFacts(rosterCharacter({ name: "Somchai" }), bible);

    expect(result).toEqual({
      role: "lead",
      occupation: "aircraft maintenance engineer",
      description: "Description: A perfectionist who trusts his hands more than words.",
    });
  });

  it("matches a bible entry via its aliases when the roster name doesn't match the canonical bible name directly", () => {
    const bible = bibleWithRefinedCharacters([
      {
        name: "Somchai Srisawat",
        role: "lead",
        occupation: "aircraft maintenance engineer",
        description: "Full canonical bible profile.",
        aliases: ["Chai", "Somchai"],
      },
    ]);

    const result = resolveEffectiveCharacterFacts(rosterCharacter({ name: "somchai" }), bible);

    expect(result.role).toBe("lead");
    expect(result.occupation).toBe("aircraft maintenance engineer");
    expect(result.description).toBe("Description: Full canonical bible profile.");
  });

  it("returns roster-only facts (undefined description) when no bible entry matches", () => {
    const result = resolveEffectiveCharacterFacts(
      rosterCharacter({ name: "Somchai", role: "lead" }),
      bibleWithRefinedCharacters([{ name: "Someone Else", occupation: "chef" }]),
    );

    expect(result).toEqual({
      role: "lead",
      occupation: null,
      description: undefined,
    });
  });

  it("returns roster-only facts when the bible itself is null", () => {
    const result = resolveEffectiveCharacterFacts(
      rosterCharacter({ name: "Somchai", role: "lead" }),
      null,
    );

    expect(result).toEqual({
      role: "lead",
      occupation: null,
      description: undefined,
    });
  });

  it("prefixes the bible description fallback with 'Description: ', matching extractCharacterDescription's convention", () => {
    const result = resolveEffectiveCharacterFacts(
      rosterCharacter({ name: "Somchai" }),
      bibleWithRefinedCharacters([
        { name: "Somchai", description: "An aircraft maintenance engineer." },
      ]),
    );

    expect(result.description).toBe("Description: An aircraft maintenance engineer.");
  });

  it("never crashes on a blank/missing character name — skips the bible lookup and returns roster-only facts", () => {
    const bible = bibleWithRefinedCharacters([
      { name: "Somchai", role: "lead", occupation: "aircraft maintenance engineer" },
    ]);

    expect(() =>
      resolveEffectiveCharacterFacts(rosterCharacter({ name: "" }), bible),
    ).not.toThrow();
    expect(resolveEffectiveCharacterFacts(rosterCharacter({ name: "" }), bible)).toEqual({
      role: null,
      occupation: null,
      description: undefined,
    });
  });

  it("never bakes occupation into the description fallback", () => {
    const result = resolveEffectiveCharacterFacts(
      rosterCharacter({ name: "Somchai" }),
      bibleWithRefinedCharacters([
        {
          name: "Somchai",
          occupation: "aircraft maintenance engineer",
          description: "A quiet perfectionist.",
        },
      ]),
    );

    expect(result.occupation).toBe("aircraft maintenance engineer");
    expect(result.description).toBe("Description: A quiet perfectionist.");
    expect(result.description).not.toContain("aircraft maintenance engineer");
  });
});
