import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  teamRooms,
  teamRuns,
  workerJobAttempts,
  workerJobs,
} from "../../drizzle/schema";
import type { LeaseContext } from "./jobControlPlaneTypes";

export class AutoTeamRunMutationFenceError extends Error {
  readonly code = "AUTO_TEAM_RUN_MUTATION_FENCE_REJECTED";

  constructor() {
    super(
      "AutoTeam run mutation rejected because its worker lease is stale or unbound"
    );
    this.name = "AutoTeamRunMutationFenceError";
  }
}

export type AutoTeamRunMutationFenceContext = {
  lease: LeaseContext;
  tenantId: string;
  runId: string;
};

const activeFence = new AsyncLocalStorage<AutoTeamRunMutationFenceContext>();

export function withAutoTeamRunMutationFenceContext<T>(
  context: AutoTeamRunMutationFenceContext,
  work: () => Promise<T>
): Promise<T> {
  return activeFence.run(context, work);
}

export function getAutoTeamRunMutationFenceContext(
  tenantId: string,
  runId: string
): AutoTeamRunMutationFenceContext | null {
  const context = activeFence.getStore();
  if (!context) return null;
  if (context.tenantId !== tenantId || context.runId !== runId) {
    throw new AutoTeamRunMutationFenceError();
  }
  return context;
}

export async function persistAutoTeamRunMutation<T>(input: {
  executor: any;
  tenantId?: string;
  runId: string;
  mutate: (executor: any) => Promise<T>;
}): Promise<T> {
  const activeContext = activeFence.getStore();
  if (!activeContext) return input.mutate(input.executor);
  const context = getAutoTeamRunMutationFenceContext(
    input.tenantId ?? activeContext.tenantId,
    input.runId
  );
  if (!context) throw new AutoTeamRunMutationFenceError();
  return withAutoTeamRunMutationFence({ ...context, mutate: input.mutate });
}

/**
 * Runs a TeamRun mutation while holding the canonical worker_jobs row lock.
 * Lease reclaim updates the same row, so the authority check and business write
 * are ordered atomically without adding another run lease or schema field.
 */
export async function withAutoTeamRunMutationFence<T>(input: {
  lease: LeaseContext;
  tenantId: string;
  runId: string;
  mutate: (tx: any) => Promise<T>;
}): Promise<T> {
  const db = getDb();
  const tokenHash = createHash("sha256")
    .update(input.lease.leaseToken, "utf8")
    .digest("hex");

  return db.transaction(async tx => {
    const [authority] = await tx
      .select({
        jobId: workerJobs.id,
        jobType: workerJobs.jobType,
        jobInput: workerJobs.inputJson,
        jobAttempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        leaseOwnerToken: workerJobs.leaseOwnerToken,
        attemptId: workerJobAttempts.id,
        attemptNumber: workerJobAttempts.attempt,
        leaseGeneration: workerJobAttempts.leaseGeneration,
        attemptTokenHash: workerJobAttempts.leaseTokenHash,
      })
      .from(workerJobs)
      .innerJoin(
        workerJobAttempts,
        and(
          eq(workerJobAttempts.workerJobId, workerJobs.id),
          eq(workerJobAttempts.id, input.lease.attemptId)
        )
      )
      .where(
        and(
          eq(workerJobs.id, input.lease.jobId),
          eq(workerJobs.tenantId, input.tenantId),
          eq(workerJobs.jobType, "auto-team.recovery.evaluate"),
          eq(workerJobs.status, "running"),
          eq(workerJobs.fencingVersion, input.lease.fencingVersion),
          eq(workerJobs.leaseOwnerToken, tokenHash),
          eq(workerJobAttempts.leaseGeneration, input.lease.fencingVersion),
          eq(workerJobAttempts.leaseTokenHash, tokenHash),
          sql`${workerJobs.leaseExpiresAt} > clock_timestamp()`
        )
      )
      .for("update", { of: workerJobs });

    const jobInput = authority?.jobInput;
    const jobRunId =
      jobInput && typeof jobInput === "object" && !Array.isArray(jobInput)
        ? (jobInput as Record<string, unknown>).runId
        : null;
    if (
      !authority ||
      authority.attemptId !== input.lease.attemptId ||
      authority.jobAttempt !== authority.attemptNumber ||
      authority.fencingVersion !== input.lease.fencingVersion ||
      authority.leaseOwnerToken !== tokenHash ||
      authority.attemptTokenHash !== tokenHash ||
      jobRunId !== input.runId
    ) {
      throw new AutoTeamRunMutationFenceError();
    }

    const [run] = await tx
      .select({ id: teamRuns.id, status: teamRuns.status })
      .from(teamRuns)
      .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
      .where(
        and(
          eq(teamRuns.id, input.runId),
          eq(teamRooms.tenantId, input.tenantId)
        )
      )
      .for("update", { of: teamRuns });
    if (!run || !["queued", "running", "paused"].includes(run.status)) {
      throw new AutoTeamRunMutationFenceError();
    }

    return input.mutate(tx);
  });
}
