import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import {
  createRoleId,
  getLatestRoleCheckpoint,
  getRoleAgentDetail,
  resetRoleStore,
  saveRoleAgent,
  saveRoleBlueprint,
  saveRoleCheckpoint,
  saveRoleContract,
  saveRoleRoutine,
  saveRoleRoutineRun,
  saveRoleWorkpackBinding,
  updateRoleContract,
} from "../rolePersistence";

describe("rolePersistence", () => {
  beforeEach(async () => {
    await resetRoleStore();
  });

  it("round-trips role detail records with bindings, routines, runs, and checkpoints", async () => {
    const tenantId = "tenant-1";
    const roleId = createRoleId("role");
    const contractId = createRoleId("rc");
    const routineId = createRoleId("rrt");
    const runId = createRoleId("rrun");
    const checkpointId = createRoleId("chk");

    const blueprint = await saveRoleBlueprint({
      id: createRoleId("rbp"),
      tenantId,
      key: "hr_ops",
      title: "HR Ops",
      departmentLabel: "People",
      purpose: "Run recurring people operations tasks",
      defaultMission: "Keep daily people ops moving safely",
      kpiCategories: ["sla"],
      defaultAuthorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["hris"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full"],
      },
      typicalConnectorFamilies: ["hris"],
      recommendedRoutineStarters: [],
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    const role = await saveRoleAgent({
      id: roleId,
      tenantId,
      blueprintId: blueprint.id,
      name: "Virtual HR",
      departmentLabel: "People",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: contractId,
      bridgeTeamId: "team_1",
      roomId: "room_1",
      ownerUserId: 7,
      ownershipContext: { bridge: "legacy_team" },
      tags: [],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    await saveRoleContract({
      id: contractId,
      tenantId,
      roleId,
      versionNumber: 1,
      status: "active",
      missionStatement: "Handle onboarding preparation every morning",
      kpiTargets: [],
      authorityEnvelope: blueprint.defaultAuthorityEnvelope,
      workpackBindingIds: ["bind_1"],
      visibilityMatrix: {},
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    await saveRoleWorkpackBinding({
      id: "bind_1",
      tenantId,
      roleId,
      contractId,
      label: "Onboarding binding",
      workpackFamily: "wp_onboarding",
      benchmarkTrack: null,
      pinnedVersionId: null,
      resolutionPolicy: "follow_latest_ready_in_family",
      rollbackBaselineVersionId: "wpv_base",
      connectorCeilingFamilies: ["hris"],
      sideEffectCeiling: "bounded_write",
      budgetCeiling: 10,
      regulatedBoundaryLabel: null,
      active: true,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    await saveRoleRoutine({
      id: routineId,
      tenantId,
      roleId,
      contractId,
      title: "Morning onboarding prep",
      description: "",
      status: "active",
      autonomyTier: "guided",
      workpackBindingIds: ["bind_1"],
      schedule: {
        triggerType: "schedule",
        intervalMinutes: 1440,
      },
      concurrencyPolicy: "singleton",
      slaMinutes: 90,
      partitionKeyField: null,
      nextWakeAt: "2026-04-11T00:00:00.000Z",
      lastWakeAt: null,
      rollbackBaselineVersionId: "wpv_base",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    await saveRoleRoutineRun({
      id: runId,
      tenantId,
      roleId,
      routineId,
      contractId,
      status: "queued",
      triggerSource: "schedule",
      idempotencyKey: "tenant-1:run-1",
      selectedWorkpackFamily: "wp_onboarding",
      resolvedWorkpackVersionId: "wpv_1",
      linkedWorkpackRunIds: ["wpr_1"],
      checkpointId,
      recoveryState: "fresh",
      resolutionPolicy: "follow_latest_ready_in_family",
      previousResolvedVersionId: null,
      rollbackBaselineVersionId: "wpv_base",
      partitionKey: null,
      blockerCodes: [],
      currentObjectiveSummary: "Prepare onboarding packets",
      approvalRequestIds: [],
      startedAt: "2026-04-11T00:00:00.000Z",
      endedAt: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });

    await saveRoleCheckpoint({
      id: checkpointId,
      tenantId,
      roleId,
      routineId,
      routineRunId: runId,
      recoveryState: "fresh",
      objectiveSummary: "Dispatch onboarding prep",
      activeQueueSummary: ["1 wake queued"],
      recentDecisions: [],
      pendingApprovalIds: [],
      nextWakeConditions: [],
      progressCursor: { authToken: "redact-me" },
      healthState: "healthy",
      lastSuccessfulOutcomeSummary: null,
      memorySummaryIds: [],
      governance: {
        trustClass: "internal",
        retentionTier: "standard",
        redactionState: "redacted",
        visibilityClass: "owner_full",
        legalHold: false,
        expiresAt: null,
      },
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });

    const detail = await getRoleAgentDetail(role.id);
    expect(detail).not.toBeNull();
    expect(detail?.bindings).toHaveLength(1);
    expect(detail?.routines).toHaveLength(1);
    expect(detail?.routineRuns[0]?.linkedWorkpackRunIds).toContain("wpr_1");
    expect(detail?.checkpoints[0]?.progressCursor).toEqual({ authToken: "[REDACTED]" });
    expect((await getLatestRoleCheckpoint(role.id))?.id).toBe(checkpointId);
  });

  it("enforces tenant scoping through role detail lookups", async () => {
    await saveRoleAgent({
      id: "role_a",
      tenantId: "tenant-a",
      blueprintId: null,
      name: "Tenant A Role",
      departmentLabel: "Ops",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: null,
      bridgeTeamId: null,
      roomId: null,
      ownerUserId: null,
      ownershipContext: {},
      tags: [],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    const detail = await getRoleAgentDetail("role_a");
    expect(detail?.role.tenantId).toBe("tenant-a");
    expect(await getRoleAgentDetail("missing")).toBeNull();
  });

  it("rejects in-place mutation of active contract authority envelope", async () => {
    const saved = await saveRoleContract({
      id: "rc_1",
      tenantId: "tenant-1",
      roleId: "role_1",
      versionNumber: 1,
      status: "active",
      missionStatement: "Stable mission",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["crm"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full"],
      },
      workpackBindingIds: [],
      visibilityMatrix: {},
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    await expect(updateRoleContract(saved.id, (current) => ({
      ...current,
      authorityEnvelope: {
        ...current.authorityEnvelope,
        connectorFamilies: ["crm", "erp"],
      },
    }))).rejects.toThrow(/new version/i);
  });
});

