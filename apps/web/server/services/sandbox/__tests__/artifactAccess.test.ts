import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockStoragePresignGet } = vi.hoisted(() => ({
  mockStoragePresignGet: vi.fn(),
}));

vi.mock("../../../storage", () => ({
  storagePresignGet: mockStoragePresignGet,
}));

vi.mock("../../../db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../../../../drizzle/schema", () => ({
  sandboxArtifacts: {
    id: "id",
    sandboxJobId: "sandboxJobId",
    objectKey: "objectKey",
    mimeType: "mimeType",
    isPrimary: "isPrimary",
  },
  sandboxJobs: {
    id: "id",
    tenantId: "tenantId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { db } from "../../../db";
import { getArtifactUrl } from "../artifactAccess";

const mockDb = db as any;

beforeEach(() => {
  vi.clearAllMocks();
});

function createJoinChain(result: any[]) {
  const limitMock = vi.fn().mockResolvedValue(result);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
  const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
  return { from: fromMock };
}

describe("getArtifactUrl", () => {
  it("generates signed URL for artifact", async () => {
    mockDb.select.mockReturnValue(
      createJoinChain([
        {
          objectKey: "sandbox-artifacts/job-123/output.mp4",
          tenantId: "tenant-1",
        },
      ]),
    );

    mockStoragePresignGet.mockResolvedValue({
      url: "https://r2.example.com/signed-url",
      key: "sandbox-artifacts/job-123/output.mp4",
    });

    const result = await getArtifactUrl({
      artifactId: 1,
      tenantId: "tenant-1",
      ttlSeconds: 900,
    });

    expect(result).toBeDefined();
    expect(result?.url).toBe("https://r2.example.com/signed-url");
  });

  it("returns null when artifact belongs to different tenant", async () => {
    mockDb.select.mockReturnValue(createJoinChain([]));

    const result = await getArtifactUrl({
      artifactId: 1,
      tenantId: "tenant-wrong",
      ttlSeconds: 900,
    });

    expect(result).toBeNull();
  });

  it("uses configurable TTL", async () => {
    mockDb.select.mockReturnValue(
      createJoinChain([{ objectKey: "key", tenantId: "tenant-1" }]),
    );

    mockStoragePresignGet.mockResolvedValue({
      url: "https://example.com/url",
      key: "key",
    });

    await getArtifactUrl({
      artifactId: 1,
      tenantId: "tenant-1",
      ttlSeconds: 3600,
    });

    expect(mockStoragePresignGet).toHaveBeenCalledWith("key", 3600);
  });
});
