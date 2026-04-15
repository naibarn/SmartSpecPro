import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { appRouter } from "../../routers";
import { resetWorkpackStore } from "../../services/workpackPersistence";

function createProtectedContext() {
  return {
    user: {
      id: 42,
      openId: "user-42",
      email: "user@example.com",
      name: "Workpack User",
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

describe("workpack router", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("creates drafts, exposes detail views, and runs simulation/replay", async () => {
    const caller = appRouter.createCaller(createProtectedContext());
    const draft = await caller.workpack.createDraft({
      title: "Support intake",
      goal: "Classify tickets and route them",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP",
          sourceText: "Classify and route support tickets.",
        },
      ],
    });

    const compiled = await caller.workpack.compile({ workpackId: draft.workpack.id });
    const simulation = await caller.workpack.simulate({ workpackId: draft.workpack.id });
    const detail = await caller.workpack.getDetail({ workpackId: draft.workpack.id });
    const replay = await caller.workpack.replay({
      workpackId: draft.workpack.id,
      simulationRunId: simulation.simulationRun.id,
    });

    expect(compiled.steps.length).toBeGreaterThan(0);
    expect(detail.workpack.id).toBe(draft.workpack.id);
    expect(simulation.simulationRun.status).toBe("blocked");
    expect(replay.inspectionMode).toBe("inspection_only");
  });

  it("returns normalized discovery and ROI payloads", async () => {
    const caller = appRouter.createCaller(createProtectedContext());
    const draft = await caller.workpack.createDraft({
      title: "Procurement intake",
      goal: "Compare vendor quotes",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "RFQ",
          sourceText: "Compare vendor quotes and prepare approval packet.",
        },
      ],
    });

    await caller.workpack.compile({ workpackId: draft.workpack.id });
    await caller.workpack.simulate({ workpackId: draft.workpack.id });

    const discovery = await caller.workpack.discovery();
    const roi = await caller.workpack.roiDashboard();

    expect(discovery.starters).toHaveLength(1);
    expect(roi.readiness).toHaveLength(1);
  });
});
