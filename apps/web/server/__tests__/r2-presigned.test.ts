/**
 * @file r2-presigned.test.ts
 * Unit tests for R2 presigned URL generation (storagePresignGet).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock S3 client and presigner
const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: "PutObject" })),
  GetObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: "GetObject" })),
  DeleteObjectCommand: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
}));

// Mock DB to return an active S3 config
const mockR2Setting = {
  id: 1,
  providerType: "r2",
  endpoint: "https://test-account.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "test-bucket",
  accessKeyIdEncrypted: "encrypted-key",
  secretAccessKeyEncrypted: "encrypted-secret",
  publicUrlPrefix: null,
  configJson: {},
  isActive: true,
};

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockR2Setting]),
        }),
      }),
    }),
  },
}));

vi.mock("../../drizzle/schema", () => ({
  storageSettings: { isActive: "isActive" },
}));

vi.mock("../services/crypto", () => ({
  decrypt: vi.fn().mockImplementation((val: string) => {
    if (val === "encrypted-key") return "test-access-key";
    if (val === "encrypted-secret") return "test-secret-key";
    return val;
  }),
}));

vi.mock("../_core/env", () => ({
  ENV: { forgeApiUrl: null, forgeApiKey: null },
}));

// Import after mocks
import { invalidateStorageCache } from "../storage";

describe("Presigned URL Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateStorageCache();
  });

  it("should generate a download URL with 1-hour expiry by default", async () => {
    mockGetSignedUrl.mockResolvedValue(
      "https://test-account.r2.cloudflarestorage.com/test-bucket/my-file.png?X-Amz-Expires=3600&...",
    );

    // Dynamic import to get fresh module with cleared cache
    const { storagePresignGet } = await import("../storage");
    const result = await storagePresignGet("my-file.png");

    expect(result).not.toBeNull();
    expect(result!.key).toBe("my-file.png");
    expect(result!.url).toContain("r2.cloudflarestorage.com");

    // Verify getSignedUrl was called with expiresIn = 3600
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ _type: "GetObject", Bucket: "test-bucket", Key: "my-file.png" }),
      { expiresIn: 3600 },
    );
  });

  it("should generate an upload URL that restricts content-type", async () => {
    mockGetSignedUrl.mockResolvedValue(
      "https://test-account.r2.cloudflarestorage.com/test-bucket/upload.jpg?...",
    );

    const { storagePresignPut } = await import("../storage");
    const result = await storagePresignPut("upload.jpg", "image/jpeg", 1024000);

    expect(result).not.toBeNull();
    expect(result!.key).toBe("upload.jpg");

    // Verify PutObjectCommand was created with ContentType
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        _type: "PutObject",
        ContentType: "image/jpeg",
        ContentLength: 1024000,
      }),
      expect.any(Object),
    );
  });

  it("should use S3 API endpoint for presigned URLs, not custom domain", async () => {
    const presignedUrl =
      "https://test-account.r2.cloudflarestorage.com/test-bucket/test.png?X-Amz-Expires=3600";
    mockGetSignedUrl.mockResolvedValue(presignedUrl);

    const { storagePresignGet } = await import("../storage");
    const result = await storagePresignGet("test.png");

    expect(result).not.toBeNull();
    // URL should be from the S3 API endpoint, not a custom domain
    expect(result!.url).toContain("r2.cloudflarestorage.com");
    expect(result!.url).not.toContain("cdn.");
  });

  it("should support configurable expiry for admin download URLs (24-hour)", async () => {
    mockGetSignedUrl.mockResolvedValue(
      "https://test-account.r2.cloudflarestorage.com/test-bucket/admin-file.zip?X-Amz-Expires=86400",
    );

    const { storagePresignGet } = await import("../storage");
    const result = await storagePresignGet("admin-file.zip", 86400);

    expect(result).not.toBeNull();
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ _type: "GetObject" }),
      { expiresIn: 86400 },
    );
  });

  it("should return null when storage is local", async () => {
    // Override the mock to return local config
    const { db } = await import("../db");
    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ ...mockR2Setting, providerType: "local" }]),
        }),
      }),
    });

    invalidateStorageCache();
    const { storagePresignGet } = await import("../storage");
    const result = await storagePresignGet("test.png");
    expect(result).toBeNull();
  });
});
