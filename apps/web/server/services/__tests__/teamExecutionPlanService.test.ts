import { describe, expect, it } from "vitest";

import { preflightApprovalBundleSchema } from "../../../shared/workOrchestrator";
import {
  buildApprovedRunPlanArtifact,
  getApprovedPlanForRun,
} from "../teamExecutionPlanService";

function makeApprovedBundle() {
  return preflightApprovalBundleSchema.parse({
    id: "bundle-1",
    tenantId: "tenant-1",
    requestId: "req-1",
    caseId: "case-1",
    state: "approved",
    createdAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T01:00:00.000Z",
    previewView: "admin_diagnostic",
    brief: {
      title: "Launch campaign",
      objective: "Create launch assets",
      summary: "Create launch assets",
      sourceRefs: [],
      approvalSnapshots: [],
      generatedAt: "2026-04-21T00:00:00.000Z",
    },
    capabilityCatalog: [],
    capabilityPlan: null,
    executionPlan: {
      id: "execution-plan-1",
      version: "team-execution-plan.v1",
      brief: {
        title: "Launch campaign",
        objective: "Create launch assets",
        summary: "Create launch assets",
        sourceRefs: [],
        approvalSnapshots: [],
        generatedAt: "2026-04-21T00:00:00.000Z",
      },
      steps: [
        {
          id: "step-1",
          stepKey: "research",
          title: "Research",
          objective: "Research",
          surface: "agency",
          action: null,
          capabilityId: "agency",
          governance: {
            surface: "agency",
            action: null,
            plannerVisible: true,
            autoExecutableByDefault: true,
            approvalRequired: false,
            minimumGate: "capability_risk_policy",
            requiredFeatureFlags: [],
            requiredPermissions: ["orchestrator.surface.agency"],
          },
          contractCompatibility: {
            state: "compatible",
            reasonCode: null,
            migrationRequired: false,
          },
          expectedArtifacts: ["research"],
          optional: false,
          metadata: {},
        },
      ],
      budget: {
        maxRounds: 12,
        maxTokens: 12000,
        maxToolCalls: 6,
        maxDurationMinutes: 30,
        maxBudgetCredits: 500,
        maxRetries: 1,
        perSurfaceMaxAttempts: {
          agency: 2,
        },
        retryDisposition: "safe_retry",
        sideEffectRetryPolicy: "automatic",
        onExceeded: "pause_for_approval",
      },
      teamResolution: {
        status: "resolved",
        code: "resolved_request_default_queue",
        teamId: "team-1",
        source: "request_default_queue",
        reason: "Resolved from request default queue",
        diagnostics: {},
      },
      preflightRevision: {
        algorithm: "sha256-json-v1",
        fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        inputs: {
          requestTitle: "Launch campaign",
          requestObjective: "Create launch assets",
          linkedConversationIds: [],
          linkedWorkpackRunIds: [],
          linkedRoleRoutineRunIds: [],
          selectedSourceIds: [],
          policyDigest: null,
          explicitTeamId: null,
        },
        generatedAt: "2026-04-21T00:00:00.000Z",
      },
      createdAt: "2026-04-21T00:00:00.000Z",
    },
    teamResolution: {
      status: "resolved",
      code: "resolved_request_default_queue",
      teamId: "team-1",
      source: "request_default_queue",
      reason: "Resolved from request default queue",
      diagnostics: {},
    },
    budget: {
      maxRounds: 12,
      maxTokens: 12000,
      maxToolCalls: 6,
      maxDurationMinutes: 30,
      maxBudgetCredits: 500,
      maxRetries: 1,
      perSurfaceMaxAttempts: {
        agency: 2,
      },
      retryDisposition: "safe_retry",
      sideEffectRetryPolicy: "automatic",
      onExceeded: "pause_for_approval",
    },
    approvalSnapshots: [],
    preflightRevision: {
      algorithm: "sha256-json-v1",
      fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      inputs: {
        requestTitle: "Launch campaign",
        requestObjective: "Create launch assets",
        linkedConversationIds: [],
        linkedWorkpackRunIds: [],
        linkedRoleRoutineRunIds: [],
        selectedSourceIds: [],
        policyDigest: null,
        explicitTeamId: null,
      },
      generatedAt: "2026-04-21T00:00:00.000Z",
    },
    createdByUserId: 42,
    launchedAt: null,
    supersededByBundleId: null,
    approvedAt: "2026-04-21T01:00:00.000Z",
    approvedByUserId: 42,
    idempotencyRecords: [],
    stateTransitions: [],
    requesterSafeDiagnostics: {},
    adminDiagnostics: {},
    metadata: {},
  });
}

describe("teamExecutionPlanService", () => {
  it("loads approved plans from run constraints and builds a Team-ready artifact", () => {
    const snapshot = getApprovedPlanForRun({
      constraintsJson: {
        workOrchestrator: {
          preflightBundle: makeApprovedBundle(),
        },
      },
    });

    expect(snapshot?.executionPlan.id).toBe("execution-plan-1");
    const artifact = buildApprovedRunPlanArtifact({
      snapshot: snapshot!,
      runId: "run-1",
      roomId: "room-1",
      teamId: "team-1",
    });

    expect(artifact.source).toBe("work_os");
    expect(artifact.steps[0]).toEqual(
      expect.objectContaining({
        stepKey: "research",
        surface: "agency",
        selectedCapabilityId: "agency",
        runtimeDispatchPolicy: expect.objectContaining({
          stepId: "step-1",
          surface: "agency",
          authorityDecision: "allowed",
        }),
      })
    );
  });
});
