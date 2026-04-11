import {
  type RoleRoutine,
  type RoleRoutineQueueItem,
  type RoleRoutineRun,
  roleRoutineQueueItemSchema,
} from "../../shared/roleAgentContracts";
import {
  createRoleId,
  getRoleAgent,
  getRoleRoutine,
  listAllRoleRoutineRuns,
  listActiveRoleRoutineRuns,
  listAllRoleQueueItems,
  listAllRoleRoutines,
  listRoleQueueItemsByTenant,
  listRoleRoutineRunsForRoutine,
  listRoleRoutinesByTenant,
  saveRoleRoutineQueueItem,
  saveRoleRoutineRun,
  updateRoleAgent,
  updateRoleRoutine,
  updateRoleRoutineQueueItem,
  updateRoleRoutineRun,
} from "./rolePersistence";
import { ensureRoutineRunCheckpoint, getRoleCheckpointHealth } from "./roleCheckpointService";

const DEFAULT_LEASE_MS = 10 * 60 * 1000;
const DEFAULT_STALE_CHECKPOINT_MINUTES = 120;
const DEFAULT_MAX_ACTIVE_RUNS_PER_ROLE = 5;
const DEFAULT_MAX_QUEUE_DEPTH_PER_ROLE = 20;

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(timestamp: Date, minutes: number): Date {
  return new Date(timestamp.getTime() + minutes * 60 * 1000);
}

function resolveLeaseMs(): number {
  const raw = Number(process.env.ROLE_ROUTINE_LEASE_MS ?? DEFAULT_LEASE_MS);
  return Number.isFinite(raw) && raw >= 30_000 ? raw : DEFAULT_LEASE_MS;
}

function resolveStaleCheckpointMinutes(): number {
  const raw = Number(process.env.ROLE_ROUTINE_STALE_CHECKPOINT_MINUTES ?? DEFAULT_STALE_CHECKPOINT_MINUTES);
  return Number.isFinite(raw) && raw >= 15 ? raw : DEFAULT_STALE_CHECKPOINT_MINUTES;
}

function normalizeTriggerWindowKey(routine: RoleRoutine, current = new Date()): string {
  if (routine.schedule.triggerType === "schedule" && routine.schedule.intervalMinutes) {
    const minutes = routine.schedule.intervalMinutes;
    const epochMinute = Math.floor(current.getTime() / 60_000);
    const bucket = Math.floor(epochMinute / minutes) * minutes;
    return `${bucket}`;
  }
  if (routine.schedule.triggerType === "schedule" && routine.schedule.cron) {
    return current.toISOString().slice(0, 13);
  }
  return current.toISOString();
}

export interface RoleRoutineWakeInput {
  tenantId: string;
  roleId: string;
  routineId: string;
  triggerSource: RoleRoutineQueueItem["triggerSource"];
  concurrencyPolicy: RoleRoutineQueueItem["concurrencyPolicy"];
  workpackFamily?: string | null;
  triggerWindowKey?: string | null;
  eventKey?: string | null;
  partitionKey?: string | null;
  now?: Date;
}

export interface RoleSchedulerTickResult {
  enqueuedQueueItemIds: string[];
  claimedQueueItemIds: string[];
  launchedRoutineRunIds: string[];
  quarantinedRoutineRunIds: string[];
}

export function normalizeRoleRoutineWake(input: RoleRoutineWakeInput): RoleRoutineQueueItem {
  const current = input.now ?? new Date();
  const createdAt = current.toISOString();
  const triggerWindowKey = input.triggerWindowKey ?? createdAt;
  const idempotencyKey = [
    input.tenantId,
    input.roleId,
    input.routineId,
    input.triggerSource,
    input.workpackFamily ?? "none",
    input.eventKey ?? triggerWindowKey,
    input.partitionKey ?? "global",
  ].join(":");

  return roleRoutineQueueItemSchema.parse({
    id: createRoleId("rqi"),
    tenantId: input.tenantId,
    roleId: input.roleId,
    routineId: input.routineId,
    triggerSource: input.triggerSource,
    workpackFamily: input.workpackFamily ?? null,
    triggerWindowKey,
    eventKey: input.eventKey ?? null,
    partitionKey: input.partitionKey ?? null,
    idempotencyKey,
    concurrencyPolicy: input.concurrencyPolicy,
    status: "queued",
    claimState: "available",
    claimantId: null,
    claimedAt: null,
    heartbeatAt: null,
    expiresAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

function shouldWakeRoutine(routine: RoleRoutine, current = new Date()): boolean {
  if (routine.status !== "active") return false;
  if (!routine.nextWakeAt) return routine.schedule.triggerType !== "connector_event";
  const nextWakeAt = Date.parse(routine.nextWakeAt);
  return Number.isFinite(nextWakeAt) && nextWakeAt <= current.getTime();
}

async function roleBackpressureAllowsQueue(input: {
  tenantId: string;
  roleId: string;
}): Promise<boolean> {
  const activeRuns = (await listActiveRoleRoutineRuns(input.tenantId))
    .filter((run) => run.roleId === input.roleId);
  const queueItems = (await listRoleQueueItemsByTenant(input.tenantId))
    .filter((item) => item.roleId === input.roleId)
    .filter((item) => item.status === "queued" || item.status === "claimed");
  return activeRuns.length < DEFAULT_MAX_ACTIVE_RUNS_PER_ROLE && queueItems.length < DEFAULT_MAX_QUEUE_DEPTH_PER_ROLE;
}

export async function materializeDueRoleRoutineWakes(input: {
  tenantId?: string;
  now?: Date;
} = {}): Promise<RoleRoutineQueueItem[]> {
  const current = input.now ?? new Date();
  const routines = input.tenantId
    ? await listRoleRoutinesByTenant(input.tenantId)
    : await listAllRoleRoutines();
  const created: RoleRoutineQueueItem[] = [];

  for (const routine of routines) {
    if (!shouldWakeRoutine(routine, current)) {
      continue;
    }
    if (!(await roleBackpressureAllowsQueue({ tenantId: routine.tenantId, roleId: routine.roleId }))) {
      await updateRoleAgent(routine.roleId, (role) => ({
        ...role,
        healthState: "degraded",
        updatedAt: current.toISOString(),
      }));
      continue;
    }

    const existingQueueItems = await listRoleQueueItemsByTenant(routine.tenantId);
    const triggerWindowKey = normalizeTriggerWindowKey(routine, current);
    const candidate = normalizeRoleRoutineWake({
      tenantId: routine.tenantId,
      roleId: routine.roleId,
      routineId: routine.id,
      triggerSource: routine.schedule.triggerType,
      concurrencyPolicy: routine.concurrencyPolicy,
      workpackFamily: null,
      triggerWindowKey,
      now: current,
    });

    if (existingQueueItems.some((item) => item.idempotencyKey === candidate.idempotencyKey && item.status !== "cancelled")) {
      continue;
    }

    created.push(await saveRoleRoutineQueueItem(candidate));
    await updateRoleRoutine(routine.id, (currentRoutine) => ({
      ...currentRoutine,
      lastWakeAt: current.toISOString(),
      nextWakeAt:
        currentRoutine.schedule.triggerType === "schedule" && currentRoutine.schedule.intervalMinutes
          ? addMinutes(current, currentRoutine.schedule.intervalMinutes).toISOString()
          : currentRoutine.nextWakeAt,
      updatedAt: current.toISOString(),
    }));
  }

  return created;
}

export async function claimNextRoleRoutineQueueItem(input: {
  claimantId: string;
  tenantId?: string;
  now?: Date;
}): Promise<RoleRoutineQueueItem | null> {
  const current = input.now ?? new Date();
  const candidates = (input.tenantId
    ? await listRoleQueueItemsByTenant(input.tenantId)
    : await listAllRoleQueueItems())
    .filter((item) => item.status === "queued" || (item.claimState === "claimed" && item.expiresAt && Date.parse(item.expiresAt) <= current.getTime()))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  const candidate = candidates[0];
  if (!candidate) {
    return null;
  }

  return updateRoleRoutineQueueItem(candidate.id, (currentItem) => ({
    ...currentItem,
    status: "claimed",
    claimState: "claimed",
    claimantId: input.claimantId,
    claimedAt: current.toISOString(),
    heartbeatAt: current.toISOString(),
    expiresAt: new Date(current.getTime() + resolveLeaseMs()).toISOString(),
    updatedAt: current.toISOString(),
  }));
}

export async function renewRoleRoutineQueueClaim(queueItemId: string, claimantId: string, now = new Date()): Promise<RoleRoutineQueueItem | null> {
  return updateRoleRoutineQueueItem(queueItemId, (item) => {
    if (item.claimantId !== claimantId || item.claimState !== "claimed") {
      return item;
    }
    return {
      ...item,
      heartbeatAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + resolveLeaseMs()).toISOString(),
      updatedAt: now.toISOString(),
    };
  });
}

function allowsOverlap(policy: RoleRoutine["concurrencyPolicy"], activeRuns: RoleRoutineRun[], partitionKey: string | null | undefined): boolean {
  if (policy === "allow_overlap") return true;
  if (policy === "partitioned_by_key") {
    return activeRuns.every((run) => run.partitionKey !== (partitionKey ?? null));
  }
  return activeRuns.length === 0;
}

export async function processClaimedRoleRoutineQueueItem(input: {
  queueItemId: string;
  claimantId: string;
  executeRoleRoutineRun?: (routineRunId: string) => Promise<void>;
  now?: Date;
}): Promise<RoleRoutineRun | null> {
  const current = input.now ?? new Date();
  const queueItem = await updateRoleRoutineQueueItem(input.queueItemId, (item) => item);
  if (!queueItem || queueItem.claimantId !== input.claimantId || queueItem.claimState !== "claimed") {
    return null;
  }

  const routine = await getRoleRoutine(queueItem.routineId);
  if (!routine) {
    await updateRoleRoutineQueueItem(queueItem.id, (item) => ({
      ...item,
      status: "cancelled",
      claimState: "released",
      updatedAt: current.toISOString(),
    }));
    return null;
  }

  const activeRuns = (await listRoleRoutineRunsForRoutine(routine.id))
    .filter((run) => run.status === "queued" || run.status === "running" || run.status === "awaiting_approval");

  const duplicateRun = activeRuns.find((run) => run.idempotencyKey === queueItem.idempotencyKey);
  if (duplicateRun) {
    await updateRoleRoutineQueueItem(queueItem.id, (item) => ({
      ...item,
      status: "completed",
      claimState: "released",
      updatedAt: current.toISOString(),
    }));
    return duplicateRun;
  }

  if (!allowsOverlap(routine.concurrencyPolicy, activeRuns, queueItem.partitionKey)) {
    await updateRoleRoutineQueueItem(queueItem.id, (item) => ({
      ...item,
      status: "completed",
      claimState: "released",
      updatedAt: current.toISOString(),
    }));
    return activeRuns[0] ?? null;
  }

  const run = await saveRoleRoutineRun({
    id: createRoleId("rrun"),
    tenantId: queueItem.tenantId,
    roleId: queueItem.roleId,
    routineId: queueItem.routineId,
    contractId: routine.contractId,
    status: "queued",
    triggerSource: queueItem.triggerSource,
    idempotencyKey: queueItem.idempotencyKey,
    selectedWorkpackFamily: queueItem.workpackFamily ?? null,
    resolvedWorkpackVersionId: null,
    linkedWorkpackRunIds: [],
    checkpointId: null,
    recoveryState: "fresh",
    resolutionPolicy: null,
    previousResolvedVersionId: null,
    rollbackBaselineVersionId: routine.rollbackBaselineVersionId ?? null,
    partitionKey: queueItem.partitionKey ?? null,
    blockerCodes: [],
    currentObjectiveSummary: `${routine.title} triggered by ${queueItem.triggerSource}`,
    approvalRequestIds: [],
    startedAt: current.toISOString(),
    endedAt: null,
    createdAt: current.toISOString(),
    updatedAt: current.toISOString(),
  });

  await ensureRoutineRunCheckpoint({
    tenantId: queueItem.tenantId,
    roleId: queueItem.roleId,
    routineId: queueItem.routineId,
    routineRunId: run.id,
    objectiveSummary: run.currentObjectiveSummary,
    healthState: "healthy",
    activeQueueSummary: [`Queue item ${queueItem.id} claimed by ${input.claimantId}`],
    nextWakeConditions: routine.nextWakeAt ? [`next wake ${routine.nextWakeAt}`] : [],
  });

  await updateRoleRoutineQueueItem(queueItem.id, (item) => ({
    ...item,
    status: "completed",
    claimState: "released",
    updatedAt: current.toISOString(),
  }));

  if (input.executeRoleRoutineRun) {
    await input.executeRoleRoutineRun(run.id);
  }

  return run;
}

export async function evaluateRoleSchedulerWatchdog(input: {
  tenantId?: string;
  now?: Date;
} = {}): Promise<RoleRoutineRun[]> {
  const current = input.now ?? new Date();
  const activeRuns = input.tenantId
    ? (await listActiveRoleRoutineRuns(input.tenantId))
    : (await listAllRoleRoutineRuns())
      .filter((run) => run.status === "queued" || run.status === "running" || run.status === "awaiting_approval");

  const quarantined: RoleRoutineRun[] = [];
  for (const run of activeRuns) {
    const checkpointHealth = await getRoleCheckpointHealth(run.roleId);
    if (checkpointHealth.freshnessTier !== "critical") {
      continue;
    }
    if ((checkpointHealth.ageMinutes ?? 0) < resolveStaleCheckpointMinutes()) {
      continue;
    }
    const updated = await updateRoleRoutineRun(run.id, (currentRun) => ({
      ...currentRun,
      status: "quarantined",
      recoveryState: "needs_resume_review",
      blockerCodes: Array.from(new Set([...currentRun.blockerCodes, "checkpoint_stale"])),
      endedAt: current.toISOString(),
      updatedAt: current.toISOString(),
    }));
    if (updated) {
      quarantined.push(updated);
      await updateRoleAgent(run.roleId, (role) => ({
        ...role,
        lifecycleState: "quarantined",
        healthState: "quarantined",
        updatedAt: current.toISOString(),
      }));
      await ensureRoutineRunCheckpoint({
        tenantId: updated.tenantId,
        roleId: updated.roleId,
        routineId: updated.routineId,
        routineRunId: updated.id,
        objectiveSummary: updated.currentObjectiveSummary,
        healthState: "quarantined",
        activeQueueSummary: [],
        nextWakeConditions: ["safe resume review required"],
      });
    }
  }
  return quarantined;
}

export async function tickRoleRoutineScheduler(input: {
  tenantId?: string;
  claimantId: string;
  executeRoleRoutineRun?: (routineRunId: string) => Promise<void>;
  now?: Date;
}): Promise<RoleSchedulerTickResult> {
  const enqueued = await materializeDueRoleRoutineWakes({ tenantId: input.tenantId, now: input.now });
  const claimedIds: string[] = [];
  const launchedIds: string[] = [];

  while (true) {
    const claimed = await claimNextRoleRoutineQueueItem({
      claimantId: input.claimantId,
      tenantId: input.tenantId,
      now: input.now,
    });
    if (!claimed) break;
    claimedIds.push(claimed.id);
    const run = await processClaimedRoleRoutineQueueItem({
      queueItemId: claimed.id,
      claimantId: input.claimantId,
      executeRoleRoutineRun: input.executeRoleRoutineRun,
      now: input.now,
    });
    if (run) {
      launchedIds.push(run.id);
    }
  }

  const quarantined = await evaluateRoleSchedulerWatchdog({ tenantId: input.tenantId, now: input.now });

  return {
    enqueuedQueueItemIds: enqueued.map((item) => item.id),
    claimedQueueItemIds: claimedIds,
    launchedRoutineRunIds: launchedIds,
    quarantinedRoutineRunIds: quarantined.map((run) => run.id),
  };
}
