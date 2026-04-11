import type { RoleRoutineRunStatus } from "../../shared/roleAgentContracts";
import { launchWorkpack } from "./workpackLaunchService";
import { getWorkpackRun } from "./workpackPersistence";
import { ensureRoutineRunCheckpoint } from "./roleCheckpointService";
import {
  getRoleRoutineRun,
  listAllRoleRoutineRuns,
  updateRoleAgent,
  updateRoleRoutineRun,
} from "./rolePersistence";
import { resolveRoleRoutineRunWorkpackTarget } from "./roleWorkpackResolutionService";

function nowIso(): string {
  return new Date().toISOString();
}

function mapRoleAutonomyTierToWorkpackMode(tier: "manual" | "guided" | "supervised" | "autonomous"): "supervised" | "autonomous" {
  return tier === "autonomous" ? "autonomous" : "supervised";
}

function mapWorkpackRunStatus(status: "queued" | "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled" | "blocked"): RoleRoutineRunStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "awaiting_approval":
      return "awaiting_approval";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "blocked":
    default:
      return "blocked";
  }
}

export async function executeRoleRoutineRun(input: {
  routineRunId: string;
  requestedBy?: number | null;
}): Promise<{
  routineRunId: string;
  workpackRunId: string;
  workpackId: string;
  versionId: string;
  status: RoleRoutineRunStatus;
}> {
  const run = await getRoleRoutineRun(input.routineRunId);
  if (!run) {
    throw new Error(`Unknown role routine run: ${input.routineRunId}`);
  }

  const resolved = await resolveRoleRoutineRunWorkpackTarget(run.id);
  const workpackLaunch = await launchWorkpack({
    workpackId: resolved.workpackId,
    requestedBy: input.requestedBy ?? null,
    autonomyMode: mapRoleAutonomyTierToWorkpackMode(resolved.effectiveAutonomyTier),
    trigger: "role_agent",
    triggerSource: `role_routine_run:${run.id}`,
  });

  const nextStatus = mapWorkpackRunStatus(workpackLaunch.run.status);
  await updateRoleRoutineRun(run.id, (current) => ({
    ...current,
    status: nextStatus,
    selectedWorkpackFamily: resolved.workpackId,
    resolvedWorkpackVersionId: resolved.versionId,
    linkedWorkpackRunIds: Array.from(new Set([...current.linkedWorkpackRunIds, workpackLaunch.run.id])),
    recoveryState: nextStatus === "failed" || nextStatus === "blocked" ? "needs_resume_review" : "fresh",
    blockerCodes: nextStatus === "failed" || nextStatus === "blocked"
      ? Array.from(new Set([...current.blockerCodes, ...resolved.blockers]))
      : current.blockerCodes,
    updatedAt: nowIso(),
  }));

  await updateRoleAgent(run.roleId, (role) => ({
    ...role,
    lifecycleState: nextStatus === "failed" || nextStatus === "blocked" ? "degraded" : role.lifecycleState === "draft" ? "active" : role.lifecycleState,
    healthState: nextStatus === "failed" || nextStatus === "blocked" ? "degraded" : "healthy",
    updatedAt: nowIso(),
  }));

  await ensureRoutineRunCheckpoint({
    tenantId: run.tenantId,
    roleId: run.roleId,
    routineId: run.routineId,
    routineRunId: run.id,
    objectiveSummary: `Resolved ${resolved.workpackId}@${resolved.versionId} and launched workpack run ${workpackLaunch.run.id}`,
    healthState: nextStatus === "failed" || nextStatus === "blocked" ? "degraded" : "healthy",
    activeQueueSummary: [`Linked workpack run ${workpackLaunch.run.id}`],
    nextWakeConditions: nextStatus === "awaiting_approval" ? ["awaiting approval"] : [],
  });

  return {
    routineRunId: run.id,
    workpackRunId: workpackLaunch.run.id,
    workpackId: resolved.workpackId,
    versionId: resolved.versionId,
    status: nextStatus,
  };
}

export async function reconcileRoleRoutineRuns(input: {
  tenantId?: string;
} = {}): Promise<string[]> {
  const runs = (await listAllRoleRoutineRuns())
    .filter((run) => (!input.tenantId || run.tenantId === input.tenantId))
    .filter((run) => run.linkedWorkpackRunIds.length > 0)
    .filter((run) => run.status === "queued" || run.status === "running" || run.status === "awaiting_approval");

  const reconciled: string[] = [];
  for (const run of runs) {
    const linkedRuns = await Promise.all(run.linkedWorkpackRunIds.map((id) => getWorkpackRun(id)));
    const current = linkedRuns.filter(Boolean);
    if (current.length === 0) continue;
    const latest = current.sort((left, right) => (right!.endedAt ?? right!.startedAt).localeCompare(left!.endedAt ?? left!.startedAt))[0]!;
    const nextStatus = mapWorkpackRunStatus(latest.status);
    if (nextStatus === run.status) continue;

    await updateRoleRoutineRun(run.id, (currentRun) => ({
      ...currentRun,
      status: nextStatus,
      recoveryState: nextStatus === "failed" || nextStatus === "blocked" ? "needs_resume_review" : currentRun.recoveryState,
      endedAt: nextStatus === "succeeded" || nextStatus === "failed" || nextStatus === "blocked" || nextStatus === "cancelled"
        ? (latest.endedAt ?? nowIso())
        : currentRun.endedAt,
      updatedAt: nowIso(),
    }));
    await updateRoleAgent(run.roleId, (role) => ({
      ...role,
      healthState: nextStatus === "failed" || nextStatus === "blocked" ? "degraded" : nextStatus === "succeeded" ? "healthy" : role.healthState,
      updatedAt: nowIso(),
    }));
    await ensureRoutineRunCheckpoint({
      tenantId: run.tenantId,
      roleId: run.roleId,
      routineId: run.routineId,
      routineRunId: run.id,
      objectiveSummary: `Workpack run ${latest.id} is ${latest.status}`,
      healthState: nextStatus === "failed" || nextStatus === "blocked" ? "degraded" : "healthy",
      activeQueueSummary: [],
      nextWakeConditions: nextStatus === "awaiting_approval" ? ["awaiting approval"] : [],
    });
    reconciled.push(run.id);
  }

  return reconciled;
}
