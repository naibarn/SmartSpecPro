/**
 * Vertical Drama Series — Location Visual Bible "multiple candidates, pick a
 * primary" (Phase C) unit coverage for `verticalDramaLocationStock.ts`.
 *
 * The router test suite (`verticalDramaLocations.test.ts`) mocks
 * `verticalDramaLocationStockService` wholesale, so it can only prove the
 * router forwards whatever the service returns — it can never exercise the
 * actual marker-resolution rule (that logic lives entirely in THIS file).
 * This suite mocks only `db` (same convention as the sibling
 * `verticalDramaCharacterStock.test.ts`) and drives the real service class
 * directly.
 *
 * Covers:
 *  - `extractPrimaryAssetLinkIdMarker` (pure) — malformed/legacy `data` is
 *    treated identically to "no marker set".
 *  - `getPrimaryReferenceUrl`/`getPrimaryReferenceAssetId`: explicit marker
 *    wins (and short-circuits the original fallback query entirely); falls
 *    back to the ORIGINAL unchanged newest-first query when unset OR when
 *    the marker no longer resolves to a valid asset.
 *  - `listRows`: same marker-wins/fallback rule, plus cross-location marker
 *    leak prevention.
 *  - `listLocationAssets`: `isPrimary` computed via the same rule against
 *    the fetched candidate set; null-url rows filtered out.
 *  - `setPrimaryAsset`: only an approved, establishing_plate, same-location,
 *    media-backed asset can be marked primary; merges into (never clobbers)
 *    the location's existing `data`.
 *  - Marker auto-clear wiring: `deleteAsset`/`transition`(to non-approved)/
 *    `markStale` clear `data.primaryAssetLinkId` ONLY when the affected
 *    asset was the current marker.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

import {
  VerticalDramaLocationStockService,
  VerticalDramaLocationStockError,
  extractPrimaryAssetLinkIdMarker,
} from "../verticalDramaLocationStock";

/** Thenable select-chain stub — resolves at ANY point in the chain
 *  (from/innerJoin/where/orderBy/limit), same "resolves at any point"
 *  convention as `verticalDramaLocations.test.ts`'s own `selectChain`
 *  (necessary here since this file's methods mix plain selects, joined
 *  selects, and joined+ordered+limited selects). */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

/** Thenable update-chain stub — supports both `.set().where().returning()`
 *  (transition's own update) and `.set().where()` awaited directly with no
 *  `.returning()` at all (the marker-write/marker-clear paths). */
function updateChain(returned: unknown[] = []) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
    then: (resolve: any, reject: any) => Promise.resolve(returned).then(resolve, reject),
  };
  return chain;
}

function deleteChain() {
  return { where: vi.fn(() => Promise.resolve(undefined)) };
}

function locationRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    tenantId: "t1",
    userId: 42,
    seriesId: 10,
    locationKey: "loc_convenience_store",
    name: "ร้านสะดวกซื้อ",
    data: { description: "แถวชั้นวางของเด็ก" },
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...over,
  };
}

function assetRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 901,
    tenantId: "t1",
    userId: 42,
    seriesId: 10,
    locationId: 5,
    mediaAssetId: 501,
    assetType: "location_reference",
    role: "establishing_plate",
    approved: true,
    qcStatus: "passed",
    checksumSha256: null,
    metadata: { state: "approved", source: "generated" },
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...over,
  };
}

const OWNER = { tenantId: "t1", userId: 42, seriesId: 10 };

beforeEach(() => {
  mockDb.select.mockReset();
  mockDb.update.mockReset();
  mockDb.insert.mockReset();
  mockDb.delete.mockReset();
});

describe("extractPrimaryAssetLinkIdMarker", () => {
  it("returns undefined for null/undefined/non-object data", () => {
    expect(extractPrimaryAssetLinkIdMarker(null)).toBeUndefined();
    expect(extractPrimaryAssetLinkIdMarker(undefined)).toBeUndefined();
    expect(extractPrimaryAssetLinkIdMarker("not-an-object")).toBeUndefined();
  });

  it("returns undefined when the key is missing (legacy/pre-feature data)", () => {
    expect(extractPrimaryAssetLinkIdMarker({ description: "x" })).toBeUndefined();
  });

  it("returns undefined for a non-number / non-finite / non-positive marker", () => {
    expect(extractPrimaryAssetLinkIdMarker({ primaryAssetLinkId: "901" })).toBeUndefined();
    expect(extractPrimaryAssetLinkIdMarker({ primaryAssetLinkId: 0 })).toBeUndefined();
    expect(extractPrimaryAssetLinkIdMarker({ primaryAssetLinkId: -5 })).toBeUndefined();
    expect(extractPrimaryAssetLinkIdMarker({ primaryAssetLinkId: Number.NaN })).toBeUndefined();
  });

  it("returns the marker when it is a positive finite number", () => {
    expect(extractPrimaryAssetLinkIdMarker({ primaryAssetLinkId: 901 })).toBe(901);
  });
});

describe("getPrimaryReferenceUrl / getPrimaryReferenceAssetId — marker resolution", () => {
  it("falls back to the original newest-first query, UNCHANGED, when no marker is set", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ data: null }])) // loadLocationData — no marker
      .mockReturnValueOnce(selectChain([{ url: "https://cdn.example.com/fallback.png" }])); // fallback query

    const service = new VerticalDramaLocationStockService();
    const url = await service.getPrimaryReferenceUrl(OWNER, 5);

    expect(url).toBe("https://cdn.example.com/fallback.png");
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it("uses the explicit marker's url when it resolves to a still-valid approved asset, SHORT-CIRCUITING the fallback query", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }])) // loadLocationData — marker=901
      .mockReturnValueOnce(selectChain([{ mediaAssetId: 501, url: "https://cdn.example.com/marker.png" }])); // marker validation — found

    const service = new VerticalDramaLocationStockService();
    const url = await service.getPrimaryReferenceUrl(OWNER, 5);

    expect(url).toBe("https://cdn.example.com/marker.png");
    // Exactly 2 selects — the original newest-first fallback query never ran.
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it("falls back to the newest-first query when the marker no longer resolves to a valid asset", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }])) // marker=901
      .mockReturnValueOnce(selectChain([])) // marker validation — NOT found (deleted / wrong location / unapproved / wrong role)
      .mockReturnValueOnce(selectChain([{ url: "https://cdn.example.com/fallback.png" }])); // fallback query

    const service = new VerticalDramaLocationStockService();
    const url = await service.getPrimaryReferenceUrl(OWNER, 5);

    expect(url).toBe("https://cdn.example.com/fallback.png");
    expect(mockDb.select).toHaveBeenCalledTimes(3);
  });

  it("getPrimaryReferenceAssetId returns the marker's mediaAssetId when the marker is valid", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }]))
      .mockReturnValueOnce(selectChain([{ mediaAssetId: 501, url: "https://cdn.example.com/marker.png" }]));

    const service = new VerticalDramaLocationStockService();
    const id = await service.getPrimaryReferenceAssetId(OWNER, 5);

    expect(id).toBe(501);
  });

  it("getPrimaryReferenceAssetId falls back to the newest-first query's own id when no marker is set", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ data: null }]))
      .mockReturnValueOnce(selectChain([{ id: 777 }]));

    const service = new VerticalDramaLocationStockService();
    const id = await service.getPrimaryReferenceAssetId(OWNER, 5);

    expect(id).toBe(777);
  });
});

describe("listRows — marker resolution", () => {
  it("leaves primaryReferenceUrl/primaryReferenceAssetLinkId undefined when neither a marker nor an approved candidate exists", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([locationRow({ data: null })])) // roster
      .mockReturnValueOnce(selectChain([])); // approvedCandidates

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listRows(OWNER);

    expect(rows[0].primaryReferenceUrl).toBeUndefined();
    expect(rows[0].primaryReferenceAssetLinkId).toBeUndefined();
  });

  it("picks the newest-approved candidate when no marker is set (unchanged fallback)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([locationRow({ data: null })])).mockReturnValueOnce(
      selectChain([
        {
          id: 801,
          locationId: 5,
          url: "https://cdn.example.com/older.png",
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
        {
          id: 802,
          locationId: 5,
          url: "https://cdn.example.com/newer.png",
          updatedAt: new Date("2026-07-05T00:00:00.000Z"),
        },
      ]),
    );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listRows(OWNER);

    expect(rows[0].primaryReferenceUrl).toBe("https://cdn.example.com/newer.png");
    expect(rows[0].primaryReferenceAssetLinkId).toBe(802);
  });

  it("an explicit marker overrides the newest-approved pick, even when it is the OLDER candidate", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([locationRow({ data: { primaryAssetLinkId: 801 } })]))
      .mockReturnValueOnce(
        selectChain([
          {
            id: 801,
            locationId: 5,
            url: "https://cdn.example.com/older.png",
            updatedAt: new Date("2026-07-01T00:00:00.000Z"),
          },
          {
            id: 802,
            locationId: 5,
            url: "https://cdn.example.com/newer.png",
            updatedAt: new Date("2026-07-05T00:00:00.000Z"),
          },
        ]),
      );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listRows(OWNER);

    expect(rows[0].primaryReferenceUrl).toBe("https://cdn.example.com/older.png");
    expect(rows[0].primaryReferenceAssetLinkId).toBe(801);
  });

  it("falls back to newest-approved when the marker points at a DIFFERENT location's asset (cross-location leak prevention)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([locationRow({ id: 5, data: { primaryAssetLinkId: 999 } })]))
      .mockReturnValueOnce(
        selectChain([
          {
            id: 999,
            locationId: 6,
            url: "https://cdn.example.com/other-location.png",
            updatedAt: new Date("2026-07-09T00:00:00.000Z"),
          },
          {
            id: 802,
            locationId: 5,
            url: "https://cdn.example.com/newer.png",
            updatedAt: new Date("2026-07-05T00:00:00.000Z"),
          },
        ]),
      );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listRows(OWNER);

    expect(rows[0].primaryReferenceUrl).toBe("https://cdn.example.com/newer.png");
    expect(rows[0].primaryReferenceAssetLinkId).toBe(802);
  });

  it("falls back to newest-approved when the marker doesn't match any approved candidate at all (deleted/unapproved)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([locationRow({ data: { primaryAssetLinkId: 12345 } })]))
      .mockReturnValueOnce(
        selectChain([
          {
            id: 802,
            locationId: 5,
            url: "https://cdn.example.com/newer.png",
            updatedAt: new Date("2026-07-05T00:00:00.000Z"),
          },
        ]),
      );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listRows(OWNER);

    expect(rows[0].primaryReferenceUrl).toBe("https://cdn.example.com/newer.png");
  });
});

describe("listLocationAssets", () => {
  it("flags the newest APPROVED candidate as primary when no marker is set", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ data: null }])).mockReturnValueOnce(
      selectChain([
        {
          id: 802,
          mediaAssetId: 502,
          url: "https://cdn.example.com/newer.png",
          approved: true,
          updatedAt: new Date("2026-07-05T00:00:00.000Z"),
        },
        {
          id: 801,
          mediaAssetId: 501,
          url: "https://cdn.example.com/older.png",
          approved: true,
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ]),
    );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listLocationAssets(OWNER, 5);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.assetLinkId === 802)?.isPrimary).toBe(true);
    expect(rows.find((r) => r.assetLinkId === 801)?.isPrimary).toBe(false);
  });

  it("an explicit marker overrides the newest-approved pick", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 801 } }])).mockReturnValueOnce(
      selectChain([
        {
          id: 802,
          mediaAssetId: 502,
          url: "https://cdn.example.com/newer.png",
          approved: true,
          updatedAt: new Date("2026-07-05T00:00:00.000Z"),
        },
        {
          id: 801,
          mediaAssetId: 501,
          url: "https://cdn.example.com/older.png",
          approved: true,
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ]),
    );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listLocationAssets(OWNER, 5);

    expect(rows.find((r) => r.assetLinkId === 801)?.isPrimary).toBe(true);
    expect(rows.find((r) => r.assetLinkId === 802)?.isPrimary).toBe(false);
  });

  it("ignores a marker pointing at an UNAPPROVED row in this result set — falls back to newest approved", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 803 } }])).mockReturnValueOnce(
      selectChain([
        {
          id: 803,
          mediaAssetId: 503,
          url: "https://cdn.example.com/pending.png",
          approved: false,
          updatedAt: new Date("2026-07-06T00:00:00.000Z"),
        },
        {
          id: 801,
          mediaAssetId: 501,
          url: "https://cdn.example.com/older.png",
          approved: true,
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ]),
    );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listLocationAssets(OWNER, 5);

    expect(rows.find((r) => r.assetLinkId === 803)?.isPrimary).toBe(false);
    expect(rows.find((r) => r.assetLinkId === 801)?.isPrimary).toBe(true);
  });

  it("flags no row as primary when none are approved yet", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ data: null }]))
      .mockReturnValueOnce(
        selectChain([
          {
            id: 803,
            mediaAssetId: 503,
            url: "https://cdn.example.com/pending.png",
            approved: false,
            updatedAt: new Date("2026-07-06T00:00:00.000Z"),
          },
        ]),
      );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listLocationAssets(OWNER, 5);

    expect(rows.every((r) => !r.isPrimary)).toBe(true);
  });

  it("filters out candidates with no resolvable media-asset url before ranking/returning", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ data: null }])).mockReturnValueOnce(
      selectChain([
        {
          id: 804,
          mediaAssetId: 504,
          url: null,
          approved: true,
          updatedAt: new Date("2026-07-08T00:00:00.000Z"),
        },
        {
          id: 801,
          mediaAssetId: 501,
          url: "https://cdn.example.com/older.png",
          approved: true,
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ]),
    );

    const service = new VerticalDramaLocationStockService();
    const rows = await service.listLocationAssets(OWNER, 5);

    expect(rows).toHaveLength(1);
    expect(rows[0].assetLinkId).toBe(801);
  });
});

describe("setPrimaryAsset", () => {
  it("writes data.primaryAssetLinkId, MERGING (not clobbering) the location's existing data", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([assetRow({ id: 901, locationId: 5, role: "establishing_plate", approved: true, mediaAssetId: 501 })]),
      ) // loadOwnedRow
      .mockReturnValueOnce(selectChain([{ data: { description: "keep me" } }])); // loadLocationData
    let capturedSet: any;
    const uChain = updateChain();
    uChain.set = vi.fn((v: any) => {
      capturedSet = v;
      return uChain;
    });
    mockDb.update.mockReturnValueOnce(uChain);

    const service = new VerticalDramaLocationStockService();
    await service.setPrimaryAsset(OWNER, 5, 901);

    expect(capturedSet.data).toEqual({ description: "keep me", primaryAssetLinkId: 901 });
  });

  it("rejects when the asset belongs to a DIFFERENT location", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([assetRow({ locationId: 6 })]));

    const service = new VerticalDramaLocationStockService();
    let caught: unknown;
    try {
      await service.setPrimaryAsset(OWNER, 5, 901);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerticalDramaLocationStockError);
    expect((caught as VerticalDramaLocationStockError).reason).toBe("asset_not_found");
  });

  it("rejects a non-establishing_plate asset (asset_wrong_role)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([assetRow({ role: "other" })]));

    const service = new VerticalDramaLocationStockService();
    let caught: unknown;
    try {
      await service.setPrimaryAsset(OWNER, 5, 901);
    } catch (err) {
      caught = err;
    }
    expect((caught as VerticalDramaLocationStockError).reason).toBe("asset_wrong_role");
  });

  it("rejects a not-yet-approved asset (asset_not_approved)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([assetRow({ approved: false })]));

    const service = new VerticalDramaLocationStockService();
    let caught: unknown;
    try {
      await service.setPrimaryAsset(OWNER, 5, 901);
    } catch (err) {
      caught = err;
    }
    expect((caught as VerticalDramaLocationStockError).reason).toBe("asset_not_approved");
  });

  it("rejects an asset link with no linked media asset", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([assetRow({ mediaAssetId: null })]));

    const service = new VerticalDramaLocationStockService();
    let caught: unknown;
    try {
      await service.setPrimaryAsset(OWNER, 5, 901);
    } catch (err) {
      caught = err;
    }
    expect((caught as VerticalDramaLocationStockError).reason).toBe("asset_not_found");
  });

  it("rejects when the asset link does not exist at all", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedRow finds nothing

    const service = new VerticalDramaLocationStockService();
    let caught: unknown;
    try {
      await service.setPrimaryAsset(OWNER, 5, 901);
    } catch (err) {
      caught = err;
    }
    expect((caught as VerticalDramaLocationStockError).reason).toBe("asset_not_found");
  });

  it("rejects (defensively) when the location row can no longer be loaded", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([assetRow({ id: 901, locationId: 5, role: "establishing_plate", approved: true, mediaAssetId: 501 })]),
      )
      .mockReturnValueOnce(selectChain([])); // loadLocationData — location not found

    const service = new VerticalDramaLocationStockService();
    let caught: unknown;
    try {
      await service.setPrimaryAsset(OWNER, 5, 901);
    } catch (err) {
      caught = err;
    }
    expect((caught as VerticalDramaLocationStockError).reason).toBe("asset_not_found");
  });
});

describe("marker auto-clear wiring — deleteAsset / transition / markStale", () => {
  it("deleteAsset clears data.primaryAssetLinkId when the deleted asset WAS the marker", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([assetRow({ id: 901, locationId: 5 })])) // loadOwnedRow
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901, description: "keep" } }])); // clearPrimaryMarkerIfMatches's loadLocationData
    mockDb.delete.mockReturnValueOnce(deleteChain());
    let capturedSet: any;
    const uChain = updateChain();
    uChain.set = vi.fn((v: any) => {
      capturedSet = v;
      return uChain;
    });
    mockDb.update.mockReturnValueOnce(uChain);

    const service = new VerticalDramaLocationStockService();
    await service.deleteAsset(OWNER, 901);

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(capturedSet.data).toEqual({ description: "keep" });
  });

  it("deleteAsset does NOT touch the location row when the deleted asset was NOT the marker", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([assetRow({ id: 902, locationId: 5 })]))
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }])); // marker is a DIFFERENT asset
    mockDb.delete.mockReturnValueOnce(deleteChain());

    const service = new VerticalDramaLocationStockService();
    await service.deleteAsset(OWNER, 902);

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("transition to rejected clears the marker when this asset WAS the marker", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([assetRow({ id: 901, locationId: 5, metadata: { state: "approved" }, approved: true })]),
      ) // loadOwnedRow
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }])); // clearPrimaryMarkerIfMatches's loadLocationData
    mockDb.update.mockReturnValueOnce(
      updateChain([assetRow({ id: 901, approved: false, metadata: { state: "rejected" } })]),
    ); // transition's own update().returning()
    let capturedSet: any;
    const clearChain = updateChain();
    clearChain.set = vi.fn((v: any) => {
      capturedSet = v;
      return clearChain;
    });
    mockDb.update.mockReturnValueOnce(clearChain);

    const service = new VerticalDramaLocationStockService();
    await service.transition({ ...OWNER, assetLinkId: 901, to: "rejected" });

    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(capturedSet.data).toEqual({});
  });

  it("transition to rejected does NOT touch the location row when this asset was NOT the marker", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([assetRow({ id: 902, locationId: 5, metadata: { state: "approved" }, approved: true })]),
      )
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }])); // marker is a DIFFERENT asset
    mockDb.update.mockReturnValueOnce(
      updateChain([assetRow({ id: 902, approved: false, metadata: { state: "rejected" } })]),
    );

    const service = new VerticalDramaLocationStockService();
    await service.transition({ ...OWNER, assetLinkId: 902, to: "rejected" });

    // Only the ONE update (the transition's own) — the marker-clear check
    // ran (it always does for a non-approved target) but found no match, so
    // it never issued a second update.
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("transition INTO approved never attempts a marker-clear lookup at all", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([assetRow({ id: 901, locationId: 5, metadata: { state: "generated" }, approved: false })]),
    );
    mockDb.update.mockReturnValueOnce(
      updateChain([assetRow({ id: 901, approved: true, metadata: { state: "approved" } })]),
    );

    const service = new VerticalDramaLocationStockService();
    await service.transition({ ...OWNER, assetLinkId: 901, to: "approved" });

    // Only the ONE select (loadOwnedRow) and ONE update (the transition's
    // own) — transitioning INTO approved never needs to clear anything.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("markStale clears the marker for a staled asset that WAS the marker", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([assetRow({ id: 901, locationId: 5, metadata: { state: "approved" }, approved: true })]),
      ) // initial rows lookup
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }])); // clearPrimaryMarkerIfMatches's loadLocationData
    const staleUpdateChain: any = { where: vi.fn(() => Promise.resolve(undefined)) };
    staleUpdateChain.set = vi.fn(() => staleUpdateChain);
    mockDb.update.mockReturnValueOnce(staleUpdateChain); // the per-row stale update (no .returning())
    let capturedSet: any;
    const clearChain = updateChain();
    clearChain.set = vi.fn((v: any) => {
      capturedSet = v;
      return clearChain;
    });
    mockDb.update.mockReturnValueOnce(clearChain);

    const service = new VerticalDramaLocationStockService();
    const count = await service.markStale(OWNER, [901]);

    expect(count).toBe(1);
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(capturedSet.data).toEqual({});
  });

  it("markStale does NOT touch the location row for a staled asset that was NOT the marker", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([assetRow({ id: 902, locationId: 5, metadata: { state: "approved" }, approved: true })]),
      )
      .mockReturnValueOnce(selectChain([{ data: { primaryAssetLinkId: 901 } }])); // marker is a DIFFERENT asset
    const staleUpdateChain: any = { where: vi.fn(() => Promise.resolve(undefined)) };
    staleUpdateChain.set = vi.fn(() => staleUpdateChain);
    mockDb.update.mockReturnValueOnce(staleUpdateChain);

    const service = new VerticalDramaLocationStockService();
    const count = await service.markStale(OWNER, [902]);

    expect(count).toBe(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});
