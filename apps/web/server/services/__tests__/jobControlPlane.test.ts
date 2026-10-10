import { describe, expect, it } from "vitest";

import {
  appendJobEvent,
  calculateRetryDelay,
  classifyJobError,
  createJobControlPlane,
  matchesExistingJobDefinitionAfterAdminDeadlineChange,
  normalizeResultReference,
  recordAuthenticatedJobCallback,
  sanitizeJobErrorMessage,
} from "../jobControlPlane";
import { assertCanonicalJobTransition } from "../jobControlPlaneTypes";
import type { JobControlPlaneRepository } from "../jobControlPlane";

function makeRepository() {
  const jobs = new Map<string, any>();
  const events: any[] = [];
  const outbox: any[] = [];
  const attempts: any[] = [];
  const settlements: any[] = [];
  const actions: any[] = [];
  const callbacks: any[] = [];
  const transitions: string[] = [];
  const runnerReceiptLocks: Array<{ jobId: string; operationKey: string }> = [];
  const repository: JobControlPlaneRepository = {
    transaction: async work =>
      work({
        findJob: async jobId => jobs.get(jobId) ?? null,
        findByIdempotency: async (tenantId, key) =>
          [...jobs.values()].find(
            job => job.tenantId === tenantId && job.idempotencyKey === key
          ) ?? null,
        findActiveByDedupeKey: async (tenantId, key) =>
          [...jobs.values()].find(
            job =>
              job.tenantId === tenantId &&
              job.activeDedupeKey === key &&
              ["pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external", "retry_scheduled", "uploading", "publishing", "indexing"].includes(job.status)
          ) ?? null,
        lockActiveDedupeKey: async () => {},
        lockAdmission: async () => {},
        countActiveJobs: async ({ tenantId, executionClass }) =>
          [...jobs.values()].filter(
            job =>
              job.tenantId === tenantId &&
              job.executionClass === executionClass &&
              [
                "pending",
                "queued",
                "leased",
                "claimed",
                "preparing",
                "running",
                "waiting_external",
                "retry_scheduled",
                "uploading",
                "publishing",
                "indexing",
              ].includes(job.status)
          ).length,
        countActiveJobsGlobal: async executionClass =>
          [...jobs.values()].filter(
            job =>
              job.executionClass === executionClass &&
              [
                "pending",
                "queued",
                "leased",
                "claimed",
                "preparing",
                "running",
                "waiting_external",
                "retry_scheduled",
                "uploading",
                "publishing",
                "indexing",
              ].includes(job.status)
          ).length,
        findAttempt: async (jobId, attempt) =>
          attempts.find(
            item => item.workerJobId === jobId && item.attempt === attempt
          ) ?? null,
        assertRunnerAuthorizationBinding: async () => true,
        findEventByIdempotency: async (jobId, key) =>
          events.find(
            event =>
              event.workerJobId === jobId && event.eventIdempotencyKey === key
          ) ?? null,
        lockRunnerReceiptStream: async (jobId, operationKey) => {
          runnerReceiptLocks.push({ jobId, operationKey });
        },
        findLatestRunnerReceipt: async (jobId, commandId) => {
          const prior = events
            .filter(
              event =>
                event.workerJobId === jobId &&
                String(event.eventType).startsWith("RUNNER_") &&
                event.payloadJson?.commandId === commandId
            )
            .sort(
              (a, b) =>
                Number(b.payloadJson.sequence) - Number(a.payloadJson.sequence)
            )[0];
          return prior
            ? {
                eventId: prior.payloadJson.eventId,
                sequence: prior.payloadJson.sequence,
                terminal: [
                  "RUNNER_EXECUTION_COMPLETED",
                  "RUNNER_COMMAND_REJECTED",
                  "RUNNER_EXECUTION_FAILED",
                  "RUNNER_CANCEL_ACKNOWLEDGED",
                  "RUNNER_UNKNOWN_OUTCOME",
                ].includes(prior.eventType),
              }
            : null;
        },
        findAction: async actionId =>
          actions.find(action => action.actionId === actionId) ?? null,
        insertAction: async values => {
          if (!actions.some(action => action.actionId === values.actionId))
            actions.push(values);
        },
        updateAction: async (actionId, values) => {
          const action = actions.find(item => item.actionId === actionId);
          if (action) Object.assign(action, values);
        },
        findCallback: async input =>
          callbacks.find(
            callback =>
              callback.adapterNamespace === input.adapterNamespace &&
              ((input.providerEventId &&
                callback.providerEventId === input.providerEventId) ||
                (input.replayKey && callback.replayKey === input.replayKey))
          ) ?? null,
        insertCallback: async values => {
          if (
            callbacks.some(
              callback =>
                callback.adapterNamespace === values.adapterNamespace &&
                (callback.providerEventId === values.providerEventId ||
                  callback.replayKey === values.replayKey)
            )
          )
            return false;
          callbacks.push(values);
          return true;
        },
        insertJob: async values => {
          const row = {
            ...values,
            status: values.status ?? "queued",
            attempt: values.attempt ?? 1,
            maxAttempts: values.maxAttempts ?? 1,
            fencingVersion: values.fencingVersion ?? 0,
            createdAt: values.createdAt ?? new Date(),
            timeoutSeconds: values.timeoutSeconds ?? 3600,
          };
          if (
            [...jobs.values()].some(
              job =>
                job.tenantId === row.tenantId &&
                job.idempotencyKey &&
                job.idempotencyKey === row.idempotencyKey
            )
          )
            return null;
          if (
            row.activeDedupeKey &&
            [...jobs.values()].some(
              job =>
                job.tenantId === row.tenantId &&
                job.activeDedupeKey === row.activeDedupeKey &&
                ["pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external", "retry_scheduled", "uploading", "publishing", "indexing"].includes(job.status)
            )
          )
            return null;
          jobs.set(String(row.id), row);
          return row;
        },
        updateJob: async input => {
          const row = jobs.get(input.jobId);
          if (!row || row.status !== input.expectedStatus) return null;
          if (
            input.expectedAttempt !== undefined &&
            row.attempt !== input.expectedAttempt
          )
            return null;
          if (
            input.expectedLeaseHash !== undefined &&
            row.leaseOwnerToken !== input.expectedLeaseHash
          )
            return null;
          if (
            input.expectedFencingVersion !== undefined &&
            row.fencingVersion !== input.expectedFencingVersion
          )
            return null;
          if (typeof input.values.status === "string") {
            const terminalRecovery =
              input.allowTerminalRecovery === true &&
              ["failed", "expired"].includes(row.status) &&
              input.values.status === "queued";
            if (!terminalRecovery)
              assertCanonicalJobTransition(row.status, input.values.status);
            transitions.push(`${row.status}->${input.values.status}`);
          }
          Object.assign(row, input.values);
          return row;
        },
        insertAttempt: async values => {
          attempts.push(values);
        },
        updateAttempt: async ({ attemptId, values }) => {
          const attempt = attempts.find(item => item.id === attemptId);
          if (attempt) Object.assign(attempt, values);
        },
        insertSettlement: async values => {
          settlements.push(values);
        },
        insertEvent: async input => {
          events.push(input);
        },
        insertOutbox: async values => {
          outbox.push({ id: `outbox-${outbox.length + 1}`, ...values });
        },
        findOutboxForAttempt: async (jobId, attemptId) =>
          [...outbox]
            .reverse()
            .find(
              item =>
                item.workerJobId === jobId &&
                (!attemptId || item.attemptId === attemptId)
            ) ?? null,
        resetOutbox: async ({ id, nextAttemptAt }) => {
          const item = outbox.find(entry => entry.id === id);
          if (item)
            Object.assign(item, {
              nextAttemptAt,
              cancelledAt: null,
              quarantinedAt: null,
              failedReason: null,
              operatorReviewReason: null,
            });
        },
        cancelUnpublishedOutbox: async ({ jobId, cancelledAt, reason }) => {
          for (const item of outbox) {
            if (
              item.workerJobId === jobId &&
              !item.publishedAt &&
              !item.cancelledAt
            ) {
              item.cancelledAt = cancelledAt;
              item.failedReason = reason;
            }
          }
        },
      }),
  };
  return {
    repository,
    jobs,
    events,
    outbox,
    attempts,
    settlements,
    actions,
    callbacks,
    transitions,
    runnerReceiptLocks,
  };
}

const definition = {
  contractVersion: "feature-186-v1",
  tenantId: "tenant-a",
  requestedByUserId: 1,
  jobType: "test_job",
  executionClass: "short" as const,
  input: { value: 1 },
  idempotencyKey: "same-request",
  retryPolicy: {
    maxAttempts: 2,
    baseDelayMs: 1,
    maxDelayMs: 10,
    jitter: "none" as const,
    deadlineMs: 1000,
    allowedErrorClasses: ["timeout"],
  },
  timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 200 },
};

describe("job control plane", () => {
  it("keeps deferred external runs out of the outbox until a job-bound authorization is persisted", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "external_agent_task",
      idempotencyKey: "deferred-external-run",
      input: { manifest: {}, spec224Run: { runId: "run-a", tenantId: "tenant-a", actorId: 1, workerJobId: "job-a" } },
    }, { deferredAdmission: true, canonicalJobId: "job-a" });
    const job = state.jobs.get(created.jobId)!;
    expect(job.status).toBe("pending");
    expect(state.outbox).toHaveLength(0);

    job.inputJson.manifest.policyBinding = { runnerId: "r", runnerSessionId: "s", capabilitySnapshotId: "c", capabilitySnapshotRevision: "1", authorizationGrantRef: "g", approvalRef: "a", budgetReservationRef: "b", workspaceRef: "w", deadline: new Date(Date.now() + 60_000).toISOString() };
    job.progressJson.spec224Authorization = { status: "READY_FOR_LIVE", binding: job.inputJson.manifest.policyBinding };
    expect(await controlPlane.releaseAuthorizationHold({ jobId: job.id, tenantId: "tenant-a", requestedByUserId: 1 })).toBe(true);
    expect(await controlPlane.releaseAuthorizationHold({ jobId: job.id, tenantId: "tenant-a", requestedByUserId: 1 })).toBe(true);
    expect(job.status).toBe("queued");
    expect(state.outbox).toHaveLength(1);
  });

  it("does not release a deferred external run without persisted authorization", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "external_agent_task",
      idempotencyKey: "deferred-external-no-auth",
      input: { manifest: {}, spec224Run: { runId: "run-b", tenantId: "tenant-a", actorId: 1, workerJobId: "job-b" } },
    }, { deferredAdmission: true, canonicalJobId: "job-b" });
    expect(await controlPlane.releaseAuthorizationHold({ jobId: created.jobId, tenantId: "tenant-a", requestedByUserId: 1 })).toBe(false);
    expect(state.jobs.get(created.jobId)?.status).toBe("pending");
    expect(state.outbox).toHaveLength(0);
  });

  it("keeps idempotency stable when an adaptive deadline changes", async () => {
    const { computeJobDefinitionHash } = await import("../jobCanonicalization");
    const historicalDefinition = { ...definition, retryPolicy: { ...definition.retryPolicy, deadlineMs: 60 * 60 * 1000 } };
    const existing = {
      definitionHash: computeJobDefinitionHash(historicalDefinition),
      retryPolicyJson: historicalDefinition.retryPolicy,
    } as any;
    const updatedAdaptiveDefinition = {
      ...definition,
      retryPolicy: { ...definition.retryPolicy, deadlineMs: 10 * 60 * 1000, deadlineMode: "adaptive" as const },
    };

    expect(matchesExistingJobDefinitionAfterAdminDeadlineChange(updatedAdaptiveDefinition, existing)).toBe(true);
  });

  it("persists bounded workload deadline defaults on newly created jobs", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const python = await controlPlane.create({
      ...definition,
      jobType: "python.legacy_task",
      retryPolicy: { ...definition.retryPolicy, deadlineMs: 60 * 60 * 1000 },
      idempotencyKey: "python-deadline",
    }, { runtimeType: "python_job_worker" });
    const video = await controlPlane.create({
      ...definition,
      jobType: "media.video_render",
      retryPolicy: { ...definition.retryPolicy, deadlineMs: 2 * 60 * 60 * 1000 },
      idempotencyKey: "video-deadline",
    });

    expect(state.jobs.get(python.jobId)?.retryPolicyJson.deadlineMs).toBe(10 * 60 * 1000);
    expect(state.jobs.get(video.jobId)?.retryPolicyJson.deadlineMs).toBe(60 * 60 * 1000);
  });

  it("returns the persisted deadline basis to workers when they load job context", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      retryPolicy: { ...definition.retryPolicy, deadlineMs: 10 * 60 * 1000 },
      idempotencyKey: "worker-context-deadline",
    });

    await expect(controlPlane.getContext(created.jobId)).resolves.toMatchObject({
      createdAt: expect.any(String),
      retryPolicy: { deadlineMs: 10 * 60 * 1000, deadlineMode: "adaptive" },
    });
  });

  it("deduplicates active work by tenant scope and permits a new job after terminal settlement", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const first = await controlPlane.create({
      ...definition,
      activeDedupeKey: "video-project:10",
      idempotencyKey: "first-request",
    });
    const duplicate = await controlPlane.create({
      ...definition,
      input: { value: 2 },
      activeDedupeKey: "video-project:10",
      idempotencyKey: "second-request",
    });

    expect(duplicate).toEqual({ jobId: first.jobId, created: false });
    expect(state.jobs.size).toBe(1);

    state.jobs.get(first.jobId)!.status = "succeeded";
    const afterTerminal = await controlPlane.create({
      ...definition,
      activeDedupeKey: "video-project:10",
      idempotencyKey: "third-request",
    });

    expect(afterTerminal.created).toBe(true);
    expect(afterTerminal.jobId).not.toBe(first.jobId);
    expect(state.jobs.size).toBe(2);
  });

  it("keeps active dedupe scopes tenant-isolated", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const first = await controlPlane.create({
      ...definition,
      activeDedupeKey: "video-project:10",
    });
    const otherTenant = await controlPlane.create({
      ...definition,
      tenantId: "tenant-b",
      activeDedupeKey: "video-project:10",
      idempotencyKey: "other-tenant-request",
    });

    expect(otherTenant.created).toBe(true);
    expect(otherTenant.jobId).not.toBe(first.jobId);
  });

  it("reads active dedupe status from worker_jobs only within the tenant and user scope", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      activeDedupeKey: "video-project:10",
    });

    await expect(controlPlane.getActiveJobByDedupeKey({
      tenantId: "tenant-a",
      requestedByUserId: 1,
      activeDedupeKey: "video-project:10",
    })).resolves.toMatchObject({ jobId: created.jobId, status: "queued" });
    await expect(controlPlane.getActiveJobByDedupeKey({
      tenantId: "tenant-a",
      requestedByUserId: 2,
      activeDedupeKey: "video-project:10",
    })).resolves.toBeNull();
    await expect(controlPlane.getActiveJobByDedupeKey({
      tenantId: "tenant-b",
      activeDedupeKey: "video-project:10",
    })).resolves.toBeNull();
  });

  it("reads job input, progress, output, and terminal status from the owner-scoped canonical row", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      input: { owner: { projectId: 10 }, value: "input" },
    });
    const job = state.jobs.get(created.jobId)!;
    job.progressJson = { stage: "render", percent: 50 };
    job.outputJson = { result: "done" };
    job.status = "succeeded";

    await expect(controlPlane.getJobSnapshot(created.jobId, { tenantId: "tenant-a", requestedByUserId: 1 }))
      .resolves.toMatchObject({
        jobId: created.jobId,
        status: "succeeded",
        input: { owner: { projectId: 10 }, value: "input" },
        progress: { stage: "render", percent: 50 },
        output: { result: "done" },
      });
    await expect(controlPlane.getJobSnapshot(created.jobId, { tenantId: "tenant-b" }))
      .rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
  });

  it("holds a certified computer-use action for approval and fences the decision", async () => {
    const state = makeRepository();
    const jobId = "job-p213-approval";
    state.jobs.set(jobId, {
      id: jobId,
      tenantId: "tenant-p213",
      requestedByUserId: 109,
      jobType: "computer_use.browser",
      executionClass: "external",
      contractVersion: "feature-186-v1",
      status: "waiting_external",
      attempt: 1,
      maxAttempts: 1,
      fencingVersion: 7,
      inputJson: { payload: { requiresIndependentVerification: true } },
      progressJson: {
        externalWait: {
          operationKey: "computer-use:job-p213-approval:1",
          metadata: {
            commandId: "observe-p213",
            runnerId: "runner-p213",
            runnerSessionId: "session-p213",
            capabilitySnapshotId: "snapshot-p213",
            capabilitySnapshotRevision: "revision-p213",
          },
        },
      },
      operatorReviewRequired: false,
      createdAt: new Date(),
      timeoutSeconds: 600,
    });
    state.attempts.push({
      id: "attempt-p213",
      workerJobId: jobId,
      attempt: 1,
      leaseGeneration: 7,
    });
    const controlPlane = createJobControlPlane(state.repository);
    const semanticState = {
      actionId: "action-p213",
      actionCommandId: "action-command-p213",
      decision: {
        decisionId: "decision-p213",
        selectedCandidateId: "candidate-p213",
      },
      selectedCandidate: { candidateId: "candidate-p213" },
    };

    await expect(
      controlPlane.requestComputerUseApproval(jobId, {
        tenantId: "tenant-p213",
        operationKey: "computer-use:job-p213-approval:1",
        approvalRequestId: "approval-p213",
        runnerId: "runner-p213",
        runnerSessionId: "session-p213",
        capabilitySnapshotId: "snapshot-p213",
        capabilitySnapshotRevision: "revision-p213",
        currentCommandId: "observe-p213",
        actionId: "action-p213",
        semanticState,
      })
    ).resolves.toBe("requested");

    expect(state.jobs.get(jobId)).toMatchObject({
      status: "waiting_external",
      statusReason: "waiting_approval",
    });
    expect(state.events.map(event => event.eventType)).toContain(
      "WAITING_APPROVAL"
    );

    await expect(
      controlPlane.resolveComputerUseApproval({
        jobId,
        tenantId: "tenant-p213",
        operationKey: "computer-use:job-p213-approval:1",
        approvalRequestId: "approval-p213",
        decision: "approved",
        runnerId: "runner-p213",
        adapter: "browser.v1",
        actionId: "action-p213",
        runnerSessionId: "session-p213",
        fencingVersion: 7,
        approverId: 207,
      })
    ).resolves.toBe("resumed");

    expect(state.jobs.get(jobId)).toMatchObject({
      status: "queued",
      statusReason: "approval_approved",
    });
    expect(
      state.events.filter(event => event.eventType === "DISPATCH_REQUESTED")
    ).toHaveLength(1);
    await expect(
      controlPlane.resolveComputerUseApproval({
        jobId,
        tenantId: "tenant-p213",
        operationKey: "computer-use:job-p213-approval:1",
        approvalRequestId: "approval-p213",
        decision: "approved",
        runnerId: "runner-p213",
        adapter: "browser.v1",
        actionId: "action-p213",
        runnerSessionId: "session-p213",
        fencingVersion: 7,
        approverId: 207,
      })
    ).resolves.toBe("duplicate");
  });

  it("denies a certified action without dispatch and ignores conflicting or stale decisions", async () => {
    const state = makeRepository();
    const jobId = "job-p213-deny";
    state.jobs.set(jobId, {
      id: jobId,
      tenantId: "tenant-p213",
      requestedByUserId: 109,
      jobType: "computer_use.browser",
      executionClass: "external",
      contractVersion: "feature-186-v1",
      status: "waiting_external",
      attempt: 1,
      maxAttempts: 1,
      fencingVersion: 8,
      inputJson: { payload: { requiresIndependentVerification: true } },
      progressJson: {
        externalWait: {
          operationKey: "computer-use:job-p213-deny:1",
          metadata: {
            commandId: "observe-deny",
            runnerId: "runner-p213",
            runnerSessionId: "session-p213",
            capabilitySnapshotId: "snapshot-p213",
            capabilitySnapshotRevision: "revision-p213",
          },
        },
      },
      operatorReviewRequired: false,
      createdAt: new Date(),
      timeoutSeconds: 600,
    });
    state.attempts.push({
      id: "attempt-p213-deny",
      workerJobId: jobId,
      attempt: 1,
      leaseGeneration: 8,
    });
    const controlPlane = createJobControlPlane(state.repository);
    await controlPlane.requestComputerUseApproval(jobId, {
      tenantId: "tenant-p213",
      operationKey: "computer-use:job-p213-deny:1",
      approvalRequestId: "approval-deny",
      runnerId: "runner-p213",
      runnerSessionId: "session-p213",
      capabilitySnapshotId: "snapshot-p213",
      capabilitySnapshotRevision: "revision-p213",
      currentCommandId: "observe-deny",
      actionId: "action-deny",
      semanticState: {
        actionId: "action-deny",
        selectedCandidate: { candidateId: "candidate-deny" },
      },
    });

    await expect(
      controlPlane.resolveComputerUseApproval({
        jobId,
        tenantId: "tenant-p213",
        operationKey: "computer-use:job-p213-deny:1",
        approvalRequestId: "approval-deny",
        decision: "rejected",
        runnerId: "runner-p213",
        adapter: "browser.v1",
        actionId: "action-deny",
        runnerSessionId: "session-p213",
        fencingVersion: 8,
        approverId: 207,
      })
    ).resolves.toBe("failed");
    expect(state.jobs.get(jobId)).toMatchObject({
      status: "failed",
      statusReason: "approval_rejected",
      errorCode: "APPROVAL_DENIED",
    });
    expect(state.outbox).toHaveLength(0);
    expect(
      state.events.some(event => event.eventType === "ACTION_DISPATCHED")
    ).toBe(false);
    await expect(
      controlPlane.resolveComputerUseApproval({
        jobId,
        tenantId: "tenant-p213",
        operationKey: "computer-use:job-p213-deny:1",
        approvalRequestId: "approval-deny",
        decision: "approved",
        runnerId: "runner-p213",
        adapter: "browser.v1",
        actionId: "action-deny",
        runnerSessionId: "session-p213",
        fencingVersion: 8,
        approverId: 207,
      })
    ).resolves.toBe("ignored");
  });

  it("omits undefined optional fields from lifecycle event payloads", async () => {
    let inserted: Record<string, unknown> | undefined;
    const query = {
      execute: async (statement: unknown) =>
        String(statement).includes("nextSequence")
          ? [{ nextSequence: "1" }]
          : [],
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          inserted = values;
        },
      }),
    };

    await appendJobEvent(query, {
      workerJobId: "job-1",
      eventType: "RECOVERED",
      eventIdempotencyKey: "recovered:job-1",
      payloadJson: {
        retryDelayMs: undefined,
        nested: { jitter: undefined, kept: true },
      },
    });

    expect(inserted?.payloadJson).toEqual({ nested: { kept: true } });
  });

  it("keeps permanent errors out of retry and unknown errors in operator review", () => {
    expect(classifyJobError({ status: 400, message: "bad request" })).toBe(
      "permanent"
    );
    expect(classifyJobError({ code: "ETIMEDOUT" })).toBe("retryable");
    expect(classifyJobError(new Error("provider response was ambiguous"))).toBe(
      "unknown"
    );
    expect(
      classifyJobError(
        Object.assign(new Error("validated domain failure"), {
          class: "permanent",
        })
      )
    ).toBe("permanent");
  });

  it("creates one canonical job and outbox intent for duplicate creates", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);

    const first = await controlPlane.create(definition);
    const second = await controlPlane.create(definition);

    expect(first.created).toBe(true);
    expect(second).toEqual({ jobId: first.jobId, created: false });
    expect(state.jobs.size).toBe(1);
    expect(state.outbox).toHaveLength(1);
    expect(state.events.map(event => event.eventType)).toEqual([
      "CREATED",
      "QUEUED",
      "DISPATCH_REQUESTED",
    ]);
  });

  it("does not claim a dependent Job before its prerequisite succeeds", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const parent = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const child = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
      input: { orchestration: { dependsOnJobIds: [parent.jobId] } },
    });

    expect(
      await controlPlane.claim({
        jobId: child.jobId,
        runnerId: "runner-child",
        adapter: "test",
      })
    ).toBeNull();
    expect(state.jobs.get(child.jobId).status).toBe("queued");

    const parentLease = await controlPlane.claim({
      jobId: parent.jobId,
      runnerId: "runner-parent",
      adapter: "test",
    });
    await controlPlane.start(parentLease!);
    await controlPlane.complete(parentLease!, { output: { ok: true } });
    expect(state.jobs.get(parent.jobId).status).toBe("succeeded");
    expect(
      await controlPlane.claim({
        jobId: child.jobId,
        runnerId: "runner-child",
        adapter: "test",
      })
    ).toMatchObject({ jobId: child.jobId });
  });

  it("fails a multi-job dependency cycle once so the claim loop cannot stall forever", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const first = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const second = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const independent = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    state.jobs.get(first.jobId).inputJson = {
      orchestration: { dependsOnJobIds: [second.jobId] },
    };
    state.jobs.get(second.jobId).inputJson = {
      orchestration: { dependsOnJobIds: [first.jobId] },
    };

    await expect(controlPlane.claim({
      jobId: first.jobId,
      runnerId: "runner-first",
      adapter: "test",
    })).resolves.toBeNull();
    expect(state.jobs.get(first.jobId)).toMatchObject({
      status: "failed",
      statusReason: "dependency_cycle",
      errorCode: "JOB_DEPENDENCY_BLOCKED",
      operatorReviewRequired: true,
    });
    expect(state.events.filter(event =>
      event.workerJobId === first.jobId && event.eventType === "FAILED"
    )).toHaveLength(1);

    await expect(controlPlane.claim({
      jobId: independent.jobId,
      runnerId: "runner-independent",
      adapter: "test",
    })).resolves.toMatchObject({ jobId: independent.jobId });

    await controlPlane.claim({
      jobId: first.jobId,
      runnerId: "runner-first",
      adapter: "test",
    });
    expect(state.events.filter(event =>
      event.workerJobId === first.jobId && event.eventType === "FAILED"
    )).toHaveLength(1);
  });

  it("detects a dependency cycle through a queued chain, not only a direct self-reference", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const first = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const second = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const third = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    state.jobs.get(first.jobId).inputJson = {
      orchestration: { dependsOnJobIds: [second.jobId] },
    };
    state.jobs.get(second.jobId).inputJson = {
      orchestration: { dependsOnJobIds: [third.jobId] },
    };
    state.jobs.get(third.jobId).inputJson = {
      orchestration: { dependsOnJobIds: [first.jobId] },
    };

    await controlPlane.claim({
      jobId: first.jobId,
      runnerId: "runner-first",
      adapter: "test",
    });
    expect(state.jobs.get(first.jobId)).toMatchObject({
      status: "failed",
      statusReason: "dependency_cycle",
      operatorReviewRequired: true,
    });
  });

  it("keeps oversized dependency scans queued when a cycle cannot be proven within budget", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const chain = await Promise.all(Array.from({ length: 129 }, () =>
      controlPlane.create({ ...definition, idempotencyKey: undefined })
    ));
    for (let index = 0; index < chain.length - 1; index += 1) {
      state.jobs.get(chain[index].jobId).inputJson = {
        orchestration: { dependsOnJobIds: [chain[index + 1].jobId] },
      };
    }

    await controlPlane.claim({
      jobId: chain[0].jobId,
      runnerId: "runner-first",
      adapter: "test",
    });
    expect(state.jobs.get(chain[0].jobId)).toMatchObject({
      status: "queued",
      operatorReviewRequired: false,
    });
    expect(state.events.filter(event =>
      event.workerJobId === chain[0].jobId && event.eventType === "FAILED"
    )).toHaveLength(0);
  });

  it("fails a dependent Job closed when its prerequisite permanently fails", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const parent = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const child = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
      input: { orchestration: { dependsOnJobIds: [parent.jobId] } },
    });

    const parentLease = await controlPlane.claim({
      jobId: parent.jobId,
      runnerId: "runner-parent",
      adapter: "test",
    });
    await controlPlane.start(parentLease!);
    await controlPlane.fail(parentLease!, {
      code: "INVALID_INPUT",
      message: "invalid prerequisite",
      class: "permanent",
    });

    expect(
      await controlPlane.claim({
        jobId: child.jobId,
        runnerId: "runner-child",
        adapter: "test",
      })
    ).toBeNull();
    expect(state.jobs.get(child.jobId)).toMatchObject({
      status: "failed",
      errorCode: "JOB_DEPENDENCY_BLOCKED",
      statusReason: "dependency_failed",
      operatorReviewRequired: true,
    });
    expect(state.events.at(-1)).toMatchObject({
      workerJobId: child.jobId,
      eventType: "FAILED",
    });
  });

  it("rejects a known adapter that does not match the persisted runtime", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition, {
      runtimeType: "python_job_worker",
    });

    await expect(
      controlPlane.claim({
        jobId: created.jobId,
        runnerId: "node-runner",
        adapter: "postgres-direct",
      })
    ).rejects.toMatchObject({ code: "JOB_ADAPTER_RUNTIME_MISMATCH" });
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.events.map(event => event.eventType)).toEqual([
      "CREATED",
      "QUEUED",
      "DISPATCH_REQUESTED",
    ]);
  });

  it("applies bounded per-tenant admission before creating another canonical job", async () => {
    const previousLimit =
      process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
    process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = "8";
    try {
      const state = makeRepository();
      const controlPlane = createJobControlPlane(state.repository);
      for (let index = 0; index < 8; index += 1) {
        await controlPlane.create({
          ...definition,
          idempotencyKey: undefined,
          input: { value: index },
        });
      }

      await expect(
        controlPlane.create({
          ...definition,
          idempotencyKey: undefined,
          input: { value: 8 },
        })
      ).rejects.toMatchObject({ code: "JOB_ADMISSION_BACKPRESSURE" });
      expect(state.jobs).toHaveLength(8);
      expect(state.outbox).toHaveLength(8);
    } finally {
      if (previousLimit === undefined)
        delete process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
      else
        process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = previousLimit;
    }
  });

  it("accepts provider-backed work into the durable queue when execution admission is full", async () => {
    const previousLimit =
      process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
    process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = "1";
    try {
      const state = makeRepository();
      const controlPlane = createJobControlPlane(state.repository);
      const first = await controlPlane.create({
        ...definition,
        idempotencyKey: undefined,
      });
      const second = await controlPlane.create(
        { ...definition, idempotencyKey: undefined, input: { value: 2 } },
        { admissionMode: "durable_queue" }
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(true);
      expect(state.jobs.size).toBe(2);
      expect(state.jobs.get(second.jobId).status).toBe("queued");
      expect(state.outbox).toHaveLength(2);
    } finally {
      if (previousLimit === undefined)
        delete process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
      else
        process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = previousLimit;
    }
  });

  it("holds a queued job and cancels unpublished dispatch before a domain pause", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });

    expect(
      await controlPlane.holdQueued(
        created.jobId,
        "storyboard.pause:run-1",
        "domain_paused"
      )
    ).toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("waiting_external");
    expect(state.outbox[0].cancelledAt).toBeInstanceOf(Date);
    expect(state.events.at(-1)).toMatchObject({
      eventType: "WAITING_EXTERNAL",
    });
    expect(
      await controlPlane.claim({
        jobId: created.jobId,
        runnerId: "late",
        adapter: "postgres-pull",
      })
    ).toBeNull();
    expect(
      await controlPlane.holdQueued(
        created.jobId,
        "storyboard.pause:run-1",
        "domain_paused"
      )
    ).toBe(true);
  });

  it("does not let a second external operation reuse an existing waiting job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });

    expect(
      await controlPlane.holdQueued(created.jobId, "provider:operation-1")
    ).toBe(true);
    expect(
      await controlPlane.holdQueued(created.jobId, "provider:operation-2")
    ).toBe(false);
    expect(
      (state.jobs.get(created.jobId).progressJson as any).externalWait
        .operationKey
    ).toBe("provider:operation-1");
  });

  it("bounds long pause and external event keys without losing idempotency", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const longOperationKey = "operation:" + "x".repeat(190);

    await expect(
      controlPlane.holdQueued(created.jobId, longOperationKey)
    ).resolves.toBe(true);

    const event = state.events.at(-1);
    expect(event.eventIdempotencyKey.length).toBeLessThanOrEqual(200);
    expect(event.eventIdempotencyKey).toContain("sha256");
  });

  it("holds a retry-scheduled job so a due retry cannot race a domain pause", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "timeout",
      message: "retry",
      class: "retryable",
    });

    expect(state.jobs.get(created.jobId).status).toBe("retry_scheduled");
    expect(
      await controlPlane.holdQueued(
        created.jobId,
        "storyboard.pause:run-1",
        "domain_paused"
      )
    ).toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("waiting_external");
    expect(state.outbox.at(-1)?.cancelledAt).toBeInstanceOf(Date);
  });

  it("cancels a queued job, fences claim, and keeps the action repeatable", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });

    await controlPlane.cancel(
      created.jobId,
      "storyboard_cancelled",
      "storyboard-cancel:run-1",
      1,
      {
        tenantId: definition.tenantId,
        requestedByUserId: definition.requestedByUserId,
        authorizationScope: "storyboard",
      }
    );
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(state.outbox[0].cancelledAt).toBeInstanceOf(Date);
    expect(
      state.events.some(event => event.eventType === "CANCEL_REQUESTED")
    ).toBe(true);
    expect(state.events.some(event => event.eventType === "CANCELLED")).toBe(
      true
    );
    await controlPlane.cancel(
      created.jobId,
      "storyboard_cancelled",
      "storyboard-cancel:run-1",
      1,
      {
        tenantId: definition.tenantId,
        requestedByUserId: definition.requestedByUserId,
        authorizationScope: "storyboard",
      }
    );
    expect(
      state.events.filter(event => event.eventType === "CANCELLED")
    ).toHaveLength(1);
  });

  it("rejects idempotency reuse with a different definition", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    await controlPlane.create(definition);

    await expect(
      controlPlane.create({ ...definition, input: { value: 2 } })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("fences stale workers and does not consume a retry for heartbeat", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    expect(lease).not.toBeNull();
    await controlPlane.start(lease!);
    await expect(
      controlPlane.heartbeat({
        ...lease!,
        fencingVersion: lease!.fencingVersion - 1,
      })
    ).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    await controlPlane.heartbeat(lease!);
    expect(state.jobs.get(created.jobId).attempt).toBe(1);
    expect(state.attempts).toHaveLength(1);
  });

  it("fences a reporter whose attempt id does not match the current attempt", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    const staleAttempt = {
      ...lease!,
      attemptId: "00000000-0000-4000-8000-000000000099",
    };

    await expect(controlPlane.heartbeat(staleAttempt)).rejects.toMatchObject({
      code: "JOB_LEASE_STALE",
    });
    await expect(
      controlPlane.progress(staleAttempt, { progress: 10, stage: "work" })
    ).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    await expect(
      controlPlane.complete(staleAttempt, { resultRef: "artifact:stale" })
    ).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    await expect(
      controlPlane.fail(staleAttempt, {
        code: "timeout",
        message: "stale",
        class: "retryable",
      })
    ).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    expect(state.jobs.get(created.jobId).status).toBe("running");
  });

  it("does not allow a late completion after cancellation or fencing", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    state.jobs.get(created.jobId).status = "cancelled";
    await expect(
      controlPlane.complete(lease!, { resultRef: "artifact:1" })
    ).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
  });

  it("increments the business attempt once and prepares a deduplicated retry outbox", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "timeout",
      message: "try again",
      class: "retryable",
    });

    expect(state.jobs.get(created.jobId).status).toBe("retry_scheduled");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
    expect(state.outbox[1].envelopeJson.attemptId).toBe(state.attempts[1].id);
    expect(state.outbox[1].envelopeJson.contractVersion).toBe(
      definition.contractVersion
    );
  });

  it("writes a durable result marker before completing", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.complete(lease!, {
      resultRef: "artifact:1",
      output: { apiKey: "do-not-persist", value: "safe" },
    });
    expect(state.settlements).toHaveLength(1);
    expect(state.jobs.get(created.jobId).status).toBe("succeeded");
    expect(state.jobs.get(created.jobId).outputJson).toEqual({
      apiKey: "[REDACTED]",
      value: "safe",
    });
  });

  it("rejects expiring result URLs and sanitizes error evidence before persistence", async () => {
    expect(() =>
      normalizeResultReference(
        "https://storage.example/result?X-Amz-Signature=secret"
      )
    ).toThrowError(expect.objectContaining({ code: "JOB_RESULT_INVALID" }));
    expect(
      sanitizeJobErrorMessage("provider apiKey=secret\nBearer abc123")
    ).toBe("provider apiKey=[REDACTED] Bearer [REDACTED]");

    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "provider_error",
      message: "provider apiKey=secret\nBearer abc123",
      class: "permanent",
    });

    expect(state.jobs.get(created.jobId).errorMessage).toBe(
      "provider apiKey=[REDACTED] Bearer [REDACTED]"
    );
    expect(state.jobs.get(created.jobId).errorMessage).not.toContain("secret");
    expect(state.jobs.get(created.jobId).errorMessage).not.toContain("abc123");
  });

  it("redacts legacy error evidence at the status API boundary", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    state.jobs.get(created.jobId).errorMessage =
      "Bearer legacy-secret\napiKey=another-secret";

    const status = await controlPlane.getStatus(created.jobId, {
      tenantId: definition.tenantId,
    });

    expect(status?.errorMessage).toBe("Bearer [REDACTED] apiKey=[REDACTED]");
    expect(status?.errorMessage).not.toContain("legacy-secret");
    expect(status?.errorMessage).not.toContain("another-secret");
  });

  it("fences and records a hard timeout instead of leaving a running row", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    state.jobs.get(created.jobId).createdAt = new Date(Date.now() - 10_000);
    state.jobs.get(created.jobId).startedAt = new Date(Date.now() - 10_000);
    state.jobs.get(created.jobId).timeoutSeconds = 1;
    state.jobs.get(created.jobId).timeoutPolicyJson = {
      softTimeoutMs: 100,
      hardTimeoutMs: 1,
    };
    await expect(controlPlane.heartbeat(lease!)).rejects.toMatchObject({
      code: "JOB_TIMEOUT",
    });
    expect(state.jobs.get(created.jobId).status).toBe("expired");
    expect(state.events.map(event => event.eventType)).toContain("TIMEOUT");
  });

  it("does not count queue time against the execution hard timeout", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
      timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 60_000 },
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    state.jobs.get(created.jobId).createdAt = new Date(Date.now() - 120_000);
    await expect(controlPlane.heartbeat(lease!)).resolves.toBeUndefined();
  });

  it("records cancellation request before final cancellation and keeps action idempotent", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    await controlPlane.cancel(
      created.jobId,
      "operator_requested",
      "00000000-0000-4000-8000-000000000001",
      7
    );
    await controlPlane.cancel(
      created.jobId,
      "operator_requested",
      "00000000-0000-4000-8000-000000000001",
      7
    );

    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(state.events.map(event => event.eventType)).toContain(
      "CANCEL_REQUESTED"
    );
    expect(state.events.map(event => event.eventType)).toContain("CANCELLED");
    expect(
      state.events.filter(event => event.eventType === "CANCELLED")
    ).toHaveLength(1);
    expect(state.outbox[0].cancelledAt).toBeInstanceOf(Date);
    expect(state.actions).toHaveLength(1);
  });

  it("reconciles a durable cancellation request after finalization is interrupted", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    await controlPlane.requestCancel(created.jobId, "publisher_shutdown");
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    await expect(
      controlPlane.reconcileCancellationRequest(created.jobId)
    ).resolves.toBe("finalized");
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(
      state.events.filter(event => event.eventType === "CANCELLED")
    ).toHaveLength(1);
  });

  it("keeps an external cancellation pending until its exact dispatched Runner ACK is persisted", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    state.jobs.get(created.jobId).inputJson = {
      spec224Run: { runId: "run-cancel-1", tenantId: definition.tenantId, actorId: definition.requestedByUserId },
    };
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "runner-operation-1",
      resumeAfter: "9999-12-31T00:00:00.000Z",
      metadata: {
        commandId: "execute-1", runnerId: "runner-a", runnerSessionId: "session-a",
        leaseId: "lease-a", fenceVersion: lease!.fencingVersion,
        capabilitySnapshotId: "capability-semantic-a", capabilitySnapshotRevision: "revision-a",
        commandTemplate: {
          commandId: "execute-1", commandType: "execute", tenantId: definition.tenantId,
          leaseId: "lease-a", fenceVersion: lease!.fencingVersion, runnerId: "runner-a",
          runnerSessionId: "session-a", capabilitySnapshotId: "capability-semantic-a",
          capabilitySnapshotRevision: "revision-a", controlPlaneOrigin: "https://control.example",
          executionKind: "external_agent_task", adapterId: "codex.v1", deadline: "9999-12-31T00:00:00.000Z",
          authEvidenceRef: "grant-ref", inputRef: "input-ref",
        },
      },
    });

    await expect(controlPlane.requestCancel(created.jobId, "owner_cancelled")).resolves.toBe(true);
    const pendingJob = state.jobs.get(created.jobId);
    const intent = state.events.find(event => event.eventType === "RUNNER_CANCEL_INTENT")!;
    expect(pendingJob.status).toBe("waiting_external");
    expect(pendingJob.fencingVersion).toBe(lease!.fencingVersion);
    expect((intent.payloadJson as any).command.leaseId).toBe("lease-a");
    await expect(controlPlane.reconcileCancellationRequest(created.jobId)).resolves.toBe("pending");

    const intentPayload = intent.payloadJson as any;
    state.events.push({
      workerJobId: created.jobId, eventType: "RUNNER_CANCEL_DISPATCHED",
      eventIdempotencyKey: `runner-cancel:${intentPayload.operationId}:dispatched`, payloadJson: {},
    } as any);
    const receiptBase = {
      jobId: created.jobId, commandId: intentPayload.command.commandId,
      runnerId: "runner-a", runnerSessionId: "session-a", tenantId: definition.tenantId,
      payload: {
        cancellationOperationId: intentPayload.operationId,
        targetCommandId: "execute-1", attempt: 1, leaseId: "lease-a",
        fenceVersion: lease!.fencingVersion, capabilitySnapshotId: "capability-semantic-a",
        capabilitySnapshotRevision: "revision-a",
      },
    };
    await expect(controlPlane.recordRunnerReceipt({
      ...receiptBase, eventId: "cancel-event-1", eventType: "COMMAND_RECEIVED", sequence: 1,
      payload: { ...receiptBase.payload, status: "received" },
    })).resolves.toBe("recorded");
    await expect(controlPlane.recordRunnerReceipt({
      ...receiptBase, eventId: "cancel-event-2", eventType: "COMMAND_ACCEPTED", sequence: 2,
      payload: { ...receiptBase.payload, status: "accepted" },
    })).resolves.toBe("recorded");
    const receipt = {
      ...receiptBase, eventId: "cancel-event-3", eventType: "CANCEL_ACKNOWLEDGED", sequence: 3,
      payload: { ...receiptBase.payload, status: "cancelled" },
    };
    await expect(controlPlane.recordRunnerReceipt(receipt)).resolves.toBe("recorded");
    await expect(controlPlane.recordRunnerReceipt(receipt)).resolves.toBe("duplicate");
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(state.events.filter(event => event.eventType === "CANCELLED")).toHaveLength(1);
    expect(state.events.filter(event => event.eventType === "RUNNER_CANCEL_ACKNOWLEDGED")).toHaveLength(1);
    expect(state.events.filter(event => event.eventType === "SPEC224_CONTINUATION_PENDING")).toHaveLength(1);
  });

  it("fails closed to operator review when a cancellation receipt reports an unknown outcome", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "runner-operation-unknown",
      resumeAfter: "9999-12-31T00:00:00.000Z",
      metadata: {
        commandId: "execute-unknown", runnerId: "runner-a", runnerSessionId: "session-a",
        leaseId: "lease-a", fenceVersion: lease!.fencingVersion,
        capabilitySnapshotId: "capability-semantic-a", capabilitySnapshotRevision: "revision-a",
        commandTemplate: {
          commandId: "execute-unknown", commandType: "execute", tenantId: definition.tenantId,
          leaseId: "lease-a", fenceVersion: lease!.fencingVersion, runnerId: "runner-a",
          runnerSessionId: "session-a", capabilitySnapshotId: "capability-semantic-a",
          capabilitySnapshotRevision: "revision-a", controlPlaneOrigin: "https://control.example",
          executionKind: "external_agent_task", adapterId: "codex.v1", deadline: "9999-12-31T00:00:00.000Z",
          authEvidenceRef: "grant-ref", inputRef: "input-ref",
        },
      },
    });
    await controlPlane.requestCancel(created.jobId, "owner_cancelled");
    const intent = state.events.find(event => event.eventType === "RUNNER_CANCEL_INTENT")!;
    const intentPayload = intent.payloadJson as any;
    state.events.push({
      workerJobId: created.jobId, eventType: "RUNNER_CANCEL_DISPATCHED",
      eventIdempotencyKey: `runner-cancel:${intentPayload.operationId}:dispatched`, payloadJson: {},
    } as any);
    const receipt = {
      jobId: created.jobId, commandId: intentPayload.command.commandId,
      eventId: "cancel-unknown-1", eventType: "UNKNOWN_OUTCOME", sequence: 1,
      runnerId: "runner-a", runnerSessionId: "session-a", tenantId: definition.tenantId,
      payload: {
        status: "unknown", cancellationOperationId: intentPayload.operationId,
        targetCommandId: "execute-unknown", leaseId: "lease-a", fenceVersion: lease!.fencingVersion,
        capabilitySnapshotId: "capability-semantic-a", capabilitySnapshotRevision: "revision-a",
      },
    };
    await expect(controlPlane.recordRunnerReceipt(receipt)).resolves.toBe("recorded");
    await expect(controlPlane.recordRunnerReceipt(receipt)).resolves.toBe("duplicate");
    expect(state.jobs.get(created.jobId).status).toBe("failed");
    expect(state.jobs.get(created.jobId).operatorReviewRequired).toBe(true);
    expect(state.events.filter(event => event.eventType === "CANCELLED")).toHaveLength(0);
    expect(state.events.filter(event => event.eventType === "RUNNER_CANCELLATION_REVIEW_REQUIRED")).toHaveLength(1);
  });

  it("treats an already-recorded cancellation request as an idempotent cancel", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    state.jobs.get(created.jobId).status = "queued";
    state.jobs.get(created.jobId).statusReason =
      "cancel_requested:storyboard_cancelled";

    await expect(
      controlPlane.cancel(created.jobId, "storyboard_cancelled")
    ).resolves.toBeUndefined();
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(
      state.events.filter(event => event.eventType === "CANCELLED")
    ).toHaveLength(1);
  });

  it("does not surface a cancellation race when another actor already finalized the job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    state.jobs.get(created.jobId).status = "succeeded";

    await expect(
      controlPlane.cancel(created.jobId, "storyboard_cancelled")
    ).resolves.toBeUndefined();
  });

  it("does not auto-dispatch an operator-review retry, but requeues it with the same outbox", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "timeout",
      message: "review",
      class: "retryable",
      operatorReviewRequired: true,
    });
    const job = state.jobs.get(created.jobId);
    const retryOutbox = state.outbox[1];
    retryOutbox.quarantinedAt = new Date();
    expect(await controlPlane.makeRetryDue(created.jobId)).toBe(false);
    expect(
      await controlPlane.makeRetryDue(
        created.jobId,
        "00000000-0000-4000-8000-000000000003",
        9,
        "operator reviewed provider timeout"
      )
    ).toBe(true);
    expect(job.status).toBe("queued");
    expect(job.operatorReviewRequired).toBe(false);
    expect(job.operatorReviewReason).toBeNull();
    expect(state.outbox).toHaveLength(2);
    expect(retryOutbox.quarantinedAt).toBeNull();
    const operatorAction = state.events.find(
      event => event.eventType === "OPERATOR_ACTION"
    );
    expect(operatorAction?.payloadJson).toMatchObject({
      action: "requeue",
      reason: "operator reviewed provider timeout",
    });
  });

  it("recovers a quarantined adapter-contract dispatch only through an audited admin requeue", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const job = state.jobs.get(created.jobId);
    const outbox = state.outbox[0];
    job.operatorReviewRequired = true;
    job.operatorReviewReason = "adapter_contract_unsupported";
    outbox.quarantinedAt = new Date();
    outbox.operatorReviewReason = "adapter_contract_unsupported";

    expect(await controlPlane.makeRetryDue(created.jobId)).toBe(false);
    expect(
      await controlPlane.makeRetryDue(
        created.jobId,
        "00000000-0000-4000-8000-000000000005",
        9,
        "deployed adapter contract admission fix"
      )
    ).toBe(true);

    expect(job.status).toBe("queued");
    expect(job.operatorReviewRequired).toBe(false);
    expect(state.outbox).toHaveLength(1);
    expect(outbox.quarantinedAt).toBeNull();
    expect(state.events.at(-1)).toMatchObject({ eventType: "RECOVERED" });
  });

  it("does not requeue a cancellation request as normal work", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "timeout",
      message: "retry",
      class: "retryable",
    });
    await controlPlane.requestCancel(created.jobId, "account_move");
    expect(await controlPlane.makeRetryDue(created.jobId)).toBe(false);
    expect(state.jobs.get(created.jobId).status).toBe("retry_scheduled");
    await controlPlane.reconcileCancellationRequest(created.jobId);
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
  });

  it("supports an audited, idempotent operator force-fail action", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    await controlPlane.forceFail(
      created.jobId,
      "manual recovery decision",
      "00000000-0000-4000-8000-000000000002",
      8
    );
    await controlPlane.forceFail(
      created.jobId,
      "manual recovery decision",
      "00000000-0000-4000-8000-000000000002",
      8
    );

    expect(state.jobs.get(created.jobId).status).toBe("failed");
    expect(state.jobs.get(created.jobId).operatorReviewRequired).toBe(true);
    expect(
      state.events.filter(event => event.eventType === "OPERATOR_ACTION")
    ).toHaveLength(1);
    expect(state.actions[0].outcomeJson).toMatchObject({
      accepted: true,
      phase: "force_failed",
    });
  });

  it("rejects unsafe direct action identifiers before mutating the job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });

    await expect(
      controlPlane.forceFail(
        created.jobId,
        "operator decision",
        "bad action\nid",
        8
      )
    ).rejects.toMatchObject({ code: "JOB_ACTION_INVALID" });
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.actions).toHaveLength(0);
  });

  it("recovers an evidence-backed story checkpoint as one new canonical attempt", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "vertical_drama.story",
      requestedByUserId: 8,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "story-runner",
      adapter: "postgres-pull",
    });
    await controlPlane.start(lease!);
    await controlPlane.forceFail(
      created.jobId,
      "provider outcome requires checkpoint review",
      "story-force-fail",
      8
    );

    const evidence = {
      checkpointDigest: "a".repeat(64),
      completedEpisodeCount: 3,
    };
    await expect(
      controlPlane.recoverCheckpoint(
        created.jobId,
        "story-checkpoint-recovery-1",
        "story_checkpoint_recovery",
        evidence,
        8,
        {
          tenantId: definition.tenantId,
          requestedByUserId: 8,
          authorizationScope: "storyboard",
        }
      )
    ).resolves.toBe(true);
    await expect(
      controlPlane.recoverCheckpoint(
        created.jobId,
        "story-checkpoint-recovery-1",
        "story_checkpoint_recovery",
        evidence,
        8,
        {
          tenantId: definition.tenantId,
          requestedByUserId: 8,
          authorizationScope: "storyboard",
        }
      )
    ).resolves.toBe(true);

    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
    expect(
      state.events.filter(event => event.eventType === "RECOVERED")
    ).toHaveLength(1);
    expect(
      state.actions.filter(action => action.command === "recover_checkpoint")
    ).toHaveLength(1);
  });

  it("recovers a lease-expired story checkpoint even after automatic attempts are exhausted", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "vertical_drama.story",
      requestedByUserId: 8,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "story-runner",
      adapter: "postgres-pull",
    });
    await controlPlane.start(lease!);

    const job = state.jobs.get(created.jobId);
    job.attempt = job.maxAttempts;
    job.leaseExpiresAt = new Date(Date.now() - 1_000);
    await expect(
      controlPlane.recoverExpiredLease(
        created.jobId,
        new Date(Date.now() + 2_000)
      )
    ).resolves.toBe("recovered");
    expect(job.status).toBe("expired");
    expect(job.errorCode).toBe("LEASE_EXPIRED");

    await expect(
      controlPlane.recoverCheckpoint(
        created.jobId,
        "story-checkpoint-recovery-expired-1",
        "story_checkpoint_recovery",
        { checkpointDigest: "b".repeat(64), completedEpisodeCount: 2 },
        8,
        {
          tenantId: definition.tenantId,
          requestedByUserId: 8,
          authorizationScope: "feature-186:vertical_drama.story:recover",
        }
      )
    ).resolves.toBe(true);

    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(3);
    expect(job.maxAttempts).toBe(3);
    expect(job.errorCode).toBeNull();
    expect(state.outbox).toHaveLength(2);
  });

  it("does not treat a hard-deadline expiry as a resumable lease expiry", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "vertical_drama.story",
      requestedByUserId: 8,
      idempotencyKey: undefined,
    });
    Object.assign(state.jobs.get(created.jobId), {
      status: "expired",
      errorCode: "JOB_DEADLINE_EXPIRED",
      finishedAt: new Date(),
    });

    await expect(
      controlPlane.recoverCheckpoint(
        created.jobId,
        "story-checkpoint-recovery-deadline-1",
        "story_checkpoint_recovery",
        { checkpointDigest: "c".repeat(64), completedEpisodeCount: 2 },
        8,
        {
          tenantId: definition.tenantId,
          requestedByUserId: 8,
          authorizationScope: "feature-186:vertical_drama.story:recover",
        }
      )
    ).resolves.toBe(false);
    expect(state.jobs.get(created.jobId).status).toBe("expired");
    expect(state.outbox).toHaveLength(1);
  });

  it("recovers a review-gated terminal job idempotently on the same canonical id", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "review-runner",
      adapter: "postgres-pull",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "IMAGE_PROVIDER_UNKNOWN",
      message: "Provider outcome requires review",
      class: "unknown",
      operatorReviewRequired: true,
    });

    const scope = {
      tenantId: definition.tenantId,
      requestedByUserId: definition.requestedByUserId,
      authorizationScope: "storyboard" as const,
    };
    await expect(
      controlPlane.recoverReviewGatedJob(
        created.jobId,
        "storyboard-review:one",
        "storyboard_user_repair",
        { disposition: "pre_submission_failure" },
        definition.requestedByUserId,
        scope
      )
    ).resolves.toBe(true);
    await expect(
      controlPlane.recoverReviewGatedJob(
        created.jobId,
        "storyboard-review:one",
        "storyboard_user_repair",
        { disposition: "pre_submission_failure" },
        definition.requestedByUserId,
        scope
      )
    ).resolves.toBe(true);

    const job = state.jobs.get(created.jobId);
    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(2);
    expect(job.operatorReviewRequired).toBe(false);
    expect(job.errorCode).toBeNull();
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
    expect(
      state.events.filter(event => event.eventType === "RECOVERED")
    ).toHaveLength(1);
    expect(
      state.actions.filter(action => action.command === "recover_review")
    ).toHaveLength(1);
  });

  it("does not recover a failed job without an operator review gate", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "review-runner",
      adapter: "postgres-pull",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "INVALID_INPUT",
      message: "Invalid input",
      class: "permanent",
    });

    await expect(
      controlPlane.recoverReviewGatedJob(
        created.jobId,
        "storyboard-review:two",
        "storyboard_user_repair",
        { disposition: "pre_submission_failure" }
      )
    ).resolves.toBe(false);
    expect(state.jobs.get(created.jobId).status).toBe("failed");
    expect(state.outbox).toHaveLength(1);
  });

  it("allows only the exact fixed Remotion runtime failure to recover without a pre-existing review flag", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "remotion_render_video",
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "review-runner",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "render_failed",
      message: "revisionId is not defined",
      class: "permanent",
    });

    await expect(
      controlPlane.recoverReviewGatedJob(
        created.jobId,
        "00000000-0000-4000-8000-000000000005",
        "user_requested_retry",
        {
          disposition: "pre_submission_failure",
          knownRuntime: "remotion_revision_id",
        },
        definition.requestedByUserId,
        {
          tenantId: definition.tenantId,
          requestedByUserId: definition.requestedByUserId,
          authorizationScope: "worker_jobs.user_retry",
        }
      )
    ).resolves.toBe(true);

    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.transitions.slice(-1)).toEqual(["failed->queued"]);
  });

  it("recovers a failed protection capability job on the same canonical id", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "content_protection.protect",
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "protection-runner",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE",
      message: "PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE",
      class: "permanent",
    });

    await expect(
      controlPlane.recoverReviewGatedJob(
        created.jobId,
        "00000000-0000-4000-8000-000000000006",
        "user_requested_retry",
        {
          disposition: "provider_operation_resolved",
          knownRuntime: "content_protection_provider",
        },
        definition.requestedByUserId,
        {
          tenantId: definition.tenantId,
          requestedByUserId: definition.requestedByUserId,
          authorizationScope: "worker_jobs.user_retry",
        }
      )
    ).resolves.toBe(true);

    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.transitions.slice(-1)).toEqual(["failed->queued"]);
  });

  it("recovers an expired protection job after the optional runtime becomes ready", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "content_protection.protect",
      idempotencyKey: undefined,
      retryPolicy: { ...definition.retryPolicy, deadlineMs: 10 },
    });
    state.jobs.get(created.jobId).createdAt = new Date(Date.now() - 1000);
    await expect(
      controlPlane.expireDeadline(created.jobId, new Date())
    ).resolves.toBe("expired");

    await expect(
      controlPlane.recoverReviewGatedJob(
        created.jobId,
        "00000000-0000-4000-8000-000000000007",
        "user_requested_retry",
        {
          disposition: "provider_operation_resolved",
          knownRuntime: "content_protection_provider",
        },
        definition.requestedByUserId,
        {
          tenantId: definition.tenantId,
          requestedByUserId: definition.requestedByUserId,
          authorizationScope: "worker_jobs.user_retry",
        }
      )
    ).resolves.toBe(true);

    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.transitions.slice(-1)).toEqual(["expired->queued"]);
  });

  it("does not expire pre-policy queued backlog during the rollout", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, jobType: "python.legacy_task", idempotencyKey: undefined });
    const job = state.jobs.get(created.jobId);
    job.createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    delete job.retryPolicyJson.deadlineMode;
    job.retryPolicyJson.deadlineMs = 24 * 60 * 60 * 1000;

    await expect(controlPlane.expireDeadline(created.jobId, new Date())).resolves.toBe("ignored");
    expect(job.status).toBe("queued");
    expect(state.transitions).toHaveLength(0);
  });

  it("does not retry a pre-policy lease after deployment", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "legacy-worker", adapter: "postgres-pull" });
    await controlPlane.start(lease!);
    const job = state.jobs.get(created.jobId);
    delete job.retryPolicyJson.deadlineMode;
    job.leaseExpiresAt = new Date(Date.now() - 1000);

    await expect(controlPlane.recoverExpiredLease(created.jobId, new Date())).resolves.toBe("ignored");
    expect(job.status).toBe("running");
    expect(state.events.some(event => event.eventType === "LEASE_EXPIRED")).toBe(false);
  });

  it("rejects reusing an action key for another command or job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    await controlPlane.forceFail(
      created.jobId,
      "manual recovery decision",
      "00000000-0000-4000-8000-000000000004",
      8
    );
    await expect(
      controlPlane.requestCancel(
        created.jobId,
        "different command",
        "00000000-0000-4000-8000-000000000004",
        8
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("records an authenticated callback once without mutating lifecycle state", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const input = {
      adapterNamespace: "provider",
      providerEventId: "event-1",
      occurredAt: new Date().toISOString(),
      tenantId: "tenant-a",
      jobId: created.jobId,
      signatureVerified: true,
      payload: { state: "done" },
    };
    await expect(
      recordAuthenticatedJobCallback(input, state.repository)
    ).resolves.toMatchObject({ disposition: "accepted" });
    await expect(
      recordAuthenticatedJobCallback(input, state.repository)
    ).resolves.toMatchObject({ disposition: "duplicate" });
    expect(state.callbacks).toHaveLength(1);
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(
      state.events.filter(event => event.eventType === "CALLBACK_ACCEPTED")
    ).toHaveLength(1);
  });

  it("treats a callback insert that loses the unique race as duplicate", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const input = {
      adapterNamespace: "provider",
      providerEventId: "race-1",
      occurredAt: new Date().toISOString(),
      tenantId: "tenant-a",
      jobId: created.jobId,
      signatureVerified: true,
      payload: { state: "done" },
    };
    const racingRepository: JobControlPlaneRepository = {
      transaction: async work =>
        state.repository.transaction(repo =>
          work({
            ...repo,
            insertCallback: async () => false,
          })
        ),
    };

    await expect(
      recordAuthenticatedJobCallback(input, racingRepository)
    ).resolves.toMatchObject({ disposition: "duplicate" });
    expect(state.callbacks).toHaveLength(0);
    expect(
      state.events.filter(event => event.eventType === "CALLBACK_ACCEPTED")
    ).toHaveLength(0);
  });

  it("rejects callbacks that provide two replay identities", async () => {
    const state = makeRepository();
    await expect(
      recordAuthenticatedJobCallback(
        {
          adapterNamespace: "provider",
          providerEventId: "event-1",
          replayKey: "replay-1",
          occurredAt: new Date().toISOString(),
          signatureVerified: true,
          payload: { state: "completed" },
        },
        state.repository
      )
    ).rejects.toMatchObject({ code: "CALLBACK_INVALID" });
  });

  it("expires a queued job at the persisted absolute deadline without a worker heartbeat", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
      retryPolicy: { ...definition.retryPolicy, deadlineMs: 10 },
    });
    state.jobs.get(created.jobId).createdAt = new Date(Date.now() - 1000);

    await expect(
      controlPlane.expireDeadline(created.jobId, new Date())
    ).resolves.toBe("expired");
    expect(state.jobs.get(created.jobId).status).toBe("expired");
    expect(state.events.map(event => event.eventType)).toContain("EXPIRED");
  });

  it("leaves legacy jobs with 24-hour deadlines unchanged during rollout", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const job = state.jobs.get(created.jobId);
    job.createdAt = new Date(Date.now() - 11 * 60 * 1000);
    job.retryPolicyJson = { ...job.retryPolicyJson, deadlineMs: 24 * 60 * 60 * 1000 };
    delete job.retryPolicyJson.deadlineMode;

    await expect(controlPlane.expireDeadline(created.jobId, new Date())).resolves.toBe("ignored");
    expect(job.status).toBe("queued");
    expect(job.errorCode).toBeUndefined();
  });

  it("resumes external work through a durable dispatch signal instead of inline claim", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "provider-op-1",
      resumeAfter: new Date(Date.now() + 10_000).toISOString(),
    });

    await expect(
      controlPlane.resumeExternal(created.jobId, "callback", "provider")
    ).resolves.toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.outbox).toHaveLength(2);
    expect(state.outbox[1].envelopeJson.reason).toBe("external_resumed");
    expect(state.attempts).toHaveLength(1);
  });

  it("advances the business attempt when a resumable storyboard pass is repaired", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "storyboard.pause:run-1",
      resumeAfter: "9999-12-31T00:00:00.000Z",
    });

    await expect(
      controlPlane.resumeExternal(
        created.jobId,
        "storyboard-resume",
        "postgres-pull",
        undefined,
        "resume:run-1",
        true
      )
    ).resolves.toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.attempts[0].finishedAt).toBeTruthy();
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[1]).toMatchObject({
      workerJobId: created.jobId,
      attempt: 2,
      recoveryReason: "external_resume_retry",
    });
    expect(state.outbox[state.outbox.length - 1]?.attemptId).toBe(
      state.attempts[1].id
    );
    expect(state.outbox[state.outbox.length - 1]?.envelopeJson).toMatchObject({
      jobId: created.jobId,
      businessAttempt: 2,
      attemptId: state.attempts[1].id,
      reason: "external_resumed",
    });
    await expect(
      controlPlane.resumeExternal(
        created.jobId,
        "storyboard-resume",
        "postgres-pull",
        undefined,
        "resume:run-1",
        true
      )
    ).resolves.toBe(true);
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
  });

  it("persists a cooperative soft-timeout request exactly once", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
      timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    const job = state.jobs.get(created.jobId);
    job.timeoutPolicyJson = { softTimeoutMs: 100, hardTimeoutMs: 1000 };
    job.startedAt = new Date(job.startedAt.getTime() - 1000);

    await expect(
      controlPlane.requestSoftTimeout(created.jobId, new Date())
    ).resolves.toBe("requested");
    await expect(
      controlPlane.requestSoftTimeout(created.jobId, new Date())
    ).resolves.toBe("requested");
    expect(job.status).toBe("running");
    expect(job.statusReason).toBe("soft_timeout_requested");
    expect(
      state.events.filter(event => event.eventType === "TIMEOUT")
    ).toHaveLength(1);
  });

  it("uses deterministic bounded jitter and keeps it below the configured cap", () => {
    const first = calculateRetryDelay(3, 1000, 10_000, "bounded", "job-1");
    expect(first).toBe(
      calculateRetryDelay(3, 1000, 10_000, "bounded", "job-1")
    );
    expect(first).toBeGreaterThanOrEqual(4000);
    expect(first).toBeLessThanOrEqual(10_000);
    expect(calculateRetryDelay(3, 1000, 10_000, "none", "job-1")).toBe(4000);
    expect(calculateRetryDelay(1, 30_000, 900_000, "none", "job-1", [30_000, 120_000, 480_000])).toBe(30_000);
    expect(calculateRetryDelay(2, 30_000, 900_000, "none", "job-1", [30_000, 120_000, 480_000])).toBe(120_000);
    expect(calculateRetryDelay(3, 30_000, 900_000, "none", "job-1", [30_000, 120_000, 480_000])).toBe(480_000);
  });

  it("keeps a Computer Use job non-terminal until independent verification PASS", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "computer_use.browser",
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "runner-command:command-1",
      resumeAfter: "2026-09-20T18:00:00.000Z",
      metadata: { requiresIndependentVerification: true },
    });
    await controlPlane.recordRunnerReceipt({
      jobId: created.jobId,
      commandId: "command-1",
      eventId: "event-execution-completed",
      eventType: "EXECUTION_COMPLETED",
      sequence: 1,
      runnerId: "runner-a",
      runnerSessionId: "session-a",
      tenantId: definition.tenantId,
      payload: {
        resultRef: "result:sha256:runner",
        requiresIndependentVerification: true,
      },
    });
    expect(state.jobs.get(created.jobId).status).toBe("waiting_external");

    await expect(
      controlPlane.markComputerUseVerificationPending(
        created.jobId,
        "runner-command:command-1",
        {
          decisionId: "decision-1",
          actionId: "action-1",
        }
      )
    ).resolves.toBe(true);
    await expect(
      controlPlane.startComputerUseVerification(
        created.jobId,
        "runner-command:command-1",
        "verification-1"
      )
    ).resolves.toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("waiting_external");
    expect(state.events.map(event => event.eventType)).toEqual(
      expect.arrayContaining([
        "RUNNER_EXECUTION_COMPLETED",
        "WAITING_VERIFICATION",
        "VERIFICATION_STARTED",
      ])
    );

    await expect(
      controlPlane.completeComputerUseVerification(
        created.jobId,
        "runner-command:command-1",
        {
          verificationId: "verification-1",
          result: "PASS",
          reasonCode: "EXPECTED_OUTCOME_OBSERVED",
          verificationEvidenceRef: "verification-evidence:sha256:pass",
        }
      )
    ).resolves.toBe("succeeded");
    expect(state.jobs.get(created.jobId).status).toBe("succeeded");
    expect(state.events.at(-2)).toMatchObject({
      eventType: "VERIFICATION_COMPLETED",
    });
    expect(state.events.at(-1)).toMatchObject({ eventType: "COMPLETED" });
  });

  it("fences external-agent receipts to the persisted attempt, lease and fence", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "external_agent_task",
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "external-agent:task-1:plan-1:1",
      providerReference: "runner-command:command-1",
      resumeAfter: "2099-01-01T00:00:00.000Z",
      metadata: {
        commandId: "command-1",
        executionKind: "external_agent_task",
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        capabilitySnapshotId: "snapshot-a",
        capabilitySnapshotRevision: "snapshot-rev-a",
        leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
        fenceVersion: lease!.fencingVersion,
      },
    });
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-stale",
        eventType: "PROGRESS",
        sequence: 1,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: 999,
          leaseId: "stale-lease",
          fenceVersion: 1,
          resultRef: "agent-result:sha256:stale",
        },
      })
    ).resolves.toBe("ignored");
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-current",
        eventType: "PROGRESS",
        sequence: 1,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: state.jobs.get(created.jobId).attempt,
          leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
          fenceVersion: lease!.fencingVersion,
          resultRef: "agent-result:sha256:current",
        },
      })
    ).resolves.toBe("recorded");
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-current",
        eventType: "PROGRESS",
        sequence: 1,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: state.jobs.get(created.jobId).attempt,
          leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
          fenceVersion: lease!.fencingVersion,
          resultRef: "agent-result:sha256:altered",
        },
      })
    ).resolves.toBe("ignored");
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-current",
        eventType: "PROGRESS",
        sequence: 1,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: state.jobs.get(created.jobId).attempt,
          leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
          fenceVersion: lease!.fencingVersion,
          resultRef: "agent-result:sha256:current",
        },
      })
    ).resolves.toBe("duplicate");
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-sequence-2",
        eventType: "PROGRESS",
        sequence: 2,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: state.jobs.get(created.jobId).attempt,
          leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
          fenceVersion: lease!.fencingVersion,
        },
      })
    ).resolves.toBe("recorded");
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-sequence-1-replay",
        eventType: "PROGRESS",
        sequence: 1,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: state.jobs.get(created.jobId).attempt,
          leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
          fenceVersion: lease!.fencingVersion,
        },
      })
    ).resolves.toBe("ignored");
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-terminal",
        eventType: "COMMAND_REJECTED",
        sequence: 3,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: state.jobs.get(created.jobId).attempt,
          leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
          fenceVersion: lease!.fencingVersion,
        },
      })
    ).resolves.toBe("recorded");
    await expect(
      controlPlane.recordRunnerReceipt({
        jobId: created.jobId,
        commandId: "command-1",
        eventId: "event-after-terminal",
        eventType: "PROGRESS",
        sequence: 4,
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        tenantId: definition.tenantId,
        payload: {
          executionKind: "external_agent_task",
          attempt: state.jobs.get(created.jobId).attempt,
          leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
          fenceVersion: lease!.fencingVersion,
        },
      })
    ).resolves.toBe("ignored");
  });

  it("accepts an authenticated current-session recovery report only for the persisted old session and routes it to operator review", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "external_agent_task",
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    const leaseId = `lease:${lease!.jobId}:${lease!.attemptId}`;
    await controlPlane.waitForExternal(lease!, {
      operationKey: "external-agent:task-recovery:plan:1",
      providerReference: "runner-command:command-recovery",
      resumeAfter: "2099-01-01T00:00:00.000Z",
      metadata: {
        commandId: "command-recovery",
        executionKind: "external_agent_task",
        runnerId: "runner-a",
        runnerSessionId: "session-old",
        capabilitySnapshotId: "snapshot-old",
        capabilitySnapshotRevision: "revision-old",
        leaseId,
        fenceVersion: lease!.fencingVersion,
        commandTemplate: { controlPlaneOrigin: "https://control.example" },
      },
    });
    const recoveryReceipt = {
      jobId: created.jobId,
      commandId: "command-recovery",
      eventId: "receipt-command-recovery-unknown",
      eventType: "UNKNOWN_OUTCOME",
      sequence: 4,
      runnerId: "runner-a",
      runnerSessionId: "session-current",
      recoveryReporterSessionId: "session-current",
      controlPlaneOrigin: "https://control.example",
      tenantId: definition.tenantId,
      payload: {
        status: "unknown",
        executionKind: "external_agent_task",
        attempt: state.jobs.get(created.jobId).attempt,
        leaseId,
        fenceVersion: lease!.fencingVersion,
        capabilitySnapshotId: "snapshot-old",
        capabilitySnapshotRevision: "revision-old",
        recoveredFromRunnerSessionId: "session-old",
      },
    };

    await expect(
      controlPlane.recordRunnerReceipt({
        ...recoveryReceipt,
        recoveryReporterSessionId: undefined,
      })
    ).resolves.toBe("ignored");
    await expect(
      controlPlane.recordRunnerReceipt({
        ...recoveryReceipt,
        payload: {
          ...recoveryReceipt.payload,
          recoveredFromRunnerSessionId: "unrelated-old-session",
        },
      })
    ).resolves.toBe("ignored");
    await expect(
      controlPlane.recordRunnerReceipt({
        ...recoveryReceipt,
        payload: {
          ...recoveryReceipt.payload,
          capabilitySnapshotRevision: "stale-revision",
        },
      })
    ).resolves.toBe("ignored");
    await expect(
      controlPlane.recordRunnerReceipt({
        ...recoveryReceipt,
        controlPlaneOrigin: "https://untrusted.example",
      })
    ).resolves.toBe("ignored");
    await expect(controlPlane.recordRunnerReceipt(recoveryReceipt)).resolves.toBe(
      "recorded"
    );
    await expect(
      controlPlane.recordRunnerReceipt({
        ...recoveryReceipt,
        runnerSessionId: "session-current-2",
        recoveryReporterSessionId: "session-current-2",
      })
    ).resolves.toBe("duplicate");

    const durableReceipt = state.events.find(
      event => event.eventType === "RUNNER_UNKNOWN_OUTCOME"
    )!;
    expect(durableReceipt.payloadJson).toMatchObject({
      runnerSessionId: "session-old",
      recoveryReporterSessionId: "session-current",
      recoveredFromRunnerSessionId: "session-old",
    });
    await expect(
      controlPlane.failExternalWait(
        created.jobId,
        "RUNNER_EXTERNAL_AGENT_OUTCOME_UNKNOWN",
        true,
        new Date(),
        "external-agent:task-recovery:plan:1"
      )
    ).resolves.toBe("failed");
    expect(state.jobs.get(created.jobId)).toMatchObject({
      status: "failed",
      operatorReviewRequired: true,
    });
  });

  it("persists a stable Spec 224 continuation intent with a terminal Runner receipt", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      jobType: "external_agent_task",
      idempotencyKey: undefined,
      input: {
        spec224Run: {
          runId: "run-d343",
          tenantId: definition.tenantId,
          actorId: 1,
        },
      },
    });
    const job = state.jobs.get(created.jobId);
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "external-agent:run-d343:plan-1:1",
      resumeAfter: "2099-01-01T00:00:00.000Z",
      metadata: {
        commandId: "command-d343",
        executionKind: "external_agent_task",
        runnerId: "runner-a",
        runnerSessionId: "session-a",
        capabilitySnapshotId: "snapshot-a",
        capabilitySnapshotRevision: "snapshot-rev-a",
        leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
        fenceVersion: lease!.fencingVersion,
      },
    });
    job.progressJson.spec224 = {
      runId: "run-d343",
      tenantId: definition.tenantId,
      actorId: 1,
      workerJobId: created.jobId,
      projectionVersion: 4,
      fencingVersion: lease!.fencingVersion,
    };

    const receipt = {
      jobId: created.jobId,
      commandId: "command-d343",
      eventId: "receipt-d343",
      eventType: "EXECUTION_COMPLETED",
      sequence: 1,
      runnerId: "runner-a",
      runnerSessionId: "session-a",
      tenantId: definition.tenantId,
      payload: {
        attempt: job.attempt,
        leaseId: `lease:${lease!.jobId}:${lease!.attemptId}`,
        fenceVersion: lease!.fencingVersion,
        capabilitySnapshotId: "snapshot-a",
        capabilitySnapshotRevision: "snapshot-rev-a",
      },
    };
    await expect(controlPlane.recordRunnerReceipt(receipt)).resolves.toBe(
      "recorded"
    );
    expect(state.runnerReceiptLocks.at(-1)).toEqual({
      jobId: created.jobId,
      operationKey: "external-agent:run-d343:plan-1:1",
    });
    await expect(controlPlane.recordRunnerReceipt(receipt)).resolves.toBe(
      "duplicate"
    );
    await expect(
      controlPlane.recordRunnerReceipt({
        ...receipt,
        payload: {
          ...receipt.payload,
          resultRef: "altered-result:receipt-d343",
        },
      })
    ).resolves.toBe("ignored");
    const intents = state.events.filter(
      event => event.eventType === "SPEC224_CONTINUATION_PENDING"
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]?.payloadJson).toMatchObject({
      schemaVersion: "spec224.runner-continuation.v1",
      runId: "run-d343",
      workerJobId: created.jobId,
      receiptEventId: "receipt-d343",
      runnerSessionId: "session-a",
      capabilitySnapshotId: "snapshot-a",
    });
    expect(intents[0]?.eventIdempotencyKey).toContain("spec224-continuation");
    expect(
      state.events.filter(
        event => event.eventType === "RUNNER_RECEIPT_CONFLICT"
      )
    ).toHaveLength(1);
  });

  it("does not terminalize on FAIL, REOBSERVE, or INCONCLUSIVE verification", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
    });
    const lease = await controlPlane.claim({
      jobId: created.jobId,
      runnerId: "runner-a",
      adapter: "test",
    });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, {
      operationKey: "runner-command:command-2",
      resumeAfter: "2026-09-20T18:00:00.000Z",
    });
    await controlPlane.markComputerUseVerificationPending(
      created.jobId,
      "runner-command:command-2",
      { decisionId: "decision-2", actionId: "action-2" }
    );
    await controlPlane.startComputerUseVerification(
      created.jobId,
      "runner-command:command-2",
      "verification-2"
    );

    for (const result of ["FAIL", "REOBSERVE", "INCONCLUSIVE"] as const) {
      await expect(
        controlPlane.completeComputerUseVerification(
          created.jobId,
          "runner-command:command-2",
          {
            verificationId: `verification-${result.toLowerCase()}`,
            result,
            reasonCode: `TEST_${result}`,
            verificationEvidenceRef: `verification-evidence:${result.toLowerCase()}`,
          }
        )
      ).resolves.toBe("waiting");
      expect(state.jobs.get(created.jobId).status).toBe("waiting_external");
    }
  });
});
