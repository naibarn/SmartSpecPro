import { describe, expect, it } from "vitest";

import {
  completeDevelopmentWorkUnit,
  createDevelopmentWorkUnit,
  applyDevelopmentDependencyEvidence,
  type DevelopmentDependencyContract,
  recordCanonicalCheckpoint,
  registerDevelopmentDependencyWait,
  registerDevelopmentDependencyWaits,
  reconcileDevelopmentResume,
  repairMissingDevelopmentDependencyWatchers,
} from "../developmentLifecycleContracts";

const workUnit = () =>
  createDevelopmentWorkUnit({
    workId: "work-bug-42",
    projectId: "project-atlas",
    repositoryId: "repo-atlas",
    source: { type: "bug", ref: "issue:42" },
    objective: "Fix the queue retry regression",
    ownership: { actor: "dev-7", session: "session-a", harness: "codex" },
    canonicalTarget: { kind: "git", locator: "refs/heads/trunk" },
    baseRevision: "a".repeat(40),
  });

const checkpoint = () => recordCanonicalCheckpoint(workUnit(), {
  canonicalRevision: "b".repeat(40),
  completedScope: ["bootstrap"],
  remainingScope: ["publish-api", "add-client"],
  pendingValidation: [],
  nextAction: "Continue implementation",
  nextOwner: "dev-7",
  handoffRef: "git:handoff-42",
  resumeFrom: "publish-api",
});

const apiDependency = (blockedScope = ["publish-api"]): DevelopmentDependencyContract => ({
  dependencyId: "dep-api-v3",
  consumerWorkId: "work-bug-42",
  projectId: "project-atlas",
  requirement: { type: "api-contract", locator: "catalog-api", minimumRevision: "revision:3" },
  producer: { workId: "work-producer-b", projectId: "project-atlas", optional: true },
  satisfaction: { predicateId: "canonical-api-contract-v3", evidenceSource: "worker_job_events" },
  waitPolicy: { eventFirst: true as const, pollingFallback: true as const, timeoutIsTerminal: false as const },
  wake: { resumeWorkId: "work-bug-42", resumeFrom: "publish-api", eventTypes: ["DEVELOPMENT_EVIDENCE"] },
  fallback: { rediscoverProducer: true as const, alternateRouteAllowed: true as const, continueIndependentWork: true as const },
  blockedScope,
  state: "UNSATISFIED" as const,
  watcher: { watcherId: "watch-dep-api-v3", status: "ACTIVE" as const, registeredAt: "2026-10-05T00:00:00.000Z" },
});

describe("project-agnostic development lifecycle contract", () => {
  it("records a safe partial checkpoint and exact-revision obligations", () => {
    const next = recordCanonicalCheckpoint(workUnit(), {
      canonicalRevision: "b".repeat(40),
      completedScope: ["retry-policy"],
      remainingScope: ["telemetry", "recovery-test"],
      pendingValidation: [{ checkType: "integration", revision: "b".repeat(40) }],
      nextAction: "Implement the recovery event projection",
      nextOwner: "dev-8",
      handoffRef: "git:handoff-42",
      resumeFrom: "retry-policy",
    });
    expect(next.progress).toMatchObject({
      state: "PARTIAL_INTEGRATED",
      canonicalRevision: "b".repeat(40),
      completedScope: ["retry-policy"],
      remainingScope: ["telemetry", "recovery-test"],
    });
    expect(next.validation.pending[0]?.revision).toBe(next.progress.canonicalRevision);
    expect(next.handoff).toMatchObject({
      nextOwner: "dev-8",
      nextAction: "Implement the recovery event projection",
      handoffRef: "git:handoff-42",
    });
    expect(next.source.type).toBe("bug");
  });

  it("rejects partial checkpoints without handoff and validation revision drift", () => {
    expect(() =>
      recordCanonicalCheckpoint(workUnit(), {
        canonicalRevision: "b".repeat(40),
        completedScope: ["retry-policy"],
        remainingScope: ["recovery-test"],
        pendingValidation: [{ checkType: "integration", revision: "c".repeat(40) }],
        nextAction: "Continue",
        nextOwner: "dev-8",
        handoffRef: "git:handoff-42",
        resumeFrom: "retry-policy",
      })
    ).toThrow("VALIDATION_REVISION_MISMATCH");
    expect(() =>
      recordCanonicalCheckpoint(workUnit(), {
        canonicalRevision: "b".repeat(40),
        completedScope: ["retry-policy"],
        remainingScope: ["recovery-test"],
        pendingValidation: [],
        nextAction: "Continue",
        nextOwner: "dev-8",
        handoffRef: "",
        resumeFrom: "retry-policy",
      })
    ).toThrow("HANDOFF_REQUIRED");
  });

  it("resumes from durable canonical handoff instead of a stale session snapshot", () => {
    const durable = recordCanonicalCheckpoint(workUnit(), {
      canonicalRevision: "d".repeat(40),
      completedScope: ["retry-policy", "telemetry"],
      remainingScope: ["recovery-test"],
      pendingValidation: [{ checkType: "focused-test", revision: "d".repeat(40) }],
      nextAction: "Add the recovery test",
      nextOwner: "dev-9",
      handoffRef: "artifact:handoff-42",
      resumeFrom: "recovery-test",
    });
    const resumed = reconcileDevelopmentResume(durable, {
      snapshotRevision: "b".repeat(40),
      completedScope: ["retry-policy"],
      remainingScope: ["telemetry", "recovery-test"],
    });
    expect(resumed).toMatchObject({
      sourceOfTruth: "DURABLE_HANDOFF",
      canonicalRevision: "d".repeat(40),
      remainingScope: ["recovery-test"],
      nextAction: "Add the recovery test",
    });
    expect(resumed.remainingScope).not.toContain("telemetry");
  });

  it("supports non-Git canonical target kinds and non-Spec source types", () => {
    const miniApp = createDevelopmentWorkUnit({
      workId: "work-generated-miniapp-5",
      projectId: "project-miniapps",
      repositoryId: "app-registry",
      source: { type: "generated", ref: "prompt:5" },
      objective: "Generate a knowledge Mini App draft",
      ownership: { actor: "agent-1", session: "run-5", harness: "native-agent" },
      canonicalTarget: { kind: "application-version", locator: "app:5" },
      baseRevision: "version:4",
    });
    expect(miniApp.canonicalTarget.kind).toBe("application-version");
    expect(miniApp.source.type).toBe("generated");
  });

  it("keeps implementation completion separate from pending validation", () => {
    const complete = completeDevelopmentWorkUnit(workUnit(), {
      canonicalRevision: "e".repeat(40),
      completedScope: ["retry-policy", "telemetry", "recovery-test"],
      pendingValidation: [{ checkType: "full-suite", revision: "e".repeat(40), state: "NOT_RUN" }],
    });
    expect(complete.progress.state).toBe("IMPLEMENTATION_COMPLETE");
    expect(complete.progress.remainingScope).toEqual([]);
    expect(complete.validation.pending[0]?.state).toBe("NOT_RUN");
  });

  it("keeps independent scope runnable while a contract dependency is pending", () => {
    const waiting = registerDevelopmentDependencyWait(
      checkpoint(),
      apiDependency(),
      ["add-client"],
      "2026-10-05T00:01:00.000Z"
    );
    expect(waiting.progress.state).toBe("WORKING");
    expect(waiting.progress.immediatelyRunnableScope).toEqual(["add-client"]);
    expect(waiting.dependencies[0]?.state).toBe("UNSATISFIED");
    expect(waiting.handoff?.wakeCondition).toBeUndefined();
  });

  it("registers a durable wait when no independent scope remains and rejects a wake-less wait", () => {
    const waiting = registerDevelopmentDependencyWait(
      checkpoint(),
      apiDependency(["publish-api", "add-client"]),
      [],
      "2026-10-05T00:01:00.000Z"
    );
    expect(waiting.progress.state).toBe("WAITING_DEPENDENCY");
    expect(waiting.handoff?.wakeCondition).toBe("dependency:dep-api-v3");
    expect(() => {
      const invalid = { ...waiting, handoff: { ...waiting.handoff!, wakeCondition: undefined } };
      return reconcileDevelopmentResume(invalid, { snapshotRevision: "b".repeat(40), completedScope: [], remainingScope: [] });
    }).toThrow("WAITING_DEPENDENCY_WAKE_REQUIRED");
  });

  it("accepts matching output from a replacement producer and does not bind to producer identity", () => {
    const waiting = registerDevelopmentDependencyWait(
      checkpoint(),
      apiDependency(),
      ["add-client"],
      "2026-10-05T00:01:00.000Z"
    );
    const resumed = applyDevelopmentDependencyEvidence(waiting, "dep-api-v3", {
      source: "worker_job_events",
      reference: "worker-job-event:event-9",
      projectId: "project-atlas",
      requirementType: "api-contract",
      locator: "catalog-api",
      revision: "revision:3",
      satisfiesMinimumRevision: true,
      observedAt: "2026-10-05T00:02:00.000Z",
      producerWorkId: "work-producer-c",
    }, "2026-10-05T00:02:01.000Z");
    expect(resumed.dependencies[0]?.state).toBe("SATISFIED");
    expect(resumed.progress.state).toBe("WORKING");
    expect(resumed.progress.immediatelyRunnableScope).toEqual(["add-client", "publish-api"]);
  });

  it("rejects evidence from a different project or evidence source", () => {
    const waiting = registerDevelopmentDependencyWait(
      checkpoint(),
      apiDependency(),
      [],
      "2026-10-05T00:01:00.000Z"
    );
    expect(() => applyDevelopmentDependencyEvidence(waiting, "dep-api-v3", {
      source: "worker_job_events",
      reference: "event:1",
      projectId: "project-other",
      requirementType: "api-contract",
      locator: "catalog-api",
      revision: "revision:3",
      satisfiesMinimumRevision: true,
      observedAt: "2026-10-05T00:02:00.000Z",
    })).toThrow("DEPENDENCY_EVIDENCE_MISMATCH");
  });

  it("keeps a scope blocked until every dependency for that scope is satisfied", () => {
    const firstWait = registerDevelopmentDependencyWait(
      checkpoint(),
      apiDependency(["publish-api"]),
      ["add-client"],
      "2026-10-05T00:01:00.000Z"
    );
    const bothWaiting = registerDevelopmentDependencyWait(
      firstWait,
      { ...apiDependency(["publish-api"]), dependencyId: "dep-schema-v2", requirement: { type: "schema", locator: "catalog-schema", minimumRevision: "revision:2" } },
      ["add-client"],
      "2026-10-05T00:01:30.000Z"
    );
    const firstSatisfied = applyDevelopmentDependencyEvidence(bothWaiting, "dep-api-v3", {
      source: "worker_job_events",
      reference: "event:api",
      projectId: "project-atlas",
      requirementType: "api-contract",
      locator: "catalog-api",
      revision: "revision:3",
      satisfiesMinimumRevision: true,
      observedAt: "2026-10-05T00:02:00.000Z",
    });
    expect(firstSatisfied.progress.state).toBe("WORKING");
    expect(firstSatisfied.progress.immediatelyRunnableScope).toEqual(["add-client"]);
    expect(firstSatisfied.progress.immediatelyRunnableScope).not.toContain("publish-api");
    const bothSatisfied = applyDevelopmentDependencyEvidence(firstSatisfied, "dep-schema-v2", {
      source: "worker_job_events",
      reference: "event:schema",
      projectId: "project-atlas",
      requirementType: "schema",
      locator: "catalog-schema",
      revision: "revision:2",
      satisfiesMinimumRevision: true,
      observedAt: "2026-10-05T00:03:00.000Z",
    });
    expect(bothSatisfied.progress.state).toBe("WORKING");
    expect(bothSatisfied.progress.immediatelyRunnableScope).toEqual(["add-client", "publish-api"]);
  });

  it("registers multiple durable dependencies before releasing the executor", () => {
    const second = {
      ...apiDependency(["publish-api"]),
      dependencyId: "dep-schema-v2",
      requirement: { type: "schema" as const, locator: "catalog-schema", minimumRevision: "revision:2" },
      satisfaction: { predicateId: "catalog-schema-v2", evidenceSource: "worker_job_events" },
      wake: { resumeWorkId: "work-bug-42", resumeFrom: "publish-api", eventTypes: ["DEVELOPMENT_EVIDENCE"] },
    };
    const waiting = registerDevelopmentDependencyWaits(
      checkpoint(),
      [apiDependency(["publish-api"]), second],
      [],
      "2026-10-05T00:01:00.000Z",
    );
    expect(waiting.progress.state).toBe("WAITING_DEPENDENCY");
    expect(waiting.dependencies.map(item => item.dependencyId)).toEqual(["dep-api-v3", "dep-schema-v2"]);
    expect(waiting.progress.immediatelyRunnableScope).toEqual([]);
  });

  it("repairs a missing watcher without losing its predicate or resume point", () => {
    const waiting = registerDevelopmentDependencyWait(
      checkpoint(),
      apiDependency(["publish-api", "add-client"]),
      [],
      "2026-10-05T00:01:00.000Z"
    );
    const damaged = {
      ...waiting,
      dependencies: waiting.dependencies.map(dependency => ({
        ...dependency,
        watcher: { ...dependency.watcher, status: "MISSING" as const },
      })),
    };
    const repaired = repairMissingDevelopmentDependencyWatchers(damaged, "2026-10-05T00:03:00.000Z");
    expect(repaired.dependencies[0]?.watcher.status).toBe("ACTIVE");
    expect(repaired.dependencies[0]?.satisfaction.predicateId).toBe("canonical-api-contract-v3");
    expect(repaired.handoff?.wakeCondition).toBe("dependency:dep-api-v3");
  });
});
