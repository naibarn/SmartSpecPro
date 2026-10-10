import { describe, expect, it } from "vitest";
import {
  buildSpec224GoalGrantApprovalPayload,
  evaluateSpec224GoalDelegation,
  type Spec224GoalDelegationInput,
  type Spec224GoalGrantScope,
} from "../spec224GoalDelegationGrant";

const baseInput = (): Spec224GoalDelegationInput => ({
  now: new Date("2026-10-10T10:00:00.000Z"),
  authority: {
    approvalRef: "approval-goal-1",
    tenantId: "tenant-a",
    executionId: "goal-1",
    requesterId: 11,
    status: "approved",
    currentApprovals: 1,
    requiredApprovers: 1,
    expiresAt: "2026-10-10T11:00:00.000Z",
    payload: {
      kind: "spec224_goal_delegation_grant",
      grantId: "grant-1",
      goalId: "goal-1",
      actorId: 11,
      workspaceId: "workspace-a",
      repositoryRef: "repo:naibarn/SmartSpecPro",
      sourceSha: "a".repeat(40),
      allowedActions: ["repair", "test", "commit", "push", "create_pr"],
      writeScope: [
        "apps/web/server/services/**",
        "apps/web/server/services/__tests__/**",
      ],
      capabilities: ["agent.external_task", "git.write", "test.run"],
      budgetLimitMinorUnits: 1000,
      currency: "USD",
      issuedAt: "2026-10-10T09:00:00.000Z",
      expiresAt: "2026-10-10T11:00:00.000Z",
    },
  },
  child: {
    goalId: "goal-1",
    tenantId: "tenant-a",
    actorId: 11,
    workspaceId: "workspace-a",
    repositoryRef: "repo:naibarn/SmartSpecPro",
    sourceSha: "a".repeat(40),
    action: "repair",
    changedPaths: ["apps/web/server/services/spec224GoalDelegationGrant.ts"],
    requiredCapabilities: ["agent.external_task", "git.write"],
    workerJobId: "job-1",
    attemptId: "attempt-1",
    budgetHold: {
      reservationRef: "hold-1",
      tenantId: "tenant-a",
      workerJobId: "job-1",
      attemptId: "attempt-1",
      status: "held",
      amountMinorUnits: 100,
      currency: "USD",
    },
  },
});

describe("SPEC-224 Goal delegation contract", () => {
  it("builds an explicit bounded request for the existing Approval Authority", () => {
    const scope: Spec224GoalGrantScope = {
      grantId: "grant-1",
      goalId: "goal-1",
      actorId: 11,
      workspaceId: "workspace-a",
      repositoryRef: "repo:naibarn/SmartSpecPro",
      sourceSha: "a".repeat(40),
      allowedActions: ["repair", "test"],
      writeScope: ["apps/web/server/services/**"],
      capabilities: ["agent.external_task"],
      budgetLimitMinorUnits: 1000,
      currency: "usd",
      issuedAt: "2026-10-10T09:00:00.000Z",
      expiresAt: "2026-10-10T11:00:00.000Z",
    };
    expect(buildSpec224GoalGrantApprovalPayload(scope)).toMatchObject({
      kind: "spec224_goal_delegation_grant",
      ...scope,
      currency: "USD",
    });
    expect(() =>
      buildSpec224GoalGrantApprovalPayload({ ...scope, writeScope: ["../**"] })
    ).toThrow("SPEC224_GOAL_GRANT_SCOPE_INVALID");
  });

  it("derives an attempt-scoped child binding from an approved authority record", () => {
    expect(evaluateSpec224GoalDelegation(baseInput())).toMatchObject({
      status: "READY_FOR_DELEGATION",
      binding: {
        grantRef: "grant-1",
        authorityRef: "approval-goal-1",
        goalId: "goal-1",
        tenantId: "tenant-a",
        actorId: 11,
        workerJobId: "job-1",
        attemptId: "attempt-1",
        sourceSha: "a".repeat(40),
        budgetReservationRef: "hold-1",
        budgetCapMinorUnits: 100,
        currency: "USD",
      },
    });
  });

  it.each(["pending", "rejected", "expired", "cancelled"] as const)(
    "denies %s authority evidence",
    status => {
      const input = baseInput();
      input.authority.status = status;
      expect(evaluateSpec224GoalDelegation(input).status).toBe(
        "AUTHORITY_DENIED"
      );
    }
  );

  it.each([
    [
      "tenant",
      (input: Spec224GoalDelegationInput) => {
        input.child.tenantId = "tenant-b";
      },
    ],
    [
      "actor",
      (input: Spec224GoalDelegationInput) => {
        input.child.actorId = 12;
      },
    ],
    [
      "workspace",
      (input: Spec224GoalDelegationInput) => {
        input.child.workspaceId = "workspace-b";
      },
    ],
    [
      "repository",
      (input: Spec224GoalDelegationInput) => {
        input.child.repositoryRef = "repo:other/project";
      },
    ],
    [
      "source SHA",
      (input: Spec224GoalDelegationInput) => {
        input.child.sourceSha = "b".repeat(40);
      },
    ],
    [
      "action",
      (input: Spec224GoalDelegationInput) => {
        input.child.action = "merge";
      },
    ],
    [
      "write scope",
      (input: Spec224GoalDelegationInput) => {
        input.child.changedPaths = ["apps/web/server/routes/runnerControl.ts"];
      },
    ],
    [
      "capability",
      (input: Spec224GoalDelegationInput) => {
        input.child.requiredCapabilities.push("secret.read");
      },
    ],
  ])("denies widened or mismatched %s scope", (_label, mutate) => {
    const input = baseInput();
    mutate(input);
    expect(evaluateSpec224GoalDelegation(input).status).toBe("SCOPE_DENIED");
  });

  it("denies missing, mismatched, released and over-ceiling budget holds", () => {
    const input = baseInput();
    input.child.budgetHold = null;
    expect(evaluateSpec224GoalDelegation(input).status).toBe("BUDGET_DENIED");

    const mismatched = baseInput();
    mismatched.child.budgetHold!.attemptId = "attempt-other";
    expect(evaluateSpec224GoalDelegation(mismatched).status).toBe(
      "BUDGET_DENIED"
    );

    const released = baseInput();
    released.child.budgetHold!.status = "released";
    expect(evaluateSpec224GoalDelegation(released).status).toBe(
      "BUDGET_DENIED"
    );

    const over = baseInput();
    over.child.budgetHold!.amountMinorUnits = 1001;
    expect(evaluateSpec224GoalDelegation(over).status).toBe("BUDGET_DENIED");
  });

  it("denies an explicitly revoked or expired grant", () => {
    const revoked = baseInput();
    revoked.authority.payload.revokedAt = "2026-10-10T09:30:00.000Z";
    expect(evaluateSpec224GoalDelegation(revoked).status).toBe(
      "AUTHORITY_DENIED"
    );

    const authorityRevoked = baseInput();
    authorityRevoked.authority.revokedAt = "2026-10-10T09:30:00.000Z";
    expect(evaluateSpec224GoalDelegation(authorityRevoked).status).toBe(
      "AUTHORITY_DENIED"
    );

    const expired = baseInput();
    expired.authority.payload.expiresAt = "2026-10-10T09:59:59.000Z";
    expect(evaluateSpec224GoalDelegation(expired).status).toBe(
      "AUTHORITY_DENIED"
    );
  });

  it("binds distinct child attempts to their own immutable hold and rejects wildcard child paths", () => {
    const first = evaluateSpec224GoalDelegation(baseInput());
    const secondInput = baseInput();
    secondInput.child.workerJobId = "job-2";
    secondInput.child.attemptId = "attempt-2";
    secondInput.child.budgetHold = {
      ...secondInput.child.budgetHold!,
      reservationRef: "hold-2",
      workerJobId: "job-2",
      attemptId: "attempt-2",
    };
    const second = evaluateSpec224GoalDelegation(secondInput);
    expect(first.status).toBe("READY_FOR_DELEGATION");
    expect(second.status).toBe("READY_FOR_DELEGATION");
    if (
      first.status === "READY_FOR_DELEGATION" &&
      second.status === "READY_FOR_DELEGATION"
    ) {
      expect(first.binding.digest).not.toBe(second.binding.digest);
      expect(second.binding.budgetReservationRef).toBe("hold-2");
    }

    const wildcard = baseInput();
    wildcard.child.changedPaths = ["apps/web/server/services/**"];
    expect(evaluateSpec224GoalDelegation(wildcard).status).toBe("SCOPE_DENIED");
  });

  it("allows a non-writing verification child without a write set", () => {
    const input = baseInput();
    input.child.action = "test";
    input.child.changedPaths = [];
    expect(evaluateSpec224GoalDelegation(input).status).toBe(
      "READY_FOR_DELEGATION"
    );

    input.now = new Date("invalid");
    expect(evaluateSpec224GoalDelegation(input).status).toBe("AUTHORITY_DENIED");
  });

  it("rejects unsafe payloads and malformed identities", () => {
    const secret = baseInput();
    secret.authority.payload.authorizationToken = "must-not-be-persisted";
    expect(evaluateSpec224GoalDelegation(secret).status).toBe(
      "AUTHORITY_DENIED"
    );

    const malformed = baseInput();
    malformed.child.sourceSha = "not-a-sha";
    expect(evaluateSpec224GoalDelegation(malformed).status).toBe(
      "SCOPE_DENIED"
    );

    const malformedPaths = baseInput();
    malformedPaths.child.changedPaths = [null] as unknown as string[];
    expect(evaluateSpec224GoalDelegation(malformedPaths).status).toBe(
      "SCOPE_DENIED"
    );

    const malformedCapabilities = baseInput();
    malformedCapabilities.child.requiredCapabilities =
      null as unknown as string[];
    expect(evaluateSpec224GoalDelegation(malformedCapabilities).status).toBe(
      "SCOPE_DENIED"
    );

    const malformedHold = baseInput();
    malformedHold.child.budgetHold!.currency = null as unknown as string;
    expect(evaluateSpec224GoalDelegation(malformedHold).status).toBe(
      "BUDGET_DENIED"
    );
  });
});
