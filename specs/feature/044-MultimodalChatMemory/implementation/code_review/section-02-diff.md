diff --git a/apps/web/server/services/__tests__/mediaAssetService.test.ts b/apps/web/server/services/__tests__/mediaAssetService.test.ts
new file mode 100644
index 00000000..e82722f2
--- /dev/null
+++ b/apps/web/server/services/__tests__/mediaAssetService.test.ts
@@ -0,0 +1,263 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock getDb before imports
+vi.mock("../../db", () => ({
+  getDb: vi.fn(),
+}));
+
+vi.mock("../../storage", () => ({
+  storagePresignGet: vi.fn(),
+  storageResolveUrl: vi.fn(),
+}));
+
+vi.mock("sharp", () => ({
+  default: vi.fn(),
+}));
+
+import { getDb } from "../../db";
+import { storagePresignGet, storageResolveUrl } from "../../storage";
+import sharp from "sharp";
+import {
+  createAssetFromAttachment,
+  fetchAsset,
+  generateSignedUrl,
+  validateImage,
+  computePerceptualHash,
+  findSimilarAssets,
+  deleteAsset,
+} from "../mediaAssetService";
+
+const mockGetDb = vi.mocked(getDb);
+const mockStoragePresignGet = vi.mocked(storagePresignGet);
+const mockStorageResolveUrl = vi.mocked(storageResolveUrl);
+const mockSharp = vi.mocked(sharp);
+
+const makeDb = (overrides: Record<string, unknown> = {}) => ({
+  select: vi.fn().mockReturnThis(),
+  from: vi.fn().mockReturnThis(),
+  where: vi.fn().mockReturnThis(),
+  limit: vi.fn().mockResolvedValue([]),
+  insert: vi.fn().mockReturnThis(),
+  values: vi.fn().mockReturnThis(),
+  returning: vi.fn().mockResolvedValue([{ id: 1 }]),
+  delete: vi.fn().mockReturnThis(),
+  ...overrides,
+});
+
+describe("mediaAssetService", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe("validateImage", () => {
+    it("accepts JPEG, PNG, WebP, GIF", () => {
+      expect(validateImage("image/jpeg", 1024).valid).toBe(true);
+      expect(validateImage("image/png", 1024).valid).toBe(true);
+      expect(validateImage("image/webp", 1024).valid).toBe(true);
+      expect(validateImage("image/gif", 1024).valid).toBe(true);
+    });
+
+    it("rejects SVG format", () => {
+      const result = validateImage("image/svg+xml", 1024);
+      expect(result.valid).toBe(false);
+      expect(result.reason).toMatch(/svg/i);
+    });
+
+    it("rejects HEIC format", () => {
+      const result = validateImage("image/heic", 1024);
+      expect(result.valid).toBe(false);
+    });
+
+    it("rejects files over 20MB", () => {
+      const result = validateImage("image/jpeg", 21 * 1024 * 1024);
+      expect(result.valid).toBe(false);
+      expect(result.reason).toMatch(/size/i);
+    });
+
+    it("rejects unknown mime type", () => {
+      const result = validateImage("application/octet-stream", 1024);
+      expect(result.valid).toBe(false);
+    });
+  });
+
+  describe("generateSignedUrl", () => {
+    it("returns time-limited signed URL from storagePresignGet", async () => {
+      mockStoragePresignGet.mockResolvedValueOnce({ url: "https://s3.example.com/signed?X-Amz=1", key: "uploads/test.jpg" });
+      const url = await generateSignedUrl("uploads/test.jpg");
+      expect(url).toBe("https://s3.example.com/signed?X-Amz=1");
+      expect(mockStoragePresignGet).toHaveBeenCalledWith("uploads/test.jpg", 3600);
+    });
+
+    it("falls back to proxy URL when presigning returns null (local storage)", async () => {
+      mockStoragePresignGet.mockResolvedValueOnce(null);
+      mockStorageResolveUrl.mockResolvedValueOnce("/api/storage/files/uploads/test.jpg");
+      const url = await generateSignedUrl("uploads/test.jpg");
+      expect(url).toBe("/api/storage/files/uploads/test.jpg");
+    });
+
+    it("respects custom expiry", async () => {
+      mockStoragePresignGet.mockResolvedValueOnce({ url: "https://s3.example.com/signed", key: "k" });
+      await generateSignedUrl("uploads/test.jpg", 7200);
+      expect(mockStoragePresignGet).toHaveBeenCalledWith("uploads/test.jpg", 7200);
+    });
+  });
+
+  describe("computePerceptualHash", () => {
+    it("returns consistent hash string for image buffer", async () => {
+      const mockPipeline = {
+        resize: vi.fn().mockReturnThis(),
+        grayscale: vi.fn().mockReturnThis(),
+        raw: vi.fn().mockReturnThis(),
+        toBuffer: vi.fn().mockResolvedValue(Buffer.from(Array(64).fill(128))),
+      };
+      mockSharp.mockReturnValueOnce(mockPipeline as any);
+
+      const hash = await computePerceptualHash(Buffer.from("fake-image"));
+      expect(typeof hash).toBe("string");
+      expect(hash.length).toBeGreaterThan(0);
+    });
+
+    it("returns null when sharp fails (corrupt image)", async () => {
+      const mockPipeline = {
+        resize: vi.fn().mockReturnThis(),
+        grayscale: vi.fn().mockReturnThis(),
+        raw: vi.fn().mockReturnThis(),
+        toBuffer: vi.fn().mockRejectedValue(new Error("corrupt image")),
+      };
+      mockSharp.mockReturnValueOnce(mockPipeline as any);
+
+      const hash = await computePerceptualHash(Buffer.from("corrupt"));
+      expect(hash).toBeNull();
+    });
+  });
+
+  describe("createAssetFromAttachment", () => {
+    const context = { userId: 1, tenantId: "tenant-1", conversationId: 10, messageId: 100, projectId: "proj-1" };
+    const attachment = { type: "image" as const, url: "https://example.com/img.jpg", key: "uploads/img.jpg", mimeType: "image/jpeg", size: 1024 };
+
+    it("creates media_assets row with correct fields", async () => {
+      const mockDb = {
+        select: vi.fn().mockReturnThis(),
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue([]),
+        insert: vi.fn().mockReturnThis(),
+        values: vi.fn().mockReturnThis(),
+        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
+      };
+      mockGetDb.mockResolvedValue(mockDb as any);
+
+      const result = await createAssetFromAttachment(attachment, context);
+      expect(result.assetId).toBe(42);
+      expect(mockDb.insert).toHaveBeenCalled();
+    });
+
+    it("returns existing assetId when checksumSha256 matches (idempotency)", async () => {
+      const mockDb = {
+        select: vi.fn().mockReturnThis(),
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue([{ id: 99 }]),
+        insert: vi.fn().mockReturnThis(),
+        values: vi.fn().mockReturnThis(),
+        returning: vi.fn().mockResolvedValue([]),
+      };
+      mockGetDb.mockResolvedValue(mockDb as any);
+
+      const result = await createAssetFromAttachment(attachment, context);
+      expect(result.assetId).toBe(99);
+      // Should not insert when dedup found
+      expect(mockDb.insert).not.toHaveBeenCalled();
+    });
+
+    it("rejects invalid mime type with error", async () => {
+      const badAttachment = { ...attachment, mimeType: "image/svg+xml" };
+      await expect(createAssetFromAttachment(badAttachment, context)).rejects.toThrow();
+    });
+
+    it("rejects files over 20MB with error", async () => {
+      const bigAttachment = { ...attachment, size: 25 * 1024 * 1024 };
+      await expect(createAssetFromAttachment(bigAttachment, context)).rejects.toThrow();
+    });
+  });
+
+  describe("fetchAsset", () => {
+    it("returns asset with signed URL for valid assetId and tenantId", async () => {
+      const asset = { id: 1, tenantId: "tenant-1", storageKey: "uploads/img.jpg", status: "analyzed" };
+      const mockDb = {
+        select: vi.fn().mockReturnThis(),
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue([asset]),
+      };
+      mockGetDb.mockResolvedValue(mockDb as any);
+      mockStoragePresignGet.mockResolvedValueOnce({ url: "https://signed.url/img.jpg", key: "uploads/img.jpg" });
+
+      const result = await fetchAsset(1, "tenant-1");
+      expect(result).not.toBeNull();
+      expect(result!.signedUrl).toBe("https://signed.url/img.jpg");
+    });
+
+    it("returns null when tenantId does not match (tenant isolation)", async () => {
+      const mockDb = {
+        select: vi.fn().mockReturnThis(),
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue([]),
+      };
+      mockGetDb.mockResolvedValue(mockDb as any);
+
+      const result = await fetchAsset(1, "wrong-tenant");
+      expect(result).toBeNull();
+    });
+  });
+
+  describe("findSimilarAssets", () => {
+    it("returns assets below Hamming distance threshold", async () => {
+      // Same hash should have distance 0
+      const sameHash = "aaaa";
+      const assets = [
+        { id: 1, perceptualHash: sameHash, tenantId: "tenant-1" },
+        { id: 2, perceptualHash: "ffff", tenantId: "tenant-1" },
+      ];
+      const mockDb = {
+        select: vi.fn().mockReturnThis(),
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue(assets),
+      };
+      mockGetDb.mockResolvedValue(mockDb as any);
+
+      const result = await findSimilarAssets(sameHash, "tenant-1", 10);
+      expect(result.length).toBeGreaterThan(0);
+      expect(result[0].id).toBe(1);
+    });
+  });
+
+  describe("deleteAsset", () => {
+    it("cascades deletion when userId and tenantId match", async () => {
+      const asset = { id: 1, userId: 1, tenantId: "tenant-1" };
+      const mockDelete = vi.fn().mockReturnThis();
+      const mockWhere = vi.fn().mockResolvedValue([]);
+      const mockDb = {
+        select: vi.fn().mockReturnThis(),
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue([asset]),
+        delete: mockDelete,
+      };
+      mockDelete.mockReturnValue({ where: mockWhere });
+      mockGetDb.mockResolvedValue(mockDb as any);
+
+      const result = await deleteAsset(1, 1, "tenant-1");
+      expect(result.deleted).toBe(true);
+      expect(mockDelete).toHaveBeenCalled();
+    });
+
+    it("throws when userId does not match (authorization check)", async () => {
+      const asset = { id: 1, userId: 99, tenantId: "tenant-1" };
+      const mockDb = {
+        select: vi.fn().mockReturnThis(),
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue([asset]),
+      };
+      mockGetDb.mockResolvedValue(mockDb as any);
+
+      await expect(deleteAsset(1, 1, "tenant-1")).rejects.toThrow();
+    });
+  });
+});
diff --git a/apps/web/server/services/mediaAssetService.ts b/apps/web/server/services/mediaAssetService.ts
new file mode 100644
index 00000000..42cec86e
--- /dev/null
+++ b/apps/web/server/services/mediaAssetService.ts
@@ -0,0 +1,243 @@
+import crypto from "crypto";
+import { eq, and, isNotNull } from "drizzle-orm";
+import sharp from "sharp";
+import { getDb } from "../db";
+import { mediaAssets } from "../../drizzle/schema";
+import { storagePresignGet, storageResolveUrl } from "../storage";
+
+// ---------------------------------------------------------------------------
+// Types
+// ---------------------------------------------------------------------------
+
+type AttachmentInput = {
+  type: "image" | "file" | "audio" | "video";
+  url: string;
+  key?: string;
+  name?: string;
+  size?: number;
+  mimeType?: string;
+  thumbnail?: string;
+  assetId?: number;
+};
+
+type AssetContext = {
+  userId: number;
+  tenantId: string;
+  conversationId: number;
+  messageId: number;
+  projectId: string;
+};
+
+type ValidationResult = { valid: boolean; reason?: string };
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
+const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
+
+// ---------------------------------------------------------------------------
+// validateImage
+// ---------------------------------------------------------------------------
+
+export function validateImage(mimeType: string | undefined, fileSize: number | undefined): ValidationResult {
+  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
+    return {
+      valid: false,
+      reason: `Unsupported image type: ${mimeType ?? "unknown"}. Allowed: JPEG, PNG, WebP, GIF. SVG and HEIC are not supported.`,
+    };
+  }
+  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
+    return { valid: false, reason: `File size ${fileSize} bytes exceeds 20 MB limit.` };
+  }
+  return { valid: true };
+}
+
+// ---------------------------------------------------------------------------
+// generateSignedUrl
+// ---------------------------------------------------------------------------
+
+export async function generateSignedUrl(storageKey: string, expirySeconds = 3600): Promise<string> {
+  const presigned = await storagePresignGet(storageKey, expirySeconds);
+  if (presigned) return presigned.url;
+  // Fallback: proxy URL for local storage
+  const resolved = await storageResolveUrl(storageKey);
+  return resolved ?? `/api/storage/files/${storageKey}`;
+}
+
+// ---------------------------------------------------------------------------
+// computePerceptualHash
+// ---------------------------------------------------------------------------
+
+export async function computePerceptualHash(imageBuffer: Buffer): Promise<string | null> {
+  try {
+    const buffer = await sharp(imageBuffer)
+      .resize(8, 8, { fit: "fill" })
+      .grayscale()
+      .raw()
+      .toBuffer();
+
+    const pixels = Array.from(buffer);
+    const avg = pixels.reduce((s, v) => s + v, 0) / pixels.length;
+    const bits = pixels.map((v) => (v >= avg ? "1" : "0")).join("");
+    // Encode as hex (4 bits → 1 hex char)
+    let hex = "";
+    for (let i = 0; i < bits.length; i += 4) {
+      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
+    }
+    return hex;
+  } catch {
+    return null;
+  }
+}
+
+// ---------------------------------------------------------------------------
+// hammingDistance — helper
+// ---------------------------------------------------------------------------
+
+function hammingDistance(a: string, b: string): number {
+  if (a.length !== b.length) return Infinity;
+  let dist = 0;
+  for (let i = 0; i < a.length; i++) {
+    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
+    dist += xor.toString(2).split("1").length - 1;
+  }
+  return dist;
+}
+
+// ---------------------------------------------------------------------------
+// createAssetFromAttachment
+// ---------------------------------------------------------------------------
+
+export async function createAssetFromAttachment(
+  attachment: AttachmentInput,
+  context: AssetContext,
+): Promise<{ assetId: number }> {
+  // 1. Validate
+  const validation = validateImage(attachment.mimeType, attachment.size);
+  if (!validation.valid) {
+    throw new Error(`Image validation failed: ${validation.reason}`);
+  }
+
+  const db = await getDb();
+  if (!db) throw new Error("Database not available");
+
+  // 2. Compute lightweight checksum from storageKey (for dedup)
+  const checksumInput = attachment.key ?? attachment.url;
+  const checksumSha256 = crypto.createHash("sha256").update(checksumInput).digest("hex");
+
+  // 3. Check for duplicate (same checksum + tenant + user)
+  const existing = await db
+    .select()
+    .from(mediaAssets)
+    .where(
+      and(
+        eq(mediaAssets.checksumSha256, checksumSha256),
+        eq(mediaAssets.tenantId, context.tenantId),
+        eq(mediaAssets.userId, context.userId),
+      ),
+    );
+
+  if (existing.length > 0) {
+    return { assetId: existing[0].id };
+  }
+
+  // 4. Insert new asset row
+  const inserted = await db
+    .insert(mediaAssets)
+    .values({
+      tenantId: context.tenantId,
+      userId: context.userId,
+      conversationId: context.conversationId,
+      messageId: context.messageId,
+      projectId: context.projectId,
+      sourceType: "chat_attachment",
+      status: "pending",
+      storageKey: attachment.key ?? attachment.url,
+      originalUrl: attachment.url,
+      mimeType: attachment.mimeType ?? "image/jpeg",
+      fileSize: attachment.size,
+      checksumSha256,
+    })
+    .returning({ id: mediaAssets.id });
+
+  return { assetId: inserted[0].id };
+}
+
+// ---------------------------------------------------------------------------
+// fetchAsset
+// ---------------------------------------------------------------------------
+
+export async function fetchAsset(
+  assetId: number,
+  tenantId: string,
+): Promise<(typeof mediaAssets.$inferSelect & { signedUrl: string }) | null> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not available");
+
+  const rows = await db
+    .select()
+    .from(mediaAssets)
+    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.tenantId, tenantId)));
+
+  if (rows.length === 0) return null;
+
+  const asset = rows[0];
+  const signedUrl = await generateSignedUrl(asset.storageKey);
+  return { ...asset, signedUrl };
+}
+
+// ---------------------------------------------------------------------------
+// findSimilarAssets
+// ---------------------------------------------------------------------------
+
+export async function findSimilarAssets(
+  hash: string,
+  tenantId: string,
+  threshold = 10,
+): Promise<Array<typeof mediaAssets.$inferSelect & { distance: number }>> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not available");
+
+  const candidates = await db
+    .select()
+    .from(mediaAssets)
+    .where(and(eq(mediaAssets.tenantId, tenantId), isNotNull(mediaAssets.perceptualHash)));
+
+  return candidates
+    .map((asset) => ({ ...asset, distance: hammingDistance(hash, asset.perceptualHash!) }))
+    .filter((a) => a.distance <= threshold)
+    .sort((a, b) => a.distance - b.distance);
+}
+
+// ---------------------------------------------------------------------------
+// deleteAsset
+// ---------------------------------------------------------------------------
+
+export async function deleteAsset(
+  assetId: number,
+  userId: number,
+  tenantId: string,
+): Promise<{ deleted: boolean }> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not available");
+
+  const rows = await db
+    .select()
+    .from(mediaAssets)
+    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.tenantId, tenantId)));
+
+  if (rows.length === 0) {
+    throw new Error(`Asset ${assetId} not found or access denied`);
+  }
+
+  const asset = rows[0];
+  if (asset.userId !== userId) {
+    throw new Error(`User ${userId} is not authorized to delete asset ${assetId}`);
+  }
+
+  await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
+
+  return { deleted: true };
+}
