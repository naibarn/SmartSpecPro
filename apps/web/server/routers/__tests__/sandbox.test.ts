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

import { sandboxRouter } from "../sandbox";

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
});
