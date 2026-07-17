/**
 * Vertical Drama Series — `createSeriesInput` genre pollution guard (Stage
 * 1.5, `planning/vd-series-memory-and-lineage/plan.md`). Same "mock the
 * whole module graph" convention as
 * `verticalDramaSeries.createSeriesFieldLimits.agreement.test.ts`.
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

describe("createSeriesInput genre pollution guard", () => {
  it("rejects a genre that is byte-identical to the title (real series 5 shape)", () => {
    const result = createSeriesInput.safeParse({
      title: "สวมรอยดาราสองชีวิต…",
      genre: "สวมรอยดาราสองชีวิต…",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const genreIssue = result.error.issues.find(
        issue => issue.path.join(".") === "genre"
      );
      expect(genreIssue).toBeDefined();
    }
  });

  it("rejects a colon-shaped 'Title: Subtitle' alt-title genre (real series 17 shape)", () => {
    const result = createSeriesInput.safeParse({
      title: "รักข้ามเวลา",
      genre: "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a long, multi-segment paraphrased-title genre (real series 16 shape)", () => {
    const result = createSeriesInput.safeParse({
      title: "คาเฟ่ป่วนรัก กับดักพี่ชายตัวแสบ",
      genre: "คาเฟ่ปั่นรัก พี่ชายหวงตัวแสบในตึกเดียวกัน",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a genuine short Thai genre label", () => {
    const result = createSeriesInput.safeParse({
      title: "รักข้ามเวลา",
      genre: "โรแมนติกดราม่าย้อนเวลา",
    });
    expect(result.success).toBe(true);
  });

  it("accepts series creation with no genre at all (optional field, unaffected)", () => {
    const result = createSeriesInput.safeParse({ title: "รักข้ามเวลา" });
    expect(result.success).toBe(true);
  });

  it("still enforces the ordinary max-length check independently of the pollution guard", () => {
    const result = createSeriesInput.safeParse({
      title: "Valid title",
      genre: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});
