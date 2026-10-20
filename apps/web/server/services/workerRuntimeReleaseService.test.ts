import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows, mockGetDb, mockPresign } = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  mockGetDb: vi.fn(),
  mockPresign: vi.fn(),
}));
vi.mock("../db", () => ({ getDb: mockGetDb }));
vi.mock("../storage", () => ({
  storageDelete: vi.fn(), storagePresignPut: mockPresign,
  storagePutFromPath: vi.fn(), storageStreamFile: vi.fn(),
}));
vi.mock("./workerRuntimeSigningKeyService", () => ({ getWorkerRuntimeSigningKey: vi.fn() }));
vi.mock("./desktopReleaseSettings", () => ({ getDesktopReleaseConfig: vi.fn() }));

import {
  getLatestPublishedWorkerRuntimeRelease,
  listWorkerRuntimeReleaseCatalog,
  presignWorkerRuntimeReleaseUpload,
  publishWorkerRuntimeRelease,
} from "./workerRuntimeReleaseService";

function release(runtimeId: string, id: number) {
  return {
    id, runtimeId, platform: runtimeId.includes("macos") ? "macos" : "windows",
    version: "0.1.0", channel: "stable", fileName: `smart-ai-hub-worker-runtime-${runtimeId}-0.1.0.zip`,
    contentType: "application/zip", fileSizeBytes: 123, fileSha256: "a".repeat(64),
    manifestJson: {}, validationStatus: "valid", validationChecksJson: [],
    isPublished: true, publishedAt: new Date("2026-10-20T00:00:00Z"), withdrawnAt: null,
    uploadedAt: new Date("2026-10-20T00:00:00Z"), updatedAt: new Date("2026-10-20T00:00:00Z"),
    uploadedBy: 1, uploadedByName: "Admin",
  };
}

describe("paused macOS runtime release distribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.splice(0, rows.length, release("hyperframes-macos-arm64", 1), release("hyperframes-windows-x64", 2));
    const result = Object.assign(Promise.resolve(rows), { where: vi.fn().mockResolvedValue(rows) });
    mockGetDb.mockReturnValue({ select: () => ({ from: () => ({ leftJoin: () => result }) }) });
  });

  it("keeps admin history while excluding paused published packs from public discovery and current selection", async () => {
    const admin = await listWorkerRuntimeReleaseCatalog({ includeUnpublished: true });
    expect(admin.releases.map(item => item.id)).toEqual([2, 1]);
    expect(admin.currentByRuntime["hyperframes-macos-arm64"]).toBeNull();
    expect(admin.currentByRuntime["hyperframes-windows-x64"]?.id).toBe(2);
    const publicCatalog = await listWorkerRuntimeReleaseCatalog();
    expect(publicCatalog.releases.map(item => item.id)).toEqual([2]);
    expect(rows[0].isPublished).toBe(true);
  });

  it("does not resolve a paused runtime as a downloadable latest release", async () => {
    expect(await getLatestPublishedWorkerRuntimeRelease("hyperframes-macos-arm64")).toBeNull();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("blocks re-publication without modifying retained records", async () => {
    await expect(publishWorkerRuntimeRelease(1)).rejects.toMatchObject({ code: "runtime_pack_paused", statusCode: 409 });
    expect(rows[0].isPublished).toBe(true);
  });

  it("blocks new upload URLs before allocating storage", async () => {
    await expect(presignWorkerRuntimeReleaseUpload({
      runtimeId: "hyperframes-macos-arm64", platform: "macos", version: "0.1.0", channel: "stable",
      fileName: "smart-ai-hub-worker-runtime-hyperframes-macos-arm64-0.1.0.zip",
      contentType: "application/zip", fileSizeBytes: 123,
    })).rejects.toMatchObject({ code: "runtime_pack_paused", statusCode: 409 });
    expect(mockPresign).not.toHaveBeenCalled();
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});
