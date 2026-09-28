import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the lazy `db` proxy before importing the service under test — mirrors
// the mocking pattern used by mediaAssetService.test.ts for DB-backed paths.
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "../../db";
import {
  VerticalDramaShotReferencesService,
  VerticalDramaShotReferenceError,
  shotReferenceRowToContract,
  buildShotReferenceManifest,
  type VerticalDramaShotReferenceContract,
} from "../verticalDramaShotReferences";
import type { VerticalDramaShotReferenceRow } from "../../../drizzle/schema";

const mockDb = vi.mocked(db, true);

function row(over: Partial<VerticalDramaShotReferenceRow> = {}): VerticalDramaShotReferenceRow {
  return {
    id: 1,
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 10,
    episodeId: 100,
    shotNumber: 3,
    mediaAssetId: 500,
    role: "reference",
    source: "grid_cut",
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  } as VerticalDramaShotReferenceRow;
}

/** Build a thenable chain stub so `await db.select()....where(...)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

function deleteChain() {
  const chain: any = {
    where: vi.fn(() => Promise.resolve(undefined)),
  };
  return chain;
}

describe("shotReferenceRowToContract", () => {
  it("maps a durable row to a browser-safe contract", () => {
    const contract = shotReferenceRowToContract(row(), "https://cdn.example.com/thumb.jpg");
    expect(contract.referenceId).toBe("1");
    expect(contract.seriesId).toBe("10");
    expect(contract.episodeId).toBe("100");
    expect(contract.shotNumber).toBe(3);
    expect(contract.mediaAssetId).toBe("500");
    expect(contract.role).toBe("reference");
    expect(contract.source).toBe("grid_cut");
    expect(contract.thumbnailUrl).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("defaults role to reference when the column is null", () => {
    const contract = shotReferenceRowToContract(row({ role: null as any }));
    expect(contract.role).toBe("reference");
  });

  it("does not expose an expired thumbnail URL to the browser", () => {
    const contract = shotReferenceRowToContract(
      row(),
      "https://tempfile.example/expired.png",
      "expired",
    );
    expect(contract.thumbnailStatus).toBe("expired");
    expect(contract.thumbnailUrl).toBeUndefined();
  });

  it("keeps a pending managed thumbnail available for the browser to verify", () => {
    const contract = shotReferenceRowToContract(
      row(),
      "/api/storage/files/pending.png",
      "pending",
    );
    expect(contract.thumbnailStatus).toBe("pending");
    expect(contract.thumbnailUrl).toBe("/api/storage/files/pending.png");
  });
});

describe("buildShotReferenceManifest", () => {
  function contract(over: Partial<VerticalDramaShotReferenceContract> = {}): VerticalDramaShotReferenceContract {
    return {
      referenceId: "1",
      seriesId: "10",
      episodeId: "100",
      shotNumber: 1,
      mediaAssetId: "500",
      role: "reference",
      source: "grid_cut",
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      ...over,
    };
  }

  it("groups references by shot number", () => {
    const manifest = buildShotReferenceManifest([
      contract({ referenceId: "1", shotNumber: 1 }),
      contract({ referenceId: "2", shotNumber: 2 }),
      contract({ referenceId: "3", shotNumber: 1 }),
    ]);
    expect(manifest[1]).toHaveLength(2);
    expect(manifest[2]).toHaveLength(1);
  });

  it("orders each shot's bucket by sortOrder then createdAt", () => {
    const manifest = buildShotReferenceManifest([
      contract({ referenceId: "a", sortOrder: 2, createdAt: "2026-01-01T00:00:00.000Z" }),
      contract({ referenceId: "b", sortOrder: 0, createdAt: "2026-01-02T00:00:00.000Z" }),
      contract({ referenceId: "c", sortOrder: 0, createdAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(manifest[1].map((r) => r.referenceId)).toEqual(["c", "b", "a"]);
  });

  it("returns an empty manifest for an empty input", () => {
    expect(buildShotReferenceManifest([])).toEqual({});
  });
});

describe("VerticalDramaShotReferencesService", () => {
  const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10 };
  let service: VerticalDramaShotReferencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VerticalDramaShotReferencesService();
  });

  describe("ownership guard", () => {
    it("throws episode_not_found when the episode isn't owned by the caller", async () => {
      mockDb.select.mockReturnValueOnce(selectChain([])); // assertEpisodeOwned -> no row

      await expect(
        service.linkReference({
          ...owner,
          episodeId: 999,
          shotNumber: 1,
          mediaAssetId: 500,
          source: "grid_cut",
        }),
      ).rejects.toThrow(VerticalDramaShotReferenceError);
    });

    it("throws media_asset_cross_tenant when the media asset belongs to another tenant", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }])) // assertEpisodeOwned -> owned
        .mockReturnValueOnce(selectChain([])) // assertMediaAssetAttachable: scoped (tenant+user) lookup -> miss
        .mockReturnValueOnce(
          selectChain([{ id: 500, tenantId: "other-tenant", userId: 42 }]),
        ); // assertMediaAssetAttachable: unscoped fallback lookup -> determines reason

      await expect(
        service.linkReference({
          ...owner,
          episodeId: 100,
          shotNumber: 1,
          mediaAssetId: 500,
          source: "grid_cut",
        }),
      ).rejects.toMatchObject({ reason: "media_asset_cross_tenant" });
    });

    it("throws media_asset_deleted when the media asset is in an unattachable state", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }]))
        .mockReturnValueOnce(
          selectChain([{ id: 500, tenantId: "tenant-1", userId: 42, status: "deleted" }]),
        );

      await expect(
        service.linkReference({
          ...owner,
          episodeId: 100,
          shotNumber: 1,
          mediaAssetId: 500,
          source: "upload",
        }),
      ).rejects.toMatchObject({ reason: "media_asset_deleted" });
    });

    it("rejects a media asset that exists but is not ready", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }]))
        .mockReturnValueOnce(
          selectChain([{ id: 500, tenantId: "tenant-1", userId: 42, status: "pending" }]),
        );

      await expect(
        service.linkReference({
          ...owner,
          episodeId: 100,
          shotNumber: 1,
          mediaAssetId: 500,
          source: "upload",
        }),
      ).rejects.toMatchObject({ reason: "media_asset_not_ready" });
    });

    it("throws media_asset_cross_user when the media asset belongs to another user in the same tenant", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }])) // assertEpisodeOwned -> owned
        .mockReturnValueOnce(selectChain([])) // scoped (tenant+user) lookup -> miss
        .mockReturnValueOnce(
          selectChain([{ id: 500, tenantId: "tenant-1", userId: 999 }]),
        ); // unscoped fallback -> same tenant, different user

      await expect(
        service.linkReference({
          ...owner,
          episodeId: 100,
          shotNumber: 1,
          mediaAssetId: 500,
          source: "grid_cut",
        }),
      ).rejects.toMatchObject({ reason: "media_asset_cross_user" });
    });

    it("throws media_asset_not_found when the media asset does not exist at all", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }])) // assertEpisodeOwned -> owned
        .mockReturnValueOnce(selectChain([])) // scoped lookup -> miss
        .mockReturnValueOnce(selectChain([])); // unscoped fallback -> also miss (row truly doesn't exist)

      await expect(
        service.linkReference({
          ...owner,
          episodeId: 100,
          shotNumber: 1,
          mediaAssetId: 500,
          source: "grid_cut",
        }),
      ).rejects.toMatchObject({ reason: "media_asset_not_found" });
    });
  });

  describe("linkReference", () => {
    it("inserts a new row when no existing link matches the unique key", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }])) // assertEpisodeOwned
        .mockReturnValueOnce(
          selectChain([{ id: 500, tenantId: "tenant-1", userId: 42, status: "ready" }]),
        ) // assertMediaAssetAttachable
        .mockReturnValueOnce(selectChain([])); // idempotency check -> no existing row
      mockDb.insert.mockReturnValueOnce(insertChain([row({ id: 7 })]));

      const result = await service.linkReference({
        ...owner,
        episodeId: 100,
        shotNumber: 3,
        mediaAssetId: 500,
        source: "grid_cut",
      });

      expect(result.referenceId).toBe("7");
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it("is idempotent — returns the existing row instead of inserting a duplicate", async () => {
      const existing = row({ id: 7 });
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }]))
        .mockReturnValueOnce(
          selectChain([{ id: 500, tenantId: "tenant-1", userId: 42, status: "ready" }]),
        )
        .mockReturnValueOnce(selectChain([existing])); // idempotency check -> found

      const result = await service.linkReference({
        ...owner,
        episodeId: 100,
        shotNumber: 3,
        mediaAssetId: 500,
        source: "grid_cut",
      });

      expect(result.referenceId).toBe("7");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe("deleteReference", () => {
    it("throws reference_not_found for an unowned reference id", async () => {
      mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedRow -> no row

      await expect(service.deleteReference(owner, 999)).rejects.toMatchObject({
        reason: "reference_not_found",
      });
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("deletes an owned reference row", async () => {
      mockDb.select.mockReturnValueOnce(selectChain([row({ id: 7 })]));
      mockDb.delete.mockReturnValueOnce(deleteChain());

      await service.deleteReference(owner, 7);
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe("reorder", () => {
    it("skips ids not owned by the shot and persists sortOrder for the rest", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ id: 100 }])) // assertEpisodeOwned
        .mockReturnValueOnce(selectChain([row({ id: 1 }), row({ id: 2 })])); // owned rows for the shot
      mockDb.update
        .mockReturnValueOnce(updateChain([row({ id: 2, sortOrder: 0 })]))
        .mockReturnValueOnce(updateChain([row({ id: 1, sortOrder: 1 })]));

      const result = await service.reorder({
        ...owner,
        episodeId: 100,
        shotNumber: 3,
        orderedReferenceIds: [2, 999, 1],
      });

      expect(result.map((r) => r.referenceId)).toEqual(["2", "1"]);
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });
  });
});
