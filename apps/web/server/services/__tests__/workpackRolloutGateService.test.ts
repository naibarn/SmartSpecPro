import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../tenantFeatureFlagService")>("../tenantFeatureFlagService");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn().mockResolvedValue({
      workpacksEnabled: true,
      workpackAutonomousPilot: false,
      workpackOpsConsole: true,
    }),
  };
});

vi.mock("../workpackPromotionService", () => ({
  evaluateWorkpackPromotionEligibility: vi.fn(() => ({
    eligible: false,
    reasonCode: "benchmark_candidate_missing",
    publicationScope: "tenant_local",
    trustTags: [],
    evidenceCompleteness: 0.4,
    benchmarkCandidate: false,
    rollbackAvailable: false,
  })),
}));

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { validateConnectorMaps } from "../workpackConnectorService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { evaluateWorkpackRolloutGate } from "../workpackRolloutGateService";
import { resetWorkpackStore } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";

describe("workpackRolloutGateService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("requires simulation before rollout", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Ops intake",
      goal: "Triage daily ops work",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Ops note",
          sourceText: "Review ops queue and route tasks.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const decision = await evaluateWorkpackRolloutGate({ workpackId: draft.workpack.id, targetMode: "supervised" });

    expect(decision.gateResult).toBe("review_required");
    expect(decision.reasonCode).toBe("simulation_missing");
  });

  it("keeps autonomous rollout staged when pilot flag is disabled", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support ops",
      goal: "Route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support guide",
          sourceText: "Classify and route support tickets.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
      metadataByFamily: {
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
          status: "healthy",
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
          status: "healthy",
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
          status: "healthy",
        },
      },
    });
    await simulateWorkpack({ workpackId: draft.workpack.id });

    const decision = await evaluateWorkpackRolloutGate({ workpackId: draft.workpack.id, targetMode: "autonomous" });

    expect(decision.gateResult).toBe("staged");
  });
});
