import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

const applyRoleIncidentActionMock = vi.fn();

vi.mock("../roleIncidentControlService", () => ({
  applyRoleIncidentAction: (...args: unknown[]) => applyRoleIncidentActionMock(...args),
}));

import { pauseRole, pauseRoutine, resumeRoutine } from "../roleCommandService";
import { createRoleId, getRoleAgent, getRoleRoutine, resetRoleStore, saveRoleAgent, saveRoleContract, saveRoleRoutine } from "../rolePersistence";

describe("roleCommandService", () => {
  beforeEach(async () => {
    await resetRoleStore();
    applyRoleIncidentActionMock.mockReset();
    applyRoleIncidentActionMock.mockResolvedValue({ ok: true });
  });

  it("fails closed before mutating when pauseRole crosses tenant boundaries", async () => {
    const roleId = createRoleId("role");
    const contractId = createRoleId("rc");
    await saveRoleAgent({
      id: roleId,
      tenantId: "tenant-a",
      blueprintId: null,
      name: "Finance role",
      departmentLabel: "Finance",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: contractId,
      bridgeTeamId: null,
      roomId: null,
      ownerUserId: 7,
      ownershipContext: {},
      tags: [],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleContract({
      id: contractId,
      tenantId: "tenant-a",
      roleId,
      versionNumber: 1,
      status: "active",
      missionStatement: "Handle finance routines",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["finance"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full", "delegated_minimum", "redacted_summary"],
      },
      workpackBindingIds: [],
      visibilityMatrix: {},
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    await expect(pauseRole({
      tenantId: "tenant-b",
      roleId,
      reason: "cross-tenant",
      operatorUserId: 99,
    })).rejects.toThrow(`Unknown role for tenant: ${roleId}`);

    expect((await getRoleAgent(roleId))?.lifecycleState).toBe("active");
    expect(applyRoleIncidentActionMock).not.toHaveBeenCalled();
  });

  it("guards routine mutations by tenant and role ownership", async () => {
    const roleId = createRoleId("role");
    const routineId = createRoleId("routine");
    const contractId = createRoleId("rc");

    await saveRoleAgent({
      id: roleId,
      tenantId: "tenant-a",
      blueprintId: null,
      name: "Ops role",
      departmentLabel: "Ops",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: contractId,
      bridgeTeamId: null,
      roomId: null,
      ownerUserId: 7,
      ownershipContext: {},
      tags: [],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleContract({
      id: contractId,
      tenantId: "tenant-a",
      roleId,
      versionNumber: 1,
      status: "active",
      missionStatement: "Handle ops routines",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["ops"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full", "delegated_minimum", "redacted_summary"],
      },
      workpackBindingIds: [],
      visibilityMatrix: {},
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleRoutine({
      id: routineId,
      tenantId: "tenant-a",
      roleId,
      contractId,
      title: "Daily ops",
      description: "",
      status: "active",
      autonomyTier: "guided",
      workpackBindingIds: ["bind_1"],
      schedule: {
        triggerType: "schedule",
        intervalMinutes: 60,
      },
      concurrencyPolicy: "singleton",
      slaMinutes: 60,
      partitionKeyField: null,
      nextWakeAt: null,
      lastWakeAt: null,
      rollbackBaselineVersionId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    await expect(pauseRoutine({
      tenantId: "tenant-b",
      roleId,
      routineId,
      reason: "cross-tenant",
      operatorUserId: 9,
    })).rejects.toThrow(`Unknown routine for tenant: ${routineId}`);

    expect((await getRoleRoutine(routineId))?.status).toBe("active");

    await resumeRoutine({
      tenantId: "tenant-a",
      roleId,
      routineId,
      reason: "safe again",
      operatorUserId: 9,
    });

    expect((await getRoleRoutine(routineId))?.status).toBe("active");
    expect(applyRoleIncidentActionMock).toHaveBeenLastCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      routineId,
      action: "resume",
      operatorUserId: 9,
    }));
  });
});
