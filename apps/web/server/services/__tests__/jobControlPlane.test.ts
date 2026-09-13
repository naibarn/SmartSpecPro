import { describe, expect, it } from "vitest";

import { calculateRetryDelay, createJobControlPlane } from "../jobControlPlane";
import type { JobControlPlaneRepository } from "../jobControlPlane";

function makeRepository() {
  const jobs = new Map<string, any>();
  const events: any[] = [];
  const outbox: any[] = [];
  const attempts: any[] = [];
  const settlements: any[] = [];
  const repository: JobControlPlaneRepository = {
    transaction: async work => work({
      findJob: async jobId => jobs.get(jobId) ?? null,
      findByIdempotency: async (tenantId, key) => [...jobs.values()].find(job => job.tenantId === tenantId && job.idempotencyKey === key) ?? null,
      findAttempt: async (jobId, attempt) => attempts.find(item => item.workerJobId === jobId && item.attempt === attempt) ?? null,
      findEventByIdempotency: async (jobId, key) => events.find(event => event.workerJobId === jobId && event.eventIdempotencyKey === key) ?? null,
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
  return { repository, jobs, events, outbox, attempts, settlements };
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
  });

  it("writes a durable result marker before completing", async () => {
    const state = makeRepository();
    const controlPlane = createJobControlPlane(state.repository);
    const created = await controlPlane.create({ ...definition, idempotencyKey: undefined });
    const lease = await controlPlane.claim({ jobId: created.jobId, runnerId: "runner-a", adapter: "test" });
    await controlPlane.start(lease!);
    await controlPlane.complete(lease!, { resultRef: "artifact:1" });
    expect(state.settlements).toHaveLength(1);
    expect(state.jobs.get(created.jobId).status).toBe("succeeded");
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
