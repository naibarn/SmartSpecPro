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

import {
  reconcileEpisodeLocations,
  persistDeepDraftDeclaredLocations,
} from "../verticalDramaLocationReconciliation";
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

  /**
   * `planning/vertical-drama-scene-dedup-bulk-slots/plan.md` — normalized-name
   * dedup fallback. Guards the bug where the storyboard skill mints an
   * unstable positional fallback key (`location-${index+1}`) for the SAME
   * physical scene across episodes, which the exact-key lookup misses,
   * previously causing a duplicate row with an identical `name`.
   */
  it("normalized-name fallback: reuses an existing row when the locationKey differs but the name matches (no insert)", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_store", name: "ร้านกาแฟ" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      {
        // Unstable positional fallback key the storyboard skill mints when
        // it omits `distinct_locations` — deliberately NOT "loc_store".
        locationKey: "location-1",
        locationName: "ร้านกาแฟ",
        description: "a completely different incoming description this run",
        shotNumbers: [1, 2],
      },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([{ locationKey: "loc_store", name: "ร้านกาแฟ" }]);
    expect(summary.createdLocations).toEqual([]);
    expect(hoisted.locationRows).toHaveLength(1);
    expect((hoisted.locationRows[0].data as { description: string }).description).toBe(
      "original, already-approved description",
    );
  });

  it("normalized-name fallback is case-insensitive", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_cafe", name: "Coffee Shop" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      { locationKey: "location-2", locationName: "coffee shop", description: "case-only variant", shotNumbers: [3] },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([{ locationKey: "loc_cafe", name: "Coffee Shop" }]);
    expect(summary.createdLocations).toEqual([]);
    expect(hoisted.locationRows).toHaveLength(1);
  });

  it("normalized-name fallback trims leading/trailing whitespace", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_cafe", name: "Coffee Shop" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      {
        locationKey: "location-3",
        locationName: "  Coffee Shop  ",
        description: "whitespace-only variant",
        shotNumbers: [4],
      },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([{ locationKey: "loc_cafe", name: "Coffee Shop" }]);
    expect(summary.createdLocations).toEqual([]);
    expect(hoisted.locationRows).toHaveLength(1);
  });

  it("does NOT merge genuinely different names — no over-merge / no fuzzy matching", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_cafe", name: "ร้านกาแฟ" })];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      {
        locationKey: "location-4",
        locationName: "ร้านกาแฟ (สาขา 2)",
        description: "a genuinely different, second branch",
        shotNumbers: [5],
      },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([]);
    expect(summary.createdLocations).toHaveLength(1);
    expect(summary.createdLocations[0].name).toBe("ร้านกาแฟ (สาขา 2)");
    expect(hoisted.locationRows).toHaveLength(2);
  });

  /**
   * Regression coverage for the episode 59 / series 16 production bug
   * (2026-07-14 fix, revised same day after a coordinator-flagged
   * regression in the first attempt — see the "positive-swap-evidence
   * override" doc comment on `reconcileEpisodeLocations` above): a
   * positional fallback key (`location-1`) that ALREADY belongs to one
   * physical location in the roster (here "Irin Cafe") must NOT be
   * silently reused just because a later episode's group happens to carry
   * the same key AND supplies POSITIVE evidence — a key-shaped
   * `locationName` that is itself a DIFFERENT existing row's own key — that
   * it actually means a different location. Absent that specific evidence,
   * a key match REUSES by default, even when the incoming `locationName`
   * text doesn't align (name drift/rewording is normal, not a swap).
   */
  it("positive-swap-evidence override: an incoming locationKey that hits an existing row, where the (key-shaped) locationName is a DIFFERENT existing row's own key, binds to that canonical row instead of the key-hit row", async () => {
    hoisted.locationRows = [
      // Old, wrong positional row — key "location-1" was minted for "Irin
      // Cafe" in an earlier regenerate.
      makeLocationRow({ id: 1, locationKey: "location-1", name: "Irin Cafe" }),
      // The correct, canonical roster row for this episode's actual
      // "location-1" group, seeded earlier from the series bible.
      makeLocationRow({ id: 2, locationKey: "shophouse-stairhall", name: "หน้าบันไดตึกแถว" }),
    ];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      {
        // Same positional key as the unrelated "Irin Cafe" row, but the
        // model's real location identity (already key-shaped text) landed
        // in locationName, matching the canonical row instead — POSITIVE
        // evidence of a swap, not mere rewording.
        locationKey: "location-1",
        locationName: "shophouse-stairhall",
        description: "stairwell scene",
        shotNumbers: [1, 2],
      },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([
      { locationKey: "shophouse-stairhall", name: "หน้าบันไดตึกแถว" },
    ]);
    expect(summary.createdLocations).toEqual([]);
    // No mutation of either existing row.
    expect(hoisted.locationRows).toHaveLength(2);
    expect(hoisted.locationRows.find((r) => r.locationKey === "location-1")?.name).toBe(
      "Irin Cafe",
    );
  });

  it("default stable-key reuse: a key match REUSES the same row even when the incoming locationName is a reworded Thai name with no positive swap evidence (no duplicate row minted)", async () => {
    hoisted.locationRows = [
      makeLocationRow({
        id: 1,
        locationKey: "shophouse-stairhall",
        name: "โถงบันไดกลางตึกแถว",
        data: { description: "original, already-approved description" },
      }),
    ];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      {
        // Same canonical key as an existing row, but the model reworded
        // the Thai location_name prose this run — legitimate name drift on
        // a legitimately reused key, NOT a swap. Both this text and the
        // row's own name slugify to the same non-informative "location"
        // fallback, so name-alignment alone can never distinguish
        // "reworded" from "different place" for Thai text — the key match
        // must be trusted by default here (this is the exact regression
        // the coordinator flagged in the first attempt at this fix).
        locationKey: "shophouse-stairhall",
        locationName: "โถงบันไดชั้นบน",
        description: "a reworded description this run",
        shotNumbers: [1, 2],
      },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.reusedLocations).toEqual([
      { locationKey: "shophouse-stairhall", name: "โถงบันไดกลางตึกแถว" },
    ]);
    expect(summary.createdLocations).toEqual([]);
    // Exactly ONE row — the reworded name must NOT mint a duplicate.
    expect(hoisted.locationRows).toHaveLength(1);
    // Description stays frozen (no DB write on reuse).
    expect((hoisted.locationRows[0].data as { description: string }).description).toBe(
      "original, already-approved description",
    );
  });

  it("normalized-name fallback also dedups within-call: two incoming groups with the same name and no pre-existing row — first inserts, second reuses", async () => {
    hoisted.locationRows = [];

    const groups: VerticalDramaStoryboardLocationGroup[] = [
      { locationKey: "location-1", locationName: "ตรอกลับ", description: "first mention", shotNumbers: [1] },
      { locationKey: "location-5", locationName: "ตรอกลับ", description: "second mention, different key", shotNumbers: [5] },
    ];

    const summary = await reconcileEpisodeLocations(owner, groups);

    expect(summary.createdLocations).toEqual([{ locationKey: "location-1", name: "ตรอกลับ" }]);
    expect(summary.reusedLocations).toEqual([{ locationKey: "location-1", name: "ตรอกลับ" }]);
    expect(hoisted.locationRows).toHaveLength(1);
  });
});

/**
 * Production-grade full-story generation
 * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
 * — `persistDeepDraftDeclaredLocations`, called by
 * `runGenerateStoryBibleDeepJob` (`server/routers/verticalDramaSeries.ts`)
 * after the bible write, to persist `generateStoryBibleDeep`'s
 * `GenerateStoryBibleDeepResult.newLocations` into `vertical_drama_locations`.
 */
describe("persistDeepDraftDeclaredLocations", () => {
  function declared(overrides: Record<string, unknown> = {}) {
    return {
      location_key: "loc-hospital-roof",
      name: "ดาดฟ้าโรงพยาบาล",
      description: "ดาดฟ้าเปิดโล่งเหนือโรงพยาบาล มองเห็นเมืองด้านล่าง",
      environment: "ลมแรง แสงยามเย็นสีส้ม เสียงรถราไกลๆ",
      time_of_day: "evening",
      mood: "tense",
      ...overrides,
    };
  }

  it("inserts a genuinely new location with description/environment/time_of_day/mood + source provenance in data", async () => {
    hoisted.locationRows = [];

    const summary = await persistDeepDraftDeclaredLocations(owner, [declared()]);

    expect(summary.createdLocations).toEqual([
      { locationKey: "loc-hospital-roof", name: "ดาดฟ้าโรงพยาบาล" },
    ]);
    expect(summary.skippedExistingKeys).toEqual([]);
    expect(hoisted.locationRows).toHaveLength(1);
    const row = hoisted.locationRows[0];
    expect(row.locationKey).toBe("loc-hospital-roof");
    expect(row.name).toBe("ดาดฟ้าโรงพยาบาล");
    expect(row.data).toEqual({
      description: "ดาดฟ้าเปิดโล่งเหนือโรงพยาบาล มองเห็นเมืองด้านล่าง",
      environment: "ลมแรง แสงยามเย็นสีส้ม เสียงรถราไกลๆ",
      timeOfDay: "evening",
      mood: "tense",
      source: "deep_story_draft",
    });
  });

  it("NEVER overwrites an existing row's data when the declared key already exists — skips it and reports it", async () => {
    hoisted.locationRows = [
      makeLocationRow({
        id: 1,
        locationKey: "loc-hospital-roof",
        name: "ดาดฟ้าโรงพยาบาล (เดิม)",
        data: { description: "original, already-approved description" },
      }),
    ];

    const summary = await persistDeepDraftDeclaredLocations(owner, [
      declared({ name: "ชื่อใหม่ที่โมเดลอยากตั้ง", description: "คำอธิบายใหม่ที่ต่างไปจากเดิม" }),
    ]);

    expect(summary.createdLocations).toEqual([]);
    expect(summary.skippedExistingKeys).toEqual(["loc-hospital-roof"]);
    expect(hoisted.locationRows).toHaveLength(1);
    expect(hoisted.locationRows[0].name).toBe("ดาดฟ้าโรงพยาบาล (เดิม)");
    expect((hoisted.locationRows[0].data as { description: string }).description).toBe(
      "original, already-approved description",
    );
  });

  it("dedupes a key declared twice within the SAME call — only the first insert survives, the second is skipped", async () => {
    hoisted.locationRows = [];

    const summary = await persistDeepDraftDeclaredLocations(owner, [
      declared({ location_key: "loc-rooftop", name: "First" }),
      declared({ location_key: "loc-rooftop", name: "Second (should be skipped)" }),
    ]);

    expect(summary.createdLocations).toEqual([{ locationKey: "loc-rooftop", name: "First" }]);
    expect(summary.skippedExistingKeys).toEqual(["loc-rooftop"]);
    expect(hoisted.locationRows).toHaveLength(1);
    expect(hoisted.locationRows[0].name).toBe("First");
  });

  it("handles a mixed batch: one genuinely new insert + one skipped existing key in a single call", async () => {
    hoisted.locationRows = [makeLocationRow({ id: 1, locationKey: "loc_store", name: "ร้านสะดวกซื้อ" })];

    const summary = await persistDeepDraftDeclaredLocations(owner, [
      declared({ location_key: "loc-new-alley", name: "ตรอกใหม่" }),
      declared({ location_key: "loc_store", name: "ร้านสะดวกซื้อ (พยายามประกาศซ้ำ)" }),
    ]);

    expect(summary.createdLocations).toEqual([{ locationKey: "loc-new-alley", name: "ตรอกใหม่" }]);
    expect(summary.skippedExistingKeys).toEqual(["loc_store"]);
    expect(hoisted.locationRows).toHaveLength(2);
  });

  it("skips a declaration with no usable location_key/name (never throws)", async () => {
    hoisted.locationRows = [];

    const summary = await persistDeepDraftDeclaredLocations(owner, [
      declared({ location_key: "", name: "" }),
    ]);

    expect(summary).toEqual({ createdLocations: [], skippedExistingKeys: [] });
    expect(hoisted.locationRows).toHaveLength(0);
  });

  it("omits time_of_day/mood from data when the declaration didn't supply them", async () => {
    hoisted.locationRows = [];

    await persistDeepDraftDeclaredLocations(owner, [
      declared({ location_key: "loc-alley", time_of_day: undefined, mood: undefined }),
    ]);

    expect(hoisted.locationRows[0].data).toEqual({
      description: "ดาดฟ้าเปิดโล่งเหนือโรงพยาบาล มองเห็นเมืองด้านล่าง",
      environment: "ลมแรง แสงยามเย็นสีส้ม เสียงรถราไกลๆ",
      source: "deep_story_draft",
    });
  });

  it("normalized-name fallback: skips (never inserts, never overwrites) a declared location whose name matches an existing row under a DIFFERENT location_key", async () => {
    hoisted.locationRows = [
      makeLocationRow({
        id: 1,
        locationKey: "loc-hospital-roof",
        name: "ดาดฟ้าโรงพยาบาล",
        data: { description: "original, already-approved description" },
      }),
    ];

    const summary = await persistDeepDraftDeclaredLocations(owner, [
      declared({
        location_key: "loc-hospital-roof-new",
        name: "ดาดฟ้าโรงพยาบาล",
        description: "a completely different incoming description",
      }),
    ]);

    expect(summary.createdLocations).toEqual([]);
    // Records the MATCHED (existing) row's own key, not the incoming one.
    expect(summary.skippedExistingKeys).toEqual(["loc-hospital-roof"]);
    expect(hoisted.locationRows).toHaveLength(1);
    expect((hoisted.locationRows[0].data as { description: string }).description).toBe(
      "original, already-approved description",
    );
  });

  it("returns empty summaries and never queries the DB for an empty declaredLocations array", async () => {
    const { db } = await import("../../db");
    const summary = await persistDeepDraftDeclaredLocations(owner, []);

    expect(summary).toEqual({ createdLocations: [], skippedExistingKeys: [] });
    expect(db.select).not.toHaveBeenCalled();
  });
});
