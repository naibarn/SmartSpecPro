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

  it("lets approved media and video blueprint steps override catalog approval defaults", () => {
    const capabilityCatalog = buildCapabilityCatalog({
      actorContext,
      selectedSurfaces: ["media_studio", "video_editor"],
    });
    const preflightRevision = buildPreflightRevisionFingerprint({
      requestTitle: brief.title,
      requestObjective: brief.objective,
      linkedConversationIds: [],
      selectedSourceIds: [],
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
        templateSource: "request_intake",
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
            stepKey: "media",
            title: "Media Asset Generation",
            surface: "media_studio",
            riskTier: "medium",
            evidenceType: "media",
            checkpointKey: null,
            requiresApproval: false,
            allowedSurfaces: ["media_studio", "manual", "work_os"],
            sideEffectClass: "external_write",
          },
          {
            stepKey: "video",
            title: "Video Composition",
            surface: "video_editor",
            riskTier: "medium",
            evidenceType: "video",
            checkpointKey: null,
            requiresApproval: false,
            allowedSurfaces: ["video_editor", "manual", "work_os"],
            sideEffectClass: "external_write",
          },
        ],
        approvalGateStepKeys: [],
        surfaceAllowlist: ["media_studio", "video_editor"],
        policyJson: {},
      } as any,
      createdAt: "2026-04-21T00:00:00.000Z",
    });

    const surfaceGovernance = result.executionPlan.steps.map(step => ({
      surface: step.surface,
      approvalRequired: step.governance.approvalRequired,
      autoExecutableByDefault: step.governance.autoExecutableByDefault,
    }));
    expect(surfaceGovernance).toEqual(
      expect.arrayContaining([
        {
          surface: "media_studio",
          approvalRequired: false,
          autoExecutableByDefault: true,
        },
        {
          surface: "video_editor",
          approvalRequired: false,
          autoExecutableByDefault: true,
        },
      ]),
    );
    expect(result.executionPlan.steps[0].metadata.plannerMode).toBe(
      "capability_aware_dynamic",
    );
  });

  it("scales media budget and quota from requested video duration", () => {
    const capabilityCatalog = buildCapabilityCatalog({
      actorContext,
      selectedSurfaces: ["media_studio", "video_editor"],
    });
    const preflightRevision = buildPreflightRevisionFingerprint({
      requestTitle: "Long video",
      requestObjective: "Create a 2 minute product video",
      linkedConversationIds: [],
      selectedSourceIds: [],
      generatedAt: "2026-04-21T00:00:00.000Z",
    });

    const result = createPreflightPlan({
      brief: {
        ...brief,
        title: "Long video",
        objective: "Create a 2 minute product video",
        summary: "Create a 2 minute product video",
      },
      capabilityCatalog,
      preflightRevision,
      teamResolution,
      policy: {
        templateKey: "content-production",
        templateFamily: "content-production",
        templateVersion: "content-production.v1",
        templateSource: "request_intake",
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
        stepBlueprints: [],
        approvalGateStepKeys: [],
        surfaceAllowlist: ["media_studio", "video_editor"],
        policyJson: {},
      } as any,
      createdAt: "2026-04-21T00:00:00.000Z",
    });

    expect(result.budget.maxMediaJobs).toBeGreaterThanOrEqual(13);
    expect(result.budget.mediaRenderQuota).toBe(result.budget.maxMediaJobs);
    expect(result.budget.maxBudgetCredits).toBeGreaterThanOrEqual(800);
    expect(result.executionPlan.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "document_management",
          metadata: expect.objectContaining({
            documentManagementRequired: expect.objectContaining({
              rag: true,
              vectorSearch: true,
            }),
            planningContract: expect.objectContaining({
              mode: "capability_catalog_grounded",
              repairLoopRequired: true,
            }),
          }),
        }),
        expect.objectContaining({
          surface: "video_editor",
          metadata: expect.objectContaining({
            mediaPipelineRequired: expect.objectContaining({
              async: true,
              finalReviewRequired: true,
              repairOnFailedReview: true,
            }),
          }),
        }),
      ]),
    );
  });
});
