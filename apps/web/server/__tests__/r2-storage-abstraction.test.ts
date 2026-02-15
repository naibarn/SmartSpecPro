/**
 * @file r2-storage-abstraction.test.ts
 * Unit tests for the Node.js storage abstraction layer with R2 configuration.
 * Tests env-var fallback for Cloud Run deployment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  const S3ClientMock = vi.fn().mockImplementation(() => ({ send: mockSend }));
  return {
    S3Client: S3ClientMock,
    PutObjectCommand: vi.fn().mockImplementation((p) => ({ ...p, _type: "PutObject" })),
    GetObjectCommand: vi.fn().mockImplementation((p) => ({ ...p, _type: "GetObject" })),
    DeleteObjectCommand: vi.fn().mockImplementation((p) => ({ ...p, _type: "DeleteObject" })),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed-url"),
}));

vi.mock("../../drizzle/schema", () => ({
  storageSettings: { isActive: "isActive" },
}));

vi.mock("../services/crypto", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted"),
}));

// Default: no DB config and no forge env
const mockLimit = vi.fn().mockResolvedValue([]);
vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mockLimit,
        }),
      }),
    }),
  },
}));

vi.mock("../_core/env", () => ({
  ENV: { forgeApiUrl: null, forgeApiKey: null },
}));

import { invalidateStorageCache } from "../storage";

describe("Node.js Storage Abstraction - R2 Env Var Fallback", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateStorageCache();
    mockLimit.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should fall back to env-var-based R2 config when DB has no active setting", async () => {
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";

    const { getActiveStorageConfig } = await import("../storage");
    const config = await getActiveStorageConfig();

    expect(config.provider).toBe("s3");
    if (config.provider === "s3") {
      expect(config.bucket).toBe("smartspecpro-production");
    }
  });

  it("should use local fallback when neither DB nor env vars are set", async () => {
    delete process.env.R2_ACCESS_KEY;
    delete process.env.R2_SECRET_KEY;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_BUCKET_NAME;

    const { getActiveStorageConfig } = await import("../storage");
    const config = await getActiveStorageConfig();

    expect(config.provider).toBe("local");
  });

  it("should upload an object to R2 and return the proxy URL", async () => {
    // Set env vars for R2 fallback
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";

    mockSend.mockResolvedValue({});

    const { storagePut } = await import("../storage");
    const result = await storagePut("temp/raw/user1/job1/image.png", Buffer.from("test"), "image/png");

    expect(result.key).toBe("temp/raw/user1/job1/image.png");
    expect(result.url).toBe("/api/storage/files/temp/raw/user1/job1/image.png");
  });

  it("should delete an object from R2", async () => {
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";

    mockSend.mockResolvedValue({});

    const { storageDelete } = await import("../storage");
    const result = await storageDelete("temp/raw/user1/job1/image.png");

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        _type: "DeleteObject",
        Bucket: "smartspecpro-production",
        Key: "temp/raw/user1/job1/image.png",
      }),
    );
  });
});
