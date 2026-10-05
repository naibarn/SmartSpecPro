import { describe, expect, it } from "vitest";

import {
  createDevelopmentWorkUnit,
  recordCanonicalCheckpoint,
  registerDevelopmentDependencyWait,
  applyDevelopmentDependencyEvidence,
  type DevelopmentDependencyContract,
  type DevelopmentDependencyEvidence,
  type DevelopmentWorkUnit,
} from "../developmentLifecycleContracts";
import {
  reconcileDevelopmentLifecycleDependencies,
  type DevelopmentLifecycleCandidate,
} from "../developmentLifecycleReconciler";

function candidate(options: { independent?: boolean; watcher?: "ACTIVE" | "MISSING" } = {}) {
  const unit = createDevelopmentWorkUnit({
    workId: "work-1",
    projectId: "project-1",
    repositoryId: "repo-1",
    source: { type: "feature", ref: "issue:1" },
    objective: "Add the API consumer",
    ownership: { actor: "user-1", session: "session-1", harness: "codex" },
    canonicalTarget: { kind: "git", locator: "refs/heads/trunk" },
    baseRevision: "a".repeat(40),
  });
  const checkpoint = recordCanonicalCheckpoint(unit, {
    canonicalRevision: "b".repeat(40),
    completedScope: ["contract-parser"],
    remainingScope: ["api-client", "unrelated-docs"],
    pendingValidation: [],
    nextAction: "Implement API client",
    nextOwner: "user-1",
    handoffRef: "git:work-1",
    resumeFrom: "api-client",
  });
  const dependency: DevelopmentDependencyContract = {
    dependencyId: "dependency-api-v3",
    consumerWorkId: "work-1",
    projectId: "project-1",
    requirement: { type: "api-contract", locator: "catalog-api", minimumRevision: "v3" },
    producer: { workId: "producer-1", projectId: "project-1", optional: true },
    satisfaction: { predicateId: "catalog-api-v3", evidenceSource: "worker_job_events" },
    waitPolicy: { eventFirst: true, pollingFallback: true, timeoutIsTerminal: false },
    wake: { resumeWorkId: "work-1", resumeFrom: "api-client", eventTypes: ["DEVELOPMENT_EVIDENCE"] },
    fallback: { rediscoverProducer: true, alternateRouteAllowed: true, continueIndependentWork: true },
    blockedScope: options.independent ? ["api-client"] : ["api-client", "unrelated-docs"],
    state: "UNSATISFIED",
    watcher: {
      watcherId: "watcher-api-v3",
      status: options.watcher ?? "ACTIVE",
      registeredAt: "2026-10-05T00:00:00.000Z",
    },
  };
  const workUnit = registerDevelopmentDependencyWait(
    checkpoint,
    dependency,
    options.independent ? ["unrelated-docs"] : [],
    "2026-10-05T00:01:00.000Z",
  );
  return {
    tenantId: "tenant-1",
    jobStatus: options.independent ? "running" : "waiting_external",
    expectedProjectionRevision: 7,
    workUnit,
  } satisfies DevelopmentLifecycleCandidate;
}

const evidence = (): DevelopmentDependencyEvidence => ({
  source: "worker_job_events",
  reference: "worker-job-event:event-9",
  projectId: "project-1",
  requirementType: "api-contract",
  locator: "catalog-api",
  revision: "v3",
  satisfiesMinimumRevision: true,
  observedAt: "2026-10-05T00:02:00.000Z",
  producerWorkId: "replacement-producer-2",
});

function makeStore(initial: DevelopmentLifecycleCandidate, outcome: "applied" | "stale" | "not-waiting" = "applied") {
  const commits: Array<{
    candidate: DevelopmentLifecycleCandidate;
    workUnit: DevelopmentWorkUnit;
    resume: boolean;
    resumeKey: string;
    evidenceRefs: string[];
  }> = [];
  return {
    commits,
    store: {
      async listCandidates() { return [initial]; },
      async commit(input: (typeof commits)[number]) {
        commits.push(input);
        return outcome;
      },
    },
  };
}

describe("generic development dependency reconciliation", () => {
  it("consumes durable event evidence first and reactivates without producer identity coupling", async () => {
    const waiting = candidate();
    const fake = makeStore(waiting);
    let fallbackChecks = 0;
    const result = await reconcileDevelopmentLifecycleDependencies({
      store: fake.store,
      evidence: {
        async findEventEvidence() { return evidence(); },
        async recheckPredicate() { fallbackChecks += 1; return null; },
      },
      now: new Date("2026-10-05T00:03:00.000Z"),
    });
    expect(fallbackChecks).toBe(0);
    expect(result).toMatchObject({ scanned: 1, dependenciesChecked: 1, satisfied: 1, resumed: 1, errors: 0 });
    expect(fake.commits[0]).toMatchObject({ resume: true, evidenceRefs: ["worker-job-event:event-9"] });
    expect(fake.commits[0]?.workUnit.dependencies[0]?.state).toBe("SATISFIED");
  });

  it("recovers a lost event through predicate recheck and continues independent work", async () => {
    const running = candidate({ independent: true });
    const fake = makeStore(running);
    let fallbackChecks = 0;
    const result = await reconcileDevelopmentLifecycleDependencies({
      store: fake.store,
      evidence: {
        async findEventEvidence() { return null; },
        async recheckPredicate() { fallbackChecks += 1; return evidence(); },
      },
      now: new Date("2026-10-05T00:03:00.000Z"),
    });
    expect(fallbackChecks).toBe(1);
    expect(result.satisfied).toBe(1);
    expect(fake.commits[0]?.resume).toBe(false);
    expect(fake.commits[0]?.workUnit.progress.immediatelyRunnableScope).toEqual(["unrelated-docs", "api-client"]);
  });

  it("repairs a missing watcher even when no event or predicate result exists", async () => {
    const missingWatcher = candidate({ watcher: "MISSING" });
    const fake = makeStore(missingWatcher);
    const result = await reconcileDevelopmentLifecycleDependencies({
      store: fake.store,
      evidence: {
        async findEventEvidence() { return null; },
        async recheckPredicate() { return null; },
      },
      now: new Date("2026-10-05T00:03:00.000Z"),
    });
    expect(result.watchersRepaired).toBe(1);
    expect(fake.commits[0]?.workUnit.dependencies[0]?.watcher.status).toBe("ACTIVE");
    expect(fake.commits[0]?.resume).toBe(false);
  });

  it("retries enqueue when evidence was persisted before the controller crashed", async () => {
    const waiting = candidate();
    const alreadySatisfied = applyDevelopmentDependencyEvidence(waiting.workUnit, "dependency-api-v3", evidence());
    const candidateAfterCrash = { ...waiting, workUnit: alreadySatisfied };
    const fake = makeStore(candidateAfterCrash);
    const result = await reconcileDevelopmentLifecycleDependencies({
      store: fake.store,
      evidence: {
        async findEventEvidence() { return null; },
        async recheckPredicate() { return null; },
      },
      now: new Date("2026-10-05T00:03:00.000Z"),
    });
    expect(result.resumed).toBe(1);
    expect(fake.commits[0]?.resumeKey).toBe("development-dependency-resume:work-1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("leaves stale and no-longer-waiting candidates for a later fenced reconciliation", async () => {
    const waiting = candidate();
    const stale = makeStore(waiting, "stale");
    const result = await reconcileDevelopmentLifecycleDependencies({
      store: stale.store,
      evidence: { async findEventEvidence() { return evidence(); }, async recheckPredicate() { return null; } },
    });
    expect(result.stale).toBe(1);
    expect(result.resumed).toBe(0);
  });
});
