import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../workpackReadinessService", () => ({
  getWorkpackReadinessSummary: vi.fn().mockResolvedValue({
    gateResult: "ready",
    reasonCode: "ready",
  }),
}));

vi.mock("../workpackRolloutGateService", () => ({
  evaluateWorkpackRolloutGate: vi.fn().mockResolvedValue({
    gateResult: "ready",
    blockers: [],
    reasonCode: "ready",
    rolloutPhase: "supervised",
  }),
}));

import { resolveRoleRoutineRunWorkpackTarget } from "../roleWorkpackResolutionService";
import { resetRoleStore, saveRoleAgent, saveRoleContract, saveRoleRoutine, saveRoleRoutineRun, saveRoleWorkpackBinding } from "../rolePersistence";
import { resetWorkpackStore, saveBenchmarkPack, saveWorkpack, saveWorkpackVersion } from "../workpackPersistence";

describe("roleWorkpackResolutionService", () => {
  beforeEach(async () => {
    await resetRoleStore();
    await resetWorkpackStore();
  });

  async function seedWorkpack() {
    const buildPlaybook = (versionId: string, createdAt: string, summary: string) => ({
      id: `playbook_${versionId}`,
      tenantId: "tenant-1",
      title: `Alpha playbook ${versionId}`,
      goal: "Route work safely",
      description: summary,
      domainPack: "support_ops" as const,
      sourceIds: [],
      extractedFields: [],
      clarificationQueue: [],
      localFileIntelligence: {
        available: false,
        parserStatus: "unknown" as const,
        capabilities: [],
        notes: [],
      },
      steps: [
        {
          id: `step_${versionId}`,
          title: "Read queue",
          objective: "Review the active queue",
          expectedOutcome: "Queue is ready for routing",
          preferredRuntimePath: "workflow" as const,
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only" as const,
          requiresReplay: true,
          requiresApproval: false,
          localityHint: "none" as const,
          idempotency: {
            mode: "effect_journal" as const,
            effectKey: `effect_${versionId}`,
            retryDisposition: "safe_retry" as const,
            replayMode: "inspection_only" as const,
          },
          metadata: {},
        },
      ],
      createdAt,
    });

    const buildExecutionPlan = (versionId: string, generatedAt: string) => ({
      workpackId: "wp_alpha",
      versionId,
      generatedAt,
      routeReason: "workflow planner route",
      fixtureRequirements: {
        requiresFixtures: false,
        requiresMaskedInputs: false,
      },
      evidenceRequirements: {
        requiredTraceDetail: "standard" as const,
        promotionNeedsReplay: true,
      },
      steps: [
        {
          id: `step_${versionId}`,
          title: "Read queue",
          objective: "Review the active queue",
          expectedOutcome: "Queue is ready for routing",
          preferredRuntimePath: "workflow" as const,
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only" as const,
          requiresReplay: true,
          requiresApproval: false,
          localityHint: "none" as const,
          idempotency: {
            mode: "effect_journal" as const,
            effectKey: `effect_${versionId}`,
            retryDisposition: "safe_retry" as const,
            replayMode: "inspection_only" as const,
          },
          metadata: {},
        },
      ],
    });

    await saveWorkpackVersion({
      id: "wpv_1",
      workpackId: "wp_alpha",
      versionNumber: 1,
      playbook: buildPlaybook("wpv_1", "2026-04-10T00:00:00.000Z", "First version"),
      executionPlan: buildExecutionPlan("wpv_1", "2026-04-10T00:00:00.000Z"),
      connectorMaps: [],
      connectorIntrospections: [],
      fixtureCatalog: [],
      compilerMetadata: {},
      publishedAt: "2026-04-10T00:00:00.000Z",
      createdAt: "2026-04-10T00:00:00.000Z",
    });
    await saveWorkpackVersion({
      id: "wpv_2",
      workpackId: "wp_alpha",
      versionNumber: 2,
      playbook: buildPlaybook("wpv_2", "2026-04-11T00:00:00.000Z", "Second version"),
      executionPlan: buildExecutionPlan("wpv_2", "2026-04-11T00:00:00.000Z"),
      connectorMaps: [],
      connectorIntrospections: [],
      fixtureCatalog: [],
      compilerMetadata: {},
      publishedAt: "2026-04-11T00:00:00.000Z",
      createdAt: "2026-04-11T00:00:00.000Z",
    });
    await saveWorkpack({
      id: "wp_alpha",
      tenantId: "tenant-1",
      title: "Alpha pack",
      description: "",
      goal: "Route work safely",
      domainPack: "support_ops",
      lifecycleState: "needs_review",
      autonomyMode: "supervised",
      promotionState: "unpromoted",
      currentVersionId: "wpv_2",
      caseSourceIds: [],
      policyProfile: {},
      runtimePreferenceHints: ["workflow"],
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });
  }

  async function seedRole(bindingPolicy: "follow_benchmark_track" | "follow_latest_ready_in_family", resolvedWorkpackVersionId: string | null = null) {
    await saveRoleAgent({
      id: "role_1",
      tenantId: "tenant-1",
      blueprintId: null,
      name: "Ops role",
      departmentLabel: "Ops",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: "rc_1",
      bridgeTeamId: null,
      roomId: null,
      ownerUserId: 1,
      ownershipContext: {},
      tags: [],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleContract({
      id: "rc_1",
      tenantId: "tenant-1",
      roleId: "role_1",
      versionNumber: 1,
      status: "active",
      missionStatement: "Run ops work",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: [],
        sideEffectCeiling: "read_only",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full", "delegated_minimum", "redacted_summary"],
      },
      workpackBindingIds: ["bind_1"],
      visibilityMatrix: {},
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleWorkpackBinding({
      id: "bind_1",
      tenantId: "tenant-1",
      roleId: "role_1",
      contractId: "rc_1",
      label: "Ops binding",
      workpackFamily: "wp_alpha",
      benchmarkTrack: null,
      pinnedVersionId: null,
      resolutionPolicy: bindingPolicy,
      rollbackBaselineVersionId: "wpv_1",
      connectorCeilingFamilies: [],
      sideEffectCeiling: "read_only",
      budgetCeiling: 10,
      regulatedBoundaryLabel: null,
      active: true,
      createdAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleRoutine({
      id: "routine_1",
      tenantId: "tenant-1",
      roleId: "role_1",
      contractId: "rc_1",
      title: "Ops sweep",
      description: "",
      status: "active",
      autonomyTier: "guided",
      workpackBindingIds: ["bind_1"],
      schedule: {
        triggerType: "manual",
      },
      concurrencyPolicy: "singleton",
      slaMinutes: 60,
      partitionKeyField: null,
      nextWakeAt: null,
      lastWakeAt: null,
      rollbackBaselineVersionId: "wpv_1",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleRoutineRun({
      id: "rrun_1",
      tenantId: "tenant-1",
      roleId: "role_1",
      routineId: "routine_1",
      contractId: "rc_1",
      status: "queued",
      triggerSource: "manual",
      idempotencyKey: "tenant-1:rrun_1",
      selectedWorkpackFamily: "wp_alpha",
      resolvedWorkpackVersionId,
      linkedWorkpackRunIds: [],
      checkpointId: null,
      recoveryState: "fresh",
      resolutionPolicy: bindingPolicy,
      previousResolvedVersionId: null,
      rollbackBaselineVersionId: "wpv_1",
      partitionKey: null,
      blockerCodes: [],
      currentObjectiveSummary: "Run ops sweep",
      approvalRequestIds: [],
      startedAt: "2026-04-10T00:00:00.000Z",
      endedAt: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
  }

  it("prefers the latest published benchmark version for benchmark-track bindings", async () => {
    await seedWorkpack();
    await saveBenchmarkPack({
      id: "bench_1",
      sourceWorkpackId: "wp_alpha",
      sourceVersionId: "wpv_1",
      title: "Alpha benchmark",
      clonedFromBenchmarkId: null,
      lineage: [],
      fixtureIds: [],
      evaluationRules: [],
      trustTags: ["verified"],
      publicationScope: "tenant_local",
      publicationStatus: "published",
      fixturesDeidentified: true,
      outputsDeidentified: true,
      publishedAt: "2026-04-12T00:00:00.000Z",
    });
    await seedRole("follow_benchmark_track");

    const resolved = await resolveRoleRoutineRunWorkpackTarget("rrun_1");

    expect(resolved.versionId).toBe("wpv_1");
    expect(resolved.resolutionPolicy).toBe("follow_benchmark_track");
  });

  it("fails closed when a resolved run would silently switch versions mid-cycle", async () => {
    await seedWorkpack();
    await seedRole("follow_latest_ready_in_family", "wpv_1");

    await expect(resolveRoleRoutineRunWorkpackTarget("rrun_1")).rejects.toThrow("requires a new cycle boundary");
  });
});
