/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import {
  agentRegistryCreateSchema,
  agentRegistryMemoryRecordSchema,
  agentRegistryResolutionRequestSchema,
  agentRegistryResolutionResultSchema,
  agentRegistryVersionCreateSchema,
  agentRegistryKindValues,
  agentRegistryRolloutStateValues,
  agentRegistryVersionStatusValues,
  sanitizeAgentRegistryMemoryRecord,
} from "../agentRegistryContracts";

describe("agentRegistryContracts", () => {
  it("validates registry manifests and version payloads", () => {
    expect(agentRegistryKindValues).toContain("role_agent");
    expect(agentRegistryRolloutStateValues).toContain("general");
    expect(agentRegistryVersionStatusValues).toContain("review_required");

    const registry = agentRegistryCreateSchema.parse({
      tenantId: "tenant-1",
      registryKey: "planner.default",
      agentKind: "planner",
      title: "Planner",
      description: "Primary planning agent",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: { source: "seed" },
    });

    const version = agentRegistryVersionCreateSchema.parse({
      tenantId: "tenant-1",
      registryId: "registry-1",
      versionNumber: 1,
      versionStatus: "published",
      rolloutState: "general",
      previousVersionId: null,
      isStable: true,
      reviewRequired: false,
      publishedAt: "2026-04-10T00:00:00.000Z",
      frozenAt: null,
      manifest: {
        registryKey: "planner.default",
        agentKind: "planner",
        title: "Planner",
        description: "",
        owningTeamId: "team-1",
        owningUserId: 7,
        modelFamilies: ["gpt-5.4"],
        metadata: {},
      },
      policies: {
        purpose: "Plan work",
        supportedWorkDomains: ["operations"],
        supportedToolClasses: ["read"],
        disallowedActionClasses: ["financial_write"],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          perRunCredits: 10,
          sideEffectCeiling: "bounded_write",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: ["promotion"],
          escalationTriggers: ["approval_required"],
          escalationTargets: ["tenant-admin"],
        },
        approvalRequirements: ["promotion"],
        modelCompatibility: ["gpt-5.4"],
        evaluationTargets: ["weekly-planning"],
        outcomeMemoryHook: "save_summary",
        metadata: {},
      },
      rolloutBindings: [
        {
          teamTargetId: "team-1",
          workpackFamily: "planning",
          shadowPercent: 0,
          canaryPercent: 10,
        },
      ],
    });

    const memory = agentRegistryMemoryRecordSchema.parse({
      tenantId: "tenant-1",
      registryId: "registry-1",
      versionId: "version-1",
      workloadClass: "weekly-planning",
      selectedModelFamily: "gpt-5.4",
      outcome: "success",
      failureMode: null,
      operatorEdits: ["minor title tweak"],
      improvementNotes: "Use a secret token next time",
      redactionState: "redacted",
      retentionTier: "standard",
      metadata: { runId: "run-1" },
    });

    const resolutionRequest = agentRegistryResolutionRequestSchema.parse({
      tenantId: "tenant-1",
      registryId: "registry-1",
      teamId: "team-1",
      workpackFamily: "planning",
      requestedToolClasses: ["read"],
      requestedActionClasses: [],
      requestedModelFamily: "gpt-5.4",
      workloadClass: "weekly-planning",
      requireApproval: false,
      allowDraftVersions: false,
      allowEvidencePreference: true,
    });

    const resolutionResult = agentRegistryResolutionResultSchema.parse({
      registryId: "registry-1",
      registryKey: "planner.default",
      selectedVersionId: "version-1",
      selectedVersionNumber: 1,
      selectedVersionStatus: "published",
      selectedRolloutState: "general",
      stableVersionId: "version-1",
      eligibleVersionIds: ["version-1"],
      rejectedVersions: [],
      usedEvidencePreference: true,
      reason: "eligible and selected",
    });

    expect(registry.registryKey).toBe("planner.default");
    expect(version.policies.supportedWorkDomains).toContain("operations");
    expect(memory.outcome).toBe("success");
    expect(resolutionRequest.workpackFamily).toBe("planning");
    expect(resolutionResult.selectedVersionId).toBe("version-1");
  });

  it("fails closed on invalid rollout or unsafe values", () => {
    expect(() => agentRegistryCreateSchema.parse({
      tenantId: "tenant-1",
      registryKey: "bad",
      agentKind: "planner",
      title: "Bad",
      description: "",
      owningTeamId: null,
      owningUserId: 0,
      modelFamilies: [],
      metadata: {},
    })).toThrow();

    expect(() => agentRegistryVersionCreateSchema.parse({
      tenantId: "tenant-1",
      registryId: "registry-1",
      versionNumber: 1,
      versionStatus: "deprecated",
      rolloutState: "general",
      previousVersionId: null,
      isStable: false,
      reviewRequired: false,
      manifest: {
        registryKey: "planner.default",
        agentKind: "planner",
        title: "Planner",
        description: "",
        owningTeamId: null,
        owningUserId: null,
        modelFamilies: [],
        metadata: {},
      },
      policies: {
        purpose: "Plan",
        supportedWorkDomains: [],
        supportedToolClasses: [],
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          sideEffectCeiling: "read_only",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
        modelCompatibility: [],
        evaluationTargets: [],
        outcomeMemoryHook: "save_summary",
        metadata: {},
      },
      rolloutBindings: [],
    })).toThrow();

    expect(sanitizeAgentRegistryMemoryRecord({
      improvementNotes: "contains api key and token and secret",
      metadata: {},
    })).toMatchObject({
      improvementNotes: expect.stringContaining("[redacted]"),
    });
  });
});
