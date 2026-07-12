/**
 * Coverage for `verticalDramaLocationReconciliation.ts`
 * (`planning/polished-toasting-gadget.md` Phase 2) — mirrors
 * `verticalDramaCharacterVariantPlanner.test.ts`'s `reconcileCharacterVariantPlan`
 * db-mocking convention (a hoisted in-memory row array + minimal
 * select/insert query builders), simplified further since this module never
 * issues an UPDATE (a stable-key match is always a no-op — see the module's
 * own doc comment).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  locationRows: [] as Record<string, unknown>[],
  nextId: 100,
}));

vi.mock("../../db", () => {
  function makeSelectBuilder() {
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.where = () => builder;
    builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve([...hoisted.locationRows]);
      } catch (err) {
        reject?.(err);
      }
    };
    return builder;
  }
  function makeInsertBuilder() {
    const builder: Record<string, unknown> = {};
    let values: Record<string, unknown> = {};
    builder.values = (v: Record<string, unknown>) => {
      values = v;
      return builder;
    };
    builder.returning = () => {
      const row = {
        id: hoisted.nextId++,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...values,
      };
      hoisted.locationRows.push(row);
      return Promise.resolve([row]);
    };
    return builder;
  }
  return {
    db: {
      select: vi.fn(() => makeSelectBuilder()),
      insert: vi.fn(() => makeInsertBuilder()),
    },
  };
});

import { reconcileEpisodeLocations } from "../verticalDramaLocationReconciliation";
import type { VerticalDramaStoryboardLocationGroup } from "@shared/verticalDramaSeries/storyboardLocations";

function makeLocationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    tenantId: "tenant-1",
    userId: 1,
    seriesId: 6,
    locationKey: "loc_store",
    name: "ร้านสะดวกซื้อ",
    data: { description: "original, already-approved description" },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const owner = { tenantId: "tenant-1", userId: 1, seriesId: 6 };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.locationRows = [];
  hoisted.nextId = 100;
});

describe("reconcileEpisodeLocations", () => {
  it("stable-key reuse: leaves the existing row completely untouched (description stays frozen, no new row)", async () => {
    hoisted.locationRows = [
      makeLocationRow({
        id: 1,
        locationKey: "loc_store",
        name: "ร้านสะดวกซื้อ",
        data: { description: "original, already-approved description" },
      }),
    ];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      {
        locationKey: "loc_store",
        // Deliberately different incoming name/description text — must NOT
        // overwrite the stored row.
        locationName: "ร้านสะดวกซื้อ (โซนของเด็ก)",
        description: "a completely different incoming description this run",
        shotNumbers: [1, 2, 3],
      },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([{ locationKey: "loc_store", name: "ร้านสะดวกซื้อ" }]);
    expect(summary.createdLocations).toEqual([]);
    expect(hoisted.locationRows).toHaveLength(1);
    expect((hoisted.locationRows[0].data as { description: string }).description).toBe(
      "original, already-approved description",
    );
    expect(hoisted.locationRows[0].name).toBe("ร้านสะดวกซื้อ");
  });

  it("reuses a location that recurs non-contiguously across two distinct_locations groups in the same call", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_store", name: "ร้านสะดวกซื้อ" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      { locationKey: "loc_store", locationName: "ร้านสะดวกซื้อ", description: "morning visit", shotNumbers: [1, 2] },
      { locationKey: "loc_kitchen", locationName: "ครัว", description: "cut to kitchen", shotNumbers: [3, 4] },
      // Flashback / return to the store later in the same episode — same key,
      // non-contiguous shot numbers.
      { locationKey: "loc_store", locationName: "ร้านสะดวกซื้อ", description: "evening return", shotNumbers: [9] },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.createdLocations).toEqual([{ locationKey: "loc_kitchen", name: "ครัว" }]);
    expect(summary.reusedLocations).toEqual([
      { locationKey: "loc_store", name: "ร้านสะดวกซื้อ" },
      { locationKey: "loc_store", name: "ร้านสะดวกซื้อ" },
    ]);
    // Only ONE new row inserted (the kitchen) — the store's 2nd recurrence
    // reused the same row, not a duplicate.
    expect(hoisted.locationRows).toHaveLength(2);
  });

  it("new-key creation: inserts a new row using the incoming locationKey verbatim when it doesn't collide", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_store", name: "ร้านสะดวกซื้อ" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      { locationKey: "loc_kitchen", locationName: "ครัว", description: "a warm home kitchen", shotNumbers: [4, 5, 6] },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.createdLocations).toEqual([{ locationKey: "loc_kitchen", name: "ครัว" }]);
    expect(hoisted.locationRows).toHaveLength(2);
    const created = hoisted.locationRows.find((row) => row.locationKey === "loc_kitchen");
    expect(created).toBeDefined();
    expect((created?.data as { description: string }).description).toBe("a warm home kitchen");
  });

  it("new-key creation: falls back to a deduped slug of locationName when locationKey is absent and the natural slug collides with an existing key", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "kitchen", name: "ครัวเก่า" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      {
        locationKey: "",
        locationName: "Kitchen",
        description: "a different, newly-introduced kitchen this episode",
        shotNumbers: [7, 8, 9],
      },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.createdLocations).toEqual([{ locationKey: "kitchen-2", name: "Kitchen" }]);
    expect(hoisted.locationRows).toHaveLength(2);
    const created = hoisted.locationRows.find((row) => row.name === "Kitchen");
    expect(created?.locationKey).toBe("kitchen-2");
  });

  it("best-effort skips a malformed group with no usable name (never throws)", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_store", name: "ร้านสะดวกซื้อ" })];

    const malformedGroup = {
      locationKey: "",
      locationName: "",
      description: "orphaned facts with nothing to key off of",
      shotNumbers: [1],
    } as unknown as VerticalDramaStoryboardLocationGroup;

    await expect(reconcileEpisodeLocations(owner, [malformedGroup])).resolves.toEqual({
      createdLocations: [],
      reusedLocations: [],
    });
    // Existing roster is unchanged.
    expect(hoisted.locationRows).toHaveLength(1);
  });

  it("handles a mixed batch: one reuse, one new insert, one skipped malformed group, in a single call", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_store", name: "ร้านสะดวกซื้อ" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      { locationKey: "loc_store", locationName: "ร้านสะดวกซื้อ", description: "reused", shotNumbers: [1, 2] },
      { locationKey: "loc_kitchen", locationName: "ครัว", description: "brand new", shotNumbers: [4, 5] },
      { locationKey: "", locationName: "", description: "malformed", shotNumbers: [6] } as unknown as VerticalDramaStoryboardLocationGroup,
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([{ locationKey: "loc_store", name: "ร้านสะดวกซื้อ" }]);
    expect(summary.createdLocations).toEqual([{ locationKey: "loc_kitchen", name: "ครัว" }]);
    expect(hoisted.locationRows).toHaveLength(2);
  });

  it("returns empty summaries and never throws for an empty distinctLocations array", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_store", name: "ร้านสะดวกซื้อ" })];

    const summary = await reconcileEpisodeLocations(owner, []);

    expect(summary).toEqual({ createdLocations: [], reusedLocations: [] });
    expect(hoisted.locationRows).toHaveLength(1);
  });
});
