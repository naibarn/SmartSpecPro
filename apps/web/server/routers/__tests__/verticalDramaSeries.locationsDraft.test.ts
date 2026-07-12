/**
 * Vertical Drama Series — Location Visual Bible whole-series seeding
 * coverage. Location-side companion to `charactersDraft`/
 * `seedCharactersFromDraft` coverage — same "mock the whole module graph,
 * test the exported procedure/function directly" convention as
 * `verticalDramaSeries.userPremise.test.ts`'s own
 * `describe("seedCharactersFromDraft — presetCharacterProfiles merge", ...)`
 * block (mirrored here, minus the preset-profile merge, which has no
 * location-side equivalent).
 *
 * Covers:
 *  - `parseLocationsDraft` line-parsing + fallback behavior (exercised
 *    indirectly through `seedLocationsFromDraft`'s inserted rows —
 *    `parseLocationsDraft` itself is a private, unexported helper, same as
 *    `parseCharactersDraft`).
 *  - `seedLocationsFromDraft`'s `locationKey` dedup-suffix collision
 *    handling, including the base-slug truncation safeguard.
 *  - `create`: `bible.locationsDraft` wires through to seeded
 *    `vertical_drama_locations` rows; omitted/empty `locationsDraft` never
 *    triggers a second insert at all.
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

const { mockSynthesizeV1, mockSynthesizeV2, mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockSynthesizeV1: vi.fn(),
  mockSynthesizeV2: vi.fn(),
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/verticalDramaPresetSynthesis", () => ({
  PresetSynthesisInputError: class extends Error {},
  synthesizeVerticalDramaPreset: mockSynthesizeV1,
  synthesizeVerticalDramaPresetV2: mockSynthesizeV2,
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

import { verticalDramaSeriesRouter, seedLocationsFromDraft } from "../verticalDramaSeries";
import { debugError } from "../../_core/logger";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;
const mockDebugError = vi.mocked(debugError);

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

const INSERTED_SERIES_ROW = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "My Series",
  locale: "th",
  aspectRatio: "9:16",
  status: "draft",
  targetEpisodeCount: 10,
  defaultEpisodeDurationSeconds: 60,
  genre: null,
  tone: null,
  targetAudience: null,
  agePolicyId: null,
  bible: null,
  memory: null,
  productTieIn: null,
  policy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* seedLocationsFromDraft — parseLocationsDraft line-parsing + fallback       */
/* -------------------------------------------------------------------------- */

describe("seedLocationsFromDraft — parseLocationsDraft line-parsing + fallback behavior", () => {
  it("parses 'Name — Description' lines into name/description pairs (no role field)", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedLocationsFromDraft(
      "tenant-1",
      42,
      10,
      "Home Kitchen — an open kitchen connected to a dining nook\nSchool Hallway — a long hallway lined with green lockers",
    );

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].name).toBe("Home Kitchen");
    expect(insertedRows[0].data).toEqual({ description: "an open kitchen connected to a dining nook" });
    expect(insertedRows[1].name).toBe("School Hallway");
    expect(insertedRows[1].data).toEqual({ description: "a long hallway lined with green lockers" });
  });

  it("falls back to { name: line, description: '' } for a non-matching line (no em-dash) — tolerant, never throws", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedLocationsFromDraft("tenant-1", 42, 10, "just a plain line with no separator");

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].name).toBe("just a plain line with no separator");
    // Empty description -> no `data` payload at all (mirrors seedCharactersFromDraft's
    // own "no truthy fields -> null" convention).
    expect(insertedRows[0].data).toBeNull();
  });

  it("skips blank/whitespace-only lines", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedLocationsFromDraft(
      "tenant-1",
      42,
      10,
      "Kitchen — a kitchen\n\n   \nHallway — a hallway",
    );

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows.map((r: any) => r.name)).toEqual(["Kitchen", "Hallway"]);
  });

  it("silently no-ops (never inserts, never throws) on empty input", async () => {
    await seedLocationsFromDraft("tenant-1", 42, 10, "");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("silently no-ops when every parsed line has a blank name", async () => {
    await seedLocationsFromDraft("tenant-1", 42, 10, "   \n\n");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* seedLocationsFromDraft — locationKey dedup-suffix collision handling       */
/* -------------------------------------------------------------------------- */

describe("seedLocationsFromDraft — locationKey dedup-suffix collision handling", () => {
  it("appends -2, -3, ... for duplicate slugified names within the same batch", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedLocationsFromDraft(
      "tenant-1",
      42,
      10,
      "Kitchen — first kitchen\nKitchen — second kitchen\nKitchen — third kitchen",
    );

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedRows.map((r: any) => r.locationKey)).toEqual(["kitchen", "kitchen-2", "kitchen-3"]);
  });

  it("truncates a long base slug to 60 chars before appending a dedup suffix, keeping every key within the 64-char column limit", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));
    const longName = "A".repeat(80);

    await seedLocationsFromDraft("tenant-1", 42, 10, `${longName} — first\n${longName} — second`);

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    const keys = insertedRows.map((r: any) => r.locationKey);
    expect(keys[0]).toBe("a".repeat(60));
    expect(keys[1]).toBe(`${"a".repeat(60)}-2`);
    for (const key of keys) {
      expect(key.length).toBeLessThanOrEqual(64);
    }
  });

  it("falls back to the 'location' slug for a name that is entirely non-alphanumeric (e.g. Thai-only text)", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedLocationsFromDraft("tenant-1", 42, 10, "ครัวที่บ้าน — คำอธิบาย");

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedRows[0].locationKey).toBe("location");
  });
});

/* -------------------------------------------------------------------------- */
/* create — locationsDraft wires through to seeded vertical_drama_locations   */
/* rows                                                                       */
/* -------------------------------------------------------------------------- */

describe("create — bible.locationsDraft wires through to seeded vertical_drama_locations rows", () => {
  it("seeds location rows from bible.locationsDraft on series creation", async () => {
    mockDb.insert
      .mockReturnValueOnce(insertChain([INSERTED_SERIES_ROW])) // verticalDramaSeries insert
      .mockReturnValueOnce(insertChain([])); // verticalDramaLocations insert

    await router.create({
      ctx: ctx(),
      input: {
        title: "My Series",
        bible: { locationsDraft: "Home Kitchen — an open kitchen with a dining nook" },
      },
    });

    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    const locationInsertedRows = mockDb.insert.mock.results[1].value.values.mock.calls[0][0];
    expect(locationInsertedRows).toHaveLength(1);
    expect(locationInsertedRows[0]).toMatchObject({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      locationKey: "home-kitchen",
      name: "Home Kitchen",
      data: { description: "an open kitchen with a dining nook" },
    });
  });

  it("never attempts a second insert when locationsDraft is absent", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_SERIES_ROW]));

    await router.create({ ctx: ctx(), input: { title: "My Series" } });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("never attempts a second insert when locationsDraft is an empty/whitespace-only string", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_SERIES_ROW]));

    await router.create({
      ctx: ctx(),
      input: { title: "My Series", bible: { locationsDraft: "   " } },
    });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("logs via debugError and does not block series creation when seeding locations throws", async () => {
    mockDb.insert
      .mockReturnValueOnce(insertChain([INSERTED_SERIES_ROW]))
      .mockImplementationOnce(() => {
        throw new Error("db unavailable");
      });

    const result = await router.create({
      ctx: ctx(),
      input: {
        title: "My Series",
        bible: { locationsDraft: "Home Kitchen — an open kitchen" },
      },
    });

    expect(result.series.id).toBe("10");
    expect(mockDebugError).toHaveBeenCalledWith(
      "verticalDramaSeries.create",
      expect.stringContaining("Failed to seed locations"),
      expect.any(Error),
    );
  });
});
