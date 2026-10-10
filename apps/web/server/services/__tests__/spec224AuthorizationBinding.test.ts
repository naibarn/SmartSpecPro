import { describe, expect, it } from "vitest";

import {
  evaluateSpec224Authorization,
  canPersistSpec224PolicyBinding,
  isSameSpec224PolicyBinding,
  type Spec224AuthorizationInput,
  type Spec224PolicyBinding,
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
      budgetCapMinorUnits: 500,
      currency: "USD",
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
  it("accepts a bounded Goal Grant child binding without reusing a job approval", () => {
    const input = baseInput();
    input.approval = null;
    input.run.goalDelegationScope = {
      goalId: "goal-224",
      repositoryRef: "repo:naibarn/SmartSpecPro",
      sourceSha: "a".repeat(40),
      action: "repair",
      changedPaths: ["apps/web/server/services/fix.ts"],
      requiredCapabilities: ["agent.external_task"],
    };
    input.goalDelegationAuthority = {
      approvalRef: "goal-approval-224",
      tenantId: "tenant-a",
      executionId: "goal-224",
      requesterId: 11,
      status: "approved",
      currentApprovals: 1,
      requiredApprovers: 1,
      expiresAt: "2026-09-23T10:30:00.000Z",
      payload: {
        kind: "spec224_goal_delegation_grant",
        grantId: "goal-grant-224",
        goalId: "goal-224",
        actorId: 11,
        workspaceId: "workspace-a",
        repositoryRef: "repo:naibarn/SmartSpecPro",
        sourceSha: "a".repeat(40),
        allowedActions: ["repair", "test", "commit", "push"],
        writeScope: ["apps/web/server/services/**"],
        capabilities: ["agent.external_task", "git.write"],
        budgetLimitMinorUnits: 1000,
        currency: "USD",
        issuedAt: "2026-09-23T09:00:00.000Z",
        expiresAt: "2026-09-23T10:30:00.000Z",
      },
    };

    expect(evaluateSpec224Authorization(input)).toMatchObject({
      status: "READY_FOR_LIVE",
      binding: {
        approvalRef: "goal-approval-224",
        budgetReservationRef: "hold-a",
        budgetCapMinorUnits: 500,
        workspaceRef: "workspace-a",
      },
    });

    input.run.goalDelegationScope.requiredCapabilities.push("git.write");
    expect(evaluateSpec224Authorization(input)).toMatchObject({
      status: "RUNNER_BINDING_REQUIRED",
      reasons: ["GOAL_GRANT_RUNNER_CAPABILITY_MISSING"],
    });
    input.run.goalDelegationScope.requiredCapabilities.pop();

    input.budget = null;
    expect(evaluateSpec224Authorization(input)).toMatchObject({
      status: "BUDGET_REQUIRED",
      reasons: ["BUDGET_RESERVATION_NOT_FOUND"],
    });
  });

  it("denies a revoked Goal Grant and refuses ambiguous approval evidence", () => {
    const input = baseInput();
    input.approval = null;
    input.run.goalDelegationScope = {
      goalId: "goal-224",
      repositoryRef: "repo:naibarn/SmartSpecPro",
      sourceSha: "a".repeat(40),
      action: "repair",
      changedPaths: ["apps/web/server/services/fix.ts"],
      requiredCapabilities: ["agent.external_task"],
    };
    input.goalDelegationAuthority = {
      approvalRef: "goal-approval-224",
      tenantId: "tenant-a",
      executionId: "goal-224",
      requesterId: 11,
      status: "approved",
      currentApprovals: 1,
      requiredApprovers: 1,
      expiresAt: "2026-09-23T10:30:00.000Z",
      revokedAt: "2026-09-23T09:59:00.000Z",
      payload: {
        kind: "spec224_goal_delegation_grant",
        grantId: "goal-grant-224",
        goalId: "goal-224",
        actorId: 11,
        workspaceId: "workspace-a",
        repositoryRef: "repo:naibarn/SmartSpecPro",
        sourceSha: "a".repeat(40),
        allowedActions: ["repair"],
        writeScope: ["apps/web/server/services/**"],
        capabilities: ["agent.external_task"],
        budgetLimitMinorUnits: 1000,
        currency: "USD",
        issuedAt: "2026-09-23T09:00:00.000Z",
        expiresAt: "2026-09-23T10:30:00.000Z",
      },
    };
    expect(evaluateSpec224Authorization(input).status).toBe("REVOKED");

    input.goalDelegationAuthority.revokedAt = null;
    input.goalDelegationAuthority.status = "expired";
    input.goalDelegationAuthority.expiresAt = "2026-09-23T09:59:59.000Z";
    input.goalDelegationAuthority.payload.expiresAt = "2026-09-23T09:59:59.000Z";
    expect(evaluateSpec224Authorization(input).status).toBe("EXPIRED");

    input.approval = baseInput().approval;
    expect(evaluateSpec224Authorization(input)).toMatchObject({
      status: "APPROVAL_REQUIRED",
      reasons: ["AMBIGUOUS_AUTHORITY_EVIDENCE"],
    });
  });

  it("denies a delegated child whose source revision differs from the Goal Grant", () => {
    const input = baseInput();
    input.approval = null;
    input.run.goalDelegationScope = {
      goalId: "goal-224",
      repositoryRef: "repo:naibarn/SmartSpecPro",
      sourceSha: "b".repeat(40),
      action: "repair",
      changedPaths: ["apps/web/server/services/fix.ts"],
      requiredCapabilities: ["agent.external_task"],
    };
    input.goalDelegationAuthority = {
      approvalRef: "goal-approval-224",
      tenantId: "tenant-a",
      executionId: "goal-224",
      requesterId: 11,
      status: "approved",
      currentApprovals: 1,
      requiredApprovers: 1,
      expiresAt: "2026-09-23T10:30:00.000Z",
      payload: {
        kind: "spec224_goal_delegation_grant",
        grantId: "goal-grant-224",
        goalId: "goal-224",
        actorId: 11,
        workspaceId: "workspace-a",
        repositoryRef: "repo:naibarn/SmartSpecPro",
        sourceSha: "a".repeat(40),
        allowedActions: ["repair"],
        writeScope: ["apps/web/server/services/**"],
        capabilities: ["agent.external_task"],
        budgetLimitMinorUnits: 1000,
        currency: "USD",
        issuedAt: "2026-09-23T09:00:00.000Z",
        expiresAt: "2026-09-23T10:30:00.000Z",
      },
    };

    expect(evaluateSpec224Authorization(input)).toMatchObject({
      status: "APPROVAL_REQUIRED",
      reasons: ["CHILD_SCOPE_EXCEEDS_GOAL_GRANT"],
    });
  });

  it("allows only a fresh pending bind or an exact durable binding retry", () => {
    const binding: Spec224PolicyBinding = {
      runnerId: "runner-a",
      runnerSessionId: "session-a",
      capabilitySnapshotId: "snapshot-a",
      capabilitySnapshotRevision: "7",
      authorizationGrantRef: "grant-a",
      approvalRef: "approval-a",
      budgetReservationRef: "hold-a",
      budgetCapMinorUnits: 500,
      currency: "USD",
      workspaceRef: "workspace-a",
      deadline: "2026-09-23T11:00:00.000Z",
    };

    expect(
      canPersistSpec224PolicyBinding({
        jobStatus: "pending",
        manifestBinding: undefined,
        progressBinding: undefined,
        nextBinding: binding,
      })
    ).toBe(true);
    expect(
      canPersistSpec224PolicyBinding({
        jobStatus: "queued",
        manifestBinding: binding,
        progressBinding: { ...binding },
        nextBinding: { ...binding },
      })
    ).toBe(true);
    expect(
      canPersistSpec224PolicyBinding({
        jobStatus: "queued",
        manifestBinding: binding,
        progressBinding: binding,
        nextBinding: { ...binding, approvalRef: "approval-replaced" },
      })
    ).toBe(false);
    expect(
      canPersistSpec224PolicyBinding({
        jobStatus: "queued",
        manifestBinding: binding,
        progressBinding: undefined,
        nextBinding: binding,
      })
    ).toBe(false);
  });

  it("treats a persisted policy binding as immutable while allowing exact retries", () => {
    const binding: Spec224PolicyBinding = {
      runnerId: "runner-a",
      runnerSessionId: "session-a",
      capabilitySnapshotId: "snapshot-a",
      capabilitySnapshotRevision: "7",
      authorizationGrantRef: "grant-a",
      approvalRef: "approval-a",
      budgetReservationRef: "hold-a",
      budgetCapMinorUnits: 500,
      currency: "USD",
      workspaceRef: "workspace-a",
      deadline: "2026-09-23T11:00:00.000Z",
    };

    expect(isSameSpec224PolicyBinding(binding, { ...binding })).toBe(true);
    expect(
      isSameSpec224PolicyBinding(
        binding,
        Object.fromEntries(Object.entries(binding).reverse())
      )
    ).toBe(true);
    expect(
      isSameSpec224PolicyBinding(binding, {
        ...binding,
        approvalRef: "approval-b",
      })
    ).toBe(false);
    expect(
      isSameSpec224PolicyBinding(binding, {
        ...binding,
        budgetCapMinorUnits: 501,
      })
    ).toBe(false);
  });

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
      budgetCapMinorUnits: 500,
      currency: "USD",
      workspaceRef: "workspace-a",
      deadline: "2026-09-23T11:00:00.000Z",
    });
  });

  it.each([
    ["approval amount mismatch", { budgetCapMinorUnits: 501, currency: "USD" }],
    ["approval currency mismatch", { budgetCapMinorUnits: 500, currency: "EUR" }],
  ])("blocks dispatch for %s", (_label, approvedBudget) => {
    const input = baseInput();
    input.approval!.payload = { ...input.approval!.payload, ...approvedBudget };
    expect(evaluateSpec224Authorization(input)).toMatchObject({
      status: "BUDGET_REQUIRED",
      reasons: ["APPROVAL_BUDGET_BINDING_MISMATCH"],
    });
  });

  it.each([
    ["missing runner", { runner: null }, "RUNNER_BINDING_REQUIRED"],
    [
      "missing provider authentication",
      {
        runner: {
          ...baseInput().runner!,
          snapshot: { ...baseInput().runner!.snapshot!, toolInventory: [] },
        },
      },
      "AUTHENTICATION_REQUIRED",
    ],
    [
      "workspace mismatch",
      {
        runner: {
          ...baseInput().runner!,
          snapshot: {
            ...baseInput().runner!.snapshot!,
            workspaceIds: ["other-workspace"],
          },
        },
      },
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
