/**
 * @file r2-storage-abstraction.test.ts
 * Unit tests for the Node.js storage abstraction layer with R2 configuration.
 * Tests env-var fallback for Cloud Run deployment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { mockSend, mockLimit, mockDb } = vi.hoisted(() => {
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mockLimit,
        }),
      }),
    }),
  };
  return { mockSend: vi.fn(), mockLimit, mockDb };
});

vi.mock("@aws-sdk/client-s3", () => {
  class S3ClientMock {
    send(...args: unknown[]) {
      return mockSend(...args);
    }
  }
  class PutObjectCommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params, { _type: "PutObject" });
    }
  }
  class CreateMultipartUploadCommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params, { _type: "CreateMultipartUpload" });
    }
  }
  class UploadPartCommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params, { _type: "UploadPart" });
    }
  }
  class CompleteMultipartUploadCommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params, { _type: "CompleteMultipartUpload" });
    }
  }
  class AbortMultipartUploadCommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params, { _type: "AbortMultipartUpload" });
    }
  }
  class GetObjectCommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params, { _type: "GetObject" });
    }
  }
  class DeleteObjectCommandMock {
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params, { _type: "DeleteObject" });
    }
  }
  return {
    S3Client: S3ClientMock,
    PutObjectCommand: PutObjectCommandMock,
    CreateMultipartUploadCommand: CreateMultipartUploadCommandMock,
    UploadPartCommand: UploadPartCommandMock,
    CompleteMultipartUploadCommand: CompleteMultipartUploadCommandMock,
    AbortMultipartUploadCommand: AbortMultipartUploadCommandMock,
    GetObjectCommand: GetObjectCommandMock,
    DeleteObjectCommand: DeleteObjectCommandMock,
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

vi.mock("../db", () => ({
  db: mockDb,
  getDb: vi.fn(() => mockDb),
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
    const result = await storagePut(
      "temp/raw/user1/job1/image.png",
      Buffer.from("test"),
      "image/png"
    );

    expect(result.key).toBe("temp/raw/user1/job1/image.png");
    expect(result.url).toBe("/api/storage/files/temp/raw/user1/job1/image.png");
  });

  it("streams a filesystem upload to R2 with an exact content length", async () => {
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";
    mockSend.mockResolvedValue({});

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "smartspec-r2-upload-")
    );
    const sourcePath = path.join(tempDir, "runtime.zip");
    fs.writeFileSync(sourcePath, "test");
    try {
      const { storagePutFromPath } = await import("../storage");
      const result = await storagePutFromPath(
        "worker-runtime-releases/runtime.zip",
        sourcePath,
        "application/zip"
      );

      expect(result.key).toBe("worker-runtime-releases/runtime.zip");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentLength: 4,
          Body: expect.objectContaining({ path: sourcePath }),
        })
      );
      const command = mockSend.mock.calls.at(-1)?.[0] as {
        Body?: AsyncIterable<Uint8Array>;
      };
      for await (const _chunk of command.Body ?? []) {
        // Consume the stream before removing the temporary source file.
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses multipart upload for large filesystem archives and completes all parts", async () => {
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";
    mockSend.mockImplementation(async (command: any) => {
      if (command._type === "CreateMultipartUpload")
        return { UploadId: "upload-1" };
      if (command._type === "UploadPart")
        return { ETag: `etag-${command.PartNumber}` };
      return {};
    });

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "smartspec-r2-multipart-")
    );
    const sourcePath = path.join(tempDir, "runtime.zip");
    fs.writeFileSync(sourcePath, "");
    fs.truncateSync(sourcePath, 100 * 1024 * 1024);
    try {
      const { storagePutFromPath } = await import("../storage");
      await storagePutFromPath(
        "worker-runtime-releases/large-runtime.zip",
        sourcePath,
        "application/zip"
      );

      const commands = mockSend.mock.calls.map(([command]) => command as any);
      expect(
        commands.filter(command => command._type === "CreateMultipartUpload")
      ).toHaveLength(1);
      expect(
        commands.filter(command => command._type === "UploadPart")
      ).toHaveLength(2);
      expect(commands.at(-1)).toEqual(
        expect.objectContaining({
          _type: "CompleteMultipartUpload",
          UploadId: "upload-1",
          MultipartUpload: {
            Parts: [
              { ETag: "etag-1", PartNumber: 1 },
              { ETag: "etag-2", PartNumber: 2 },
            ],
          },
        })
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("aborts a multipart upload when a part fails", async () => {
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";
    mockSend.mockImplementation(async (command: any) => {
      if (command._type === "CreateMultipartUpload")
        return { UploadId: "upload-2" };
      if (command._type === "UploadPart") throw new Error("connection reset");
      return {};
    });

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "smartspec-r2-multipart-abort-")
    );
    const sourcePath = path.join(tempDir, "runtime.zip");
    fs.writeFileSync(sourcePath, "");
    fs.truncateSync(sourcePath, 100 * 1024 * 1024);
    try {
      const { storagePutFromPath } = await import("../storage");
      await expect(
        storagePutFromPath(
          "worker-runtime-releases/large-runtime.zip",
          sourcePath,
          "application/zip"
        )
      ).rejects.toThrow("connection reset");
      expect(mockSend.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({
          _type: "AbortMultipartUpload",
          UploadId: "upload-2",
        })
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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
      })
    );
  });

  it("returns null (not a thrown error) when streaming a missing key from R2", async () => {
    // Regression: a missing-key GetObject used to throw uncaught, which skipped
    // the /api/storage/files/* route's .jpg -> .webp fallback and surfaced a
    // bare 404 even when the .webp original existed the whole time.
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";

    const notFound: any = new Error("The specified key does not exist.");
    notFound.name = "NoSuchKey";
    mockSend.mockRejectedValue(notFound);

    const { storageStreamFile } = await import("../storage");
    const result = await storageStreamFile("images/asset.jpg");

    expect(result).toBeNull();
  });

  it("still throws for a genuine R2 error unrelated to a missing key", async () => {
    process.env.R2_ACCESS_KEY = "env-access-key";
    process.env.R2_SECRET_KEY = "env-secret-key";
    process.env.R2_ACCOUNT_ID = "my-account-id";
    process.env.R2_BUCKET_NAME = "smartspecpro-production";

    mockSend.mockRejectedValue(new Error("connection reset"));

    const { storageStreamFile } = await import("../storage");
    await expect(storageStreamFile("images/asset.jpg")).rejects.toThrow(
      "connection reset"
    );
  });
});
