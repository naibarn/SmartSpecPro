import { describe, expect, it } from "vitest";

import { appendJobEvent, calculateRetryDelay, classifyJobError, createJobControlPlane, normalizeResultReference, recordAuthenticatedJobCallback, sanitizeJobErrorMessage } from "../jobControlPlane";
import type { JobControlPlaneRepository } from "../jobControlPlane";

function makeRepository() {
  const jobs = new Map<string, any>();
  const events: any[] = [];
  const outbox: any[] = [];
  const attempts: any[] = [];
  const settlements: any[] = [];
  const actions: any[] = [];
  const callbacks: any[] = [];
  const repository: JobControlPlaneRepository = {
    transaction: async work => work({
      findJob: async jobId => jobs.get(jobId) ?? null,
      findByIdempotency: async (tenantId, key) => [...jobs.values()].find(job => job.tenantId === tenantId && job.idempotencyKey === key) ?? null,
      lockAdmission: async () => {},
      countActiveJobs: async ({ tenantId, executionClass }) => [...jobs.values()].filter(job =>
        job.tenantId === tenantId
        && job.executionClass === executionClass
        && ["pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external", "retry_scheduled", "uploading", "publishing", "indexing"].includes(job.status),
      ).length,
      countActiveJobsGlobal: async executionClass => [...jobs.values()].filter(job =>
        job.executionClass === executionClass
        && ["pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external", "retry_scheduled", "uploading", "publishing", "indexing"].includes(job.status),
      ).length,
      findAttempt: async (jobId, attempt) => attempts.find(item => item.workerJobId === jobId && item.attempt === attempt) ?? null,
      findEventByIdempotency: async (jobId, key) => events.find(event => event.workerJobId === jobId && event.eventIdempotencyKey === key) ?? null,
      findAction: async actionId => actions.find(action => action.actionId === actionId) ?? null,
      insertAction: async values => {
        if (!actions.some(action => action.actionId === values.actionId)) actions.push(values);
      },
      updateAction: async (actionId, values) => {
        const action = actions.find(item => item.actionId === actionId);
        if (action) Object.assign(action, values);
      },
      findCallback: async input => callbacks.find(callback => callback.adapterNamespace === input.adapterNamespace && ((input.providerEventId && callback.providerEventId === input.providerEventId) || (input.replayKey && callback.replayKey === input.replayKey))) ?? null,
      insertCallback: async values => {
        if (callbacks.some(callback => callback.adapterNamespace === values.adapterNamespace && (callback.providerEventId === values.providerEventId || callback.replayKey === values.replayKey))) return false;
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
        if ([...jobs.values()].some(job => job.tenantId === row.tenantId && job.idempotencyKey && job.idempotencyKey === row.idempotencyKey)) return null;
        jobs.set(String(row.id), row);
        return row;
      },
      updateJob: async input => {
        const row = jobs.get(input.jobId);
        if (!row || row.status !== input.expectedStatus) return null;
        if (input.expectedAttempt !== undefined && row.attempt !== input.expectedAttempt) return null;
        if (input.expectedLeaseHash !== undefined && row.leaseOwnerToken !== input.expectedLeaseHash) return null;
        if (input.expectedFencingVersion !== undefined && row.fencingVersion !== input.expectedFencingVersion) return null;
        Object.assign(row, input.values);
        return row;
      },
      insertAttempt: async values => { attempts.push(values); },
      updateAttempt: async ({ attemptId, values }) => {
        const attempt = attempts.find(item => item.id === attemptId);
        if (attempt) Object.assign(attempt, values);
      },
      insertSettlement: async values => { settlements.push(values); },
      insertEvent: async input => { events.push(input); },
      insertOutbox: async values => { outbox.push({ id: `outbox-${outbox.length + 1}`, ...values }); },
      findOutboxForAttempt: async (jobId, attemptId) => [...outbox].reverse().find(item => item.workerJobId === jobId && (!attemptId || item.attemptId === attemptId)) ?? null,
      resetOutbox: async ({ id, nextAttemptAt }) => {
        const item = outbox.find(entry => entry.id === id);
        if (item) Object.assign(item, { nextAttemptAt, cancelledAt: null, quarantinedAt: null, failedReason: null, operatorReviewReason: null });
      },
      cancelUnpublishedOutbox: async ({ jobId, cancelledAt, reason }) => {
        for (const item of outbox) {
          if (item.workerJobId === jobId && !item.publishedAt && !item.cancelledAt) {
            item.cancelledAt = cancelledAt;
            item.failedReason = reason;
          }
        }
      },
    }),
  };
  return { repository, jobs, events, outbox, attempts, settlements, actions, callbacks };
}

const definition = {
  contractVersion: "feature-186-v1",
  tenantId: "tenant-a",
  requestedByUserId: 1,
  jobType: "test_job",
  executionClass: "short" as const,
  input: { value: 1 },
  idempotencyKey: "same-request",
  retryPolicy: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 10, jitter: "none" as const, deadlineMs: 1000, allowedErrorClasses: ["timeout"] },
  timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 200 },
};

describe("job control plane", () => {
  it("omits undefined optional fields from lifecycle event payloads", async () => {
    let inserted: Record<string, unknown> | undefined;
    const query = {
      execute: async (statement: unknown) => String(statement).includes("nextSequence")
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
      payloadJson: { retryDelayMs: undefined, nested: { jitter: undefined, kept: true } },
    });

    expect(inserted?.payloadJson).toEqual({ nested: { kept: true } });
  });

  it("keeps permanent errors out of retry and unknown errors in operator review", () => {
    expect(classifyJobError({ status: 400, message: "bad request" })).toBe("permanent");
    expect(classifyJobError({ code: "ETIMEDOUT" })).toBe("retryable");
    expect(classifyJobError(new Error("provider response was ambiguous"))).toBe("unknown");
    expect(classifyJobError(Object.assign(new Error("validated domain failure"), { class: "permanent" }))).toBe("permanent");
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
    expect(state.events.map(event => event.eventType)).toEqual(["CREATED", "QUEUED", "DISPATCH_REQUESTED"]);
  });

  it("does not claim a dependent Job before its prerequisite succeeds", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const parent = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const child = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
      input: { orchestration: { dependsOnJobIds: [parent.jobId] } },
    });

    expect(
      await controlPlane.claim({ jobId: child.jobId, runnerId: "runner-child", adapter: "test" })
    ).toBeNull();
    expect(state.jobs.get(child.jobId).status).toBe("queued");

    const parentLease = await controlPlane.claim({ jobId: parent.jobId, runnerId: "runner-parent", adapter: "test" });
    await controlPlane.start(parentLease!);
    await controlPlane.complete(parentLease!, { output: { ok: true } });
    expect(state.jobs.get(parent.jobId).status).toBe("succeeded");
    expect(
      await controlPlane.claim({ jobId: child.jobId, runnerId: "runner-child", adapter: "test" })
    ).toMatchObject({ jobId: child.jobId });
  });

  it("fails a dependent Job closed when its prerequisite permanently fails", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const parent = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const child = await controlPlane.create({
      ...definition,
      idempotencyKey: undefined,
      input: { orchestration: { dependsOnJobIds: [parent.jobId] } },
    });

    const parentLease = await controlPlane.claim({ jobId: parent.jobId, runnerId: "runner-parent", adapter: "test" });
    await controlPlane.start(parentLease!);
    await controlPlane.fail(parentLease!, {
      code: "INVALID_INPUT",
      message: "invalid prerequisite",
      class: "permanent",
    });

    expect(
      await controlPlane.claim({ jobId: child.jobId, runnerId: "runner-child", adapter: "test" })
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
    const created = await controlPlane.create(definition, { runtimeType: "python_job_worker" });

    await expect(controlPlane.claim({
      jobId: created.jobId,
      runnerId: "node-runner",
      adapter: "postgres-direct",
    })).rejects.toMatchObject({ code: "JOB_ADAPTER_RUNTIME_MISMATCH" });
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.events.map(event => event.eventType)).toEqual(["CREATED", "QUEUED", "DISPATCH_REQUESTED"]);
  });

  it("applies bounded per-tenant admission before creating another canonical job", async () => {
    const previousLimit = process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
    process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = "8";
    try {
      const state = makeRepository();
      const controlPlane = createJobControlPlane(state.repository);
      for (let index = 0; index < 8; index += 1) {
        await controlPlane.create({ ...definition, idempotencyKey: undefined, input: { value: index } });
      }

      await expect(controlPlane.create({ ...definition, idempotencyKey: undefined, input: { value: 8 } }))
        .rejects.toMatchObject({ code: "JOB_ADMISSION_BACKPRESSURE" });
      expect(state.jobs).toHaveLength(8);
      expect(state.outbox).toHaveLength(8);
    } finally {
      if (previousLimit === undefined) delete process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
      else process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = previousLimit;
    }
  });

  it("accepts provider-backed work into the durable queue when execution admission is full", async () => {
    const previousLimit = process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
    process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = "1";
    try {
      const state = makeRepository();
      const controlPlane = createJobControlPlane(state.repository);
      const first = await controlPlane.create({ ...definition, idempotencyKey: undefined });
      const second = await controlPlane.create(
        { ...definition, idempotencyKey: undefined, input: { value: 2 } },
        { admissionMode: "durable_queue" },
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(true);
      expect(state.jobs.size).toBe(2);
      expect(state.jobs.get(second.jobId).status).toBe("queued");
      expect(state.outbox).toHaveLength(2);
    } finally {
      if (previousLimit === undefined) delete process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT;
      else process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_SHORT = previousLimit;
    }
  });

  it("holds a queued job and cancels unpublished dispatch before a domain pause", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });

    expect(await controlPlane.holdQueued(created.jobId, "storyboard.pause:run-1", "domain_paused")).toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("waiting_external");
    expect(state.outbox[0].cancelledAt).toBeInstanceOf(Date);
    expect(state.events.at(-1)).toMatchObject({ eventType: "WAITING_EXTERNAL" });
    expect(await controlPlane.claim({ jobId: created.jobId, runnerId: "late", adapter: "postgres-pull" })).toBeNull();
    expect(await controlPlane.holdQueued(created.jobId, "storyboard.pause:run-1", "domain_paused")).toBe(true);
  });

  it("does not let a second external operation reuse an existing waiting job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });

    expect(await controlPlane.holdQueued(created.jobId, "provider:operation-1")).toBe(true);
    expect(await controlPlane.holdQueued(created.jobId, "provider:operation-2")).toBe(false);
    expect((state.jobs.get(created.jobId).progressJson as any).externalWait.operationKey).toBe("provider:operation-1");
  });

  it("bounds long pause and external event keys without losing idempotency", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const longOperationKey = "operation:" + "x".repeat(190);

    await expect(controlPlane.holdQueued(created.jobId, longOperationKey)).resolves.toBe(true);

    const event = state.events.at(-1);
    expect(event.eventIdempotencyKey.length).toBeLessThanOrEqual(200);
    expect(event.eventIdempotencyKey).toContain("sha256");
  });

  it("holds a retry-scheduled job so a due retry cannot race a domain pause", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, { code: "timeout", message: "retry", class: "retryable" });

    expect(state.jobs.get(created.jobId).status).toBe("retry_scheduled");
    expect(await controlPlane.holdQueued(created.jobId, "storyboard.pause:run-1", "domain_paused")).toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("waiting_external");
    expect(state.outbox.at(-1)?.cancelledAt).toBeInstanceOf(Date);
  });

  it("cancels a queued job, fences claim, and keeps the action repeatable", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });

    await controlPlane.cancel(created.jobId, "storyboard_cancelled", "storyboard-cancel:run-1", 1, {
      tenantId: definition.tenantId,
      requestedByUserId: definition.requestedByUserId,
      authorizationScope: "storyboard",
    });
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(state.outbox[0].cancelledAt).toBeInstanceOf(Date);
    expect(state.events.some(event => event.eventType === "CANCEL_REQUESTED")).toBe(true);
    expect(state.events.some(event => event.eventType === "CANCELLED")).toBe(true);
    await controlPlane.cancel(created.jobId, "storyboard_cancelled", "storyboard-cancel:run-1", 1, {
      tenantId: definition.tenantId,
      requestedByUserId: definition.requestedByUserId,
      authorizationScope: "storyboard",
    });
    expect(state.events.filter(event => event.eventType === "CANCELLED")).toHaveLength(1);
  });

  it("rejects idempotency reuse with a different definition", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    await controlPlane.create(definition);

    await expect(controlPlane.create({ ...definition, input: { value: 2 } })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("fences stale workers and does not consume a retry for heartbeat", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    expect(lease).not.toBeNull();
    await controlPlane.start(lease!);
    await expect(controlPlane.heartbeat({ ...lease!, fencingVersion: lease!.fencingVersion - 1 })).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    await controlPlane.heartbeat(lease!);
    expect(state.jobs.get(created.jobId).attempt).toBe(1);
    expect(state.attempts).toHaveLength(1);
  });

  it("fences a reporter whose attempt id does not match the current attempt", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    const staleAttempt = { ...lease!, attemptId: "00000000-0000-4000-8000-000000000099" };

    await expect(controlPlane.heartbeat(staleAttempt)).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    await expect(controlPlane.progress(staleAttempt, { progress: 10, stage: "work" })).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    await expect(controlPlane.complete(staleAttempt, { resultRef: "artifact:stale" })).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    await expect(controlPlane.fail(staleAttempt, { code: "timeout", message: "stale", class: "retryable" })).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
    expect(state.jobs.get(created.jobId).status).toBe("running");
  });

  it("does not allow a late completion after cancellation or fencing", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    state.jobs.get(created.jobId).status = "cancelled";
    await expect(controlPlane.complete(lease!, { resultRef: "artifact:1" })).rejects.toMatchObject({ code: "JOB_LEASE_STALE" });
  });

  it("increments the business attempt once and prepares a deduplicated retry outbox", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, { code: "timeout", message: "try again", class: "retryable" });

    expect(state.jobs.get(created.jobId).status).toBe("retry_scheduled");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
    expect(state.outbox[1].envelopeJson.attemptId).toBe(state.attempts[1].id);
    expect(state.outbox[1].envelopeJson.contractVersion).toBe(definition.contractVersion);
  });

  it("writes a durable result marker before completing", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.complete(lease!, { resultRef: "artifact:1", output: { apiKey: "do-not-persist", value: "safe" } });
    expect(state.settlements).toHaveLength(1);
    expect(state.jobs.get(created.jobId).status).toBe("succeeded");
    expect(state.jobs.get(created.jobId).outputJson).toEqual({ apiKey: "[REDACTED]", value: "safe" });
  });

  it("rejects expiring result URLs and sanitizes error evidence before persistence", async () => {
    expect(() => normalizeResultReference("https://storage.example/result?X-Amz-Signature=secret")).toThrowError(
      expect.objectContaining({ code: "JOB_RESULT_INVALID" }),
    );
    expect(sanitizeJobErrorMessage("provider apiKey=secret\nBearer abc123")).toBe("provider apiKey=[REDACTED] Bearer [REDACTED]");

    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, { code: "provider_error", message: "provider apiKey=secret\nBearer abc123", class: "permanent" });

    expect(state.jobs.get(created.jobId).errorMessage).toBe("provider apiKey=[REDACTED] Bearer [REDACTED]");
    expect(state.jobs.get(created.jobId).errorMessage).not.toContain("secret");
    expect(state.jobs.get(created.jobId).errorMessage).not.toContain("abc123");
  });

  it("redacts legacy error evidence at the status API boundary", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    state.jobs.get(created.jobId).errorMessage = "Bearer legacy-secret\napiKey=another-secret";

    const status = await controlPlane.getStatus(created.jobId, { tenantId: definition.tenantId });

    expect(status?.errorMessage).toBe("Bearer [REDACTED] apiKey=[REDACTED]");
    expect(status?.errorMessage).not.toContain("legacy-secret");
    expect(status?.errorMessage).not.toContain("another-secret");
  });

  it("fences and records a hard timeout instead of leaving a running row", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    state.jobs.get(created.jobId).createdAt = new Date(Date.now() - 10_000);
    state.jobs.get(created.jobId).startedAt = new Date(Date.now() - 10_000);
    state.jobs.get(created.jobId).timeoutSeconds = 1;
    state.jobs.get(created.jobId).timeoutPolicyJson = { softTimeoutMs: 100, hardTimeoutMs: 1 };
    await expect(controlPlane.heartbeat(lease!)).rejects.toMatchObject({ code: "JOB_TIMEOUT" });
    expect(state.jobs.get(created.jobId).status).toBe("expired");
    expect(state.events.map(event => event.eventType)).toContain("TIMEOUT");
  });

  it("does not count queue time against the execution hard timeout", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined, timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 60_000 } });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    state.jobs.get(created.jobId).createdAt = new Date(Date.now() - 120_000);
    await expect(controlPlane.heartbeat(lease!)).resolves.toBeUndefined();
  });

  it("records cancellation request before final cancellation and keeps action idempotent", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    await controlPlane.cancel(created.jobId, "operator_requested", "00000000-0000-4000-8000-000000000001", 7);
    await controlPlane.cancel(created.jobId, "operator_requested", "00000000-0000-4000-8000-000000000001", 7);

    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(state.events.map(event => event.eventType)).toContain("CANCEL_REQUESTED");
    expect(state.events.map(event => event.eventType)).toContain("CANCELLED");
    expect(state.events.filter(event => event.eventType === "CANCELLED")).toHaveLength(1);
    expect(state.outbox[0].cancelledAt).toBeInstanceOf(Date);
    expect(state.actions).toHaveLength(1);
  });

  it("reconciles a durable cancellation request after finalization is interrupted", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    await controlPlane.requestCancel(created.jobId, "publisher_shutdown");
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    await expect(controlPlane.reconcileCancellationRequest(created.jobId)).resolves.toBe("finalized");
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(state.events.filter(event => event.eventType === "CANCELLED")).toHaveLength(1);
  });

  it("treats an already-recorded cancellation request as an idempotent cancel", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    state.jobs.get(created.jobId).status = "queued";
    state.jobs.get(created.jobId).statusReason = "cancel_requested:storyboard_cancelled";

    await expect(controlPlane.cancel(created.jobId, "storyboard_cancelled")).resolves.toBeUndefined();
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
    expect(state.events.filter(event => event.eventType === "CANCELLED")).toHaveLength(1);
  });

  it("does not surface a cancellation race when another actor already finalized the job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    state.jobs.get(created.jobId).status = "succeeded";

    await expect(controlPlane.cancel(created.jobId, "storyboard_cancelled")).resolves.toBeUndefined();
  });

  it("does not auto-dispatch an operator-review retry, but requeues it with the same outbox", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, { code: "timeout", message: "review", class: "retryable", operatorReviewRequired: true });
    const job = state.jobs.get(created.jobId);
    const retryOutbox = state.outbox[1];
    retryOutbox.quarantinedAt = new Date();
    expect(await controlPlane.makeRetryDue(created.jobId)).toBe(false);
    expect(await controlPlane.makeRetryDue(created.jobId, "00000000-0000-4000-8000-000000000003", 9, "operator reviewed provider timeout")).toBe(true);
    expect(job.status).toBe("queued");
    expect(job.operatorReviewRequired).toBe(false);
    expect(job.operatorReviewReason).toBeNull();
    expect(state.outbox).toHaveLength(2);
    expect(retryOutbox.quarantinedAt).toBeNull();
    const operatorAction = state.events.find(event => event.eventType === "OPERATOR_ACTION");
    expect(operatorAction?.payloadJson).toMatchObject({ action: "requeue", reason: "operator reviewed provider timeout" });
  });

  it("does not requeue a cancellation request as normal work", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create(definition);
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, { code: "timeout", message: "retry", class: "retryable" });
    await controlPlane.requestCancel(created.jobId, "account_move");
    expect(await controlPlane.makeRetryDue(created.jobId)).toBe(false);
    expect(state.jobs.get(created.jobId).status).toBe("retry_scheduled");
    await controlPlane.reconcileCancellationRequest(created.jobId);
    expect(state.jobs.get(created.jobId).status).toBe("cancelled");
  });

  it("supports an audited, idempotent operator force-fail action", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    await controlPlane.forceFail(created.jobId, "manual recovery decision", "00000000-0000-4000-8000-000000000002", 8);
    await controlPlane.forceFail(created.jobId, "manual recovery decision", "00000000-0000-4000-8000-000000000002", 8);

    expect(state.jobs.get(created.jobId).status).toBe("failed");
    expect(state.jobs.get(created.jobId).operatorReviewRequired).toBe(true);
    expect(state.events.filter(event => event.eventType === "OPERATOR_ACTION")).toHaveLength(1);
    expect(state.actions[0].outcomeJson).toMatchObject({ accepted: true, phase: "force_failed" });
  });

  it("rejects unsafe direct action identifiers before mutating the job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });

    await expect(controlPlane.forceFail(created.jobId, "operator decision", "bad action\nid", 8)).rejects.toMatchObject({ code: "JOB_ACTION_INVALID" });
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
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "story-runner", adapter: "postgres-pull" });
    await controlPlane.start(lease!);
    await controlPlane.forceFail(created.jobId, "provider outcome requires checkpoint review", "story-force-fail", 8);

    const evidence = {
      checkpointDigest: "a".repeat(64),
      completedEpisodeCount: 3,
    };
    await expect(controlPlane.recoverCheckpoint(
      created.jobId,
      "story-checkpoint-recovery-1",
      "story_checkpoint_recovery",
      evidence,
      8,
      { tenantId: definition.tenantId, requestedByUserId: 8, authorizationScope: "storyboard" },
    )).resolves.toBe(true);
    await expect(controlPlane.recoverCheckpoint(
      created.jobId,
      "story-checkpoint-recovery-1",
      "story_checkpoint_recovery",
      evidence,
      8,
      { tenantId: definition.tenantId, requestedByUserId: 8, authorizationScope: "storyboard" },
    )).resolves.toBe(true);

    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
    expect(state.events.filter(event => event.eventType === "RECOVERED")).toHaveLength(1);
    expect(state.actions.filter(action => action.command === "recover_checkpoint")).toHaveLength(1);
  });

  it("recovers a review-gated terminal job idempotently on the same canonical id", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "review-runner", adapter: "postgres-pull" });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "IMAGE_PROVIDER_UNKNOWN",
      message: "Provider outcome requires review",
      class: "unknown",
      operatorReviewRequired: true,
    });

    const scope = { tenantId: definition.tenantId, requestedByUserId: definition.requestedByUserId, authorizationScope: "storyboard" as const };
    await expect(controlPlane.recoverReviewGatedJob(
      created.jobId,
      "storyboard-review:one",
      "storyboard_user_repair",
      { disposition: "pre_submission_failure" },
      definition.requestedByUserId,
      scope,
    )).resolves.toBe(true);
    await expect(controlPlane.recoverReviewGatedJob(
      created.jobId,
      "storyboard-review:one",
      "storyboard_user_repair",
      { disposition: "pre_submission_failure" },
      definition.requestedByUserId,
      scope,
    )).resolves.toBe(true);

    const job = state.jobs.get(created.jobId);
    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(2);
    expect(job.operatorReviewRequired).toBe(false);
    expect(job.errorCode).toBeNull();
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
    expect(state.events.filter(event => event.eventType === "RECOVERED")).toHaveLength(1);
    expect(state.actions.filter(action => action.command === "recover_review")).toHaveLength(1);
  });

  it("does not recover a failed job without an operator review gate", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "review-runner", adapter: "postgres-pull" });
    await controlPlane.start(lease!);
    await controlPlane.fail(lease!, {
      code: "INVALID_INPUT",
      message: "Invalid input",
      class: "permanent",
    });

    await expect(controlPlane.recoverReviewGatedJob(
      created.jobId,
      "storyboard-review:two",
      "storyboard_user_repair",
      { disposition: "pre_submission_failure" },
    )).resolves.toBe(false);
    expect(state.jobs.get(created.jobId).status).toBe("failed");
    expect(state.outbox).toHaveLength(1);
  });

  it("rejects reusing an action key for another command or job", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    await controlPlane.forceFail(created.jobId, "manual recovery decision", "00000000-0000-4000-8000-000000000004", 8);
    await expect(controlPlane.requestCancel(created.jobId, "different command", "00000000-0000-4000-8000-000000000004", 8)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("records an authenticated callback once without mutating lifecycle state", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const input = { adapterNamespace: "provider", providerEventId: "event-1", occurredAt: new Date().toISOString(), tenantId: "tenant-a", jobId: created.jobId, signatureVerified: true, payload: { state: "done" } };
    await expect(recordAuthenticatedJobCallback(input, state.repository)).resolves.toMatchObject({ disposition: "accepted" });
    await expect(recordAuthenticatedJobCallback(input, state.repository)).resolves.toMatchObject({ disposition: "duplicate" });
    expect(state.callbacks).toHaveLength(1);
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.events.filter(event => event.eventType === "CALLBACK_ACCEPTED")).toHaveLength(1);
  });

  it("treats a callback insert that loses the unique race as duplicate", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const input = { adapterNamespace: "provider", providerEventId: "race-1", occurredAt: new Date().toISOString(), tenantId: "tenant-a", jobId: created.jobId, signatureVerified: true, payload: { state: "done" } };
    const racingRepository: JobControlPlaneRepository = {
      transaction: async work => state.repository.transaction(repo => work({
        ...repo,
        insertCallback: async () => false,
      })),
    };

    await expect(recordAuthenticatedJobCallback(input, racingRepository)).resolves.toMatchObject({ disposition: "duplicate" });
    expect(state.callbacks).toHaveLength(0);
    expect(state.events.filter(event => event.eventType === "CALLBACK_ACCEPTED")).toHaveLength(0);
  });

  it("rejects callbacks that provide two replay identities", async () => {
    const state = makeRepository();
    await expect(recordAuthenticatedJobCallback({
      adapterNamespace: "provider",
      providerEventId: "event-1",
      replayKey: "replay-1",
      occurredAt: new Date().toISOString(),
      signatureVerified: true,
      payload: { state: "completed" },
    }, state.repository)).rejects.toMatchObject({ code: "CALLBACK_INVALID" });
  });

  it("expires a queued job at the persisted absolute deadline without a worker heartbeat", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined, retryPolicy: { ...definition.retryPolicy, deadlineMs: 10 } });
    state.jobs.get(created.jobId).createdAt = new Date(Date.now() - 1000);

    await expect(controlPlane.expireDeadline(created.jobId, new Date())).resolves.toBe("expired");
    expect(state.jobs.get(created.jobId).status).toBe("expired");
    expect(state.events.map(event => event.eventType)).toContain("EXPIRED");
  });

  it("resumes external work through a durable dispatch signal instead of inline claim", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, { operationKey: "provider-op-1", resumeAfter: new Date(Date.now() + 10_000).toISOString() });

    await expect(controlPlane.resumeExternal(created.jobId, "callback", "provider")).resolves.toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.outbox).toHaveLength(2);
    expect(state.outbox[1].envelopeJson.reason).toBe("external_resumed");
    expect(state.attempts).toHaveLength(1);
  });

  it("advances the business attempt when a resumable storyboard pass is repaired", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.waitForExternal(lease!, { operationKey: "storyboard.pause:run-1", resumeAfter: "9999-12-31T00:00:00.000Z" });

    await expect(controlPlane.resumeExternal(created.jobId, "storyboard-resume", "postgres-pull", undefined, "resume:run-1", true)).resolves.toBe(true);
    expect(state.jobs.get(created.jobId).status).toBe("queued");
    expect(state.jobs.get(created.jobId).attempt).toBe(2);
    expect(state.attempts[0].finishedAt).toBeTruthy();
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[1]).toMatchObject({ workerJobId: created.jobId, attempt: 2, recoveryReason: "external_resume_retry" });
    expect(state.outbox[state.outbox.length - 1]?.attemptId).toBe(state.attempts[1].id);
    expect(state.outbox[state.outbox.length - 1]?.envelopeJson).toMatchObject({ jobId: created.jobId, businessAttempt: 2, attemptId: state.attempts[1].id, reason: "external_resumed" });
    await expect(controlPlane.resumeExternal(created.jobId, "storyboard-resume", "postgres-pull", undefined, "resume:run-1", true)).resolves.toBe(true);
    expect(state.attempts).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
  });

  it("persists a cooperative soft-timeout request exactly once", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined, timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 } });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    const job = state.jobs.get(created.jobId);
    job.timeoutPolicyJson = { softTimeoutMs: 100, hardTimeoutMs: 1000 };
    job.startedAt = new Date(job.startedAt.getTime() - 1000);

    await expect(controlPlane.requestSoftTimeout(created.jobId, new Date())).resolves.toBe("requested");
    await expect(controlPlane.requestSoftTimeout(created.jobId, new Date())).resolves.toBe("requested");
    expect(job.status).toBe("running");
    expect(job.statusReason).toBe("soft_timeout_requested");
    expect(state.events.filter(event => event.eventType === "TIMEOUT")).toHaveLength(1);
  });

  it("uses deterministic bounded jitter and keeps it below the configured cap", () => {
    const first = calculateRetryDelay(3, 1000, 10_000, "bounded", "job-1");
    expect(first).toBe(calculateRetryDelay(3, 1000, 10_000, "bounded", "job-1"));
    expect(first).toBeGreaterThanOrEqual(4000);
    expect(first).toBeLessThanOrEqual(10_000);
    expect(calculateRetryDelay(3, 1000, 10_000, "none", "job-1")).toBe(4000);
  });
});
