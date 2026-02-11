import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockGetLibraryOpsSummary,
  mockReprocessCallbackDlqEntry,
  mockRetryFailedLibraryIndexJobs,
  mockCreateLibraryOpsRepository,
  mockAuditLog,
  mockIsLibraryEnabledForTenant,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn().mockResolvedValue({}),
  mockGetLibraryOpsSummary: vi.fn(),
  mockReprocessCallbackDlqEntry: vi.fn(),
  mockRetryFailedLibraryIndexJobs: vi.fn(),
  mockCreateLibraryOpsRepository: vi.fn().mockReturnValue({}),
  mockAuditLog: vi.fn(),
  mockIsLibraryEnabledForTenant: vi.fn().mockReturnValue(true),
}));

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../services/libraryFeatureFlags", () => ({
  isLibraryEnabledForTenant: mockIsLibraryEnabledForTenant,
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

vi.mock("../services/libraryOpsService", () => ({
  createLibraryOpsRepository: mockCreateLibraryOpsRepository,
  getLibraryOpsSummary: mockGetLibraryOpsSummary,
  reprocessCallbackDlqEntry: mockReprocessCallbackDlqEntry,
  retryFailedLibraryIndexJobs: mockRetryFailedLibraryIndexJobs,
}));

vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    adminProcedure: createProcedure(),
  };
});

import { libraryOpsRouter } from "./libraryOps";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({});
  mockIsLibraryEnabledForTenant.mockReturnValue(true);
});

describe("libraryOpsRouter.getSummary", () => {
  it("passes tenant-scoped options when scope is tenant", async () => {
    mockGetLibraryOpsSummary.mockResolvedValue({
      callbackDlqPending: 0,
      callbackRetryPending: 0,
      indexRetryPending: 1,
      indexFailed: 2,
    });

    const fn = libraryOpsRouter.getSummary as Function;
    await fn({
      ctx: {
        user: { id: 1, role: "admin", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        scope: "tenant",
      },
    });

    expect(mockGetLibraryOpsSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "44",
      }),
    );
  });

  it("rejects tenant scope when tenant context is missing", async () => {
    const fn = libraryOpsRouter.getSummary as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 1, role: "admin", currentTenantId: null },
          tenantId: null,
        },
        input: {
          scope: "tenant",
        },
      }),
    ).rejects.toThrow("Tenant scope is required for library ops summary");
  });
});

describe("libraryOpsRouter.reprocessCallbackDlq", () => {
  it("rejects tenant scope when tenant context is missing", async () => {
    const fn = libraryOpsRouter.reprocessCallbackDlq as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 1, role: "admin", currentTenantId: null },
          tenantId: null,
        },
        input: {
          id: 10,
          scope: "tenant",
        },
      }),
    ).rejects.toThrow("Tenant scope is required for DLQ reprocess");
  });

  it("passes tenant id to reprocess service in tenant scope", async () => {
    mockReprocessCallbackDlqEntry.mockResolvedValue({
      success: true,
      status: "reprocessed",
      dlqId: 10,
      eventMovedToRetry: true,
    });

    const fn = libraryOpsRouter.reprocessCallbackDlq as Function;
    await fn({
      ctx: {
        user: { id: 1, role: "admin", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        id: 10,
        scope: "tenant",
      },
    });

    expect(mockReprocessCallbackDlqEntry).toHaveBeenCalledWith(
      expect.anything(),
      10,
      expect.objectContaining({ tenantId: "44" }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestPayload: expect.objectContaining({ operationScope: "tenant" }),
      }),
    );
  });

  it("allows explicit global reprocess and emits global scope audit marker", async () => {
    mockReprocessCallbackDlqEntry.mockResolvedValue({
      success: true,
      status: "reprocessed",
      dlqId: 10,
      eventMovedToRetry: true,
    });

    const fn = libraryOpsRouter.reprocessCallbackDlq as Function;
    await fn({
      ctx: {
        user: { id: 1, role: "admin", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        id: 10,
        scope: "global",
      },
    });

    expect(mockReprocessCallbackDlqEntry).toHaveBeenCalledWith(
      expect.anything(),
      10,
      expect.objectContaining({ tenantId: null }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "libraryOps.reprocessCallbackDlq",
        requestPayload: expect.objectContaining({
          operationScope: "global",
        }),
      }),
    );
  });

  it("rejects global reprocess for non-elevated role", async () => {
    const fn = libraryOpsRouter.reprocessCallbackDlq as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 1, role: "user", currentTenantId: 44 },
          tenantId: null,
        },
        input: {
          id: 11,
          scope: "global",
        },
      }),
    ).rejects.toThrow("Global library ops require elevated role");
  });
});

describe("libraryOpsRouter.retryFailedIndexJobs", () => {
  it("rejects tenant retry when tenant context is missing", async () => {
    const fn = libraryOpsRouter.retryFailedIndexJobs as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 1, role: "admin", currentTenantId: null },
          tenantId: null,
        },
        input: {
          scope: "tenant",
          limit: 10,
        },
      }),
    ).rejects.toThrow("Tenant scope is required for retry operations");
  });

  it("passes tenant id to retry service in tenant scope", async () => {
    mockRetryFailedLibraryIndexJobs.mockResolvedValue({
      retried: 2,
      jobIds: [1, 2],
    });

    const fn = libraryOpsRouter.retryFailedIndexJobs as Function;
    await fn({
      ctx: {
        user: { id: 1, role: "admin", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        scope: "tenant",
        limit: 10,
      },
    });

    expect(mockRetryFailedLibraryIndexJobs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "44",
      }),
    );
  });

  it("rejects global retry for non-elevated role", async () => {
    const fn = libraryOpsRouter.retryFailedIndexJobs as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 1, role: "user", currentTenantId: 44 },
          tenantId: null,
        },
        input: {
          scope: "global",
          limit: 10,
        },
      }),
    ).rejects.toThrow("Global library ops require elevated role");
  });
});
