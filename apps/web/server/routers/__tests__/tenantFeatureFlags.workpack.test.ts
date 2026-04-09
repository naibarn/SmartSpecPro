import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { appRouter } from "../../routers";

function createProtectedContext() {
  return {
    user: {
      id: 11,
      openId: "admin-11",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "email",
      role: "admin",
      currentTenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      ip: "127.0.0.1",
      protocol: "https",
      headers: {},
    },
    res: {
      clearCookie: vi.fn(),
    },
    userToken: null,
    tenantId: "tenant-1",
    publicUrl: "https://tenant.example.com",
  } as any;
}

describe("tenantFeatureFlags workpack rollout", () => {
  it("returns tenant rollout posture for workpack flags", async () => {
    const caller = appRouter.createCaller(createProtectedContext());
    const result = await caller.tenantFeatureFlags.getWorkpackRolloutState({ tenantId: "tenant-1" });

    expect(result.workpacksEnabled).toBe(true);
    expect(result.rolloutPhase).toBe("supervised");
  });
});
