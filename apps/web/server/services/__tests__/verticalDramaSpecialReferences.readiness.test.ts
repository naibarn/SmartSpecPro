import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcileVerticalDramaMediaAsset: vi.fn(),
  rows: [] as Array<{
    id: number;
    status: string;
    storageKey: string | null;
    originalUrl: string | null;
    mimeType: string;
  }>,
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(mocks.rows),
      })),
    })),
  },
}));
vi.mock("../verticalDramaMediaAssetService", () => ({
  copyAuthorizedManagedMediaToVerticalDrama: vi.fn(),
  ingestVerticalDramaMediaAsset: vi.fn(),
  reconcileVerticalDramaMediaAsset: mocks.reconcileVerticalDramaMediaAsset,
}));

import { assertOwnedSpecialMediaAssets } from "../verticalDramaSpecialReferences";

describe("special tie-in reference readiness", () => {
  it("repairs a pending image asset when its managed object is still present", async () => {
    mocks.rows = [
      {
        id: 4676,
        status: "pending",
        storageKey: "vertical-drama/53/image/image/portrait.png",
        originalUrl: "/api/storage/files/vertical-drama/53/image/image/portrait.png",
        mimeType: "image/png",
      },
    ];
    mocks.reconcileVerticalDramaMediaAsset.mockResolvedValue({
      mediaAssetId: 4676,
      storageKey: "vertical-drama/53/image/image/portrait.png",
      url: "/api/storage/files/vertical-drama/53/image/image/portrait.png",
      mimeType: "image/png",
      status: "ready",
    });

    await expect(
      assertOwnedSpecialMediaAssets(
        { tenantId: "tenant-1", userId: 1 },
        ["4676"],
      ),
    ).resolves.toBeUndefined();
    expect(mocks.reconcileVerticalDramaMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ mediaAssetId: 4676, mediaType: "image" }),
    );
  });

  it("keeps the reference blocked when reconciliation confirms the object is gone", async () => {
    mocks.rows = [
      {
        id: 4676,
        status: "pending",
        storageKey: "vertical-drama/53/image/image/missing.png",
        originalUrl: "/api/storage/files/vertical-drama/53/image/image/missing.png",
        mimeType: "image/png",
      },
    ];
    mocks.reconcileVerticalDramaMediaAsset.mockResolvedValue({
      mediaAssetId: 4676,
      storageKey: "vertical-drama/53/image/image/missing.png",
      url: "",
      mimeType: "image/png",
      status: "expired",
    });

    await expect(
      assertOwnedSpecialMediaAssets(
        { tenantId: "tenant-1", userId: 1 },
        ["4676"],
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "One or more reference images are not ready image assets",
    });
  });
});
