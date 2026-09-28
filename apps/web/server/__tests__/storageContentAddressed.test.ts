import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

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
    CreateMultipartUploadCommand: CommandMock,
    UploadPartCommand: CommandMock,
    CompleteMultipartUploadCommand: CommandMock,
    AbortMultipartUploadCommand: CommandMock,
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
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: mockLimit })) })),
    })),
  })),
}));
vi.mock("../_core/env", () => ({
  ENV: { forgeApiUrl: null, forgeApiKey: null },
}));

describe("storagePutContentAddressedIfAbsent", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    process.env.R2_ACCESS_KEY = "test-access";
    process.env.R2_SECRET_KEY = "test-secret";
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_BUCKET_NAME = "non-production-test-bucket";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("writes by content hash with a conditional create", async () => {
    const bytes = Buffer.from("bundle bytes");
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
      $metadata: { httpStatusCode: 200 },
    });
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    await expect(
      storagePutContentAddressedIfAbsent(
        "spec224/bundles",
        bytes,
        "application/octet-stream"
      )
    ).resolves.toEqual({
      key: `spec224/bundles/sha256/${sha256}`,
      url: `/api/storage/files/spec224/bundles/sha256/${sha256}`,
      sha256,
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      Bucket: "non-production-test-bucket",
      Key: `spec224/bundles/sha256/${sha256}`,
      IfNoneMatch: "*",
    });
  });

  it("does not return a reference when newly written bytes fail read-back verification", async () => {
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from("tampered bytes") },
      $metadata: { httpStatusCode: 200 },
    });
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();

    await expect(
      storagePutContentAddressedIfAbsent(
        "spec224/bundles",
        Buffer.from("bundle bytes")
      )
    ).rejects.toThrow("STORAGE_CONTENT_ADDRESS_VERIFY_FAILED");
  });

  it("rejects malformed or encoded traversal namespaces before storage access", async () => {
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();

    await expect(
      storagePutContentAddressedIfAbsent("safe/%2e%2e/escape", Buffer.from("x"))
    ).rejects.toThrow();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("accepts an existing object only when its bytes match the content address", async () => {
    const bytes = Buffer.from("bundle bytes");
    mockSend
      .mockRejectedValueOnce(
        Object.assign(new Error("precondition"), {
          name: "InvalidRequest",
          Code: "PreconditionFailed",
          $metadata: { httpStatusCode: 412 },
        })
      )
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => bytes },
        $metadata: { httpStatusCode: 200 },
      });
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();

    await expect(
      storagePutContentAddressedIfAbsent("spec224/bundles", bytes)
    ).resolves.toMatchObject({
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("rejects a conflicting object already stored under the computed hash", async () => {
    const bytes = Buffer.from("bundle bytes");
    mockSend
      .mockRejectedValueOnce(
        Object.assign(new Error("precondition"), {
          name: "PreconditionFailed",
          $metadata: { httpStatusCode: 412 },
        })
      )
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => Buffer.from("different bytes"),
        },
        $metadata: { httpStatusCode: 200 },
      });
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();

    await expect(
      storagePutContentAddressedIfAbsent("spec224/bundles", bytes)
    ).rejects.toThrow("STORAGE_CONTENT_ADDRESS_CONFLICT");
  });

  it("fails closed when the configured provider has no conditional-create guarantee", async () => {
    delete process.env.R2_ACCESS_KEY;
    delete process.env.R2_SECRET_KEY;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_BUCKET_NAME;
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();

    await expect(
      storagePutContentAddressedIfAbsent(
        "spec224/bundles",
        Buffer.from("bundle")
      )
    ).rejects.toThrow("STORAGE_CONDITIONAL_CREATE_UNSUPPORTED");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("preserves non-precondition HTTP 412 failures", async () => {
    const failure = Object.assign(new Error("conditional header rejected"), {
      name: "InvalidRequest",
      $metadata: { httpStatusCode: 412 },
    });
    mockSend.mockRejectedValueOnce(failure);
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();

    await expect(
      storagePutContentAddressedIfAbsent("spec224/bundles", Buffer.from("x"))
    ).rejects.toBe(failure);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a precondition response has no readable object", async () => {
    mockSend
      .mockRejectedValueOnce(
        Object.assign(new Error("precondition"), {
          name: "PreconditionFailed",
          $metadata: { httpStatusCode: 412 },
        })
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("missing"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        })
      );
    const { invalidateStorageCache, storagePutContentAddressedIfAbsent } =
      await import("../storage");
    invalidateStorageCache();

    await expect(
      storagePutContentAddressedIfAbsent("spec224/bundles", Buffer.from("x"))
    ).rejects.toThrow("STORAGE_CONTENT_ADDRESS_CONFLICT");
  });
});
