import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb before imports
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storagePresignGet: vi.fn(),
  storageResolveUrl: vi.fn(),
}));

vi.mock("../durableMediaAssetService", () => ({
  copyMediaBufferToR2: vi.fn(),
  copyMediaSourceToR2: vi.fn(),
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
  validateMediaAttachment,
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

    it("accepts file at exactly 20MB boundary", () => {
      const result = validateImage("image/jpeg", 20 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it("rejects file one byte over 20MB", () => {
      const result = validateImage("image/jpeg", 20 * 1024 * 1024 + 1);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/size/i);
    });

    it("accepts undefined size (size unknown — deferred to storage layer)", () => {
      // Unknown size should not be rejected at validation time
      const result = validateImage("image/jpeg", undefined);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateMediaAttachment", () => {
    it("accepts video and audio references within their media limits", () => {
      expect(validateMediaAttachment("video", "video/mp4", 10 * 1024 * 1024).valid).toBe(true);
      expect(validateMediaAttachment("audio", "audio/mpeg", 10 * 1024 * 1024).valid).toBe(true);
    });

    it("rejects unsupported attachment types", () => {
      expect(validateMediaAttachment("file", "application/pdf", 1024).valid).toBe(false);
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

    it("falls back to constructed path when storageResolveUrl also returns null", async () => {
      mockStoragePresignGet.mockResolvedValueOnce(null);
      mockStorageResolveUrl.mockResolvedValueOnce(null);
      const url = await generateSignedUrl("uploads/test.jpg");
      expect(url).toBe("/api/storage/files/uploads/test.jpg");
    });

    it("returns null when storageKey is null", async () => {
      const url = await generateSignedUrl(null);
      expect(url).toBeNull();
      expect(mockStoragePresignGet).not.toHaveBeenCalled();
    });

    it("respects custom expiry", async () => {
      mockStoragePresignGet.mockResolvedValueOnce({ url: "https://s3.example.com/signed", key: "k" });
      await generateSignedUrl("uploads/test.jpg", 7200);
      expect(mockStoragePresignGet).toHaveBeenCalledWith("uploads/test.jpg", 7200);
    });
  });

  describe("computePerceptualHash", () => {
    function makePipeline(pixels: number[]) {
      return {
        resize: vi.fn().mockReturnThis(),
        grayscale: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from(pixels)),
      };
    }

    it("returns exactly 16-char lowercase hex string", async () => {
      // 9×8 = 72 pixels (9 wide so 8 differences per row × 8 rows = 64 bits → 16 hex)
      mockSharp.mockReturnValueOnce(makePipeline(Array(72).fill(128)) as any);
      const hash = await computePerceptualHash(Buffer.from("fake-image"));
      expect(hash).not.toBeNull();
      expect(hash!.length).toBe(16);
      expect(/^[0-9a-f]{16}$/.test(hash!)).toBe(true);
    });

    it("returns same hash for same pixel pattern (deterministic)", async () => {
      const pixels = Array(72).fill(0).map((_, i) => (i % 2 === 0 ? 100 : 200));
      mockSharp.mockReturnValueOnce(makePipeline(pixels) as any);
      const hash1 = await computePerceptualHash(Buffer.from("img-a"));

      mockSharp.mockReturnValueOnce(makePipeline(pixels) as any);
      const hash2 = await computePerceptualHash(Buffer.from("img-b"));

      expect(hash1).toBe(hash2);
    });

    it("returns different hashes for different pixel patterns", async () => {
      // dHash compares pixel[i] < pixel[i+1] per row — uniform values all give 0-bits.
      // Use alternating patterns: ascending → all 1-bits, descending → all 0-bits.
      const ascending = Array(72).fill(0).map((_, i) => (i % 2 === 0 ? 100 : 200)); // bit=1 each step
      const descending = Array(72).fill(0).map((_, i) => (i % 2 === 0 ? 200 : 100)); // bit=0 each step
      mockSharp.mockReturnValueOnce(makePipeline(ascending) as any);
      const hashA = await computePerceptualHash(Buffer.from("img-a"));

      mockSharp.mockReturnValueOnce(makePipeline(descending) as any);
      const hashB = await computePerceptualHash(Buffer.from("img-b"));

      expect(hashA).not.toBe(hashB);
    });

    it("returns null when sharp fails (corrupt image)", async () => {
      const badPipeline = {
        resize: vi.fn().mockReturnThis(),
        grayscale: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockRejectedValue(new Error("corrupt image")),
      };
      mockSharp.mockReturnValueOnce(badPipeline as any);

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

    it("uses url as checksum key when attachment.key is absent", async () => {
      const urlOnly = { type: "image" as const, url: "https://example.com/img.jpg", mimeType: "image/jpeg", size: 1024 };
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 55 }]),
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      const result = await createAssetFromAttachment(urlOnly, context);
      expect(result.assetId).toBe(55);
      expect(mockDb.insert).toHaveBeenCalled();
      // storageKey should fall back to the URL itself
      const insertedValues = mockDb.values.mock.calls[0][0];
      expect(insertedValues.storageKey).toBe("https://example.com/img.jpg");
    });

    it("creates asset even when sharp fails to extract dimensions (non-fatal)", async () => {
      // Configure sharp to fail (simulates corrupt or non-image buffer)
      const badPipeline = {
        resize: vi.fn().mockReturnThis(),
        grayscale: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        metadata: vi.fn().mockRejectedValue(new Error("Not an image")),
        toBuffer: vi.fn().mockRejectedValue(new Error("Not an image")),
      };
      mockSharp.mockReturnValue(badPipeline as any);

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 77 }]),
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      // Asset should still be created despite dimension extraction failure
      const result = await createAssetFromAttachment(attachment, context);
      expect(result.assetId).toBe(77);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("creates new asset for different tenant even with same checksum (tenant isolation in dedup)", async () => {
      // Dedup returns [] because tenantId="tenant-2" ≠ "tenant-1" in WHERE clause
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 88 }]),
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      const tenant2Context = { ...context, tenantId: "tenant-2" };
      const result = await createAssetFromAttachment(attachment, tenant2Context);

      // New asset created (not reusing tenant-1's asset)
      expect(result.assetId).toBe(88);
      expect(mockDb.insert).toHaveBeenCalled();
      // Asset must be stored under tenant-2
      const insertedValues = mockDb.values.mock.calls[0][0];
      expect(insertedValues.tenantId).toBe("tenant-2");
    });
  });

  describe("if (!db) guard clauses", () => {
    it("createAssetFromAttachment throws when db unavailable", async () => {
      mockGetDb.mockResolvedValue(null as any);
      await expect(
        createAssetFromAttachment(
          { type: "image", url: "https://example.com/img.jpg", key: "uploads/img.jpg", mimeType: "image/jpeg", size: 1024 },
          { userId: 1, tenantId: "t1", conversationId: 10, messageId: 100, projectId: null }
        )
      ).rejects.toThrow(/database not available/i);
    });

    it("fetchAsset throws when db unavailable", async () => {
      mockGetDb.mockResolvedValue(null as any);
      await expect(fetchAsset(1, "tenant-1")).rejects.toThrow(/database not available/i);
    });

    it("findSimilarAssets throws when db unavailable", async () => {
      mockGetDb.mockResolvedValue(null as any);
      await expect(findSimilarAssets("aaaa", "tenant-1")).rejects.toThrow(/database not available/i);
    });

    it("deleteAsset throws when db unavailable", async () => {
      mockGetDb.mockResolvedValue(null as any);
      await expect(deleteAsset(1, 1, "tenant-1")).rejects.toThrow(/database not available/i);
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
    function makeRetrievalDb(assets: any[]) {
      return {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(assets),
      };
    }

    it("returns assets at or below Hamming distance threshold", async () => {
      // "0000" vs "0000" → distance 0 (included)
      // "0000" vs "ffff" → 'f'=1111, '0'=0000, XOR=1111=4 bits × 4 chars = distance 16 (excluded at threshold=10)
      const targetHash = "0000";
      const assets = [
        { id: 1, perceptualHash: "0000", tenantId: "tenant-1" },
        { id: 2, perceptualHash: "ffff", tenantId: "tenant-1" },
      ];
      mockGetDb.mockResolvedValue(makeRetrievalDb(assets) as any);

      const result = await findSimilarAssets(targetHash, "tenant-1", 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].distance).toBe(0);
    });

    it("returns empty array when no assets exist", async () => {
      mockGetDb.mockResolvedValue(makeRetrievalDb([]) as any);
      const result = await findSimilarAssets("aaaa", "tenant-1", 10);
      expect(result).toHaveLength(0);
    });

    it("returns empty array when all assets exceed threshold", async () => {
      const assets = [{ id: 1, perceptualHash: "ffff", tenantId: "tenant-1" }];
      mockGetDb.mockResolvedValue(makeRetrievalDb(assets) as any);
      // "0000" vs "ffff" → distance 16, threshold=5 → excluded
      const result = await findSimilarAssets("0000", "tenant-1", 5);
      expect(result).toHaveLength(0);
    });

    it("sorts results by distance ascending (closest first)", async () => {
      // "0000" vs "0001" → distance 1; vs "000f" → distance 4
      const assets = [
        { id: 1, perceptualHash: "000f", tenantId: "tenant-1" }, // distance 4
        { id: 2, perceptualHash: "0001", tenantId: "tenant-1" }, // distance 1
      ];
      mockGetDb.mockResolvedValue(makeRetrievalDb(assets) as any);

      const result = await findSimilarAssets("0000", "tenant-1", 10);
      expect(result).toHaveLength(2);
      expect(result[0].distance).toBeLessThanOrEqual(result[1].distance);
      expect(result[0].id).toBe(2);
    });

    it("uses default threshold of 10 when not specified", async () => {
      // distance 8 should be included at default threshold=10
      const assets = [{ id: 1, perceptualHash: "00ff", tenantId: "tenant-1" }];
      mockGetDb.mockResolvedValue(makeRetrievalDb(assets) as any);
      const result = await findSimilarAssets("0000", "tenant-1");
      expect(result).toHaveLength(1);
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

    it("throws when tenantId does not match (cross-tenant isolation)", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]), // tenantId mismatch → no rows
      };
      mockGetDb.mockResolvedValue(mockDb as any);

      await expect(deleteAsset(1, 1, "wrong-tenant")).rejects.toThrow(/not found or access denied/i);
    });
  });
});
