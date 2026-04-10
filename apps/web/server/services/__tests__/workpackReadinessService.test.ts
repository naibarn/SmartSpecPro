import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../tenantFeatureFlagService")>("../tenantFeatureFlagService");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn().mockResolvedValue({
      workpacksEnabled: true,
      workpackAutonomousPilot: true,
      workpackOpsConsole: true,
    }),
  };
});

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { validateConnectorMaps } from "../workpackConnectorService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { getWorkpackReadinessSummary } from "../workpackReadinessService";
import { resetWorkpackStore, updateWorkpackVersion } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";

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

describe("workpackReadinessService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("derives stable readiness summaries from evidence", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support ops",
      goal: "Classify tickets",
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

    const summary = await getWorkpackReadinessSummary(draft.workpack.id);

    expect(summary.gateResult).toBe("ready");
    expect(summary.trustStatus).toBe("verified");
  });
});
