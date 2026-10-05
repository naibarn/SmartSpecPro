import { describe, expect, it } from "vitest";

import { buildDevelopmentRun } from "../spec224DevelopmentRunContracts";
import { createDevelopmentWorkUnit } from "../developmentLifecycleContracts";
import {
  createDevelopmentRunService,
  createPersistedDevelopmentRun,
  type CanonicalDevelopmentJobSnapshot,
  type DevelopmentRunPersistenceAdapter,
  type DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";
import {
  buildBlockerLedgerEntry,
  compileRequirementClosureGraph,
} from "../spec224RequirementClosureContracts";
import { deriveSpec224RequirementId } from "../spec224SpecBaseline";
import { createRequirementClosurePersistenceService } from "../spec224RequirementClosurePersistence";
import { makeReadyClosureFixture } from "./spec224ClosureReadyFixture";

const baseRun = buildDevelopmentRun({
  runId: "run-224-persisted",
  tenantId: "tenant-acme",
  actorId: 42,
  goal: "Implement a governed Skill",
  repositoryRef: "repo:smartspecpro",
  baseRevision: "git:base123",
  contextPackHash: "a".repeat(64),
  workspaceId: "workspace:run-224-persisted",
});
baseRun.evidenceRefs.push("evidence:req-final-gate");

function memoryAdapter(
  initial?: DevelopmentRunStoreRecord,
  canonicalJob: CanonicalDevelopmentJobSnapshot = {
    status: "succeeded",
    output: { evidenceRefs: ["evidence:phase-pass"] },
  }
): DevelopmentRunPersistenceAdapter {
  let record = initial ?? null;
  return {
    async transaction(work) {
      return work({
        async load(runId, scope) {
          if (!record || record.run.runId !== runId) return null;
          if (
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
          if (!record || record.run.runId !== next.run.runId)
            throw new Error("RUN_NOT_FOUND");
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          )
            throw new Error("RUN_SCOPE_FORBIDDEN");
          if (record.revision !== expectedRevision)
            throw new Error("RUN_PROJECTION_STALE");
          record = { ...structuredClone(next), revision: expectedRevision + 1 };
        },
        async appendEvent(event, scope) {
          if (!record || record.run.runId !== event.runId)
            throw new Error("RUN_NOT_FOUND");
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          )
            throw new Error("RUN_SCOPE_FORBIDDEN");
          const existing = record.events.find(
            item => item.idempotencyKey === event.idempotencyKey
          );
          if (existing) return existing;
          record.events.push(structuredClone(event));
          return event;
        },
        async getCanonicalJob() {
          return canonicalJob;
        },
        async createCanonicalJob() {
          return { jobId: "verification-worker-job", created: true };
        },
      });
    },
    async seed(next) {
      record = structuredClone(next);
    },
    async read() {
      return structuredClone(record);
    },
  };
}

describe("Spec 224 durable DevelopmentRun persistence", () => {
  it("persists partial canonical work and implementation completion on the existing run owner", async () => {
    const adapter = memoryAdapter();
    const service = createDevelopmentRunService(adapter);
    const unit = createDevelopmentWorkUnit({
      workId: "work-bug-42",
      projectId: "project-atlas",
      repositoryId: "repo-atlas",
      source: { type: "bug", ref: "issue:42" },
      objective: "Fix the retry regression",
      ownership: { actor: "42", session: "session-a", harness: "codex" },
      canonicalTarget: { kind: "git", locator: "refs/heads/trunk" },
      baseRevision: "a".repeat(40),
    });
    const run = buildDevelopmentRun({
      ...baseRun,
      runId: "run-224-canonical-checkpoint",
      workspaceId: "workspace:canonical-checkpoint",
      workUnit: unit,
    });
    await service.initialize({
      run,
      eventIdempotencyKey: "run-created:canonical-checkpoint",
      scope: { tenantId: run.tenantId, actorId: run.actorId },
    });
    const checkpoint = {
      canonicalRevision: "b".repeat(40),
      completedScope: ["retry-policy"],
      remainingScope: ["recovery-test"],
      pendingValidation: [{ checkType: "focused-test", revision: "b".repeat(40) }],
      nextAction: "Add the recovery test",
      nextOwner: "dev-8",
      handoffRef: "git:handoff-42",
      resumeFrom: "recovery-test",
    };
    const saved = await service.recordCanonicalCheckpoint({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      idempotencyKey: "canonical-checkpoint:retry-42",
      checkpoint,
    });
    expect(saved.run.workUnit?.progress).toMatchObject({
      state: "PARTIAL_INTEGRATED",
      canonicalRevision: "b".repeat(40),
      remainingScope: ["recovery-test"],
    });
    expect(saved.event?.type).toBe("CANONICAL_CHECKPOINT_RECORDED");
    const replay = await service.recordCanonicalCheckpoint({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      idempotencyKey: "canonical-checkpoint:retry-42",
      checkpoint,
    });
    expect(replay.accepted).toBe(false);

    const completed = await service.recordImplementationCompletion({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "implementation-complete:retry-42",
      completion: {
        canonicalRevision: "c".repeat(40),
        completedScope: ["retry-policy", "recovery-test"],
        pendingValidation: [{ checkType: "full-suite", revision: "c".repeat(40), state: "NOT_RUN" }],
      },
    });
    expect(completed.run.workUnit?.progress.state).toBe("IMPLEMENTATION_COMPLETE");
    expect(completed.run.workUnit?.validation.pending[0]?.revision).toBe("c".repeat(40));
    const persisted = await adapter.read();
    expect(persisted?.run.workUnit?.progress.canonicalRevision).toBe("c".repeat(40));
    expect(persisted?.events.map(event => event.type)).toContain("IMPLEMENTATION_COMPLETE_RECORDED");
  });

  it("persists resource verification events without consuming a phase transition", async () => {
    const adapter = memoryAdapter();
    const service = createDevelopmentRunService(adapter);
    const run = buildDevelopmentRun({
      ...baseRun,
      runId: "run-224-verification-events",
      workspaceId: "workspace:run-224-verification-events",
    });
    await service.initialize({
      run,
      eventIdempotencyKey: "run-created:verification-events",
      scope: { tenantId: run.tenantId, actorId: run.actorId },
    });

    const recorded = await service.recordVerificationEvent({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      idempotencyKey: "verification:full:admission:1",
      type: "VERIFICATION_ADMISSION",
      payload: {
        profile: "full",
        state: "QUEUED_RESOURCE",
        reason: "INSUFFICIENT_MEMORY_HEADROOM",
        requiredMemoryMiB: 10_240,
      },
      occurredAt: "2026-10-03T01:00:00.000Z",
    });
    const duplicate = await service.recordVerificationEvent({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      idempotencyKey: "verification:full:admission:1",
      type: "VERIFICATION_ADMISSION",
      payload: { profile: "full", state: "QUEUED_RESOURCE" },
    });
    const persisted = await adapter.read();

    expect(recorded.accepted).toBe(true);
    expect(duplicate.accepted).toBe(false);
    expect(persisted?.run.state).toBe("DISCOVERY");
    expect(persisted?.run.phaseAttempt).toBe(0);
    expect(persisted?.events.at(-1)).toMatchObject({
      type: "VERIFICATION_ADMISSION",
      payload: { state: "QUEUED_RESOURCE" },
    });
  });

  it("persists a durable dependency wait and applies producer-independent evidence with CAS", async () => {
    const adapter = memoryAdapter();
    const resumedWaits: Array<{ operationKey: string; resumeKey: string }> = [];
    const releasedWaits: string[] = [];
    const service = createDevelopmentRunService(adapter, {
      hasDependencyPredicate: () => true,
      releaseDependencyWait: async input => { releasedWaits.push(input.operationKey); },
      resumeDependencyWait: async input => {
        resumedWaits.push({ operationKey: input.operationKey, resumeKey: input.resumeKey });
        return true;
      },
    });
    const unit = createDevelopmentWorkUnit({
      workId: "work-dependency-42",
      projectId: "project-atlas",
      repositoryId: "repo-atlas",
      source: { type: "bug", ref: "issue:dependency-42" },
      objective: "Continue independent work while waiting for an API contract",
      ownership: { actor: "42", session: "session-a", harness: "codex" },
      canonicalTarget: { kind: "git", locator: "refs/heads/trunk" },
      baseRevision: "a".repeat(40),
    });
    const run = buildDevelopmentRun({
      ...baseRun,
      runId: "run-224-dependency-wait",
      workspaceId: "workspace:dependency-wait",
      workUnit: unit,
    });
    run.workerJobId = "waiting-job-dependency-42";
    await service.initialize({
      run,
      eventIdempotencyKey: "run-created:dependency-wait",
      scope: { tenantId: run.tenantId, actorId: run.actorId },
    });
    const checkpoint = await service.recordCanonicalCheckpoint({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 0,
      expectedFencingVersion: run.fencingVersion,
      idempotencyKey: "canonical-checkpoint:dependency-wait",
      checkpoint: {
        canonicalRevision: "b".repeat(40),
        completedScope: ["discovery"],
        remainingScope: ["api-client", "docs"],
        pendingValidation: [],
        nextAction: "Continue docs while waiting for API contract",
        nextOwner: "42",
        handoffRef: "git:dependency-handoff",
        resumeFrom: "api-client",
      },
    });
    const dependency = {
      dependencyId: "dependency-api-contract",
      consumerWorkId: unit.workId,
      projectId: unit.projectId,
      requirement: { type: "api-contract" as const, locator: "contracts/api-v2", minimumRevision: "c".repeat(40) },
      satisfaction: { predicateId: "canonical-api-contract", evidenceSource: "worker_job_events" },
      waitPolicy: { eventFirst: true as const, pollingFallback: true as const, timeoutIsTerminal: false as const },
      wake: { resumeWorkId: unit.workId, resumeFrom: "api-client", eventTypes: ["DEVELOPMENT_EVIDENCE"] },
      fallback: { rediscoverProducer: true as const, alternateRouteAllowed: true as const, continueIndependentWork: true as const },
      blockedScope: ["api-client"],
      state: "UNSATISFIED" as const,
      watcher: { watcherId: "watch-api-contract", status: "ACTIVE" as const, registeredAt: "2026-10-05T00:00:00.000Z" },
    };
    const waiting = await service.registerDependencyWait({
      lease: {
        jobId: run.workerJobId,
        attemptId: "attempt-1",
        leaseToken: "lease-token",
        fencingVersion: 1,
        expiresAt: "2026-10-05T01:00:00.000Z",
      },
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: checkpoint.revision,
      expectedFencingVersion: run.fencingVersion,
      idempotencyKey: "dependency-wait:api-contract:42",
      dependency,
      immediatelyRunnableScope: ["docs"],
    });
    expect(waiting.run.workUnit?.progress).toMatchObject({ state: "WORKING", immediatelyRunnableScope: ["docs"] });
    expect(waiting.event?.type).toBe("DEPENDENCY_WAIT_REGISTERED");
    expect(releasedWaits).toEqual([]);

    const evidence = {
      source: "worker_job_events",
      reference: "event:replacement-producer-api-v2",
      projectId: unit.projectId,
      requirementType: "api-contract" as const,
      locator: "contracts/api-v2",
      revision: "d".repeat(40),
      satisfiesMinimumRevision: true,
      observedAt: "2026-10-05T00:05:00.000Z",
      producerWorkId: "replacement-producer",
    };
    const resumed = await service.recordDependencyEvidence({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: waiting.revision,
      expectedFencingVersion: run.fencingVersion,
      idempotencyKey: "dependency-evidence:api-contract:42",
      dependencyId: dependency.dependencyId,
      evidence,
    });
    expect(resumed.run.workUnit?.progress.immediatelyRunnableScope).toEqual(["docs", "api-client"]);
    expect(resumed.event?.type).toBe("DEPENDENCY_EVIDENCE_APPLIED");
    expect((await adapter.read())?.events.map(event => event.type)).toContain("DEPENDENCY_EVIDENCE_APPLIED");
    expect(resumedWaits).toHaveLength(1);
    expect(resumedWaits[0]?.operationKey).toMatch(/^development-dependency:[a-f0-9]{48}$/);
    expect(resumedWaits[0]?.resumeKey).toMatch(/^development-dependency:[a-f0-9]{64}$/);
    const replay = await service.recordDependencyEvidence({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: waiting.revision,
      expectedFencingVersion: run.fencingVersion,
      idempotencyKey: "dependency-evidence:api-contract:42",
      dependencyId: dependency.dependencyId,
      evidence,
    });
    expect(replay.accepted).toBe(false);
    expect(resumedWaits).toHaveLength(2);
    expect(resumedWaits[1]).toEqual(resumedWaits[0]);
  });

  it("atomically admits one full-verification request and replays it idempotently", async () => {
    const adapter = memoryAdapter();
    const service = createDevelopmentRunService(adapter, {
      fullVerificationRuntimeConfigured: true,
      assessFullVerificationResources: async () => ({
        state: "ADMITTED",
        requiredMemoryMiB: 10_240,
      }),
    });
    const run = buildDevelopmentRun({
      ...baseRun,
      runId: "run-224-full-verification",
      workspaceId: "workspace:run-224-full-verification",
    });
    await service.initialize({
      run,
      eventIdempotencyKey: "run-created:full-verification",
      scope: { tenantId: run.tenantId, actorId: run.actorId },
    });
    const request = {
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      idempotencyKey: "full-verification-request-001",
    };

    const accepted = await service.requestFullVerification(request);
    const replay = await service.requestFullVerification(request);
    const persisted = await adapter.read();

    expect(accepted).toMatchObject({ state: "QUEUED", accepted: true, jobId: "verification-worker-job" });
    expect(replay).toMatchObject({ state: "QUEUED", accepted: false, jobId: "verification-worker-job" });
    expect(persisted?.run.state).toBe("DISCOVERY");
    expect(persisted?.run.phaseAttempt).toBe(0);
    expect(persisted?.events.filter(event => event.type === "VERIFICATION_ADMISSION")).toHaveLength(1);
    expect(persisted?.events.at(-1)?.payload).toMatchObject({ state: "QUEUED", jobId: "verification-worker-job" });
  });

  it("does not enqueue when full verification runtime or resource admission is unavailable", async () => {
    const adapter = memoryAdapter();
    const run = buildDevelopmentRun({
      ...baseRun,
      runId: "run-224-full-verification-blocked",
      workspaceId: "workspace:run-224-full-verification-blocked",
    });
    const initialService = createDevelopmentRunService(adapter);
    await initialService.initialize({
      run,
      eventIdempotencyKey: "run-created:full-verification-blocked",
      scope: { tenantId: run.tenantId, actorId: run.actorId },
    });
    const missingRuntime = await initialService.requestFullVerification({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      idempotencyKey: "full-verification-request-002",
    });
    expect(missingRuntime).toMatchObject({ state: "NOT_CONFIGURED", jobId: null });

    const blockedRun = buildDevelopmentRun({
      ...baseRun,
      runId: "run-224-full-verification-resource-blocked",
      workspaceId: "workspace:run-224-full-verification-resource-blocked",
    });
    const blockedAdapter = memoryAdapter();
    await initialServiceFor(blockedAdapter).initialize({
      run: blockedRun,
      eventIdempotencyKey: "run-created:full-verification-resource-blocked",
      scope: { tenantId: blockedRun.tenantId, actorId: blockedRun.actorId },
    });
    const blockedService = createDevelopmentRunService(blockedAdapter, {
      fullVerificationRuntimeConfigured: true,
      assessFullVerificationResources: async () => ({
        state: "QUEUED_RESOURCE",
        reason: "INSUFFICIENT_MEMORY_HEADROOM",
        requiredMemoryMiB: 10_240,
      }),
    });
    const blocked = await blockedService.requestFullVerification({
      runId: blockedRun.runId,
      tenantId: blockedRun.tenantId,
      actorId: blockedRun.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      idempotencyKey: "full-verification-request-003",
    });
    expect(blocked).toMatchObject({ state: "QUEUED_RESOURCE", jobId: null });
  });

  it("rejects stale revision and fencing owners before a full-verification enqueue", async () => {
    const adapter = memoryAdapter();
    const run = buildDevelopmentRun({
      ...baseRun,
      runId: "run-224-full-verification-stale",
      workspaceId: "workspace:run-224-full-verification-stale",
    });
    const service = createDevelopmentRunService(adapter, {
      fullVerificationRuntimeConfigured: true,
      assessFullVerificationResources: async () => ({
        state: "ADMITTED",
        requiredMemoryMiB: 10_240,
      }),
    });
    await service.initialize({
      run,
      eventIdempotencyKey: "run-created:full-verification-stale",
      scope: { tenantId: run.tenantId, actorId: run.actorId },
    });

    await expect(service.requestFullVerification({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 9,
      expectedFencingVersion: 0,
      idempotencyKey: "full-verification-stale-revision",
    })).rejects.toThrow("RUN_PROJECTION_STALE");
    await expect(service.requestFullVerification({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 9,
      idempotencyKey: "full-verification-stale-fence",
    })).rejects.toThrow("RUN_FENCE_STALE");
    expect((await adapter.read())?.events).toHaveLength(1);
  });

  function initialServiceFor(adapter: DevelopmentRunPersistenceAdapter) {
    return createDevelopmentRunService(adapter);
  }

  function finalVerifyRun() {
    const ready = finalVerifyReadyFixture();
    return {
      ...baseRun,
      evidenceRefs: [
        ...new Set([
          ...baseRun.evidenceRefs,
          ...ready.evidenceRefs,
          "evidence:req-final-gate",
          "evidence:blocker-final-gate",
        ]),
      ],
      state: "FINAL_VERIFY" as const,
      workerJobId: "worker-job-final-verify",
    };
  }

  function finalVerifyGraph() {
    const sourceArtifactDigest = "c".repeat(64);
    const digest = "b".repeat(64);
    const text = "Final Verify uses persisted closure state.";
    const requirementId = deriveSpec224RequirementId({
      specId: "224",
      revision: "1",
      sourceArtifactDigest,
      sourceDigest: digest,
      line: 1,
      text,
    });
    return compileRequirementClosureGraph({
      baseline: {
        specId: "224",
        revision: "1",
        sourceArtifactDigest,
        digest,
        baselineId: "baseline:224-r1",
        authorityRef: "authority:platform-engineering",
        scopeEnvelopeRef: "scope:224-r1",
      },
      requirements: [
        {
          id: requirementId,
          sourceRef: "spec:224@1#L1",
          text,
        },
      ],
      planSections: [
        {
          id: "section:final-gate",
          requirementIds: [requirementId],
        },
      ],
      workPackages: [
        {
          id: "wp:final-gate",
          planSectionId: "section:final-gate",
          requirementIds: [requirementId],
          dependsOn: [],
        },
      ],
    });
  }

  function finalVerifyReadyFixture() {
    return makeReadyClosureFixture(finalVerifyGraph(), {
      baseRevision: baseRun.baseRevision,
      prefix: "development-run-final",
    });
  }

  async function attachFinalVerifyGraph(
    adapter: DevelopmentRunPersistenceAdapter,
    graph = finalVerifyGraph()
  ) {
    return createRequirementClosurePersistenceService(adapter).attachGraph({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      idempotencyKey: "closure:final-gate:attach",
      graph,
    });
  }

  const finalVerifyProvenance = {
    candidateSha: "a".repeat(64),
    verifiedBaseSha: "c".repeat(64),
    specDigest: "b".repeat(64),
    policySnapshotDigest: "d".repeat(64),
    verificationProfileVersion: "profile:spec224-v1",
    evidenceBundleDigest: "e".repeat(64),
  };

  it("persists a phase transition and rejects a stale projection revision", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createDevelopmentRunService(adapter);

    const first = await service.command({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 0,
      idempotencyKey: "phase:discovery:complete",
      command: {
        kind: "transition",
        nextState: "PLANNING",
        eventType: "PHASE_COMPLETED",
        payload: { phase: "DISCOVERY" },
      },
    });
    expect(first.accepted).toBe(true);
    expect(first.run.state).toBe("PLANNING");
    expect((await adapter.read())?.revision).toBe(1);

    await expect(
      service.command({
        runId: baseRun.runId,
        tenantId: baseRun.tenantId,
        actorId: baseRun.actorId,
        expectedRevision: 0,
        idempotencyKey: "phase:planning:stale",
        command: {
          kind: "transition",
          nextState: "PLAN_VERIFY",
          eventType: "PHASE_COMPLETED",
          payload: {},
        },
      })
    ).rejects.toThrow("RUN_PROJECTION_STALE");
  });

  it("makes repeated commands idempotent and enforces tenant and actor scope", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createDevelopmentRunService(adapter);
    const command = {
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 0,
      idempotencyKey: "phase:discovery:complete",
      command: {
        kind: "transition" as const,
        nextState: "PLANNING" as const,
        eventType: "PHASE_COMPLETED" as const,
        payload: { phase: "DISCOVERY" },
      },
    };

    const first = await service.command(command);
    const duplicate = await service.command({
      ...command,
      expectedRevision: 1,
    });
    expect(first.accepted).toBe(true);
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.run.state).toBe("PLANNING");

    await expect(
      service.command({
        ...command,
        tenantId: "tenant-other",
        expectedRevision: 1,
      })
    ).rejects.toThrow("RUN_NOT_FOUND");
    await expect(
      service.command({ ...command, actorId: 7, expectedRevision: 1 })
    ).rejects.toThrow("RUN_NOT_FOUND");
  });

  it("reconciles a succeeded canonical worker job into the next safe phase", async () => {
    const adapter = memoryAdapter({
      run: { ...baseRun, workerJobId: "worker-job-224" },
      revision: 0,
      events: [],
    });
    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
    });

    expect(result.action).toBe("CONTINUE");
    expect(result.run.state).toBe("PLANNING");
    expect(result.run.events.at(-1)?.type).toBe("PHASE_COMPLETED");
  });

  it("fails closed to owner decision for an unknown external outcome", async () => {
    const run = {
      ...baseRun,
      state: "IMPLEMENT" as const,
      workerJobId: "worker-job-unknown",
    };
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "failed",
        errorCode: "UNKNOWN_OUTCOME",
        errorMessage: "External execution outcome is unknown",
        operatorReviewRequired: true,
      }
    );
    const result = await createDevelopmentRunService(adapter).reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    expect(result.action).toBe("WAIT");
    expect(result.run.state).toBe("WAITING_HUMAN_DECISION");
    expect(result.reason).toBe("external_outcome_unknown_requires_review");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "DECISION_REQUIRED",
      payload: {
        reason: "external_outcome_unknown",
        workerJobId: run.workerJobId,
      },
    });
  });

  it("does not complete Final Verify when a persisted requirement is incomplete", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
        resultRef: "result:final-worker",
      }
    );
    await attachFinalVerifyGraph(adapter);
    const service = createDevelopmentRunService(adapter);

    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.reason).toBe("final_verification_rejected");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: {
        workerJobId: run.workerJobId,
        closureErrorCode: "REQUIREMENT_NOT_TERMINAL",
      },
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    expect(duplicate.action).toBe("WAIT");
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "PHASE_FAILED")
    ).toHaveLength(1);
  });

  it("rejects Final Verify when the persisted closure graph is missing", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
      }
    );

    const result = await createDevelopmentRunService(adapter).reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: { closureErrorCode: "CLOSURE_GRAPH_NOT_FOUND" },
    });
  });

  it("does not complete Final Verify when a persisted blocker is open", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
      }
    );
    await attachFinalVerifyGraph(adapter, finalVerifyReadyFixture().graph);
    const closure = createRequirementClosurePersistenceService(adapter);
    await closure.upsertBlocker({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-gate:open",
      blocker: buildBlockerLedgerEntry({
        blockerId: "blocker:final-gate",
        runId: run.runId,
        requirementRefs: [finalVerifyGraph().requirements[0]!.id],
        classification: "TEST_FAILURE",
        severity: "high",
      }),
    });

    const result = await createDevelopmentRunService(adapter).reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: { closureErrorCode: "BLOCKER_OPEN" },
    });
  });

  it("completes Final Verify only when the persisted closure is eligible", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
        resultRef: "result:final-worker",
      }
    );
    await attachFinalVerifyGraph(adapter, finalVerifyReadyFixture().graph);

    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("STOP");
    expect(result.run.state).toBe("COMPLETED");
    expect(result.reason).toBe("final_verification_passed");
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "RUN_COMPLETED")
    ).toHaveLength(1);
  });

  it("rejects a stale terminal provenance tuple through the existing repair path", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: {
          evidenceRefs: ["evidence:final-worker-result"],
          verificationProvenance: {
            ...finalVerifyProvenance,
            specDigest: "f".repeat(64),
          },
        },
      }
    );
    await attachFinalVerifyGraph(adapter, finalVerifyReadyFixture().graph);

    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: {
        closureErrorCode: "FINAL_VERIFY_PROVENANCE_STALE",
      },
    });
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "PHASE_FAILED")
    ).toHaveLength(1);
  });

  it("rejects a malformed terminal provenance tuple with a stable error code", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: {
          evidenceRefs: ["evidence:final-worker-result"],
          verificationProvenance: {
            ...finalVerifyProvenance,
            candidateSha: "not-a-sha",
          },
        },
      }
    );
    await attachFinalVerifyGraph(adapter, finalVerifyReadyFixture().graph);

    const result = await createDevelopmentRunService(adapter).reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: {
        closureErrorCode: "FINAL_VERIFY_PROVENANCE_INVALID",
      },
    });
  });

  it("completes an eligible terminal provenance tuple and preserves duplicate reconciliation", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: {
          evidenceRefs: ["evidence:final-worker-result"],
          verificationProvenance: finalVerifyProvenance,
        },
      }
    );
    await attachFinalVerifyGraph(adapter, finalVerifyReadyFixture().graph);

    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("STOP");
    expect(result.run.state).toBe("COMPLETED");
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "RUN_COMPLETED")
    ).toHaveLength(1);
  });

  it("rejects idempotency-key reuse for another command and stale run fences", async () => {
    const boundRun = {
      ...baseRun,
      workerJobId: "worker-job-fenced",
      fencingVersion: 4,
    };
    const adapter = memoryAdapter({ run: boundRun, revision: 0, events: [] });
    const service = createDevelopmentRunService(adapter);
    const command = {
      runId: boundRun.runId,
      tenantId: boundRun.tenantId,
      actorId: boundRun.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 4,
      idempotencyKey: "phase:discovery:complete",
      command: {
        kind: "transition" as const,
        nextState: "PLANNING" as const,
        eventType: "PHASE_COMPLETED" as const,
        payload: {},
      },
    };

    await service.command(command);
    await expect(
      service.command({
        ...command,
        expectedRevision: 1,
        command: { ...command.command, nextState: "PLAN_VERIFY" },
      })
    ).rejects.toThrow("RUN_IDEMPOTENCY_CONFLICT");
    await expect(
      service.command({
        ...command,
        expectedRevision: 1,
        expectedFencingVersion: 3,
        idempotencyKey: "phase:planning:stale-fence",
        command: { ...command.command, nextState: "PLAN_VERIFY" },
      })
    ).rejects.toThrow("RUN_FENCE_STALE");
  });

  it("creates the canonical worker job through external_agent_task and stores the bound run projection", async () => {
    const adapter = memoryAdapter();
    const result = await createPersistedDevelopmentRun({
      run: baseRun,
      provider: "codex",
      runtime: "local_runner",
      planId: "plan-224-persisted",
      planRevision: 1,
      skillIds: [],
      requestedCapabilities: ["workspace.edit"],
      authorizationScope: "spec224.development.run",
      persistence: adapter,
      controlPlane: {
        create: async (definition, options) => {
          expect(definition.jobType).toBe("external_agent_task");
          expect(definition.input).toHaveProperty("spec224Run");
          expect(options).toMatchObject({ runtimeType: "external_runtime" });
          return { jobId: "worker-job-224", created: true };
        },
      } as never,
      executorRegistry: { has: () => true } as never,
    });

    expect(result.run.workerJobId).toBe("worker-job-224");
    expect((await adapter.read())?.events[0]?.type).toBe("RUN_CREATED");
  });
});
