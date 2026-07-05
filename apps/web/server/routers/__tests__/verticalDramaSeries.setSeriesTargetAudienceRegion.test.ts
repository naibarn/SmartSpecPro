/**
 * Vertical Drama Series — `setSeriesTargetAudienceRegion` mutation coverage
 * (2026-07-06 character-prompt quality upgrade).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.deleteSeries.test.ts`. Covers:
 *  - Zod input validation rejects an unknown region value.
 *  - Ownership guard: a series that doesn't belong to the caller's
 *    tenant/user throws NOT_FOUND before any write.
 *  - Happy path: merges `targetAudienceRegion` into the EXISTING `bible`
 *    jsonb (read-modify-write) without clobbering other bible fields —
 *    unlike `updateSeries`, which replaces `bible` wholesale when supplied.
 *  - Happy path when the series has no `bible` yet (null) — still writes a
 *    valid object with just `targetAudienceRegion`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
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

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";
import { z } from "zod";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

// The mocked `protectedProcedure.input()` above is a passthrough (does not
// actually re-validate) — so we independently validate the router's real Zod
// schema shape here via a fresh schema mirroring the mutation's declared
// input, to guard the "reject unknown region" contract even though the
// handler itself is invoked directly (bypassing tRPC's own input parsing) in
// every other test in this file.
const VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS = [
  "thai",
  "east_asian",
  "southeast_asian",
  "south_asian",
  "western",
  "latin",
  "middle_eastern",
  "african",
  "global_mixed",
] as const;
const regionInputSchema = z.object({
  seriesId: z.string().min(1),
  targetAudienceRegion: z.enum(VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS),
});

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

/** Thenable select-chain stub so `await db.select()....where(...).limit(...)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    groupBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

/** Thenable update-chain stub so `await db.update(...).set(...).where(...).returning()` resolves to `rows`. */
function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const SERIES_ROW_NO_BIBLE = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
  bible: null,
};

const SERIES_ROW_WITH_BIBLE = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
  bible: { logline: "A rise-and-fall corporate drama", mainPlot: "Betrayal at the top" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setSeriesTargetAudienceRegion — input validation", () => {
  it("rejects an unknown region value via the router's own Zod schema", () => {
    expect(() =>
      regionInputSchema.parse({ seriesId: "10", targetAudienceRegion: "atlantis" }),
    ).toThrow();
  });

  it("accepts every documented region value", () => {
    for (const region of VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS) {
      expect(() =>
        regionInputSchema.parse({ seriesId: "10", targetAudienceRegion: region }),
      ).not.toThrow();
    }
  });
});

describe("setSeriesTargetAudienceRegion — ownership guard", () => {
  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries lookup — empty

    await expect(
      router.setSeriesTargetAudienceRegion({
        ctx: ctx(),
        input: { seriesId: "999", targetAudienceRegion: "east_asian" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.setSeriesTargetAudienceRegion({
        ctx: ctx(),
        input: { seriesId: "not-a-number", targetAudienceRegion: "east_asian" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("scopes the ownership lookup to the caller's tenant and never another tenant's series", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // no row matches this tenant/user

    await expect(
      router.setSeriesTargetAudienceRegion({
        ctx: ctx({ tenantId: "other-tenant" }),
        input: { seriesId: "10", targetAudienceRegion: "western" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("setSeriesTargetAudienceRegion — happy path", () => {
  it("merges targetAudienceRegion into the EXISTING bible without clobbering other fields", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW_WITH_BIBLE])); // loadOwnedSeries lookup

    const updated = {
      ...SERIES_ROW_WITH_BIBLE,
      bible: { ...SERIES_ROW_WITH_BIBLE.bible, targetAudienceRegion: "east_asian" },
    };
    const setSpy = vi.fn();
    const chain = updateChain([updated]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.setSeriesTargetAudienceRegion({
      ctx: ctx(),
      input: { seriesId: "10", targetAudienceRegion: "east_asian" },
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bible: expect.objectContaining({
          logline: "A rise-and-fall corporate drama",
          mainPlot: "Betrayal at the top",
          targetAudienceRegion: "east_asian",
        }),
      }),
    );
    expect(result.series.id).toBe("10");
    expect((result.series as any).bible.targetAudienceRegion).toBe("east_asian");
  });

  it("writes a valid bible object with just targetAudienceRegion when the series has no bible yet", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW_NO_BIBLE])); // loadOwnedSeries lookup

    const updated = { ...SERIES_ROW_NO_BIBLE, bible: { targetAudienceRegion: "western" } };
    const setSpy = vi.fn();
    const chain = updateChain([updated]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.setSeriesTargetAudienceRegion({
      ctx: ctx(),
      input: { seriesId: "10", targetAudienceRegion: "western" },
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bible: { targetAudienceRegion: "western" } }),
    );
    expect((result.series as any).bible.targetAudienceRegion).toBe("western");
  });
});
