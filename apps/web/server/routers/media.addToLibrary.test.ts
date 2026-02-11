import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAddMediaTaskToLibrary, mockAuditLog } = vi.hoisted(() => ({
  mockAddMediaTaskToLibrary: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../services/mediaLibraryService", () => ({
  addMediaTaskToLibrary: mockAddMediaTaskToLibrary,
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

vi.mock("../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    getModels: vi.fn().mockReturnValue([]),
    getModel: vi.fn().mockReturnValue(null),
  },
  MEDIA_MODELS: {},
  DEFAULT_MODELS: { image: "google-nano-banana-pro", video: "veo-3-1", audio: "elevenlabs-tts" },
}));

vi.mock("../services/creditService", () => ({
  deductCredits: vi.fn(),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  refundCredits: vi.fn(),
}));

vi.mock("../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn().mockReturnValue(10),
}));

vi.mock("../services/rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn().mockReturnValue(true),
    getResetTime: vi.fn().mockReturnValue(1000),
  },
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../drizzle/schema", () => ({
  mediaModels: { modelId: "modelId", creditCost: "creditCost", configJson: "configJson" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("../_core/tokens", () => ({
  signBearerToken: vi.fn().mockReturnValue("fallback-token"),
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
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

import { mediaRouter } from "./media";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.LIBRARY_ENABLED;
  delete process.env.LIBRARY_ENABLED_TENANTS;
});

describe("mediaRouter.addTaskToLibrary", () => {
  it("adds completed media task into library", async () => {
    mockAddMediaTaskToLibrary.mockResolvedValue({
      itemId: 501,
      created: true,
      indexJob: { jobId: 9001, status: "pending", created: true },
      taskStatus: "completed",
    });

    const fn = mediaRouter.addTaskToLibrary as Function;
    const result = await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        userToken: "token-abc",
        tenantId: null,
      },
      input: {
        taskId: "task-123",
      },
    });

    expect(result.itemId).toBe(501);
    expect(mockAddMediaTaskToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTaskId: "task-123", userToken: "token-abc" }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "library_mutation",
        endpoint: "media.addTaskToLibrary",
      }),
    );
  });

  it("rejects add-to-library when tenant context is missing", async () => {
    const fn = mediaRouter.addTaskToLibrary as Function;

    await expect(
      fn({
        ctx: {
          user: { id: 9, role: "user", currentTenantId: null },
          userToken: "token-abc",
          tenantId: null,
        },
        input: { taskId: "task-123" },
      }),
    ).rejects.toThrow("Tenant context is required");
  });

  it("falls back to numeric user tenant when ctx tenant is string in mixed schema", async () => {
    mockAddMediaTaskToLibrary.mockResolvedValue({
      itemId: 502,
      created: true,
      indexJob: { jobId: 9002, status: "pending", created: true },
      taskStatus: "completed",
    });

    const fn = mediaRouter.addTaskToLibrary as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        userToken: "token-abc",
        tenantId: "tenant-ZCSKEM9s" as any,
      },
      input: { taskId: "task-123" },
    });

    expect(mockAddMediaTaskToLibrary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 44 }),
    );
  });

  it("prefers numeric ctx tenant when user tenant is non-numeric string", async () => {
    mockAddMediaTaskToLibrary.mockResolvedValue({
      itemId: 504,
      created: true,
      indexJob: { jobId: 9004, status: "pending", created: true },
      taskStatus: "completed",
    });

    const fn = mediaRouter.addTaskToLibrary as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: "tenant-ZCSKEM9s" as any },
        userToken: "token-abc",
        tenantId: 44 as any,
      },
      input: { taskId: "task-123" },
    });

    expect(mockAddMediaTaskToLibrary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 44 }),
    );
  });

  it("uses ctx string tenant when user tenant is missing", async () => {
    mockAddMediaTaskToLibrary.mockResolvedValue({
      itemId: 503,
      created: true,
      indexJob: { jobId: 9003, status: "pending", created: true },
      taskStatus: "completed",
    });

    const fn = mediaRouter.addTaskToLibrary as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: null },
        userToken: "token-abc",
        tenantId: "tenant-ZCSKEM9s" as any,
      },
      input: { taskId: "task-123" },
    });

    expect(mockAddMediaTaskToLibrary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "tenant-ZCSKEM9s" }),
    );
  });

  it("rejects add-to-library when library feature is disabled", async () => {
    process.env.LIBRARY_ENABLED = "false";
    const fn = mediaRouter.addTaskToLibrary as Function;

    await expect(
      fn({
        ctx: {
          user: { id: 9, role: "user", currentTenantId: 44 },
          userToken: "token-abc",
          tenantId: null,
        },
        input: { taskId: "task-123" },
      }),
    ).rejects.toThrow("Library feature is disabled");
  });
});
