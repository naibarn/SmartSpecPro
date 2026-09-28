import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend, mockLimit } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3ClientMock {
    send = mockSend;
  }
  class CommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params);
    }
  }
  return {
    S3Client: S3ClientMock,
    PutObjectCommand: CommandMock,
    GetObjectCommand: CommandMock,
    HeadObjectCommand: CommandMock,
    DeleteObjectCommand: CommandMock,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed-url"),
}));

vi.mock("../../drizzle/schema", () => ({
  storageSettings: { isActive: "isActive" },
  systemSettings: {},
}));

vi.mock("../services/crypto", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted"),
}));

vi.mock("../db", () => {
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: mockLimit }),
      }),
    }),
  };
  return { db, getDb: vi.fn(() => db) };
});

vi.mock("../_core/env", () => ({
  ENV: { forgeApiUrl: null, forgeApiKey: null },
}));

describe("storageHeadFile", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reads object validators without opening the image body", async () => {
    const lastModified = new Date("2026-08-17T00:00:00.000Z");
    mockSend.mockResolvedValue({
      ContentType: "image/png",
      ContentLength: 42,
      ETag: `"r2-version-1"`,
      LastModified: lastModified,
    });

    const { invalidateStorageCache, storageHeadFile } =
      await import("../storage");
    invalidateStorageCache();
    await expect(storageHeadFile("images/asset.png")).resolves.toEqual({
      contentType: "image/png",
      contentLength: 42,
      etag: `"r2-version-1"`,
      lastModified,
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "smartspecpro-production",
        Key: "images/asset.png",
      })
    );
  });
});
