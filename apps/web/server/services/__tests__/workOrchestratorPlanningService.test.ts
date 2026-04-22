import { describe, expect, it } from "vitest";

import { createPreflightPlan } from "../workOrchestratorPlanningService";
import {
  buildCapabilityCatalog,
} from "../orchestratorCapabilityCatalogService";
import {
  buildPreflightRevisionFingerprint,
} from "../preflightRevisionService";
import type {
  CompiledWorkBrief,
  TeamResolutionDecision,
  WorkIntakeActorContext,
} from "../../../shared/workOrchestrator";

const actorContext: WorkIntakeActorContext = {
  tenantId: "tenant-1",
  actorUserId: 42,
  requesterUserId: "42",
  roles: ["member"],
  domainId: null,
  privateVaultUnlocked: false,
  allowedSourceScopes: ["case", "request", "conversation", "manual"],
  allowedSurfacePermissions: [
    "orchestrator.surface.skill",
    "orchestrator.surface.agency",
    "orchestrator.surface.browser",
    "orchestrator.surface.document_management",
    "orchestrator.surface.media_studio",
    "orchestrator.surface.video_editor",
    "orchestrator.surface.work_os",
  ],
  previewAccessLevel: "requester_safe",
};

const brief: CompiledWorkBrief = {
  title: "Launch campaign",
  objective: "Create launch assets",
  summary: "Create launch assets",
  sourceRefs: [],
  approvalSnapshots: [],
  generatedAt: "2026-04-21T00:00:00.000Z",
};

const teamResolution: TeamResolutionDecision = {
  status: "resolved",
  code: "resolved_request_default_queue",
  teamId: "team-1",
  source: "request_default_queue",
  reason: "Resolved from request default queue",
  diagnostics: {},
};

describe("workOrchestratorPlanningService", () => {
  it("builds capability and execution plans with a runtime budget", () => {
    const capabilityCatalog = buildCapabilityCatalog({
      actorContext,
      selectedSurfaces: ["skill", "agency"],
    });
    const preflightRevision = buildPreflightRevisionFingerprint({
      requestTitle: brief.title,
      requestObjective: brief.objective,
      linkedConversationIds: ["chat-1"],
      selectedSourceIds: ["chat-1"],
      generatedAt: "2026-04-21T00:00:00.000Z",
    });

    const result = createPreflightPlan({
      brief,
      capabilityCatalog,
      preflightRevision,
      teamResolution,
      policy: {
        templateKey: "content-production",
        templateFamily: "content-production",
        templateVersion: "content-production.v1",
        templateSource: "case_intake",
        templateTitle: "Content Production Fabric",
        modeResolution: {
          requestedMode: "fully_auto",
          effectiveMode: "fully_auto",
          recommendedMode: "fully_auto",
          downgraded: false,
          reasonCode: "explicit",
          reason: "Requested fully_auto",
          confidence: 0.9,
        },
        stepBlueprints: [
          {
            stepKey: "research",
            title: "Research",
            surface: "skill",
            riskTier: "low",
            evidenceType: "brief",
            checkpointKey: "research-complete",
            requiresApproval: false,
            allowedSurfaces: ["skill", "agency"],
            sideEffectClass: "read_only",
          },
        ],
        approvalGateStepKeys: [],
        surfaceAllowlist: ["skill", "agency"],
        policyJson: {},
      } as any,
      createdAt: "2026-04-21T00:00:00.000Z",
    });

    expect(result.capabilityPlan.steps[0]).toEqual(
      expect.objectContaining({
        selectedSurface: "skill",
      }),
    );
    expect(result.executionPlan.steps[0]).toEqual(
      expect.objectContaining({
        surface: "skill",
      }),
    );
    expect(result.budget.maxTokens).toBeGreaterThan(0);
  });
});
