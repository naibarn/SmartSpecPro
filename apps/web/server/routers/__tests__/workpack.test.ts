import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { appRouter } from "../../routers";
import { resetWorkpackStore } from "../../services/workpackPersistence";
import { compileWorkpackExecutionPlan } from "../../services/workpackCompilerService";
import { validateConnectorMaps } from "../../services/workpackConnectorService";
import { publishBenchmarkPack } from "../../services/workpackPromotionService";
import { updateWorkpackVersion } from "../../services/workpackPersistence";
import { simulateWorkpack } from "../../services/workpackSimulationService";

const supportConnectorMetadata = {
  helpdesk: {
    availableFields: ["record_id", "status", "summary", "ticket_id", "priority"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      ticket_id: "string",
      priority: "string",
    },
    grantedScopes: ["helpdesk:read", "helpdesk:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
  knowledge_base: {
    availableFields: ["record_id", "status", "summary", "article_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      article_id: "string",
    },
    grantedScopes: ["knowledge_base:read", "knowledge_base:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
  chat: {
    availableFields: ["record_id", "status", "summary", "thread_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      thread_id: "string",
    },
    grantedScopes: ["chat:read", "chat:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
};

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
    expect(detail.enterprise.releaseGate.gateResult).toMatch(/ready|review_required|blocked/);
    expect(detail.enterprise.sdkContract.kind).toBe("internal_agent_sdk");
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
    expect(roi.enterprise).toHaveLength(1);
    expect(roi.roadmapSummary.workpackCount).toBe(1);
    expect(roi.roadmapSummary.phaseCounts.ready + roi.roadmapSummary.phaseCounts.review_required + roi.roadmapSummary.phaseCounts.blocked).toBeGreaterThan(0);
  });

  it("surfaces benchmark manifests in discovery", async () => {
    const caller = appRouter.createCaller(createProtectedContext());
    const draft = await caller.workpack.createDraft({
      title: "Support benchmark",
      goal: "Classify and route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP",
          sourceText: "Classify and route tickets.",
        },
      ],
    });

    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
      metadataByFamily: supportConnectorMetadata,
    });
    await updateWorkpackVersion(draft.version.id, (version) => ({
      ...version,
      fixtureCatalog: version.fixtureCatalog.map((fixture) => ({
        ...fixture,
        governance: {
          ...fixture.governance,
          redactionState: "de_identified",
          accessScope: "benchmark_candidate",
        },
      })),
    }));
    await simulateWorkpack({ workpackId: draft.workpack.id });

    await publishBenchmarkPack({ workpackId: draft.workpack.id });

    const discovery = await caller.workpack.discovery();
    expect(discovery.benchmarks[0]?.manifest?.packId).toBeTruthy();
    expect(discovery.benchmarks[0]?.manifest?.reversible).toBe(true);
  });

  it("exposes workpack release health for admin monitoring", async () => {
    const caller = appRouter.createCaller(createProtectedContext());
    const draft = await caller.workpack.createDraft({
      title: "Ops briefing",
      goal: "Prepare a recurring status summary",
      domainPack: "operations",
      sources: [
        {
          type: "document",
          title: "Ops notes",
          sourceText: "Compile a concise status summary.",
        },
      ],
    });

    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await simulateWorkpack({ workpackId: draft.workpack.id });

    const releaseHealth = await caller.adminOps.workpackReleaseHealth();
    expect(releaseHealth.readiness.length).toBe(1);
    expect(releaseHealth.summary.workpackCount).toBeGreaterThan(0);
  });
});
