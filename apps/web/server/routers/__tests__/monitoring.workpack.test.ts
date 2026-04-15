import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { appRouter } from "../../routers";
import { createDraftWorkpack } from "../../services/workpackIntakeService";
import { compileWorkpackExecutionPlan } from "../../services/workpackCompilerService";
import { resetWorkpackStore } from "../../services/workpackPersistence";
import { simulateWorkpack } from "../../services/workpackSimulationService";

function createAdminContext() {
  return {
    user: {
      id: 1,
      openId: "admin-1",
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

describe("monitoring workpack router", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("returns normalized workpack telemetry and readiness payloads", async () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support metrics",
      goal: "Route support tasks",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP",
          sourceText: "Classify and route support tasks.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    simulateWorkpack({ workpackId: draft.workpack.id });

    const caller = appRouter.createCaller(createAdminContext());
    const summary = await caller.monitoring.getWorkpackSummary();
    const readiness = await caller.monitoring.getWorkpackReadiness();

    expect(summary.totals.workpackCount).toBe(1);
    expect(readiness).toHaveLength(1);
  });
});
