import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb before imports
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storagePresignGet: vi.fn(),
  storageResolveUrl: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

import { getDb } from "../../db";
import { storagePresignGet, storageResolveUrl } from "../../storage";
import sharp from "sharp";
import {
  createAssetFromAttachment,
  fetchAsset,
  generateSignedUrl,
  validateImage,
  computePerceptualHash,
  findSimilarAssets,
  deleteAsset,
} from "../mediaAssetService";

const mockGetDb = vi.mocked(getDb);
const mockStoragePresignGet = vi.mocked(storagePresignGet);
const mockStorageResolveUrl = vi.mocked(storageResolveUrl);
const mockSharp = vi.mocked(sharp);

const makeDb = (overrides: Record<string, unknown> = {}) => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: 1 }]),
  delete: vi.fn().mockReturnThis(),
  ...overrides,
});

describe("mediaAssetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateImage", () => {
    it("accepts JPEG, PNG, WebP, GIF", () => {
      expect(validateImage("image/jpeg", 1024).valid).toBe(true);
      expect(validateImage("image/png", 1024).valid).toBe(true);
      expect(validateImage("image/webp", 1024).valid).toBe(true);
      expect(validateImage("image/gif", 1024).valid).toBe(true);
    });

    it("rejects SVG format", () => {
      const result = validateImage("image/svg+xml", 1024);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/svg/i);
    });

    it("rejects HEIC format", () => {
      const result = validateImage("image/heic", 1024);
      expect(result.valid).toBe(false);
    });

    it("rejects files over 20MB", () => {
      const result = validateImage("image/jpeg", 21 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/size/i);
    });

    it("rejects unknown mime type", () => {
      const result = validateImage("application/octet-stream", 1024);
      expect(result.valid).toBe(false);
    });
  });

  describe("generateSignedUrl", () => {
    it("returns time-limited signed URL from storagePresignGet", async () => {
      mockStoragePresignGet.mockResolvedValueOnce({ url: "https://s3.example.com/signed?X-Amz=1", key: "uploads/test.jpg" });
      const url = await generateSignedUrl("uploads/test.jpg");
      expect(url).toBe("https://s3.example.com/signed?X-Amz=1");
      expect(mockStoragePresignGet).toHaveBeenCalledWith("uploads/test.jpg", 3600);
    });

    it("falls back to proxy URL when presigning returns null (local storage)", async () => {
      mockStoragePresignGet.mockResolvedValueOnce(null);
      mockStorageResolveUrl.mockResolvedValueOnce("/api/storage/files/uploads/test.jpg");
      const url = await generateSignedUrl("uploads/test.jpg");
      expect(url).toBe("/api/storage/files/uploads/test.jpg");
    });

    it("respects custom expiry", async () => {
      mockStoragePresignGet.mockResolvedValueOnce({ url: "https://s3.example.com/signed", key: "k" });
      await generateSignedUrl("uploads/test.jpg", 7200);
      expect(mockStoragePresignGet).toHaveBeenCalledWith("uploads/test.jpg", 7200);
    });
  });

  describe("computePerceptualHash", () => {
    it("returns consistent hash string for image buffer", async () => {
      const mockPipeline = {
        resize: vi.fn().mockReturnThis(),
        grayscale: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from(Array(64).fill(128))),
      };
      mockSharp.mockReturnValueOnce(mockPipeline as any);

      const hash = await computePerceptualHash(Buffer.from("fake-image"));
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("returns null when sharp fails (corrupt image)", async () => {
      const mockPipeline = {
        resize: vi.fn().mockReturnThis(),
        grayscale: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockRejectedValue(new Error("corrupt image")),
      };
      mockSharp.mockReturnValueOnce(mockPipeline as any);

      const hash = await computePerceptualHash(Buffer.from("corrupt"));
      expect(hash).toBeNull();
    });
  });

  describe("createAssetFromAttachment", () => {
    const context = { userId: 1, tenantId: "tenant-1", conversationId: 10, messageId: 100, projectId: "proj-1" };
    const attachment = { type: "image" as const, url: "https://example.com/img.jpg", key: "uploads/img.jpg", mimeType: "image/jpeg", size: 1024 };

    it("creates media_assets row with correct fields", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      const result = await createAssetFromAttachment(attachment, context);
      expect(result.assetId).toBe(42);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("returns existing assetId when checksumSha256 matches (idempotency)", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 99 }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      const result = await createAssetFromAttachment(attachment, context);
      expect(result.assetId).toBe(99);
      // Should not insert when dedup found
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("rejects invalid mime type with error", async () => {
      const badAttachment = { ...attachment, mimeType: "image/svg+xml" };
      await expect(createAssetFromAttachment(badAttachment, context)).rejects.toThrow();
    });

    it("rejects files over 20MB with error", async () => {
      const bigAttachment = { ...attachment, size: 25 * 1024 * 1024 };
      await expect(createAssetFromAttachment(bigAttachment, context)).rejects.toThrow();
    });
  });

  describe("fetchAsset", () => {
    it("returns asset with signed URL for valid assetId and tenantId", async () => {
      const asset = { id: 1, tenantId: "tenant-1", storageKey: "uploads/img.jpg", status: "analyzed" };
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([asset]),
      };
      mockGetDb.mockResolvedValue(mockDb as any);
      mockStoragePresignGet.mockResolvedValueOnce({ url: "https://signed.url/img.jpg", key: "uploads/img.jpg" });

      const result = await fetchAsset(1, "tenant-1");
      expect(result).not.toBeNull();
      expect(result!.signedUrl).toBe("https://signed.url/img.jpg");
    });

    it("returns null when tenantId does not match (tenant isolation)", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      const result = await fetchAsset(1, "wrong-tenant");
      expect(result).toBeNull();
    });
  });

  describe("findSimilarAssets", () => {
    it("returns assets below Hamming distance threshold", async () => {
      // Same hash should have distance 0
      const sameHash = "aaaa";
      const assets = [
        { id: 1, perceptualHash: sameHash, tenantId: "tenant-1" },
        { id: 2, perceptualHash: "ffff", tenantId: "tenant-1" },
      ];
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(assets),
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      const result = await findSimilarAssets(sameHash, "tenant-1", 10);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe(1);
    });
  });

  describe("deleteAsset", () => {
    it("cascades deletion when userId and tenantId match", async () => {
      const asset = { id: 1, userId: 1, tenantId: "tenant-1" };
      const mockDelete = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([asset]),
        delete: mockDelete,
      };
      mockDelete.mockReturnValue({ where: mockWhere });
      mockGetDb.mockResolvedValue(mockDb as any);

      const result = await deleteAsset(1, 1, "tenant-1");
      expect(result.deleted).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it("throws when userId does not match (authorization check — userId in WHERE)", async () => {
      // With userId in the initial WHERE, wrong userId returns empty rows → "not found or access denied"
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]), // no match because userId=1 != owner userId=99
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      await expect(deleteAsset(1, 1, "tenant-1")).rejects.toThrow();
    });
  });
});
