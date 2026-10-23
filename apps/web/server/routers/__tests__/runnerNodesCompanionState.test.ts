import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRunnerCompanionState = vi.hoisted(() => vi.fn());

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const procedure: any = {
      input: () => procedure,
      query: (handler: Function) => handler,
      mutation: (handler: Function) => handler,
    };
    return procedure;
  };
  return {
    router: (routes: unknown) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../services/runnerCompanionViewState", () => ({
  getRunnerCompanionState: (...args: unknown[]) =>
    mockGetRunnerCompanionState(...args),
}));
vi.mock("../../services/cloudflareStagingExecutorIdentityService", () => ({
  CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY: "cloudflare.staging.executor",
  CLOUDFLARE_STAGING_EXECUTOR_PROFILE: "cloudflare_staging_executor",
  CLOUDFLARE_STAGING_EXECUTOR_TARGET: "cloudflare-staging",
  validateCloudflareStagingExecutorRegistration: vi.fn(),
}));

import { runnerNodesRouter } from "../runnerNodes";

describe("runnerNodesRouter.companionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRunnerCompanionState.mockResolvedValue({
      schemaVersion: "runner-companion.v1",
    });
  });

  it("binds the projection to the authenticated tenant and user", async () => {
    const handler = runnerNodesRouter.companionState as unknown as Function;

    await handler({
      ctx: {
        tenantId: "tenant-a",
        user: { id: 7, role: "admin", currentTenantId: "tenant-b" },
      },
    });

    expect(mockGetRunnerCompanionState).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: 7,
    });
  });

  it("uses the authenticated current tenant when the request context has no override", async () => {
    const handler = runnerNodesRouter.companionState as unknown as Function;

    await handler({ ctx: { user: { id: 11, currentTenantId: "tenant-c" } } });

    expect(mockGetRunnerCompanionState).toHaveBeenCalledWith({
      tenantId: "tenant-c",
      userId: 11,
    });
  });
});
