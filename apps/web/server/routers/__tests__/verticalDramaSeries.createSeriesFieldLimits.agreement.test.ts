/**
 * Vertical Drama Series — `createSeriesInput` length limits must stay in
 * lockstep with `CREATE_SERIES_FIELD_LIMITS` (shared/verticalDramaSeries),
 * the single source of truth also used by preset synthesis clamping
 * (server/services/verticalDramaPresetSynthesis.ts) and the Create Series
 * wizard (client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx).
 *
 * This guards against exactly the bug this test suite was added for: the
 * router schema and a producer of these fields silently drifting apart,
 * causing a valid-looking AI draft to fail `create` with a zod `too_big`
 * error. Same "mock the whole module graph" convention as
 * `verticalDramaSeries.deleteSeries.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: () => ({}),
    update: () => ({}),
    insert: () => ({}),
    delete: () => ({}),
    transaction: () => ({}),
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/verticalDramaPresetSynthesis", () => ({
  PresetSynthesisInputError: class extends Error {},
  synthesizeVerticalDramaPreset: vi.fn(),
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import { createSeriesInput } from "../verticalDramaSeries";
import { CREATE_SERIES_FIELD_LIMITS } from "@shared/verticalDramaSeries";

describe("createSeriesInput length limits agree with CREATE_SERIES_FIELD_LIMITS", () => {
  it("CREATE_SERIES_FIELD_LIMITS includes userPremise (Feature 132 §4.2 F132A)", () => {
    expect(Object.keys(CREATE_SERIES_FIELD_LIMITS)).toContain("userPremise");
    expect(CREATE_SERIES_FIELD_LIMITS.userPremise).toBe(12000);
  });

  it.each(Object.entries(CREATE_SERIES_FIELD_LIMITS))(
    "field %s: a string at the limit passes, one character over fails",
    (field, limit) => {
      const atLimit = "a".repeat(limit);
      const overLimit = "a".repeat(limit + 1);

      const baseInput = { title: "Valid title" };
      const withField = { ...baseInput, [field]: atLimit };
      const overField = { ...baseInput, [field]: overLimit };

      expect(createSeriesInput.safeParse(withField).success).toBe(true);
      const overResult = createSeriesInput.safeParse(overField);
      if (field === "title") {
        // title itself is required + has its own min(1); still must fail over-limit.
        expect(overResult.success).toBe(false);
      } else {
        expect(overResult.success).toBe(false);
      }
    },
  );
});
