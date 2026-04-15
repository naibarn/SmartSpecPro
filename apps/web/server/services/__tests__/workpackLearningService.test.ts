import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { validateConnectorMaps } from "../workpackConnectorService";
import { normalizeWorkpackException } from "../workpackExceptionService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { deriveWorkpackImprovementProposals } from "../workpackLearningService";
import { resetWorkpackStore } from "../workpackPersistence";
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

describe("workpackLearningService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("groups repeated exception patterns into improvement proposals", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Procurement intake",
      goal: "Compare vendor options",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "RFQ",
          sourceText: "Compare vendors and prepare approval packet.",
        },
      ],
    });

    await normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "connector_auth",
      reasonCode: "connector_scope_missing",
      title: "Connector scope missing",
      summary: "Vendor portal scope missing",
      remediationPointer: "/workpacks/connectors",
      nextAction: "Refresh scope",
    });
    await normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "connector_auth",
      reasonCode: "connector_scope_missing",
      title: "Connector scope missing",
      summary: "Vendor portal scope missing again",
      remediationPointer: "/workpacks/connectors",
      nextAction: "Refresh scope",
    });

    const bundle = await deriveWorkpackImprovementProposals(draft.workpack.id);

    expect(bundle.proposals.some((proposal) => proposal.actionType === "connector_map_adjustment")).toBe(true);
  });

  it("emits benchmark candidates for stable successful runs", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support ops",
      goal: "Classify and route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP",
          sourceText: "Classify and route tickets, then notify the requester.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
      metadataByFamily: supportConnectorMetadata,
    });
    await simulateWorkpack({ workpackId: draft.workpack.id });

    const bundle = await deriveWorkpackImprovementProposals(draft.workpack.id);

    expect(bundle.benchmarkCandidate).toBe(true);
    expect(bundle.proposals.some((proposal) => proposal.actionType === "benchmark_publication")).toBe(true);
  });
});
