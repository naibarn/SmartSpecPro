/**
 * Feature 135 — Hermes Grok media worker, section 09: `hermesMediaReferences.ts`
 * coverage — reference-set builder (assetId+sha256, never a URL field),
 * best-effort URL->assetId lookup, and the task-envelope shaper.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHermesMediaReferences,
  buildHermesMediaTaskEnvelope,
  resolveHermesReferenceAssetIdFromUrl,
  resolveHermesOrderedRefsFromUrls,
  HermesMediaReferenceAssetNotFoundError,
  type HermesMediaReferenceRepo,
  type HermesReferenceAssetLookupRepo,
} from "../hermesMediaReferences";
import { debugLog } from "../../_core/logger";

vi.mock("../../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

function fakeRepo(overrides: Partial<HermesMediaReferenceRepo> = {}): HermesMediaReferenceRepo {
  return {
    findAssetById: vi.fn(async () => null),
    persistChecksum: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("buildHermesMediaReferences", () => {
  it("builds references with continuous 1-based indices and pulls sha256 from the stored checksum column", async () => {
    const repo = fakeRepo({
      findAssetById: vi.fn(async ({ assetId }) => ({
        id: assetId,
        storageKey: `key-${assetId}`,
        checksumSha256: "a".repeat(64),
      })),
    });
    const hashObject = vi.fn();
    const refs = await buildHermesMediaReferences(
      {
        tenantId: "tenant-1",
        userId: 1,
        orderedRefs: [
          { assetId: "10", role: "start_frame", label: "Image-1" },
          { assetId: "11", role: "reference", label: "Image-2" },
        ],
      },
      { repo, hashObject },
    );
    expect(refs).toEqual([
      { assetId: "10", index: 1, role: "start_frame", label: "Image-1", sha256: "a".repeat(64) },
      { assetId: "11", index: 2, role: "reference", label: "Image-2", sha256: "a".repeat(64) },
    ]);
    // Checksum already present on the row — never falls back to hashing.
    expect(hashObject).not.toHaveBeenCalled();
  });

  it("computes + persists the checksum when the asset row has none yet", async () => {
    const persistChecksum = vi.fn(async () => {});
    const repo = fakeRepo({
      findAssetById: vi.fn(async () => ({ id: "42", storageKey: "k42", checksumSha256: null })),
      persistChecksum,
    });
    const hashObject = vi.fn(async () => "b".repeat(64));
    const refs = await buildHermesMediaReferences(
      { tenantId: "tenant-1", userId: 1, orderedRefs: [{ assetId: "42", role: "reference", label: "Image-1" }] },
      { repo, hashObject },
    );
    expect(refs[0].sha256).toBe("b".repeat(64));
    expect(hashObject).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: "42", storageKey: "k42" }),
    );
    expect(persistChecksum).toHaveBeenCalledWith({ assetId: "42", checksumSha256: "b".repeat(64) });
  });

  it("never fails the submit when the best-effort checksum write-back throws", async () => {
    const repo = fakeRepo({
      findAssetById: vi.fn(async () => ({ id: "42", storageKey: "k42", checksumSha256: null })),
      persistChecksum: vi.fn(async () => {
        throw new Error("write-back failed");
      }),
    });
    const hashObject = vi.fn(async () => "c".repeat(64));
    const refs = await buildHermesMediaReferences(
      { tenantId: "tenant-1", userId: 1, orderedRefs: [{ assetId: "42", role: "reference", label: "Image-1" }] },
      { repo, hashObject },
    );
    expect(refs[0].sha256).toBe("c".repeat(64));
  });

  it("throws HermesMediaReferenceAssetNotFoundError for an asset id that does not resolve for this owner", async () => {
    const repo = fakeRepo({ findAssetById: vi.fn(async () => null) });
    await expect(
      buildHermesMediaReferences(
        { tenantId: "tenant-1", userId: 1, orderedRefs: [{ assetId: "999", role: "reference", label: "Image-1" }] },
        { repo },
      ),
    ).rejects.toBeInstanceOf(HermesMediaReferenceAssetNotFoundError);
  });

  it("returns an empty array for an empty orderedRefs (image.generate, 0 references)", async () => {
    const repo = fakeRepo();
    const refs = await buildHermesMediaReferences({ tenantId: "t", userId: 1, orderedRefs: [] }, { repo });
    expect(refs).toEqual([]);
  });

  it("never emits a URL-shaped field on any reference (contract .strict() ban)", async () => {
    const repo = fakeRepo({
      findAssetById: vi.fn(async () => ({ id: "1", storageKey: "k", checksumSha256: "d".repeat(64) })),
    });
    const refs = await buildHermesMediaReferences(
      { tenantId: "t", userId: 1, orderedRefs: [{ assetId: "1", role: "reference", label: "Image-1" }] },
      { repo },
    );
    expect(Object.keys(refs[0]).sort()).toEqual(["assetId", "index", "label", "role", "sha256"].sort());
  });
});

describe("resolveHermesReferenceAssetIdFromUrl", () => {
  it("resolves an S3-proxy storage URL to its owning asset id", async () => {
    const repo: HermesReferenceAssetLookupRepo = {
      findAssetByStorageKey: vi.fn(async () => ({ id: "77" })),
    };
    const result = await resolveHermesReferenceAssetIdFromUrl(
      { tenantId: "t", userId: 1, url: "/api/storage/files/characters/portrait-1.png" },
      { repo },
    );
    expect(result).toBe("77");
    expect(repo.findAssetByStorageKey).toHaveBeenCalledWith({
      tenantId: "t",
      userId: 1,
      storageKey: "characters/portrait-1.png",
    });
  });

  it("resolves a local /uploads/ storage URL to its owning asset id", async () => {
    const repo: HermesReferenceAssetLookupRepo = {
      findAssetByStorageKey: vi.fn(async () => ({ id: "88" })),
    };
    const result = await resolveHermesReferenceAssetIdFromUrl(
      { tenantId: "t", userId: 1, url: "/uploads/locations/plate-1.png?x=1" },
      { repo },
    );
    expect(result).toBe("88");
    expect(repo.findAssetByStorageKey).toHaveBeenCalledWith({
      tenantId: "t",
      userId: 1,
      storageKey: "locations/plate-1.png",
    });
  });

  it("returns null (never throws) for a URL shape it cannot map back to a storage key", async () => {
    const repo: HermesReferenceAssetLookupRepo = {
      findAssetByStorageKey: vi.fn(async () => ({ id: "1" })),
    };
    const result = await resolveHermesReferenceAssetIdFromUrl(
      { tenantId: "t", userId: 1, url: "https://external.example.com/image.png" },
      { repo },
    );
    expect(result).toBeNull();
    expect(repo.findAssetByStorageKey).not.toHaveBeenCalled();
  });

  it("returns null when no owned asset row matches the storage key", async () => {
    const repo: HermesReferenceAssetLookupRepo = {
      findAssetByStorageKey: vi.fn(async () => null),
    };
    const result = await resolveHermesReferenceAssetIdFromUrl(
      { tenantId: "t", userId: 1, url: "/uploads/foo.png" },
      { repo },
    );
    expect(result).toBeNull();
  });
});

describe("buildHermesMediaTaskEnvelope", () => {
  it("shapes a pending MediaTask envelope from a freshly queued hermes taskId", () => {
    const task = buildHermesMediaTaskEnvelope({
      taskId: "hermes_job-1",
      userId: 42,
      mediaType: "image",
      model: "grok-imagine-image",
      prompt: "a portrait",
    });
    expect(task).toMatchObject({
      id: "hermes_job-1",
      userId: "42",
      mediaType: "image",
      status: "pending",
      model: "grok-imagine-image",
      prompt: "a portrait",
      creditsUsed: 0,
    });
    expect(typeof task.createdAt).toBe("string");
  });

  it("includes extraParams under parameters.extra_params when provided", () => {
    const task = buildHermesMediaTaskEnvelope({
      taskId: "hermes_job-2",
      userId: 1,
      mediaType: "video",
      model: "grok-imagine-video",
      prompt: "a clip",
      extraParams: { __vd_series_id: "5" },
    });
    expect(task.parameters).toEqual({ extra_params: { __vd_series_id: "5" } });
  });

  // Code review FIX 4: a dropped reference must never be silent.
  it("surfaces resultData.droppedReferenceCount when a reference was dropped", () => {
    const task = buildHermesMediaTaskEnvelope({
      taskId: "hermes_job-3",
      userId: 1,
      mediaType: "image",
      model: "grok-imagine-image",
      prompt: "a portrait",
      droppedReferenceCount: 1,
    });
    expect(task.resultData).toEqual({ droppedReferenceCount: 1 });
  });

  it("omits resultData entirely when nothing was dropped", () => {
    const task = buildHermesMediaTaskEnvelope({
      taskId: "hermes_job-4",
      userId: 1,
      mediaType: "image",
      model: "grok-imagine-image",
      prompt: "a portrait",
      droppedReferenceCount: 0,
    });
    expect(task.resultData).toBeUndefined();
  });
});

describe("resolveHermesOrderedRefsFromUrls (code review FIX 4 — audited reference resolution)", () => {
  beforeEach(() => {
    vi.mocked(debugLog).mockClear();
  });

  it("resolves every URL, preserving original-index-based labels, with zero drops", async () => {
    const repo: HermesReferenceAssetLookupRepo = {
      findAssetByStorageKey: vi.fn(async ({ storageKey }) => ({ id: `asset-${storageKey}` })),
    };
    const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls(
      {
        tenantId: "t",
        userId: 1,
        urls: ["/uploads/a.png", "/uploads/b.png"],
        traceId: "trace-1",
        connectionId: "conn-1",
      },
      { repo },
    );
    expect(droppedReferenceCount).toBe(0);
    expect(orderedRefs).toEqual([
      { assetId: "asset-a.png", role: "reference", label: "Image-1" },
      { assetId: "asset-b.png", role: "reference", label: "Image-2" },
    ]);
    expect(debugLog).not.toHaveBeenCalled();
  });

  it("drops an unresolvable URL, logs the drop with traceId+connectionId (never the url), and reports the count", async () => {
    const repo: HermesReferenceAssetLookupRepo = {
      findAssetByStorageKey: vi.fn(async ({ storageKey }) =>
        storageKey === "a.png" ? { id: "asset-a" } : null,
      ),
    };
    const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls(
      {
        tenantId: "t",
        userId: 1,
        urls: ["/uploads/a.png", "https://external.example.com/not-owned.png"],
        traceId: "trace-2",
        connectionId: "conn-2",
      },
      { repo },
    );
    expect(droppedReferenceCount).toBe(1);
    // Original-index-based label — the surviving entry keeps "Image-1", the
    // numbering is never compacted around the dropped slot.
    expect(orderedRefs).toEqual([{ assetId: "asset-a", role: "reference", label: "Image-1" }]);
    expect(debugLog).toHaveBeenCalledWith(
      "hermesMediaReferences",
      expect.stringContaining("Dropped"),
      expect.objectContaining({ traceId: "trace-2", connectionId: "conn-2", referenceIndex: 1 }),
    );
  });

  it("supports custom roleFor/labelFor keyed off the ORIGINAL loop index", async () => {
    const repo: HermesReferenceAssetLookupRepo = {
      findAssetByStorageKey: vi.fn(async () => null).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "asset-2" }),
    };
    const { orderedRefs } = await resolveHermesOrderedRefsFromUrls(
      {
        tenantId: "t",
        userId: 1,
        urls: ["/uploads/missing.png", "/uploads/present.png"],
        traceId: "trace-3",
        connectionId: "conn-3",
        roleFor: (i) => (i === 0 ? "start_frame" : "reference"),
      },
      { repo },
    );
    expect(orderedRefs).toEqual([{ assetId: "asset-2", role: "reference", label: "Image-2" }]);
  });
});
