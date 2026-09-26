import { describe, expect, it } from "vitest";

import {
  evaluateSpec224Authorization,
  type Spec224AuthorizationInput,
} from "../spec224AuthorizationBinding";

const baseInput = (): Spec224AuthorizationInput => ({
  now: new Date("2026-09-23T10:00:00.000Z"),
  run: {
    runId: "run-224",
    tenantId: "tenant-a",
    actorId: 11,
    workerJobId: "job-224",
    attemptId: "attempt-1",
    workspaceId: "workspace-a",
    provider: "codex",
    deadline: "2026-09-23T11:00:00.000Z",
  },
  runner: {
    runnerId: "runner-a",
    tenantId: "tenant-a",
    ownerUserId: 11,
    trustState: "trusted",
    status: "online",
    activeSessionId: "session-a",
    snapshot: {
      runnerId: "runner-a",
      tenantId: "tenant-a",
      runnerSessionId: "session-a",
      capabilitySnapshotId: "snapshot-a",
      revision: "7",
      observedAt: "2026-09-23T09:59:00.000Z",
      expiresAt: "2026-09-23T10:30:00.000Z",
      capabilities: ["agent.external_task"],
      workspaceIds: ["workspace-a"],
      resourceClass: "medium",
      toolInventory: [
        {
          toolId: "codex",
          kind: "agent_cli",
          displayName: "Codex",
          version: "0.144.1",
          adapterId: "codex.v1",
          adapterVersion: "0.1.0",
          discoverySource: "runner_probe",
          installState: "installed",
          configurationState: "configured",
          authState: "authenticated",
          healthState: "healthy",
          availabilityState: "available",
          trustState: "trusted",
          fingerprint: "codex-fingerprint",
          authorizationEvidenceRef: "runner-auth:sha256:grant-a",
          observedAt: "2026-09-23T09:59:00.000Z",
          expiresAt: "2026-09-23T10:30:00.000Z",
          reasonCodes: [],
        },
      ],
    },
  },
  approval: {
    approvalRef: "approval-a",
    tenantId: "tenant-a",
    executionId: "job-224",
    requesterId: 11,
    status: "approved",
    currentApprovals: 1,
    requiredApprovers: 1,
    expiresAt: "2026-09-23T10:30:00.000Z",
    payload: {
      runId: "run-224",
      provider: "codex",
      workspaceId: "workspace-a",
      authorizationGrantRef: "runner-auth:sha256:grant-a",
    },
  },
  budget: {
    budgetReservationRef: "hold-a",
    tenantId: "tenant-a",
    workerJobId: "job-224",
    attemptId: "attempt-1",
    status: "held",
    amountMinorUnits: 500,
    currency: "USD",
    expiresAt: "2026-09-23T10:30:00.000Z",
  },
});

describe("Spec 224 owner authorization binding", () => {
  it("returns READY only when Runner, approval and durable budget evidence agree", () => {
    const result = evaluateSpec224Authorization(baseInput());

    expect(result.status).toBe("READY_FOR_LIVE");
    expect(result.binding).toEqual({
      runnerId: "runner-a",
      runnerSessionId: "session-a",
      capabilitySnapshotId: "snapshot-a",
      capabilitySnapshotRevision: "7",
      authorizationGrantRef: "runner-auth:sha256:grant-a",
      approvalRef: "approval-a",
      budgetReservationRef: "hold-a",
      spendCeilingMicros: 500,
      workspaceRef: "workspace-a",
      deadline: "2026-09-23T11:00:00.000Z",
    });
  });

  it.each([
    ["missing runner", { runner: null }, "RUNNER_BINDING_REQUIRED"],
    [
      "missing provider authentication",
      { runner: { ...baseInput().runner!, snapshot: { ...baseInput().runner!.snapshot!, toolInventory: [] } } },
      "AUTHENTICATION_REQUIRED",
    ],
    [
      "workspace mismatch",
      { runner: { ...baseInput().runner!, snapshot: { ...baseInput().runner!.snapshot!, workspaceIds: ["other-workspace"] } } },
      "WORKSPACE_APPROVAL_REQUIRED",
    ],
    ["missing approval", { approval: null }, "APPROVAL_REQUIRED"],
    ["missing budget", { budget: null }, "BUDGET_REQUIRED"],
  ])("fails closed for %s", (_label, override, expected) => {
    const result = evaluateSpec224Authorization({
      ...baseInput(),
      ...override,
    });

    expect(result.status).toBe(expected);
    expect(result.binding).toBeUndefined();
  });

  it("rejects forged cross-tenant approval and budget references", () => {
    const approval = { ...baseInput().approval!, tenantId: "tenant-b" };
    const result = evaluateSpec224Authorization({ ...baseInput(), approval });

    expect(result.status).toBe("APPROVAL_REQUIRED");
    expect(result.reasons).toContain("APPROVAL_TENANT_MISMATCH");
  });

  it("rejects expired or revoked Runner evidence", () => {
    const revoked = {
      ...baseInput().runner!,
      trustState: "revoked" as const,
    };
    expect(
      evaluateSpec224Authorization({ ...baseInput(), runner: revoked }).status
    ).toBe("REVOKED");

    const expired = {
      ...baseInput().runner!,
      snapshot: {
        ...baseInput().runner!.snapshot!,
        expiresAt: "2026-09-23T09:59:59.000Z",
      },
    };
    expect(
      evaluateSpec224Authorization({ ...baseInput(), runner: expired }).status
    ).toBe("EXPIRED");
  });

  it("does not expose or accept raw credentials in authority evidence", () => {
    const result = evaluateSpec224Authorization({
      ...baseInput(),
      approval: {
        ...baseInput().approval!,
        payload: { ...baseInput().approval!.payload, apiKey: "secret" },
      },
    });

    expect(result.status).toBe("APPROVAL_REQUIRED");
    expect(result.reasons).toContain("APPROVAL_PAYLOAD_SECRET");
  });
});
