import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agentRegistryAdapterService", () => ({
  syncRoleRegistry: vi.fn().mockResolvedValue(null),
}));

import { syncRoleRegistry } from "../agentRegistryAdapterService";
import { resetRoleStore } from "../rolePersistence";
import { createRoleAgentFromBlueprint, updateRoleMission, upsertRoleRoutineDefinition, upsertRoleWorkpackBinding } from "../roleConfigurationService";

describe("roleConfigurationService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetRoleStore();
  });

  it("syncs the agent registry when creating a role", async () => {
    const result = await createRoleAgentFromBlueprint({
      tenantId: "tenant-1",
      key: "role-1",
      title: "Ops Lead",
      departmentLabel: "Operations",
      purpose: "Run operations",
      defaultMission: "Keep things moving",
      ownerUserId: 7,
      bridgeTeamId: "team-1",
    });

    expect(result.role.id).toBeTruthy();
    expect(syncRoleRegistry).toHaveBeenCalledWith("tenant-1", result.role.id);
  });

  it("syncs the agent registry again when mission changes create a new contract version", async () => {
    const created = await createRoleAgentFromBlueprint({
      tenantId: "tenant-1",
      key: "role-1",
      title: "Ops Lead",
      departmentLabel: "Operations",
      purpose: "Run operations",
      defaultMission: "Keep things moving",
      ownerUserId: 7,
      bridgeTeamId: "team-1",
    });

    vi.mocked(syncRoleRegistry).mockClear();

    const nextContract = await updateRoleMission({
      tenantId: "tenant-1",
      roleId: created.role.id,
      missionStatement: "Keep things moving safely",
      autonomyTier: "supervised",
      monthlyBudgetLimit: 250,
    });

    expect(nextContract.versionNumber).toBe(2);
    expect(nextContract.status).toBe("pending_review");
    expect(syncRoleRegistry).toHaveBeenCalledWith("tenant-1", created.role.id);
  });

  it("syncs the agent registry when workpack bindings and routines change", async () => {
    const created = await createRoleAgentFromBlueprint({
      tenantId: "tenant-1",
      key: "role-1",
      title: "Ops Lead",
      departmentLabel: "Operations",
      purpose: "Run operations",
      defaultMission: "Keep things moving",
      ownerUserId: 7,
      bridgeTeamId: "team-1",
    });

    vi.mocked(syncRoleRegistry).mockClear();

    const binding = await upsertRoleWorkpackBinding({
      tenantId: "tenant-1",
      roleId: created.role.id,
      contractId: created.contract.id,
      label: "Ops binding",
      workpackFamily: "planning",
      resolutionPolicy: "follow_latest_ready_in_family",
    });
    expect(syncRoleRegistry).toHaveBeenCalledWith("tenant-1", created.role.id);

    vi.mocked(syncRoleRegistry).mockClear();

    await upsertRoleRoutineDefinition({
      tenantId: "tenant-1",
      roleId: created.role.id,
      contractId: created.contract.id,
      title: "Daily planning",
      workpackBindingIds: [binding.id],
      autonomyTier: "supervised",
      triggerType: "schedule",
      intervalMinutes: 60,
      concurrencyPolicy: "singleton",
      slaMinutes: 30,
    });
    expect(syncRoleRegistry).toHaveBeenCalledWith("tenant-1", created.role.id);
  });
});
