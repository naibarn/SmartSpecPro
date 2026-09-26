import { afterEach, describe, expect, it } from "vitest";

import { executeCanonicalJobEnvelope } from "../../jobs/unifiedJobConsumer";
import {
  createJobControlPlane,
  type JobControlPlaneRepository,
} from "../jobControlPlane";
import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import { DirectJobTransportAdapter } from "../jobDirectTransportAdapter";
import {
  configureExternalAgentTaskDispatcher,
  resetExternalAgentTaskDispatcherForTests,
} from "../externalAgentTaskExecutor";
import { buildDevelopmentRun } from "../spec224DevelopmentRunContracts";
import {
  createDevelopmentRunService,
  createPersistedDevelopmentRun,
  type DevelopmentRunPersistenceAdapter,
  type DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";
import { reconcileAndContinueNextPhase } from "../spec224PhaseController";

/**
 * Deterministic in-memory integration seam only. It validates the canonical
 * worker_jobs admission/dispatch/settlement path without DB or provider creds.
 */
function makeJobRepository() {
  const jobs = new Map<string, any>();
  const events: any[] = [];
  const outbox: any[] = [];
  const attempts: any[] = [];
  const settlements: any[] = [];
  const actions: any[] = [];
  const callbacks: any[] = [];
  const repository: JobControlPlaneRepository = {
    transaction: async work =>
      work({
        findJob: async jobId => jobs.get(jobId) ?? null,
        findByIdempotency: async (tenantId, key) =>
          [...jobs.values()].find(
            job => job.tenantId === tenantId && job.idempotencyKey === key
          ) ?? null,
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
        findEventByIdempotency: async (jobId, key) =>
          events.find(
            event =>
              event.workerJobId === jobId && event.eventIdempotencyKey === key
          ) ?? null,
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
          if (
            !events.some(
              event =>
                event.workerJobId === input.workerJobId &&
                event.eventIdempotencyKey === input.eventIdempotencyKey
            )
          )
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
            )
              Object.assign(item, { cancelledAt, failedReason: reason });
          }
        },
      }),
  };
  return { repository, jobs, events, outbox, attempts, settlements };
}

function memoryDevelopmentRunAdapter(
  jobs: Map<string, any>
): DevelopmentRunPersistenceAdapter {
  let record: DevelopmentRunStoreRecord | null = null;
  return {
    async transaction(work) {
      return work({
        async load(runId, scope) {
          if (
            !record ||
            record.run.runId !== runId ||
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          )
            return null;
          return structuredClone(record);
        },
        async findEvent(runId, idempotencyKey, scope) {
          const current = await this.load(runId, scope);
          return (
            current?.events.find(
              event => event.idempotencyKey === idempotencyKey
            ) ?? null
          );
        },
        async save(next, expectedRevision, scope) {
          if (expectedRevision === -1 && !record) {
            record = structuredClone(next);
            return;
          }
          if (
            !record ||
            record.run.runId !== next.run.runId ||
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          )
            throw new Error("RUN_NOT_FOUND");
          if (record.revision !== expectedRevision)
            throw new Error("RUN_PROJECTION_STALE");
          record = { ...structuredClone(next), revision: expectedRevision + 1 };
        },
        async appendEvent(event) {
          if (!record || record.run.runId !== event.runId)
            throw new Error("RUN_NOT_FOUND");
          const existing = record.events.find(
            item => item.idempotencyKey === event.idempotencyKey
          );
          if (existing) return existing;
          record.events.push(structuredClone(event));
          return event;
        },
        async getCanonicalJob(run, scope) {
          if (!run.workerJobId) return null;
          const job = jobs.get(run.workerJobId);
          if (
            !job ||
            job.tenantId !== scope.tenantId ||
            job.requestedByUserId !== scope.actorId
          )
            return null;
          return {
            status: job.status,
            output: job.outputJson ?? null,
            resultRef: job.resultRef ?? null,
            errorCode: job.errorCode ?? null,
            errorMessage: job.errorMessage ?? null,
            attempt: job.attempt,
          };
        },
      });
    },
  };
}

afterEach(() => {
  resetExternalAgentTaskDispatcherForTests();
});

describe.sequential(
  "Spec 224 mandatory in-memory canonical integration seam",
  () => {
    it("persists, dispatches, settles, reloads, and continues DISCOVERY to PLANNING exactly once", async () => {
      const state = makeJobRepository();
      const controlPlane = createJobControlPlane(state.repository);
      const persistence = memoryDevelopmentRunAdapter(state.jobs);
      const run = buildDevelopmentRun({
        runId: "run-224-integration",
        tenantId: "tenant-224",
        actorId: 224,
        goal: "Prove the bounded canonical integration seam",
        repositoryRef: "repo:smartspecpro",
        baseRevision: "git:integration224",
        contextPackHash: "a".repeat(64),
        workspaceId: "workspace:spec224-integration",
      });
      let dispatches = 0;
      configureExternalAgentTaskDispatcher(async input => {
        dispatches += 1;
        expect(input.manifest).toMatchObject({
          taskId: run.runId,
          tenantId: run.tenantId,
          actorId: run.actorId,
          provider: "codex",
          runtime: "local_runner",
        });
        expect(input.context).toMatchObject({
          tenantId: run.tenantId,
          requestedByUserId: run.actorId,
          jobType: "external_agent_task",
        });
        return {
          resultRef: "evidence:spec224-discovery-success",
          output: { evidenceRefs: ["evidence:phase-pass"] },
        };
      });

      const created = await createPersistedDevelopmentRun({
        run,
        provider: "codex",
        runtime: "local_runner",
        planId: "plan-224-integration",
        planRevision: 1,
        skillIds: [],
        requestedCapabilities: ["workspace.edit"],
        authorizationScope: "spec224.development.run",
        persistence,
        controlPlane,
        executorRegistry: defaultJobExecutorRegistry,
      });
      const job = state.jobs.get(created.jobRef.jobId);
      const outbox = state.outbox[0];
      expect(created.run.workerJobId).toBe(created.jobRef.jobId);
      expect(job).toMatchObject({
        tenantId: run.tenantId,
        requestedByUserId: run.actorId,
        status: "queued",
        jobType: "external_agent_task",
      });

      const transport = new DirectJobTransportAdapter(
        {
          controlPlane,
          executorRegistry: defaultJobExecutorRegistry,
          runnerId: "spec224-integration-runner",
        },
        new Set(["external_agent_task"])
      );
      const request = {
        outboxId: outbox.id,
        jobId: created.jobRef.jobId,
        businessAttempt: 1,
        contractVersion: "feature-186-v1",
        dedupeKey: outbox.dedupeKey,
        routingMetadata: {},
      };
      await transport.publish(request);
      await transport.publish(request);

      expect(dispatches).toBe(1);
      expect(job).toMatchObject({
        status: "succeeded",
        resultRef: "evidence:spec224-discovery-success",
        outputJson: { evidenceRefs: ["evidence:phase-pass"] },
      });
      expect(state.settlements).toHaveLength(1);
      expect(state.events.map(event => event.eventType)).toEqual(
        expect.arrayContaining([
          "CREATED",
          "QUEUED",
          "DISPATCH_REQUESTED",
          "LEASE_ACQUIRED",
          "STARTED",
          "SETTLEMENT_RECORDED",
          "COMPLETED",
        ])
      );

      const firstService = createDevelopmentRunService(persistence);
      const continuation = await reconcileAndContinueNextPhase({
        runId: run.runId,
        tenantId: run.tenantId,
        actorId: run.actorId,
        expectedRevision: 0,
        expectedFencingVersion: created.run.fencingVersion,
        idempotencyKey: "continue:planning:plan-2",
        provider: "codex",
        runtime: "local_runner",
        planId: "plan-224-integration",
        planRevision: 2,
        skillIds: [],
        requestedCapabilities: ["workspace.edit"],
        authorizationScope: "spec224.development.run",
        persistence,
        controlPlane,
        executorRegistry: defaultJobExecutorRegistry,
      });
      const firstReconcile = continuation.reconcile;
      const nextPhase = continuation.continuation;
      if (!nextPhase) throw new Error("SPEC224_CONTINUATION_NOT_CREATED");
      expect(firstReconcile).toMatchObject({
        action: "CONTINUE",
        reason: "phase_succeeded",
      });
      expect(firstReconcile.run.state).toBe("PLANNING");
      expect(firstReconcile.run.events.at(-1)).toMatchObject({
        type: "PHASE_COMPLETED",
        payload: expect.objectContaining({ workerJobId: created.jobRef.jobId }),
      });

      expect(nextPhase).toMatchObject({
        accepted: true,
        run: {
          state: "PLANNING",
          workerJobId: expect.not.stringMatching(created.jobRef.jobId),
        },
      });
      const nextJob = state.jobs.get(nextPhase.jobRef.jobId);
      const nextOutbox = state.outbox.at(-1);
      expect(nextJob).toMatchObject({
        tenantId: run.tenantId,
        requestedByUserId: run.actorId,
        status: "queued",
        jobType: "external_agent_task",
        runtimeType: "external_runtime",
      });
      await transport.publish({
        outboxId: nextOutbox.id,
        jobId: nextPhase.jobRef.jobId,
        businessAttempt: 1,
        contractVersion: "feature-186-v1",
        dedupeKey: nextOutbox.dedupeKey,
        routingMetadata: {},
      });
      expect(dispatches).toBe(2);
      const secondReconcile = await firstService.reconcile({
        runId: run.runId,
        tenantId: run.tenantId,
        actorId: run.actorId,
      });
      expect(secondReconcile).toMatchObject({
        action: "CONTINUE",
        reason: "phase_succeeded",
      });
      expect(secondReconcile.run.state).toBe("PLAN_VERIFY");

      const restartedService = createDevelopmentRunService(persistence);
      expect(
        await restartedService.get({
          runId: run.runId,
          tenantId: run.tenantId,
          actorId: run.actorId,
        })
      ).toMatchObject({
        run: { workerJobId: nextPhase.jobRef.jobId, state: "PLAN_VERIFY" },
      });

      const duplicateReconcile = await restartedService.reconcile({
        runId: run.runId,
        tenantId: run.tenantId,
        actorId: run.actorId,
      });
      expect(duplicateReconcile.run.state).toBe("PLAN_VERIFY");
      expect(duplicateReconcile.revision).toBe(secondReconcile.revision);
    });
  }
);
