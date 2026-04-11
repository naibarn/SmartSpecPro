import {
  buildDefaultRoleContextGovernance,
  type CheckpointRecoveryState,
  type RoleCheckpoint,
} from "../../shared/roleAgentContracts";
import {
  createRoleId,
  getRoleCheckpoint,
  getLatestRoleCheckpoint,
  saveRoleCheckpoint,
  updateRoleAgent,
  updateRoleCheckpoint,
  updateRoleRoutineRun,
} from "./rolePersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export interface RoleCheckpointHealth {
  checkpoint: RoleCheckpoint | null;
  ageMinutes: number | null;
  freshnessTier: "fresh" | "warning" | "critical";
  recoveryState: CheckpointRecoveryState | null;
}

export function checkpointAgeMinutes(updatedAt: string | null | undefined, now = Date.now()): number | null {
  if (!updatedAt) return null;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((now - parsed) / 60_000));
}

export function freshnessTierFromAge(ageMinutes: number | null): RoleCheckpointHealth["freshnessTier"] {
  if (ageMinutes === null || ageMinutes <= 30) return "fresh";
  if (ageMinutes <= 120) return "warning";
  return "critical";
}

export async function writeRoleCheckpoint(input: {
  tenantId: string;
  roleId: string;
  routineId?: string | null;
  routineRunId?: string | null;
  checkpointId?: string | null;
  objectiveSummary: string;
  activeQueueSummary?: string[];
  recentDecisions?: string[];
  pendingApprovalIds?: string[];
  nextWakeConditions?: string[];
  progressCursor?: Record<string, unknown>;
  healthState: RoleCheckpoint["healthState"];
  recoveryState?: CheckpointRecoveryState;
  lastSuccessfulOutcomeSummary?: string | null;
  memorySummaryIds?: string[];
  governance?: Partial<RoleCheckpoint["governance"]>;
}): Promise<RoleCheckpoint> {
  const timestamp = nowIso();
  const checkpoint = await saveRoleCheckpoint({
    id: input.checkpointId ?? createRoleId("chk"),
    tenantId: input.tenantId,
    roleId: input.roleId,
    routineId: input.routineId ?? null,
    routineRunId: input.routineRunId ?? null,
    recoveryState: input.recoveryState ?? "fresh",
    objectiveSummary: input.objectiveSummary,
    activeQueueSummary: input.activeQueueSummary ?? [],
    recentDecisions: input.recentDecisions ?? [],
    pendingApprovalIds: input.pendingApprovalIds ?? [],
    nextWakeConditions: input.nextWakeConditions ?? [],
    progressCursor: input.progressCursor ?? {},
    healthState: input.healthState,
    lastSuccessfulOutcomeSummary: input.lastSuccessfulOutcomeSummary ?? null,
    memorySummaryIds: input.memorySummaryIds ?? [],
    governance: buildDefaultRoleContextGovernance(input.governance),
    createdAt: input.checkpointId ? timestamp : timestamp,
    updatedAt: timestamp,
  });

  await updateRoleAgent(input.roleId, (current) => ({
    ...current,
    lastCheckpointAt: checkpoint.updatedAt,
    lastRoutineRunId: input.routineRunId ?? current.lastRoutineRunId ?? null,
    healthState: checkpoint.healthState,
    updatedAt: timestamp,
  }));

  if (input.routineRunId) {
    await updateRoleRoutineRun(input.routineRunId, (run) => ({
      ...run,
      checkpointId: checkpoint.id,
      recoveryState: checkpoint.recoveryState,
      updatedAt: timestamp,
    }));
  }

  return checkpoint;
}

export async function updateCheckpointRecoveryState(
  checkpointId: string,
  recoveryState: CheckpointRecoveryState,
): Promise<RoleCheckpoint | null> {
  const timestamp = nowIso();
  return updateRoleCheckpoint(checkpointId, (current) => ({
    ...current,
    recoveryState,
    updatedAt: timestamp,
  }));
}

export async function getRoleCheckpointHealth(roleId: string): Promise<RoleCheckpointHealth> {
  const checkpoint = await getLatestRoleCheckpoint(roleId);
  const ageMinutes = checkpointAgeMinutes(checkpoint?.updatedAt ?? checkpoint?.createdAt ?? null);
  return {
    checkpoint,
    ageMinutes,
    freshnessTier: freshnessTierFromAge(ageMinutes),
    recoveryState: checkpoint?.recoveryState ?? null,
  };
}

export async function ensureRoutineRunCheckpoint(input: {
  tenantId: string;
  roleId: string;
  routineId: string;
  routineRunId: string;
  objectiveSummary: string;
  healthState: RoleCheckpoint["healthState"];
  activeQueueSummary?: string[];
  nextWakeConditions?: string[];
}): Promise<RoleCheckpoint> {
  const latest = await getLatestRoleCheckpoint(input.roleId);
  const existing = latest?.routineRunId === input.routineRunId && latest.id
    ? await getRoleCheckpoint(latest.id)
    : null;
  return writeRoleCheckpoint({
    tenantId: input.tenantId,
    roleId: input.roleId,
    routineId: input.routineId,
    routineRunId: input.routineRunId,
    checkpointId: existing?.id ?? null,
    objectiveSummary: input.objectiveSummary,
    activeQueueSummary: input.activeQueueSummary,
    nextWakeConditions: input.nextWakeConditions,
    healthState: input.healthState,
    recoveryState: existing?.recoveryState ?? "fresh",
  });
}
