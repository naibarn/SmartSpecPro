import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, captured } = vi.hoisted(() => ({
  captured: { set: undefined as Record<string, unknown> | undefined },
  mockDb: { update: vi.fn() },
}));

vi.mock("../../db", () => ({ db: mockDb }));

import { persistCharacterVisualBible } from "../verticalDramaCharacterDnaPersistence";

const VISUAL_BIBLE = {
  version: 1,
  createdAt: "2026-07-13T00:00:00.000Z",
  model: "test-model",
  visualIdentitySummary: "story-grounded lead",
  identityAnchors: ["asymmetric smile"],
  signatureWardrobe: "navy workwear",
  hairMakeupNotes: "natural side part",
  performanceEnergy: "measured",
  consistencyStrategy: "lock recall stack",
  signatureVisualCues: ["asymmetric smile"],
  colorPalette: "navy and amber",
  storyWorldRelationship: "legal thriller",
  forbiddenDrift: ["generic CEO"],
  emotionalRangeNeeded: ["calm", "guilt"],
  ageRange: "early 30s",
};

function updateChain(returningRows: unknown[]) {
  const chain: any = {
    set: vi.fn((values: Record<string, unknown>) => {
      captured.set = values;
      return chain;
    }),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => returningRows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.set = undefined;
});

describe("persistCharacterVisualBible", () => {
  it("uses a nested jsonb_set patch and never replaces the whole character data object", async () => {
    const chain = updateChain([{ id: 7 }]);

    await persistCharacterVisualBible(
      { tenantId: "tenant-1", userId: 42, seriesId: 99 },
      7,
      VISUAL_BIBLE
    );

    expect(chain.set).toHaveBeenCalledTimes(1);
    expect(captured.set).toHaveProperty("updatedAt");
    const queryChunks =
      (captured.set?.data as { queryChunks?: Array<{ value?: unknown }> })
        ?.queryChunks ?? [];
    const sqlText = queryChunks
      .flatMap(chunk => (Array.isArray(chunk.value) ? chunk.value : []))
      .filter((value): value is string => typeof value === "string")
      .join("");
    expect(sqlText).toContain("jsonb_set");
    expect(sqlText).toContain("visualBible");
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.returning).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the owner-scoped update matches no character", async () => {
    updateChain([]);

    await expect(
      persistCharacterVisualBible(
        { tenantId: "tenant-1", userId: 42, seriesId: 99 },
        7,
        VISUAL_BIBLE
      )
    ).rejects.toThrow(/owned character/i);
  });
});
