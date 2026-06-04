import { beforeEach, describe, expect, it, vi } from "vitest";

const storageExistsMock = vi.hoisted(() => vi.fn());

vi.mock("../../storage", () => ({
  storageExists: storageExistsMock,
  storagePut: vi.fn(),
  storageResolveUrl: vi.fn(),
}));

import { serverVerifiedProviderEvidenceFromAnchorsForTest } from "../marketplaceAutoReviewService";

describe("marketplace auto review reference evidence", () => {
  beforeEach(() => {
    storageExistsMock.mockReset();
  });

  it("accepts uploaded anchors whose storage key was randomized by ai.upload", async () => {
    storageExistsMock.mockResolvedValue(true);

    const evidence = await serverVerifiedProviderEvidenceFromAnchorsForTest({
      auth: { userId: 116, tenantId: "1" },
      productTruth: {
        imageUrls: ["https://cdn.example.test/product.png"],
      },
      referenceAnchors: {
        productImageUrl: "https://cdn.example.test/product.png",
        characterImageUrl: "/uploads/chat/uploads/116/random-face-123.png",
        characterImageUploadKey: "chat/uploads/116/random-face-123.png",
        characterImageFileName: "original-face.png",
        environmentImageUrl:
          "/api/storage/files/chat/uploads/116/random-room-456.png",
        environmentImageUploadKey: "chat/uploads/116/random-room-456.png",
        environmentImageFileName: "original-room.png",
      },
    });

    expect(storageExistsMock).toHaveBeenCalledWith(
      "chat/uploads/116/random-face-123.png"
    );
    expect(storageExistsMock).toHaveBeenCalledWith(
      "chat/uploads/116/random-room-456.png"
    );
    expect(evidence.character).toMatchObject({
      role: "character",
      status: "verified",
      verifiedBy: "server",
    });
    expect(evidence.environment).toMatchObject({
      role: "environment",
      status: "verified",
      verifiedBy: "server",
    });
  });

  it("does not verify anchors outside the current user's upload namespace", async () => {
    storageExistsMock.mockResolvedValue(true);

    const evidence = await serverVerifiedProviderEvidenceFromAnchorsForTest({
      auth: { userId: 116, tenantId: "1" },
      productTruth: {
        imageUrls: ["https://cdn.example.test/product.png"],
      },
      referenceAnchors: {
        productImageUrl: "https://cdn.example.test/product.png",
        characterImageUrl: "/uploads/chat/uploads/999/random-face-123.png",
        characterImageUploadKey: "chat/uploads/999/random-face-123.png",
        characterImageFileName: "original-face.png",
        environmentImageUrl:
          "/api/storage/files/chat/uploads/116/random-room-456.png",
        environmentImageUploadKey: "chat/uploads/116/random-room-456.png",
        environmentImageFileName: "original-room.png",
      },
    });

    expect(evidence.character).toBeUndefined();
    expect(evidence.environment).toMatchObject({
      role: "environment",
      status: "verified",
    });
    expect(storageExistsMock).not.toHaveBeenCalledWith(
      "chat/uploads/999/random-face-123.png"
    );
  });
});
