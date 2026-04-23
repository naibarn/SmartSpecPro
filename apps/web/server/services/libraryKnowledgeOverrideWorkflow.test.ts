import { describe, expect, it } from "vitest";

import {
  approveLibraryKnowledgeReleaseGateOverride,
  createLibraryKnowledgeReleaseGateOverride,
  listLibraryKnowledgeReleaseGateOverrides,
  rejectLibraryKnowledgeReleaseGateOverride,
  requestLibraryKnowledgeReleaseGateOverride,
} from "./libraryKnowledgeObservabilityService";

type OverrideRow = {
  id: number;
  actorUserId: number | null;
  approvedByUserId: number | null;
  reason: string;
  scopeType: "tenant" | "global";
  scopeId: string | null;
  status: string;
  overrideMode: "standard" | "break_glass";
  metadata: Record<string, unknown>;
  approvedAt: Date | null;
  approvalReason: string | null;
  rejectedAt: Date | null;
  rejectedByUserId: number | null;
  rejectedReason: string | null;
  createdAt: Date;
  expiresAt: Date;
};

function makePendingOverrideRow(
  overrides: Partial<OverrideRow> = {},
): OverrideRow {
  return {
    id: overrides.id ?? 1,
    actorUserId: overrides.actorUserId ?? 7,
    approvedByUserId: overrides.approvedByUserId ?? null,
    reason: overrides.reason ?? "controlled readiness canary",
    scopeType: overrides.scopeType ?? "tenant",
    scopeId: overrides.scopeId ?? "tenant-1",
    status: overrides.status ?? "pending_approval",
    overrideMode: overrides.overrideMode ?? "standard",
    metadata: overrides.metadata ?? {},
    approvedAt: overrides.approvedAt ?? null,
    approvalReason: overrides.approvalReason ?? null,
    rejectedAt: overrides.rejectedAt ?? null,
    rejectedByUserId: overrides.rejectedByUserId ?? null,
    rejectedReason: overrides.rejectedReason ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-04-22T00:00:00.000Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-04-22T08:00:00.000Z"),
  };
}

function makeApprovalDb(existingRow: OverrideRow) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [existingRow],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{
            ...existingRow,
            ...values,
          }],
        }),
      }),
    }),
  };
}

function makeListDb(rows: OverrideRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => rows,
          }),
        }),
      }),
    }),
  };
}

describe("library release-gate override workflow", () => {
  it("requires incident metadata for break-glass requests", async () => {
    await expect(
      requestLibraryKnowledgeReleaseGateOverride({
        tenantId: "tenant-1",
        actorUserId: 7,
        reason: "urgent production investigation",
        mode: "break_glass",
        expiresAt: "2026-04-22T03:00:00.000Z",
        now: new Date("2026-04-22T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/incidentRef/);
  });

  it("does not allow the requester to self-approve an active override", async () => {
    await expect(
      createLibraryKnowledgeReleaseGateOverride({
        tenantId: "tenant-1",
        actorUserId: 7,
        approvedByUserId: 7,
        reason: "controlled readiness canary",
        expiresAt: "2026-04-22T08:00:00.000Z",
        now: new Date("2026-04-22T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/second approving admin/);
  });

  it("requires a second admin to approve a pending request", async () => {
    const row = makePendingOverrideRow();
    const db = makeApprovalDb(row);

    await expect(
      approveLibraryKnowledgeReleaseGateOverride({
        overrideId: row.id,
        approvedByUserId: row.actorUserId ?? 7,
        reason: "looks safe",
        dbClient: db as never,
        now: new Date("2026-04-22T01:00:00.000Z"),
      }),
    ).rejects.toThrow(/second approving admin/);
  });

  it("transitions a pending request to active after independent approval", async () => {
    const row = makePendingOverrideRow({
      overrideMode: "break_glass",
      metadata: {
        incidentRef: "INC-2048",
      },
    });
    const db = makeApprovalDb(row);

    const override = await approveLibraryKnowledgeReleaseGateOverride({
      overrideId: row.id,
      approvedByUserId: 19,
      reason: "incident commander approved",
      dbClient: db as never,
      now: new Date("2026-04-22T01:00:00.000Z"),
    });

    expect(override.status).toBe("active");
    expect(override.mode).toBe("break_glass");
    expect(override.approvedByUserId).toBe(19);
    expect(override.approvalReason).toBe("incident commander approved");
    expect(override.approvedAt).toBe("2026-04-22T01:00:00.000Z");
  });

  it("transitions a pending request to rejected after independent review", async () => {
    const row = makePendingOverrideRow();
    const db = makeApprovalDb(row);

    const override = await rejectLibraryKnowledgeReleaseGateOverride({
      overrideId: row.id,
      rejectedByUserId: 19,
      reason: "insufficient incident evidence",
      dbClient: db as never,
      now: new Date("2026-04-22T01:00:00.000Z"),
    });

    expect(override.status).toBe("rejected");
    expect(override.rejectedByUserId).toBe(19);
    expect(override.rejectedReason).toBe("insufficient incident evidence");
  });

  it("derives expired status when listing old pending or active requests", async () => {
    const db = makeListDb([
      makePendingOverrideRow({
        id: 1,
        status: "pending_approval",
        expiresAt: new Date("2026-04-22T01:00:00.000Z"),
      }),
      makePendingOverrideRow({
        id: 2,
        status: "active",
        approvedByUserId: 19,
        approvedAt: new Date("2026-04-22T00:10:00.000Z"),
        expiresAt: new Date("2026-04-22T01:00:00.000Z"),
      }),
    ]);

    const overrides = await listLibraryKnowledgeReleaseGateOverrides({
      tenantId: "tenant-1",
      status: "expired",
      dbClient: db as never,
      now: new Date("2026-04-22T02:00:00.000Z"),
    });

    expect(overrides).toHaveLength(2);
    expect(overrides.every((override) => override.status === "expired")).toBe(true);
  });
});
