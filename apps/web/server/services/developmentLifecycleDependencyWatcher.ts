import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { workerJobEvents, workerJobs } from "../../drizzle/schema";
import { db, getDb } from "../db";
import {
  parseDevelopmentWorkUnit,
  type DevelopmentDependencyContract,
  type DevelopmentDependencyEvidence,
} from "./developmentLifecycleContracts";
import {
  createDevelopmentRunService,
  defaultDevelopmentRunPersistenceAdapter,
} from "./spec224DevelopmentRunPersistence";
import { getDevelopmentLifecyclePredicate } from "./developmentLifecyclePredicateRegistry";

export type DevelopmentDependencyPredicateRecheck = (input: {
  tenantId: string;
  workUnit: ReturnType<typeof parseDevelopmentWorkUnit>;
  dependency: DevelopmentDependencyContract;
}) => Promise<DevelopmentDependencyEvidence | null>;

type Waiter = {
  jobId: string;
  tenantId: string;
  actorId: number;
  runId: string;
  dependencyId: string;
  expectedRevision: number;
  expectedFencingVersion: number;
  workUnit: ReturnType<typeof parseDevelopmentWorkUnit>;
  dependency: DevelopmentDependencyContract;
};

function evidenceFromEvent(payload: Record<string, unknown>): DevelopmentDependencyEvidence | null {
  const candidate = payload.developmentEvidence;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const evidence = candidate as DevelopmentDependencyEvidence;
  if (
    typeof evidence.reference !== "string" ||
    typeof evidence.source !== "string" ||
    typeof evidence.projectId !== "string" ||
    typeof evidence.requirementType !== "string" ||
    typeof evidence.locator !== "string" ||
    typeof evidence.satisfiesMinimumRevision !== "boolean" ||
    typeof evidence.observedAt !== "string"
  ) return null;
  return evidence;
}

async function listWaiters(limit: number, tenantId?: string): Promise<Waiter[]> {
  const rows = await db.select({
    jobId: workerJobs.id,
    tenantId: workerJobs.tenantId,
    actorId: workerJobs.requestedByUserId,
    status: workerJobs.status,
    progressJson: workerJobs.progressJson,
  }).from(workerJobs)
    .where(and(
      inArray(workerJobs.status, ["queued", "running", "waiting_external"] as any),
      sql`(
        ${workerJobs.progressJson}->'developmentLifecycle'->'workUnit' IS NOT NULL
        OR ${workerJobs.progressJson}->'spec224'->'workUnit' IS NOT NULL
      )`,
      ...(tenantId ? [eq(workerJobs.tenantId, tenantId)] : []),
    ))
    .orderBy(asc(workerJobs.createdAt))
    .limit(limit);
  const waiters: Waiter[] = [];
  for (const row of rows) {
    if (!row.actorId) continue;
    const progress = row.progressJson as Record<string, unknown>;
    const externalWait = progress.externalWait as { metadata?: Record<string, unknown> } | undefined;
    const metadata = externalWait?.metadata?.developmentLifecycle as Record<string, unknown> | undefined;
    const spec224Projection = progress.spec224 as Record<string, unknown> | undefined;
    const genericProjection = progress.developmentLifecycle as Record<string, unknown> | undefined;
    const projection = genericProjection ?? spec224Projection;
    const runId = typeof metadata?.runId === "string" ? metadata.runId
      : typeof projection?.runId === "string" ? projection.runId : null;
    const workUnitValue = projection?.workUnit ?? spec224Projection?.workUnit;
    if (!runId || !workUnitValue || typeof projection?.fencingVersion !== "number") continue;
    try {
      const workUnit = parseDevelopmentWorkUnit(workUnitValue);
      const workId = typeof metadata?.workId === "string" ? metadata.workId : workUnit.workId;
      const dependencyIds = row.status === "waiting_external" && Array.isArray(metadata?.dependencyIds)
        ? metadata.dependencyIds.filter((value): value is string => typeof value === "string")
        : row.status === "waiting_external" && typeof metadata?.dependencyId === "string"
          ? [metadata.dependencyId]
          : workUnit.dependencies.filter(item => item.state === "UNSATISFIED").map(item => item.dependencyId);
      const expectedRevision = Number(projection.projectionVersion ?? spec224Projection?.projectionVersion ?? 0);
      if (!Number.isSafeInteger(expectedRevision)) continue;
      for (const dependencyId of dependencyIds) {
        const dependency = workUnit.dependencies.find(item => item.dependencyId === dependencyId);
        if (!dependency || dependency.state !== "UNSATISFIED" || dependency.consumerWorkId !== workId) continue;
        waiters.push({
          jobId: row.jobId,
          tenantId: row.tenantId,
          actorId: row.actorId,
          runId,
          dependencyId,
          expectedRevision,
          expectedFencingVersion: projection.fencingVersion,
          workUnit,
          dependency,
        });
      }
    } catch {
      // Invalid projections stay visible for operator repair; never resume them.
    }
  }
  return waiters;
}

async function persistEvidence(waiter: Waiter, evidence: DevelopmentDependencyEvidence): Promise<boolean> {
  const digest = createHash("sha256").update(`${waiter.dependencyId}:${evidence.reference}`).digest("hex").slice(0, 48);
  try {
    const result = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).recordDependencyEvidence({
      runId: waiter.runId,
      tenantId: waiter.tenantId,
      actorId: waiter.actorId,
      expectedRevision: waiter.expectedRevision,
      expectedFencingVersion: waiter.expectedFencingVersion,
      idempotencyKey: `dependency-evidence:${digest}`,
      dependencyId: waiter.dependencyId,
      evidence,
    });
    return result.accepted;
  } catch (error) {
    if (error instanceof Error && error.message === "RUN_PROJECTION_STALE") return false;
    throw error;
  }
}

export async function wakeDevelopmentLifecycleWaitersFromEvidence(input: {
  tenantId: string;
  eventType: string;
  evidence: DevelopmentDependencyEvidence;
}): Promise<{ scanned: number; evidenceApplied: number }> {
  getDb();
  const waiters = await listWaiters(500, input.tenantId);
  let evidenceApplied = 0;
  for (const waiter of waiters) {
    if (waiter.tenantId !== input.tenantId) continue;
    const dependency = waiter.dependency;
    if (
      !dependency.wake.eventTypes.includes(input.eventType) ||
      input.evidence.source !== dependency.satisfaction.evidenceSource ||
      input.evidence.projectId !== dependency.projectId ||
      input.evidence.requirementType !== dependency.requirement.type ||
      input.evidence.locator !== dependency.requirement.locator ||
      input.evidence.satisfiesMinimumRevision !== true ||
      (dependency.requirement.minimumRevision !== undefined && typeof input.evidence.revision !== "string")
    ) continue;
    const predicate = getDevelopmentLifecyclePredicate(dependency.satisfaction.predicateId);
    if (!predicate) continue;
    const verified = await predicate.verifyEvidence({
      tenantId: input.tenantId,
      workUnit: waiter.workUnit,
      dependency,
      evidence: input.evidence,
    });
    if (verified && await persistEvidence(waiter, verified)) evidenceApplied += 1;
  }
  return { scanned: waiters.length, evidenceApplied };
}

export async function reconcileDevelopmentLifecycleWaiters(input: {
  limit?: number;
  recheckPredicate?: DevelopmentDependencyPredicateRecheck;
} = {}): Promise<{ scanned: number; eventsChecked: number; predicatesRechecked: number; watchersRepaired: number; evidenceApplied: number; errors: number }> {
  getDb();
  const waiters = await listWaiters(Math.max(1, Math.min(input.limit ?? 100, 500)));
  const result = { scanned: waiters.length, eventsChecked: 0, predicatesRechecked: 0, watchersRepaired: 0, evidenceApplied: 0, errors: 0 };
  const byTenant = new Map<string, Waiter[]>();
  for (const waiter of waiters) byTenant.set(waiter.tenantId, [...(byTenant.get(waiter.tenantId) ?? []), waiter]);

  for (const [tenantId, tenantWaiters] of byTenant) {
    const eventTypes = [...new Set(tenantWaiters.flatMap(waiter => waiter.dependency.wake.eventTypes))];
    const events = await db.select({ payload: workerJobEvents.payloadJson })
      .from(workerJobEvents)
      .innerJoin(workerJobs, eq(workerJobs.id, workerJobEvents.workerJobId))
      .where(and(eq(workerJobs.tenantId, tenantId), inArray(workerJobEvents.eventType, eventTypes)))
      .orderBy(desc(workerJobEvents.createdAt))
      .limit(500);
    for (const waiter of tenantWaiters) {
      try {
        if (waiter.dependency.watcher.status === "MISSING") {
          const repairDigest = createHash("sha256").update(`${waiter.runId}:${waiter.dependencyId}:${waiter.expectedRevision}`).digest("hex").slice(0, 48);
          const repaired = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).repairDependencyWatchers({
            runId: waiter.runId,
            tenantId: waiter.tenantId,
            actorId: waiter.actorId,
            expectedRevision: waiter.expectedRevision,
            expectedFencingVersion: waiter.expectedFencingVersion,
            idempotencyKey: `dependency-watcher-repair:${repairDigest}`,
          });
          if (repaired.accepted) result.watchersRepaired += 1;
          continue;
        }
        let evidence: DevelopmentDependencyEvidence | null = null;
        const predicate = getDevelopmentLifecyclePredicate(waiter.dependency.satisfaction.predicateId);
        for (const event of events) {
          const candidate = evidenceFromEvent(event.payload);
          if (!candidate) continue;
          result.eventsChecked += 1;
          if (
            candidate.source === waiter.dependency.satisfaction.evidenceSource &&
            candidate.projectId === waiter.dependency.projectId &&
            candidate.requirementType === waiter.dependency.requirement.type &&
            candidate.locator === waiter.dependency.requirement.locator &&
            candidate.satisfiesMinimumRevision === true &&
            (!waiter.dependency.requirement.minimumRevision || typeof candidate.revision === "string")
          ) {
            if (predicate) {
              evidence = await predicate.verifyEvidence({
                tenantId,
                workUnit: waiter.workUnit,
                dependency: waiter.dependency,
                evidence: candidate,
              });
              if (evidence) break;
            }
          }
        }
        if (!evidence && input.recheckPredicate) {
          result.predicatesRechecked += 1;
          evidence = await input.recheckPredicate({ tenantId, workUnit: waiter.workUnit, dependency: waiter.dependency });
        } else if (!evidence && predicate) {
          result.predicatesRechecked += 1;
          evidence = await predicate.recheck({ tenantId, workUnit: waiter.workUnit, dependency: waiter.dependency });
        }
        if (evidence && await persistEvidence(waiter, evidence)) result.evidenceApplied += 1;
      } catch {
        result.errors += 1;
      }
    }
  }
  return result;
}
