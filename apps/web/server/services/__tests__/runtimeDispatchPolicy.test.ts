import { describe, expect, it } from "vitest";

import {
  buildRuntimeDispatchPolicy,
  WORK_ORCHESTRATOR_REASON_CODES,
} from "../workOrchestratorSecurityPolicy";
import type {
  ExecutionBudgetEnvelope,
  TeamExecutionPlanStep,
  WorkIntakeActorContext,
} from "../../../shared/workOrchestrator";

const budget: ExecutionBudgetEnvelope = {
  maxRounds: 20,
  maxTokens: 4000,
  maxToolCalls: 8,
  maxMediaJobs: 1,
  maxWorkflowRuns: 1,
  maxAgencyRuns: 1,
  maxDurationMinutes: 30,
  maxBudgetCredits: 120,
  maxRetries: 1,
  perSurfaceMaxAttempts: {
    skill: 2,
    agency: 1,
    browser: 1,
    document_management: 1,
    media_studio: 1,
    video_editor: 1,
    workflow: 1,
    skill_studio: 1,
    work_os: 1,
    manual: 1,
  },
  mediaRenderQuota: 1,
  retryDisposition: "single_attempt",
  sideEffectRetryPolicy: "verify_then_retry",
  onExceeded: "pause_for_approval",
};

describe("runtimeDispatchPolicy", () => {
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
      "orchestrator.surface.video_editor",
    ],
    previewAccessLevel: "requester_safe",
  };

  it("builds a blocked policy for compatibility-blocked steps", () => {
    const step: TeamExecutionPlanStep = {
      id: "step-1",
      stepKey: "workflow",
      title: "Run workflow",
      objective: "Run workflow",
      surface: "workflow",
      action: null,
      capabilityId: "workflow",
      governance: {
        surface: "workflow",
        action: null,
        plannerVisible: true,
        autoExecutableByDefault: false,
        approvalRequired: true,
        minimumGate: "feature_flag_runtime_permission_approval",
        requiredFeatureFlags: [],
        requiredPermissions: [],
      },
      contractCompatibility: {
        state: "blocked_contract_not_migrated",
        reasonCode: "surface_contract_not_migrated",
        migrationRequired: true,
      },
      expectedArtifacts: [],
      optional: false,
      metadata: {
        sideEffectClass: "external_side_effect",
      },
    };

    const policy = buildRuntimeDispatchPolicy({
      step,
      budget,
      inputFingerprint: "hash-1",
    });

    expect(policy.authorityDecision).toBe("blocked");
    expect(policy.maxAttempts).toBe(1);
    expect(policy.sideEffectClass).toBe("external_side_effect");
  });

  it("re-evaluates current actor permissions when actor context is provided", () => {
    const step: TeamExecutionPlanStep = {
      id: "step-2",
      stepKey: "browser-review",
      title: "Review browser workflow",
      objective: "Review browser workflow",
      surface: "browser",
      action: null,
      capabilityId: "browser",
      governance: {
        surface: "browser",
        action: null,
        plannerVisible: true,
        autoExecutableByDefault: true,
        approvalRequired: false,
        minimumGate: "connector_domain_policy",
        requiredFeatureFlags: [],
        requiredPermissions: ["orchestrator.surface.browser"],
      },
      contractCompatibility: {
        state: "compatible",
        reasonCode: null,
        migrationRequired: false,
      },
      expectedArtifacts: [],
      optional: false,
      metadata: {},
    };

    const policy = buildRuntimeDispatchPolicy({
      step,
      budget,
      inputFingerprint: "hash-2",
      actorContext,
    });

    expect(policy.authorityDecision).toBe("blocked");
    expect(policy.deadLetterPolicy.reasonCode).toBe(
      WORK_ORCHESTRATOR_REASON_CODES.authorityMissing,
    );
  });

  it("uses approval-required dead-letter reasons for privileged surfaces", () => {
    const step: TeamExecutionPlanStep = {
      id: "step-3",
      stepKey: "video-edit",
      title: "Edit final video",
      objective: "Edit final video",
      surface: "video_editor",
      action: null,
      capabilityId: "video_editor",
      governance: {
        surface: "video_editor",
        action: null,
        plannerVisible: true,
        autoExecutableByDefault: false,
        approvalRequired: true,
        minimumGate: "provider_allowlist_quota",
        requiredFeatureFlags: [],
        requiredPermissions: ["orchestrator.surface.video_editor"],
      },
      contractCompatibility: {
        state: "compatible",
        reasonCode: null,
        migrationRequired: false,
      },
      expectedArtifacts: [],
      optional: false,
      metadata: {},
    };

    const policy = buildRuntimeDispatchPolicy({
      step,
      budget,
      inputFingerprint: "hash-3",
      actorContext,
    });

    expect(policy.authorityDecision).toBe("approval_required");
    expect(policy.deadLetterPolicy.reasonCode).toBe(
      WORK_ORCHESTRATOR_REASON_CODES.approvalRequired,
    );
  });
});
