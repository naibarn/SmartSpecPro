import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "01234567890123456789012345678901";
});

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { appRouter } from "../../routers";
import { resetRoleStore, saveRoleAgent, saveRoleContract, saveRoleMessage } from "../../services/rolePersistence";

function createContext(tenantId: string) {
  return {
    user: {
      id: 42,
      openId: "user-42",
      email: "user@example.com",
      name: "Role Admin",
      loginMethod: "email",
      role: "admin",
      currentTenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      ip: "127.0.0.1",
      protocol: "https",
      headers: {},
    },
    res: {
      clearCookie: vi.fn(),
    },
    userToken: null,
    tenantId,
    publicUrl: "https://tenant.example.com",
  } as any;
}

describe("role monitor and typed room routes", () => {
  beforeEach(async () => {
    await resetRoleStore();

    await saveRoleAgent({
      id: "role_a",
      tenantId: "tenant-a",
      blueprintId: null,
      name: "Tenant A role",
      departmentLabel: "Ops",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: "rc_a",
      bridgeTeamId: null,
      roomId: "room_a",
      ownerUserId: 7,
      ownershipContext: {},
      tags: [],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });
    await saveRoleContract({
      id: "rc_a",
      tenantId: "tenant-a",
      roleId: "role_a",
      versionNumber: 1,
      status: "active",
      missionStatement: "Tenant A mission",
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
    await saveRoleMessage({
      id: "msg_a",
      tenantId: "tenant-a",
      roomId: "room_a",
      senderRoleId: "role_a",
      recipientRoleId: null,
      recipientGroup: null,
      relatedRoutineId: null,
      relatedRoutineRunId: null,
      relatedWorkpackFamily: null,
      relatedWorkpackRunId: null,
      intentType: "status_summary",
      priority: "normal",
      dueState: "none",
      actionabilityState: "informational",
      provenance: {
        source: "role_monitor",
        actorId: "role_a",
        actorType: "role",
        traceId: "trace_a",
      },
      visibilityClass: "redacted_summary",
      contentSummary: "Tenant A message",
      metadata: {},
      createdAt: "2026-04-10T00:00:00.000Z",
      acknowledgedAt: null,
    });
  });

  it("fails closed when another tenant tries to mutate a role mission", async () => {
    const caller = appRouter.createCaller(createContext("tenant-b"));

    await expect(caller.roleMonitor.updateMission({
      roleId: "role_a",
      missionStatement: "Cross-tenant update",
    })).rejects.toThrow("Unknown role or active contract missing");
  });

  it("fails closed when another tenant tries to read typed role messages", async () => {
    const caller = appRouter.createCaller(createContext("tenant-b"));

    await expect(caller.teamRoom.getRoleMessages({
      roleId: "role_a",
    })).rejects.toThrow("Role belongs to another tenant");
  });
});
