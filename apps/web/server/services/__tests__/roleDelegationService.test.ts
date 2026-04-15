import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

const sendRoomMessageMock = vi.fn();

vi.mock("../roomService", () => ({
  sendMessage: (...args: unknown[]) => sendRoomMessageMock(...args),
}));

vi.mock("../workpackPersistence", () => ({
  getWorkpackDetail: vi.fn().mockResolvedValue(null),
}));

import { sendTypedRoleMessage } from "../roleDelegationService";
import { createRoleId, getRoleAgentDetail, resetRoleStore, saveRoleAgent, saveRoleContract } from "../rolePersistence";

async function seedRole(input: {
  tenantId: string;
  name: string;
  roomId?: string | null;
  visibilityMatrix?: Record<string, Array<"owner_full" | "delegated_minimum" | "redacted_summary" | "shared_reference" | "operator_review">>;
}) {
  const roleId = createRoleId("role");
  const contractId = createRoleId("rc");
  await saveRoleAgent({
    id: roleId,
    tenantId: input.tenantId,
    blueprintId: null,
    name: input.name,
    departmentLabel: "Ops",
    lifecycleState: "active",
    healthState: "healthy",
    currentAutonomyTier: "guided",
    activeContractId: contractId,
    bridgeTeamId: null,
    roomId: input.roomId ?? null,
    ownerUserId: 1,
    ownershipContext: {},
    tags: [],
    lastCheckpointAt: null,
    lastRoutineRunId: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  });
  await saveRoleContract({
    id: contractId,
    tenantId: input.tenantId,
    roleId,
    versionNumber: 1,
    status: "active",
    missionStatement: `${input.name} mission`,
    kpiTargets: [],
    authorityEnvelope: {
      autonomyTier: "guided",
      connectorFamilies: ["ops"],
      sideEffectCeiling: "bounded_write",
      monthlyBudgetLimit: 100,
      regulatedActionLabels: [],
      requiresApprovalFor: [],
      visibilityDefaults: ["owner_full", "delegated_minimum", "redacted_summary", "shared_reference", "operator_review"],
    },
    workpackBindingIds: [],
    visibilityMatrix: input.visibilityMatrix ?? {
      role_messages: ["owner_full", "delegated_minimum", "redacted_summary", "shared_reference"],
      room_threads: ["owner_full", "delegated_minimum", "redacted_summary", "shared_reference"],
    },
    notes: "",
    activatedAt: "2026-04-10T00:00:00.000Z",
    supersededByContractId: null,
    createdAt: "2026-04-10T00:00:00.000Z",
  });
  return roleId;
}

describe("roleDelegationService", () => {
  beforeEach(async () => {
    await resetRoleStore();
    sendRoomMessageMock.mockReset();
    sendRoomMessageMock.mockResolvedValue({ id: "room-message-1" });
  });

  it("fails closed when recipient visibility does not allow delegated handoff context", async () => {
    const senderRoleId = await seedRole({ tenantId: "tenant-1", name: "Sender", roomId: "room-1" });
    const recipientRoleId = await seedRole({
      tenantId: "tenant-1",
      name: "Recipient",
      roomId: "room-1",
      visibilityMatrix: {
        role_messages: ["owner_full"],
      },
    });

    await expect(sendTypedRoleMessage({
      tenantId: "tenant-1",
      senderRoleId,
      recipientRoleId,
      intentType: "handoff",
      contentSummary: "Please pick this up",
    })).rejects.toThrow("recipient_visibility_scope_exceeded");

    expect(sendRoomMessageMock).not.toHaveBeenCalled();
  });

  it("redacts shared summaries and mirrors only safe room summaries", async () => {
    const senderRoleId = await seedRole({ tenantId: "tenant-1", name: "Sender", roomId: "room-1" });
    const recipientRoleId = await seedRole({ tenantId: "tenant-1", name: "Recipient", roomId: "room-1" });

    const result = await sendTypedRoleMessage({
      tenantId: "tenant-1",
      senderRoleId,
      recipientRoleId,
      intentType: "status_summary",
      contentSummary: "Operations summary with confidential detail hidden from unrelated viewers.",
      metadata: {
        status: "healthy",
        secretToken: "should-not-travel",
        summary: "clean",
      },
    });

    expect(result.message.visibilityClass).toBe("redacted_summary");
    expect(result.message.metadata).toEqual({
      status: "healthy",
      summary: "clean",
    });
    expect(sendRoomMessageMock).toHaveBeenCalledOnce();
    expect(sendRoomMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      recipientType: "subgroup",
      metadataJson: expect.objectContaining({
        visibilityClass: "redacted_summary",
      }),
    }));
  });

  it("keeps delegated handoffs out of shared room mirrors", async () => {
    const senderRoleId = await seedRole({ tenantId: "tenant-1", name: "Sender", roomId: "room-1" });
    const recipientRoleId = await seedRole({ tenantId: "tenant-1", name: "Recipient", roomId: "room-1" });

    await sendTypedRoleMessage({
      tenantId: "tenant-1",
      senderRoleId,
      recipientRoleId,
      intentType: "handoff",
      contentSummary: "Take over the bounded ops recovery task",
    });

    expect(sendRoomMessageMock).not.toHaveBeenCalled();
    const senderDetail = await getRoleAgentDetail(senderRoleId);
    expect(senderDetail?.handoffs).toHaveLength(1);
  });
});
