import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockStorageStreamFile: vi.fn(),
  mockGetUploadsDir: vi.fn(() => "/tmp/uploads"),
}));

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mocks.mockGetDb(...args),
}));

vi.mock("../../storage", () => ({
  getUploadsDir: (...args: unknown[]) => mocks.mockGetUploadsDir(...args),
  storageStreamFile: (...args: unknown[]) => mocks.mockStorageStreamFile(...args),
}));

import {
  isProtectedAutoTeamMediaKey,
  normalizeManagedMediaKey,
  parseManagedMediaUrl,
  signManagedMediaAccessUrl,
  streamManagedMediaAccessToken,
} from "../managedMediaAccessService";

function makeDb(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  };
}

function makeResponse() {
  const res: any = {
    statusCode: 200,
    headers: new Map<string, string>(),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    setHeader: vi.fn((key: string, value: string) => {
      res.headers.set(key, value);
      return res;
    }),
    sendFile: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  return res;
}

describe("managedMediaAccessService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects traversal and query-bearing managed media URLs", () => {
    expect(normalizeManagedMediaKey("%2e%2e/private.mp4")).toBeNull();
    expect(normalizeManagedMediaKey("auto-team-media/tenant/run/final.mp4")).toBe(
      "auto-team-media/tenant/run/final.mp4",
    );
    expect(parseManagedMediaUrl("/uploads/auto-team-media/t/r/final.mp4?token=x")).toBeNull();
    expect(isProtectedAutoTeamMediaKey("auto-team-media/t/r/final.mp4")).toBe(true);
  });

  it("streams only when the signed token matches a persisted final artifact", async () => {
    const tokenUrl = signManagedMediaAccessUrl({
      ref: { kind: "storage", key: "auto-team-media/tenant-1/run-1/final.mp4" },
      tenantId: "tenant-1",
      userId: 42,
      runId: "run-1",
    });
    const token = new URL(`https://example.test${tokenUrl}`).searchParams.get("token")!;
    const stream = {
      pipe: vi.fn(),
    };
    mocks.mockGetDb.mockResolvedValue(makeDb([{ id: "artifact-1" }]));
    mocks.mockStorageStreamFile.mockResolvedValue({
      stream,
      contentType: "video/mp4",
      contentLength: 123,
      isPartial: false,
    });
    const res = makeResponse();

    await streamManagedMediaAccessToken(
      { query: { token }, headers: {}, user: { id: 42, role: "user" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.mockStorageStreamFile).toHaveBeenCalledWith(
      "auto-team-media/tenant-1/run-1/final.mp4",
      undefined,
    );
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });

  it("blocks signed tokens that do not have a matching final artifact", async () => {
    const tokenUrl = signManagedMediaAccessUrl({
      ref: { kind: "storage", key: "auto-team-media/tenant-1/run-1/final.mp4" },
      tenantId: "tenant-1",
      userId: 42,
      runId: "run-1",
    });
    const token = new URL(`https://example.test${tokenUrl}`).searchParams.get("token")!;
    mocks.mockGetDb.mockResolvedValue(makeDb([]));
    const res = makeResponse();

    await streamManagedMediaAccessToken(
      { query: { token }, headers: {}, user: { id: 42, role: "user" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.mockStorageStreamFile).not.toHaveBeenCalled();
  });

  it("blocks user-bound media tokens from other sessions", async () => {
    const tokenUrl = signManagedMediaAccessUrl({
      ref: { kind: "storage", key: "auto-team-media/tenant-1/run-1/final.mp4" },
      tenantId: "tenant-1",
      userId: 42,
      runId: "run-1",
    });
    const token = new URL(`https://example.test${tokenUrl}`).searchParams.get("token")!;
    mocks.mockGetDb.mockResolvedValue(makeDb([{ id: "artifact-1" }]));
    const res = makeResponse();

    await streamManagedMediaAccessToken(
      { query: { token }, headers: {}, user: { id: 99, role: "user" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.mockStorageStreamFile).not.toHaveBeenCalled();
  });

  it("does not let admins bypass a user-bound media token", async () => {
    const tokenUrl = signManagedMediaAccessUrl({
      ref: { kind: "storage", key: "auto-team-media/tenant-1/run-1/final.mp4" },
      tenantId: "tenant-1",
      userId: 42,
      runId: "run-1",
    });
    const token = new URL(`https://example.test${tokenUrl}`).searchParams.get("token")!;
    mocks.mockGetDb.mockResolvedValue(makeDb([{ id: "artifact-1" }]));
    const res = makeResponse();

    await streamManagedMediaAccessToken(
      { query: { token }, headers: {}, user: { id: 99, role: "admin" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.mockStorageStreamFile).not.toHaveBeenCalled();
  });

  it("refuses to mint unbound final media access tokens", () => {
    expect(() =>
      signManagedMediaAccessUrl({
        ref: { kind: "storage", key: "auto-team-media/tenant-1/run-1/final.mp4" },
        tenantId: "tenant-1",
        userId: null,
        runId: "run-1",
      }),
    ).toThrow("managed_media_access_requires_user_binding");
  });
});
