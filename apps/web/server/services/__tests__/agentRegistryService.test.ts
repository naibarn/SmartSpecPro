import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAgentRegistry,
  createPromotionReview,
  freezeAgentVersion,
  publishAgentVersion,
  recordAgentOutcomeMemory,
  resolveAgentVersion,
  rollbackAgentVersion,
} from "../agentRegistryService";

function createRepo() {
  const state = {
    registries: [] as any[],
    versions: [] as any[],
    policyBindings: [] as any[],
    rolloutBindings: [] as any[],
    memories: [] as any[],
    reviews: [] as any[],
  };

  const repo: any = {
    state,
    async transaction(fn: any) {
      return fn(repo);
    },
    async createRegistry(values: any) {
      const row = { ...values };
      state.registries.push(row);
      return row;
    },
    async getRegistryByTenantAndId(tenantId: string, registryId: string) {
      return state.registries.find((row) => row.tenantId === tenantId && row.id === registryId) ?? null;
    },
    async getRegistryByTenantAndKey(tenantId: string, registryKey: string) {
      return state.registries.find((row) => row.tenantId === tenantId && row.registryKey === registryKey) ?? null;
    },
    async listRegistries(tenantId: string) {
      return state.registries.filter((row) => row.tenantId === tenantId);
    },
    async updateRegistry(registryId: string, patch: any) {
      const row = state.registries.find((entry) => entry.id === registryId);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
    async createVersion(values: any) {
      const row = { ...values };
      state.versions.push(row);
      return row;
    },
    async updateVersion(versionId: string, patch: any) {
      const row = state.versions.find((entry) => entry.id === versionId);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
    async createPolicyBinding(values: any) {
      const row = { ...values };
      state.policyBindings.push(row);
      return row;
    },
    async createRolloutBinding(values: any) {
      const row = { ...values };
      state.rolloutBindings.push(row);
      return row;
    },
    async createOutcomeMemory(values: any) {
      const row = { ...values };
      state.memories.push(row);
      return row;
    },
    async createPromotionReview(values: any) {
      const row = { ...values };
      state.reviews.push(row);
      return row;
    },
    async loadResolutionContext(tenantId: string, identifier: { registryId?: string; registryKey?: string }, workloadClass?: string | null) {
      const registry = identifier.registryId
        ? state.registries.find((row) => row.tenantId === tenantId && row.id === identifier.registryId)
        : identifier.registryKey
          ? state.registries.find((row) => row.tenantId === tenantId && row.registryKey === identifier.registryKey)
          : null;
      if (!registry) return null;
      return {
        registry,
        versions: state.versions.filter((row) => row.registryId === registry.id),
        policyBindings: state.policyBindings.filter((row) => row.registryId === registry.id),
        rolloutBindings: state.rolloutBindings.filter((row) => row.registryId === registry.id),
        memories: workloadClass
          ? state.memories.filter((row) => row.registryId === registry.id && row.workloadClass === workloadClass)
          : state.memories.filter((row) => row.registryId === registry.id),
      };
    },
  };

  return repo;
}

describe("agentRegistryService", () => {
  let repo: any;

  beforeEach(() => {
    repo = createRepo();
  });

  it("creates a registry record", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.default",
      agentKind: "planner",
      title: "Planner",
      description: "Primary planner",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: { source: "seed" },
    }, repo);

    expect(registry.registryKey).toBe("planner.default");
    expect(repo.state.registries).toHaveLength(1);
  });

  it("publishes a version and attaches policy and rollout bindings", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.default",
      agentKind: "planner",
      title: "Planner",
      description: "Primary planner",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: {},
    }, repo);

    const version = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 1,
      versionStatus: "published",
      rolloutState: "general",
      isStable: true,
      reviewRequired: false,
      publishedAt: "2026-04-10T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: null,
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
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
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
    }, repo);

    expect(version.versionNumber).toBe(1);
    expect(repo.state.policyBindings).toHaveLength(1);
    expect(repo.state.rolloutBindings).toHaveLength(1);
    expect(repo.state.registries[0]?.currentStableVersionId).toBe(version.id);
  });

  it("resolves the best eligible version and prefers evidence when allowed", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.default",
      agentKind: "planner",
      title: "Planner",
      description: "Primary planner",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: {},
    }, repo);

    const baseVersion = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 1,
      versionStatus: "published",
      rolloutState: "general",
      isStable: false,
      reviewRequired: false,
      publishedAt: "2026-04-10T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: null,
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
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          sideEffectCeiling: "bounded_write",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
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
    }, repo);

    const candidateVersion = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 2,
      versionStatus: "published",
      rolloutState: "general",
      isStable: false,
      reviewRequired: false,
      publishedAt: "2026-04-11T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: baseVersion.id,
      manifest: {
        registryKey: "planner.default",
        agentKind: "planner",
        title: "Planner v2",
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
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          sideEffectCeiling: "bounded_write",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
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
    }, repo);

    await recordAgentOutcomeMemory({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionId: candidateVersion.id,
      workloadClass: "weekly-planning",
      selectedModelFamily: "gpt-5.4",
      outcome: "success",
      failureMode: null,
      operatorEdits: [],
      improvementNotes: "Better than prior version",
      redactionState: "redacted",
      retentionTier: "standard",
      metadata: {},
    }, repo);

    const resolved = await resolveAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      teamId: "team-1",
      workpackFamily: "planning",
      requestedToolClasses: ["read"],
      requestedActionClasses: [],
      requestedModelFamily: "gpt-5.4",
      workloadClass: "weekly-planning",
      requireApproval: false,
      allowDraftVersions: false,
      allowEvidencePreference: true,
    }, repo);

    expect(resolved.selectedVersionId).toBe(candidateVersion.id);
    expect(resolved.usedEvidencePreference).toBe(true);
  });

  it("fails closed when policy or rollout requirements are missing", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.default",
      agentKind: "planner",
      title: "Planner",
      description: "Primary planner",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: {},
    }, repo);

    await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 1,
      versionStatus: "draft",
      rolloutState: "draft",
      isStable: false,
      reviewRequired: true,
      publishedAt: null,
      frozenAt: null,
      previousVersionId: null,
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
        disallowedActionClasses: ["write"],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          sideEffectCeiling: "bounded_write",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
        modelCompatibility: ["gpt-5.4"],
        evaluationTargets: ["weekly-planning"],
        outcomeMemoryHook: "save_summary",
        metadata: {},
      },
      rolloutBindings: [],
    }, repo);

    const resolved = await resolveAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      teamId: "team-1",
      workpackFamily: "planning",
      requestedToolClasses: ["write"],
      requestedActionClasses: ["write"],
      requestedModelFamily: "gpt-5.4",
      workloadClass: "weekly-planning",
      requireApproval: true,
      allowDraftVersions: false,
      allowEvidencePreference: false,
    }, repo);

    expect(resolved.selectedVersionId).toBeNull();
    expect(resolved.rejectedVersions[0]?.reasons.join(" ")).toContain("draft");
  });

  it("creates promotion reviews and supports freeze / rollback", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.default",
      agentKind: "planner",
      title: "Planner",
      description: "",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: [],
      metadata: {},
    }, repo);

    const version = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 1,
      versionStatus: "published",
      rolloutState: "general",
      isStable: true,
      reviewRequired: false,
      publishedAt: "2026-04-10T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: null,
      manifest: {
        registryKey: "planner.default",
        agentKind: "planner",
        title: "Planner",
        description: "",
        owningTeamId: "team-1",
        owningUserId: 7,
        modelFamilies: [],
        metadata: {},
      },
      policies: {
        purpose: "Plan work",
        supportedWorkDomains: ["operations"],
        supportedToolClasses: ["read"],
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          sideEffectCeiling: "bounded_write",
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
    }, repo);

    const review = await createPromotionReview({
      tenantId: "tenant-1",
      registryId: registry.id,
      proposedVersionId: version.id,
      baselineVersionId: null,
      decision: "promote",
      reason: "Stable",
      createdByUserId: 7,
    }, repo);
    expect(review.decision).toBe("promote");

    const frozen = await freezeAgentVersion({
      tenantId: "tenant-1",
      versionId: version.id,
      reason: "freeze",
    }, repo);
    expect(frozen.versionStatus).toBe("frozen");

    const rolledBack = await rollbackAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionId: version.id,
      reason: "rollback",
    }, repo);
    expect(rolledBack.currentStableVersionId).toBe(version.id);
  });

  it("keeps canary versions tied to their rollout cohort", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.canary",
      agentKind: "planner",
      title: "Planner",
      description: "Canary planner",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: {},
    }, repo);

    const version = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 1,
      versionStatus: "published",
      rolloutState: "canary",
      isStable: false,
      reviewRequired: false,
      publishedAt: "2026-04-11T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: null,
      manifest: {
        registryKey: "planner.canary",
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
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          sideEffectCeiling: "bounded_write",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
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
          canaryPercent: 100,
        },
      ],
    }, repo);

    const resolved = await resolveAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      teamId: "team-1",
      workpackFamily: "planning",
      requestedToolClasses: ["read"],
      requestedActionClasses: [],
      requestedModelFamily: "gpt-5.4",
      workloadClass: "weekly-planning",
      requireApproval: false,
      allowDraftVersions: false,
      allowEvidencePreference: false,
    }, repo);

    expect(resolved.selectedVersionId).toBe(version.id);
    expect(resolved.selectedRolloutState).toBe("canary");
  });

  it("forces review_required when policy scope widens", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.review",
      agentKind: "planner",
      title: "Planner",
      description: "Review planner",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: {},
    }, repo);

    const baseline = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 1,
      versionStatus: "published",
      rolloutState: "general",
      isStable: true,
      reviewRequired: false,
      publishedAt: "2026-04-10T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: null,
      manifest: {
        registryKey: "planner.review",
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
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "team",
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
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
        modelCompatibility: ["gpt-5.4"],
        evaluationTargets: ["weekly-planning"],
        outcomeMemoryHook: "save_summary",
        metadata: {},
      },
      rolloutBindings: [],
    }, repo);

    const widened = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 2,
      versionStatus: "published",
      rolloutState: "general",
      isStable: false,
      reviewRequired: false,
      publishedAt: "2026-04-12T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: baseline.id,
      manifest: {
        registryKey: "planner.review",
        agentKind: "planner",
        title: "Planner v2",
        description: "",
        owningTeamId: "team-1",
        owningUserId: 7,
        modelFamilies: ["gpt-5.4"],
        metadata: {},
      },
      policies: {
        purpose: "Plan work",
        supportedWorkDomains: ["operations", "finance"],
        supportedToolClasses: ["read", "write"],
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          perRunCredits: 20,
          perTenantCredits: 100,
          sideEffectCeiling: "bounded_write",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
        modelCompatibility: ["gpt-5.4"],
        evaluationTargets: ["weekly-planning"],
        outcomeMemoryHook: "save_summary",
        metadata: {},
      },
      rolloutBindings: [],
    }, repo);

    expect(widened.versionStatus).toBe("review_required");
    expect(widened.reviewRequired).toBe(true);
  });

  it("redacts memory payloads before persistence", async () => {
    const registry = await createAgentRegistry({
      tenantId: "tenant-1",
      registryKey: "planner.memory",
      agentKind: "planner",
      title: "Planner",
      description: "Memory planner",
      owningTeamId: "team-1",
      owningUserId: 7,
      modelFamilies: ["gpt-5.4"],
      metadata: {},
    }, repo);

    const version = await publishAgentVersion({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionNumber: 1,
      versionStatus: "published",
      rolloutState: "general",
      isStable: true,
      reviewRequired: false,
      publishedAt: "2026-04-10T00:00:00.000Z",
      frozenAt: null,
      previousVersionId: null,
      manifest: {
        registryKey: "planner.memory",
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
        disallowedActionClasses: [],
        memoryScope: {
          accessScope: "registry",
          visibility: "operator_review",
          retentionTier: "standard",
          redactionState: "redacted",
          legalHold: false,
        },
        budgetPolicy: {
          sideEffectCeiling: "bounded_write",
        },
        escalationPolicy: {
          failClosed: true,
          approvalRequiredFor: [],
          escalationTriggers: [],
          escalationTargets: [],
        },
        approvalRequirements: [],
        modelCompatibility: ["gpt-5.4"],
        evaluationTargets: ["weekly-planning"],
        outcomeMemoryHook: "save_summary",
        metadata: {},
      },
      rolloutBindings: [],
    }, repo);

    await recordAgentOutcomeMemory({
      tenantId: "tenant-1",
      registryId: registry.id,
      versionId: version.id,
      workloadClass: "weekly-planning",
      selectedModelFamily: "gpt-5.4",
      outcome: "failure",
      failureMode: "token leak",
      operatorEdits: ["rotate api_key", "check secret"],
      improvementNotes: "api_key should not be used",
      redactionState: "redacted",
      retentionTier: "standard",
      metadata: { api_key: "abc123", nested: { secret: "shh" } },
    }, repo);

    const memory = repo.state.memories[0];
    expect(memory.failureMode).toBe("[redacted] leak");
    expect(memory.operatorEditsJson[0]).toContain("[redacted]");
    expect(memory.improvementNotes).toContain("[redacted]");
    expect(memory.metadataJson.api_key).toBe("[REDACTED]");
    expect(memory.metadataJson.nested.secret).toBe("[REDACTED]");
  });
});
