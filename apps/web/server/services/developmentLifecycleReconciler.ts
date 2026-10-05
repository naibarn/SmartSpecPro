import {
  applyDevelopmentDependencyEvidence,
  parseDevelopmentWorkUnit,
  repairMissingDevelopmentDependencyWatchers,
  type DevelopmentDependencyContract,
  type DevelopmentDependencyEvidence,
  type DevelopmentWorkUnit,
} from "./developmentLifecycleContracts";

export type DevelopmentLifecycleCandidate = {
  tenantId: string;
  jobStatus: string;
  expectedProjectionRevision: number;
  workUnit: DevelopmentWorkUnit;
};

export type DevelopmentLifecycleEvidenceAdapter = {
  /** Read the durable event source first; event delivery itself may be lost. */
  findEventEvidence(input: {
    tenantId: string;
    workUnit: DevelopmentWorkUnit;
    dependency: DevelopmentDependencyContract;
  }): Promise<DevelopmentDependencyEvidence | null>;
  /** Re-evaluate the predicate against its current authority as reconciliation fallback. */
  recheckPredicate(input: {
    tenantId: string;
    workUnit: DevelopmentWorkUnit;
    dependency: DevelopmentDependencyContract;
  }): Promise<DevelopmentDependencyEvidence | null>;
};

export type DevelopmentLifecycleReconciliationStore = {
  listCandidates(limit: number): Promise<DevelopmentLifecycleCandidate[]>;
  /** CAS projection update and any required resume/outbox enqueue must be atomic. */
  commit(input: {
    candidate: DevelopmentLifecycleCandidate;
    workUnit: DevelopmentWorkUnit;
    resume: boolean;
    resumeKey: string;
    evidenceRefs: string[];
    now: Date;
  }): Promise<"applied" | "stale" | "not-waiting">;
};

export type DevelopmentLifecycleReconciliationResult = {
  scanned: number;
  dependenciesChecked: number;
  satisfied: number;
  watchersRepaired: number;
  resumed: number;
  stale: number;
  errors: number;
};

export async function reconcileDevelopmentLifecycleDependencies(input: {
  store: DevelopmentLifecycleReconciliationStore;
  evidence: DevelopmentLifecycleEvidenceAdapter;
  now?: Date;
  limit?: number;
}): Promise<DevelopmentLifecycleReconciliationResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const candidates = await input.store.listCandidates(limit);
  const result: DevelopmentLifecycleReconciliationResult = {
    scanned: candidates.length,
    dependenciesChecked: 0,
    satisfied: 0,
    watchersRepaired: 0,
    resumed: 0,
    stale: 0,
    errors: 0,
  };

  for (const candidate of candidates) {
    try {
      let next = parseDevelopmentWorkUnit(candidate.workUnit);
      const repaired = repairMissingDevelopmentDependencyWatchers(next, now.toISOString());
      const watcherRepaired = repaired !== next;
      if (watcherRepaired) result.watchersRepaired += 1;
      next = repaired;
      const evidenceRefs: string[] = [];

      for (const dependency of next.dependencies) {
        if (dependency.state !== "UNSATISFIED") continue;
        result.dependenciesChecked += 1;
        const context = { tenantId: candidate.tenantId, workUnit: next, dependency };
        const observed = await input.evidence.findEventEvidence(context)
          ?? await input.evidence.recheckPredicate(context);
        if (!observed) continue;
        next = applyDevelopmentDependencyEvidence(next, dependency.dependencyId, observed, now.toISOString());
        evidenceRefs.push(observed.reference);
        result.satisfied += 1;
      }

      const hasRunnableScope = next.progress.immediatelyRunnableScope.length > 0;
      const hasPendingDependencies = next.dependencies.some(dependency => dependency.state === "UNSATISFIED");
      const resume = candidate.jobStatus === "waiting_external" && (hasRunnableScope || !hasPendingDependencies);
      if (!watcherRepaired && evidenceRefs.length === 0 && !resume) continue;

      const outcome = await input.store.commit({
        candidate,
        workUnit: next,
        resume,
        resumeKey: evidenceRefs.length > 0
          ? `development-dependency:${evidenceRefs.sort().join(",")}`
          : resume
            ? `development-dependency-resume:${next.workId}:${next.progress.canonicalRevision}`
            : `development-watcher-repair:${next.workId}:${now.toISOString()}`,
        evidenceRefs,
        now,
      });
      if (outcome === "stale" || outcome === "not-waiting") result.stale += 1;
      else if (resume) result.resumed += 1;
    } catch {
      result.errors += 1;
    }
  }
  return result;
}
