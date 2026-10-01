import { describe, expect, it } from "vitest";
import {
  computeSpec224ProtectedStartAuthorityDigest,
  isRunnerCommandBoundToCanonicalAgentManifest,
  isSpec224ProtectedStartCommandBoundToEvent,
  isMatchingSpec224ProtectedStartEvent,
  spec224AuthorizedCommandId,
} from "../spec224RuntimeAdmission";

describe("Spec 224 protected execution-start identity", () => {
  const operationId = "a".repeat(64);
  const authority = {
    tenantId: "tenant-a",
    tenantOwnerId: 41,
    actorId: 41,
    runId: "run-a",
    workerJobId: "job-a",
    attemptId: "attempt-a",
    grantId: "grant-a",
  };

  it("binds the authority digest to the authenticated actor", () => {
    const actorDigest = computeSpec224ProtectedStartAuthorityDigest(authority);
    const otherActorDigest = computeSpec224ProtectedStartAuthorityDigest({
      ...authority,
      actorId: 42,
    });

    expect(otherActorDigest).not.toBe(actorDigest);
  });

  it("binds the authority digest to the tenant owner", () => {
    const ownerDigest = computeSpec224ProtectedStartAuthorityDigest(authority);
    const otherOwnerDigest = computeSpec224ProtectedStartAuthorityDigest({
      ...authority,
      tenantOwnerId: 42,
    });

    expect(otherOwnerDigest).not.toBe(ownerDigest);
  });

  it("rejects a persisted start whose authenticated principal differs", () => {
    const identity = {
      authority,
      authorityDigest: computeSpec224ProtectedStartAuthorityDigest(authority),
      operationId,
      eventIdempotencyKey: "start-a",
    };
    const event = {
      eventType: "SPEC224_PROTECTED_EXECUTION_STARTED",
      attemptId: "attempt-a",
      eventIdempotencyKey: "start-a",
      eventSequence: 17,
      payloadJson: {
        schemaVersion: "spec224.protected-execution-start.v2",
        ...authority,
        operationId,
        authorityDigest: identity.authorityDigest,
        admissionCorrelationId: `spec224-admission:${operationId}`,
        eventIdempotencyKey: "start-a",
        authorizedCommandId: spec224AuthorizedCommandId(operationId),
        startedAt: "2026-10-01T00:00:00.000Z",
      },
    };

    expect(
      isMatchingSpec224ProtectedStartEvent(event, identity, "attempt-a")
    ).toBe(true);
    expect(
      isMatchingSpec224ProtectedStartEvent(
        {
          ...event,
          payloadJson: { ...event.payloadJson, actorId: 99 },
        },
        identity,
        "attempt-a"
      )
    ).toBe(false);
  });

  it("rejects a key collision from another attempt or event type", () => {
    const identity = {
      authority,
      authorityDigest: computeSpec224ProtectedStartAuthorityDigest(authority),
      operationId,
      eventIdempotencyKey: "start-a",
    };
    const event = {
      eventType: "SPEC224_PROTECTED_EXECUTION_STARTED",
      attemptId: "attempt-a",
      eventIdempotencyKey: "start-a",
      eventSequence: 17,
      payloadJson: {
        schemaVersion: "spec224.protected-execution-start.v2",
        ...authority,
        operationId,
        authorityDigest: identity.authorityDigest,
        admissionCorrelationId: `spec224-admission:${operationId}`,
        eventIdempotencyKey: "start-a",
        authorizedCommandId: spec224AuthorizedCommandId(operationId),
        startedAt: "2026-10-01T00:00:00.000Z",
      },
    };

    expect(
      isMatchingSpec224ProtectedStartEvent(
        { ...event, attemptId: "attempt-b" },
        identity,
        "attempt-a"
      )
    ).toBe(false);
    expect(
      isMatchingSpec224ProtectedStartEvent(
        { ...event, eventType: "JOB_COMPLETED" },
        identity,
        "attempt-a"
      )
    ).toBe(false);
    expect(
      isMatchingSpec224ProtectedStartEvent(
        {
          ...event,
          payloadJson: {
            ...event.payloadJson,
            authorizedCommandId: "b1817e44-46a5-4623-97c9-9f01713aad0f",
          },
        },
        identity,
        "attempt-a"
      )
    ).toBe(false);
  });

  it("binds a Runner command to the persisted start authority instead of trusting command assertions", () => {
    const completeAuthority = {
      ...authority,
      attempt: 3,
      executionInputDigest: "b".repeat(64),
      decisionEpoch: 12,
      runRevision: 7,
      workerJobFencingVersion: 8,
      leaseGeneration: 9,
      attestationId: "attestation-a",
      runnerId: "runner-a",
      runnerSessionId: "session-a",
      capabilitySnapshotId: "capability-a",
      capabilitySnapshotRevision: "revision-a",
    };
    const identity = {
      authority: completeAuthority,
      authorityDigest:
        computeSpec224ProtectedStartAuthorityDigest(completeAuthority),
      operationId,
      eventIdempotencyKey: `spec224:protected-start:${operationId}`,
    };
    const event = {
      eventType: "SPEC224_PROTECTED_EXECUTION_STARTED",
      attemptId: "attempt-a",
      eventIdempotencyKey: identity.eventIdempotencyKey,
      eventSequence: 17,
      payloadJson: {
        schemaVersion: "spec224.protected-execution-start.v2",
        ...completeAuthority,
        operationId,
        authorityDigest: identity.authorityDigest,
        admissionCorrelationId: `spec224-admission:${operationId}`,
        eventIdempotencyKey: identity.eventIdempotencyKey,
        authorizedCommandId: spec224AuthorizedCommandId(operationId),
        startedAt: "2026-10-01T00:00:00.000Z",
      },
    };
    const command = {
      commandId: spec224AuthorizedCommandId(operationId),
      commandType: "execute" as const,
      jobId: "job-a",
      leaseId: "lease:job-a:attempt-a",
      attempt: 3,
      fencingToken: 8,
      tenantId: "tenant-a",
      userId: 41,
      runnerId: "runner-a",
      runnerSessionId: "session-a",
      capabilitySnapshotId: "capability-a",
      capabilitySnapshotRevision: "revision-a",
      idempotencyKey: identity.eventIdempotencyKey,
      authorizationGrantRef: "grant-a",
    };

    expect(
      isSpec224ProtectedStartCommandBoundToEvent(
        event,
        identity,
        "attempt-a",
        command
      )
    ).toBe(true);
    expect(
      isSpec224ProtectedStartCommandBoundToEvent(event, identity, "attempt-a", {
        ...command,
        runnerSessionId: "attacker-session",
      })
    ).toBe(false);
    expect(
      isSpec224ProtectedStartCommandBoundToEvent(event, identity, "attempt-a", {
        ...command,
        fencingToken: 7,
      })
    ).toBe(false);
    expect(
      isSpec224ProtectedStartCommandBoundToEvent(event, identity, "attempt-a", {
        ...command,
        commandId: "forged-command",
      })
    ).toBe(false);
    expect(
      isSpec224ProtectedStartCommandBoundToEvent(
        {
          ...event,
          payloadJson: { ...event.payloadJson, decisionEpoch: 11 },
        },
        identity,
        "attempt-a",
        command
      )
    ).toBe(false);

    const invalidCommandCases: Array<{
      field: string;
      command: typeof command;
    }> = [
      { field: "command ID", command: { ...command, commandId: "forged" } },
      { field: "attempt", command: { ...command, attempt: 4 } },
      { field: "fence", command: { ...command, fencingToken: 9 } },
      { field: "tenant", command: { ...command, tenantId: "tenant-b" } },
      { field: "actor", command: { ...command, userId: 42 } },
      { field: "runner", command: { ...command, runnerId: "runner-b" } },
      {
        field: "Runner session",
        command: { ...command, runnerSessionId: "session-b" },
      },
      {
        field: "capability snapshot",
        command: { ...command, capabilitySnapshotId: "capability-b" },
      },
      {
        field: "capability revision",
        command: { ...command, capabilitySnapshotRevision: "revision-b" },
      },
      {
        field: "idempotency key",
        command: { ...command, idempotencyKey: "forged-key" },
      },
      {
        field: "authorization grant",
        command: { ...command, authorizationGrantRef: "grant-b" },
      },
    ];
    for (const testCase of invalidCommandCases) {
      expect(
        isSpec224ProtectedStartCommandBoundToEvent(
          event,
          identity,
          "attempt-a",
          testCase.command
        ),
        `must reject forged ${testCase.field}`
      ).toBe(false);
    }

    const invalidEventCases = [
      {
        field: "operation ID",
        event: {
          ...event,
          payloadJson: {
            ...event.payloadJson,
            operationId: "forged-operation",
          },
        },
      },
      {
        field: "authority digest",
        event: {
          ...event,
          payloadJson: {
            ...event.payloadJson,
            authorityDigest: "f".repeat(64),
          },
        },
      },
      {
        field: "grant binding",
        event: {
          ...event,
          payloadJson: { ...event.payloadJson, grantId: "grant-b" },
        },
      },
      {
        field: "attestation binding",
        event: {
          ...event,
          payloadJson: { ...event.payloadJson, attestationId: "attestation-b" },
        },
      },
      {
        field: "attempt binding",
        event: { ...event, attemptId: "attempt-b" },
      },
      {
        field: "revision",
        event: {
          ...event,
          payloadJson: { ...event.payloadJson, runRevision: 8 },
        },
      },
      {
        field: "lease generation",
        event: {
          ...event,
          payloadJson: { ...event.payloadJson, leaseGeneration: 10 },
        },
      },
      {
        field: "Runner session binding",
        event: {
          ...event,
          payloadJson: { ...event.payloadJson, runnerSessionId: "session-b" },
        },
      },
      {
        field: "capability binding",
        event: {
          ...event,
          payloadJson: {
            ...event.payloadJson,
            capabilitySnapshotId: "capability-b",
          },
        },
      },
      {
        field: "capability revision binding",
        event: {
          ...event,
          payloadJson: {
            ...event.payloadJson,
            capabilitySnapshotRevision: "revision-b",
          },
        },
      },
      {
        field: "event sequence",
        event: { ...event, eventSequence: null },
      },
    ];
    for (const testCase of invalidEventCases) {
      expect(
        isSpec224ProtectedStartCommandBoundToEvent(
          testCase.event,
          identity,
          "attempt-a",
          command
        ),
        `must reject forged ${testCase.field}`
      ).toBe(false);
    }

    expect(
      isSpec224ProtectedStartCommandBoundToEvent(
        event,
        { ...identity, operationId: "f".repeat(64) },
        "attempt-a",
        command
      )
    ).toBe(false);
    expect(
      isSpec224ProtectedStartCommandBoundToEvent(
        event,
        { ...identity, authorityDigest: "f".repeat(64) },
        "attempt-a",
        command
      )
    ).toBe(false);
  });

  it("rejects protected Runner command content that differs from the canonical job manifest", () => {
    const manifest = {
      taskId: "task-a",
      tenantId: "tenant-a",
      actorId: 41,
      goalId: "goal-a",
      planId: "plan-a",
      planRevision: 2,
      provider: "codex" as const,
      runtime: "local_runner" as const,
      workspaceId: "workspace-a",
      contextPackageIds: ["context-a"],
      skillIds: ["skill-a"],
      mcpGrantIds: [],
      requestedCapabilities: ["code.edit"],
      policyBinding: {
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        capabilitySnapshotId: "capability-a",
        capabilitySnapshotRevision: "revision-a",
        authorizationGrantRef: "grant-a",
        approvalRef: "approval-a",
        budgetReservationRef: "budget-a",
        spendCeilingMicros: 5000,
        workspaceRef: "workspace-a",
        deadline: "2099-01-01T00:00:00.000Z",
      },
    };
    const command = {
      executionKind: "external_agent_task" as const,
      adapterId: "codex.v1",
      adapterVersionConstraint: "0.1.0",
      workspaceRef: "workspace-a",
      deadline: manifest.policyBinding.deadline,
      authorizationGrantRef: "grant-a",
      inputRef: "runner-input:job-a:attempt-a",
      payload: {
        taskId: "task-a",
        goalId: "goal-a",
        planId: "plan-a",
        planRevision: 2,
        workspaceId: "workspace-a",
        contextPackageIds: ["context-a"],
        skillIds: ["skill-a"],
        mcpGrantIds: [],
        requestedCapabilities: ["code.edit"],
        approvalRef: "approval-a",
        budgetReservationRef: "budget-a",
        spendCeilingMicros: 5000,
      },
    };

    expect(
      isRunnerCommandBoundToCanonicalAgentManifest(
        command,
        manifest,
        "job-a",
        "attempt-a"
      )
    ).toBe(true);
    expect(
      isRunnerCommandBoundToCanonicalAgentManifest(
        {
          ...command,
          payload: { ...command.payload, goalId: "attacker-goal" },
        },
        manifest,
        "job-a",
        "attempt-a"
      )
    ).toBe(false);
    expect(
      isRunnerCommandBoundToCanonicalAgentManifest(
        { ...command, inputRef: "runner-input:other-job:attempt-a" },
        manifest,
        "job-a",
        "attempt-a"
      )
    ).toBe(false);
    expect(
      isRunnerCommandBoundToCanonicalAgentManifest(
        { ...command, projectRef: "attacker-project" },
        manifest,
        "job-a",
        "attempt-a"
      )
    ).toBe(false);
    expect(
      isRunnerCommandBoundToCanonicalAgentManifest(
        { ...command, browserEngineConstraint: "attacker-engine" },
        manifest,
        "job-a",
        "attempt-a"
      )
    ).toBe(false);
  });
});
