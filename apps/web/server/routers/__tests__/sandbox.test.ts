import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tRPC to extract handler functions
vi.mock("../../_core/trpc", () => {
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

const { mockDispatchToSandbox, mockShouldUseSandbox } = vi.hoisted(() => ({
  mockDispatchToSandbox: vi.fn(),
  mockShouldUseSandbox: vi.fn(),
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  dispatchToSandbox: mockDispatchToSandbox,
  shouldUseSandbox: mockShouldUseSandbox,
}));

vi.mock("../../services/sandbox/policyResolver", () => ({
  checkTenantPolicy: vi.fn().mockResolvedValue({ allowed: true }),
  resolveProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../services/sandbox/statusProjection", () => ({
  projectStatus: vi.fn().mockReturnValue({
    label: "Queued",
    phase: "pending",
    isTerminal: false,
  }),
}));

vi.mock("../../services/sandbox/costEstimator", () => ({
  estimateCost: vi.fn().mockReturnValue(5),
  reserveCredits: vi.fn().mockResolvedValue({ transactionId: 1 }),
  refundReservedCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/sandbox/artifactAccess", () => ({
  getArtifactUrl: vi.fn().mockResolvedValue(null),
  getJobArtifactUrls: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../db", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../../../drizzle/schema", () => ({
  sandboxJobs: {
    id: "id",
    tenantId: "tenantId",
    userId: "userId",
    status: "status",
    featureType: "featureType",
    createdAt: "createdAt",
  },
  sandboxProfiles: {
    id: "id",
    slug: "slug",
    isActive: "isActive",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
}));

import { sandboxRouter, canAccessSandboxJob } from "../sandbox";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sandboxRouter", () => {
  it("exports all required procedures", () => {
    expect(sandboxRouter).toBeDefined();
    expect(sandboxRouter.createJob).toBeDefined();
    expect(sandboxRouter.getJobStatus).toBeDefined();
    expect(sandboxRouter.cancelJob).toBeDefined();
    expect(sandboxRouter.getJobTranscript).toBeDefined();
    expect(sandboxRouter.listJobs).toBeDefined();
    expect(sandboxRouter.getProfiles).toBeDefined();
  });

  it("allows access for the job owner in the same tenant", () => {
    const allowed = canAccessSandboxJob(
      { tenantId: "tenant-001", userId: 7 },
      { tenantId: "tenant-001", userId: 7, role: "user" },
    );
    expect(allowed).toBe(true);
  });

  it("denies access for different user in the same tenant", () => {
    const allowed = canAccessSandboxJob(
      { tenantId: "tenant-001", userId: 7 },
      { tenantId: "tenant-001", userId: 8, role: "user" },
    );
    expect(allowed).toBe(false);
  });

  it("denies access for owner user in different tenant", () => {
    const allowed = canAccessSandboxJob(
      { tenantId: "tenant-001", userId: 7 },
      { tenantId: "tenant-002", userId: 7, role: "user" },
    );
    expect(allowed).toBe(false);
  });

  it("allows admin access across tenants", () => {
    const allowed = canAccessSandboxJob(
      { tenantId: "tenant-001", userId: 7 },
      { tenantId: "tenant-999", userId: 55, role: "admin" },
    );
    expect(allowed).toBe(true);
  });
});
