import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { validateConnectorMaps } from "../workpackConnectorService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { evaluateWorkpackPromotionEligibility, publishBenchmarkPack, rollbackWorkpackPromotion } from "../workpackPromotionService";
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

describe("workpackPromotionService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("blocks promotion when evidence is incomplete", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Executive briefing",
      goal: "Prepare a weekly briefing",
      domainPack: "executive_support",
      sources: [
        {
          type: "document",
          title: "Briefing notes",
          sourceText: "Collect the briefing context and prepare a summary.",
        },
      ],
    });

    const eligibility = await evaluateWorkpackPromotionEligibility(draft.workpack.id);

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasonCode).toBe("execution_plan_missing");
  });

  it("publishes tenant-local benchmarks and supports rollback", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support benchmark",
      goal: "Classify and route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support flow",
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

    const promotion = await publishBenchmarkPack({ workpackId: draft.workpack.id });

    expect(promotion.benchmarkPack?.publicationStatus).toBe("published");
    expect(promotion.manifest?.packId).toBe(promotion.benchmarkPack?.id);
    expect(promotion.manifest?.reversible).toBe(true);
    expect(promotion.promotionRecord.state).toBe("active");

    const rolledBack = await rollbackWorkpackPromotion({
      tenantId: "tenant-1",
      promotionRecordId: promotion.promotionRecord.id,
    });
    expect(rolledBack.state).toBe("rolled_back");
  });
});
