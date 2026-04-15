import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { validateConnectorMaps } from "../workpackConnectorService";
import { createDraftWorkpack } from "../workpackIntakeService";
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

describe("workpackSimulationService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("runs a fixture-backed simulation and records stable steps", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support inbox triage",
      goal: "Classify tickets and close the loop",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support guide",
          sourceText: "Classify, route, and close each support request.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
      metadataByFamily: supportConnectorMetadata,
    });

    const result = await simulateWorkpack({ workpackId: draft.workpack.id });

    expect(result.simulationRun.status).toBe("passed");
    expect(result.simulationRun.simulatedSteps).toHaveLength(draft.playbook.steps.length);
    expect(result.exceptionIds).toHaveLength(0);
  });

  it("fails closed when fixtures are missing", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Finance close",
      goal: "Run closing checklist",
      domainPack: "finance_ops",
      sources: [
        {
          type: "document",
          title: "Close book",
          sourceText: "Collect and reconcile closing data.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    await updateWorkpackVersion(draft.version.id, (version) => ({
      ...version,
      fixtureCatalog: [],
    }));

    const result = await simulateWorkpack({ workpackId: draft.workpack.id });

    expect(result.simulationRun.status).toBe("blocked");
    expect(result.simulationRun.mismatchCategories).toContain("fixture_unavailable");
    expect(result.exceptionIds.length).toBeGreaterThan(0);
  });
});
