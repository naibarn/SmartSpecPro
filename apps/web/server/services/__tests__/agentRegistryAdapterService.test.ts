import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agentRegistryService", () => ({
  createAgentRegistry: vi.fn(),
  getAgentRegistry: vi.fn(),
  listAgentRegistryVersions: vi.fn(),
  publishAgentVersion: vi.fn(),
  resolveAgentVersion: vi.fn(),
}));

import {
  createAgentRegistry,
  getAgentRegistry,
  listAgentRegistryVersions,
  publishAgentVersion,
  resolveAgentVersion,
} from "../agentRegistryService";
import {
  resetRoleStore,
  saveRoleAgent,
  saveRoleBlueprint,
  saveRoleContract,
  getRoleAgent,
} from "../rolePersistence";
import {
  getRoleRegistrySnapshot,
  syncRoleRegistry,
} from "../agentRegistryAdapterService";

describe("agentRegistryAdapterService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetRoleStore();
  });

  it("syncs role metadata into the registry and persists the mapping", async () => {
    const registry = {
      id: "agr_1",
      tenantId: "tenant-1",
      registryKey: "role-agent:role-1",
      agentKind: "role_agent",
      title: "Ops Lead",
    };
    const version = {
      id: "agv_2",
      tenantId: "tenant-1",
      registryId: "agr_1",
      versionNumber: 2,
      versionStatus: "review_required",
      rolloutState: "general",
      previousVersionId: null,
      isStable: false,
      reviewRequired: true,
      publishedAt: null,
      frozenAt: null,
      createdAt: new Date(),
    };

    vi.mocked(createAgentRegistry).mockResolvedValue(registry as any);
    vi.mocked(listAgentRegistryVersions).mockResolvedValue([]);
    vi.mocked(publishAgentVersion).mockResolvedValue(version as any);
    vi.mocked(getAgentRegistry).mockResolvedValue(registry as any);
    vi.mocked(resolveAgentVersion).mockResolvedValue({
      registryId: "agr_1",
      registryKey: "role-agent:role-1",
      selectedVersionId: "agv_2",
      selectedVersionNumber: 2,
      selectedVersionStatus: "review_required",
      selectedRolloutState: "general",
      stableVersionId: "agv_2",
      eligibleVersionIds: ["agv_2"],
      rejectedVersions: [],
      usedEvidencePreference: false,
      reason: "eligible and selected",
    } as any);

    await saveRoleBlueprint({
      id: "bp-1",
      tenantId: "tenant-1",
      key: "role-1",
      title: "Ops Lead",
      departmentLabel: "Operations",
      purpose: "Run operations",
      defaultMission: "Keep things moving",
      kpiCategories: [],
      defaultAuthorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["ops"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full"],
      },
      typicalConnectorFamilies: ["ops"],
      recommendedRoutineStarters: [],
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleAgent({
      id: "role-1",
      tenantId: "tenant-1",
      blueprintId: "bp-1",
      name: "Ops Lead",
      departmentLabel: "Operations",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: "rc-1",
      bridgeTeamId: "team-1",
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
      id: "rc-1",
      tenantId: "tenant-1",
      roleId: "role-1",
      versionNumber: 1,
      status: "active",
      missionStatement: "Keep things moving",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["ops"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 120,
        regulatedActionLabels: ["financial_write"],
        requiresApprovalFor: ["promotion"],
        visibilityDefaults: ["owner_full", "delegated_minimum"],
      },
      workpackBindingIds: [],
      visibilityMatrix: {},
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleContract({
      id: "rc-2",
      tenantId: "tenant-1",
      roleId: "role-1",
      versionNumber: 2,
      status: "pending_review",
      missionStatement: "Keep things moving safely",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["ops"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 140,
        regulatedActionLabels: ["financial_write"],
        requiresApprovalFor: ["promotion", "budget"],
        visibilityDefaults: ["owner_full", "delegated_minimum"],
      },
      workpackBindingIds: [],
      visibilityMatrix: {},
      notes: "",
      activatedAt: null,
      supersededByContractId: "rc-1",
      createdAt: "2026-04-11T00:00:00.000Z",
    });

    const snapshot = await syncRoleRegistry("tenant-1", "role-1");

    expect(createAgentRegistry).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      registryKey: "role-agent:role-1",
      agentKind: "role_agent",
    }));
    expect(publishAgentVersion).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      registryId: "agr_1",
      versionNumber: 2,
      versionStatus: "review_required",
    }));
    expect(snapshot?.reference?.registryId).toBe("agr_1");
    expect(snapshot?.version?.id).toBe("agv_2");

    const role = await getRoleAgent("role-1");
    expect(role?.ownershipContext).toHaveProperty("agentRegistry.registryId", "agr_1");
  });

  it("reads an existing registry snapshot without mutating state", async () => {
    vi.mocked(getAgentRegistry).mockResolvedValue({
      id: "agr_2",
      tenantId: "tenant-1",
      registryKey: "role-agent:role-2",
      agentKind: "role_agent",
      title: "Planner",
    } as any);
    vi.mocked(listAgentRegistryVersions).mockResolvedValue([
      {
        id: "agv_2",
        tenantId: "tenant-1",
        registryId: "agr_2",
        versionNumber: 1,
        versionStatus: "published",
        rolloutState: "general",
        previousVersionId: null,
        isStable: true,
        reviewRequired: false,
        publishedAt: null,
        frozenAt: null,
        createdAt: new Date(),
      } as any,
    ]);
    vi.mocked(resolveAgentVersion).mockResolvedValue({
      registryId: "agr_2",
      registryKey: "role-agent:role-2",
      selectedVersionId: "agv_2",
      selectedVersionNumber: 1,
      selectedVersionStatus: "published",
      selectedRolloutState: "general",
      stableVersionId: "agv_2",
      eligibleVersionIds: ["agv_2"],
      rejectedVersions: [],
      usedEvidencePreference: false,
      reason: "eligible and selected",
    } as any);

    await saveRoleAgent({
      id: "role-2",
      tenantId: "tenant-1",
      blueprintId: null,
      name: "Planner",
      departmentLabel: "Planning",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: null,
      bridgeTeamId: null,
      roomId: null,
      ownerUserId: 7,
      ownershipContext: {
        agentRegistry: {
          registryId: "agr_2",
          registryKey: "role-agent:role-2",
          versionId: "agv_2",
          versionNumber: 1,
          syncedAt: "2026-04-10T00:00:00.000Z",
        },
      },
      tags: [],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    const snapshot = await getRoleRegistrySnapshot("tenant-1", "role-2");

    expect(snapshot?.registry?.id).toBe("agr_2");
    expect(snapshot?.version?.id).toBe("agv_2");
    expect(snapshot?.resolution?.selectedVersionId).toBe("agv_2");
  });
});
