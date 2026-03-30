import crypto from "crypto";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";

import { getDb } from "../db";
import {
  skillMaintenanceSchedules,
  skills,
  type Skill,
  type SkillMaintenanceSchedule,
} from "../../drizzle/schema";
import { analyzeSkillForMaintenance } from "./skillMaintenanceAnalyzer";
import { persistSkillMaintenanceAnalysis } from "./skillUpgradePlanner";
import { computeNextRun, validateCronStrict, validateTimeZone } from "../routers/scheduleDraftTool";

type DbLike = any;

const DEFAULT_SWEEP_LIMIT = 100;
const SCHEDULE_LOCK_TTL_MS = 20 * 60_000;

export interface MaintenanceSweepInput {
  limit?: number;
  category?: string;
  executionMode?: string;
  genjsCandidatesOnly?: boolean;
}

export interface MaintenanceSweepResult {
  scannedCount: number;
  analyzedCount: number;
  results: Array<{
    skillId: number;
    skillSlug: string;
    qualityScore: number;
    recommendationCount: number;
    isGenjsCandidate: boolean;
  }>;
}

export interface ResolvedMaintenanceScheduleInput {
  name: string;
  description?: string | null;
  cronExpression: string;
  timezone: string;
  scopeType: string;
  scopeJson: Record<string, unknown>;
  policyJson: Record<string, unknown>;
  status: "active" | "paused" | "disabled";
  nextRunAt: Date | null;
}

let intervalId: NodeJS.Timeout | null = null;
let initialTimeoutId: NodeJS.Timeout | null = null;
let tickInFlight = false;

function normalizeScheduleLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SWEEP_LIMIT;
  }
  return Math.max(1, Math.min(200, Math.floor(value)));
}

export function resolveMaintenanceSweepInput(
  schedule: Pick<SkillMaintenanceSchedule, "scopeType" | "scopeJson">,
): MaintenanceSweepInput {
  const scopeJson = (schedule.scopeJson as Record<string, unknown> | null) ?? {};
  const base: MaintenanceSweepInput = {
    limit: normalizeScheduleLimit(scopeJson.limit),
  };

  if (schedule.scopeType === "category") {
    return {
      ...base,
      category: typeof scopeJson.category === "string" ? scopeJson.category : undefined,
      genjsCandidatesOnly: Boolean(scopeJson.genjsCandidatesOnly),
    };
  }

  if (schedule.scopeType === "execution_mode") {
    return {
      ...base,
      executionMode: typeof scopeJson.executionMode === "string" ? scopeJson.executionMode : undefined,
      genjsCandidatesOnly: Boolean(scopeJson.genjsCandidatesOnly),
    };
  }

  if (schedule.scopeType === "genjs_candidates") {
    return {
      ...base,
      category: typeof scopeJson.category === "string" ? scopeJson.category : undefined,
      executionMode: typeof scopeJson.executionMode === "string" ? scopeJson.executionMode : undefined,
      genjsCandidatesOnly: true,
    };
  }

  return {
    ...base,
    category: typeof scopeJson.category === "string" ? scopeJson.category : undefined,
    executionMode: typeof scopeJson.executionMode === "string" ? scopeJson.executionMode : undefined,
    genjsCandidatesOnly: Boolean(scopeJson.genjsCandidatesOnly),
  };
}

export function resolveMaintenanceScheduleInput(input: {
  name: string;
  description?: string | null;
  cronExpression?: string | null;
  timezone?: string | null;
  scopeType?: string | null;
  scopeJson?: Record<string, unknown> | null;
  policyJson?: Record<string, unknown> | null;
  status?: "active" | "paused" | "disabled" | null;
}): ResolvedMaintenanceScheduleInput {
  const cronExpression = input.cronExpression?.trim() || "0 2 * * *";
  const cronCheck = validateCronStrict(cronExpression);
  if (!cronCheck.valid) {
    throw new Error(cronCheck.error || "Invalid cron expression");
  }
  const timezone = input.timezone?.trim() || "UTC";
  const timezoneCheck = validateTimeZone(timezone);
  if (!timezoneCheck.valid) {
    throw new Error(timezoneCheck.error || "Invalid timezone");
  }

  const status = input.status ?? "active";
  const nextRunAt = status === "active"
    ? computeNextRun("recurring", cronExpression, undefined, timezone)
    : null;

  if (status === "active" && !nextRunAt) {
    throw new Error("Could not compute the next maintenance run for this schedule");
  }

  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    cronExpression,
    timezone,
    scopeType: input.scopeType?.trim() || "all_skills",
    scopeJson: input.scopeJson ?? {},
    policyJson: input.policyJson ?? {},
    status,
    nextRunAt,
  };
}

async function listSkillsForSweep(
  db: DbLike,
  filters: MaintenanceSweepInput,
  tenantId?: string | null,
): Promise<Skill[]> {
  const conditions = [];

  if (tenantId) {
    conditions.push(eq(skills.tenantId, tenantId));
  }
  if (filters.category) {
    conditions.push(eq(skills.category, filters.category as any));
  }
  if (filters.executionMode) {
    conditions.push(eq(skills.executionMode, filters.executionMode as any));
  }

  let query = db.select().from(skills);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  query = query.orderBy(asc(skills.id)) as typeof query;
  query = query.limit(filters.limit ?? DEFAULT_SWEEP_LIMIT) as typeof query;

  return query;
}

export async function executeSkillMaintenanceSweep(params: {
  db: DbLike;
  requestedBy?: number | null;
  scheduleId?: number | null;
  triggerSource?: string;
  tenantId?: string | null;
  filters?: MaintenanceSweepInput;
}): Promise<MaintenanceSweepResult> {
  const {
    db,
    requestedBy = null,
    scheduleId = null,
    triggerSource = "manual",
    tenantId = null,
    filters = {},
  } = params;

  const rows = await listSkillsForSweep(db, {
    limit: filters.limit ?? DEFAULT_SWEEP_LIMIT,
    category: filters.category,
    executionMode: filters.executionMode,
    genjsCandidatesOnly: filters.genjsCandidatesOnly,
  }, tenantId);

  const results: MaintenanceSweepResult["results"] = [];
  let scannedCount = 0;

  for (const skill of rows) {
    scannedCount += 1;

    const preview = analyzeSkillForMaintenance({
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      folderPath: skill.folderPath,
      executionMode: skill.executionMode,
      configJson: (skill.configJson as Record<string, unknown> | null) ?? null,
      sandboxProfileSlug: skill.sandboxProfileSlug,
      requiresNetwork: skill.requiresNetwork,
      requiresBrowser: skill.requiresBrowser,
    });

    if (filters.genjsCandidatesOnly && !preview.isGenjsCandidate) {
      continue;
    }

    const persisted = await persistSkillMaintenanceAnalysis({
      db,
      skill,
      requestedBy,
      scheduleId,
      triggerSource,
    });

    results.push({
      skillId: skill.id,
      skillSlug: skill.slug,
      qualityScore: persisted.analysis.qualityScore,
      recommendationCount: persisted.recommendations.length,
      isGenjsCandidate: persisted.analysis.isGenjsCandidate,
    });
  }

  return {
    scannedCount,
    analyzedCount: results.length,
    results,
  };
}

async function executeDueSchedule(
  db: DbLike,
  schedule: SkillMaintenanceSchedule,
): Promise<void> {
  const now = new Date();
  const lockToken = crypto.randomUUID();
  const lockExpiresAt = new Date(now.getTime() + SCHEDULE_LOCK_TTL_MS);

  const [claimedSchedule] = await db
    .update(skillMaintenanceSchedules)
    .set({
      runningAt: now,
      lockToken,
      lockExpiresAt,
      updatedAt: new Date(),
    })
    .where(and(
      eq(skillMaintenanceSchedules.id, schedule.id),
      eq(skillMaintenanceSchedules.status, "active"),
      or(
        isNull(skillMaintenanceSchedules.nextRunAt),
        lte(skillMaintenanceSchedules.nextRunAt, now),
      ),
      or(
        isNull(skillMaintenanceSchedules.lockExpiresAt),
        lte(skillMaintenanceSchedules.lockExpiresAt, now),
      ),
    ))
    .returning();

  if (!claimedSchedule) {
    return;
  }

  const filters = resolveMaintenanceSweepInput(schedule);

  try {
    await executeSkillMaintenanceSweep({
      db,
      requestedBy: claimedSchedule.createdBy ?? null,
      scheduleId: claimedSchedule.id,
      triggerSource: "schedule",
      tenantId: claimedSchedule.tenantId,
      filters,
    });

    await db
      .update(skillMaintenanceSchedules)
      .set({
        lastRunAt: now,
        nextRunAt: claimedSchedule.status === "active"
          ? computeNextRun("recurring", claimedSchedule.cronExpression || undefined, undefined, claimedSchedule.timezone)
          : null,
        runningAt: null,
        lockToken: null,
        lockExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(skillMaintenanceSchedules.id, claimedSchedule.id),
        eq(skillMaintenanceSchedules.lockToken, lockToken),
      ));
  } catch (error) {
    console.error(
      `[SkillMaintenanceScheduler] Schedule ${claimedSchedule.id} failed:`,
      error instanceof Error ? error.message : error,
    );

    await db
      .update(skillMaintenanceSchedules)
      .set({
        lastRunAt: now,
        nextRunAt: claimedSchedule.status === "active"
          ? computeNextRun("recurring", claimedSchedule.cronExpression || undefined, undefined, claimedSchedule.timezone)
          : null,
        runningAt: null,
        lockToken: null,
        lockExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(skillMaintenanceSchedules.id, claimedSchedule.id),
        eq(skillMaintenanceSchedules.lockToken, lockToken),
      ));
  }
}

export async function runDueSkillMaintenanceSchedules(now = new Date()): Promise<{ scannedSchedules: number; executedSchedules: number }> {
  const db = await getDb();
  if (!db) {
    return { scannedSchedules: 0, executedSchedules: 0 };
  }

  const schedules = await db
    .select()
    .from(skillMaintenanceSchedules)
    .where(eq(skillMaintenanceSchedules.status, "active"))
    .orderBy(asc(skillMaintenanceSchedules.id));

  let executedSchedules = 0;

  for (const schedule of schedules) {
    const shouldRun = !schedule.nextRunAt || schedule.nextRunAt <= now;
    if (!shouldRun) {
      continue;
    }

    executedSchedules += 1;
    await executeDueSchedule(db, schedule);
  }

  return {
    scannedSchedules: schedules.length,
    executedSchedules,
  };
}

export async function initializeSkillMaintenanceScheduler(): Promise<void> {
  if (intervalId || initialTimeoutId) {
    return;
  }

  initialTimeoutId = setTimeout(() => {
    initialTimeoutId = null;
    void runSkillMaintenanceSchedulerTick();
    intervalId = setInterval(() => {
      void runSkillMaintenanceSchedulerTick();
    }, 15 * 60_000);
  }, 60_000);

  console.log("[SkillMaintenanceScheduler] Job initialized (every 15 minutes)");
}

async function runSkillMaintenanceSchedulerTick(): Promise<void> {
  if (tickInFlight) {
    return;
  }

  tickInFlight = true;
  try {
    await runDueSkillMaintenanceSchedules();
  } catch (error) {
    console.error(
      "[SkillMaintenanceScheduler] Tick failed:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    tickInFlight = false;
  }
}

export async function shutdownSkillMaintenanceScheduler(): Promise<void> {
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId);
    initialTimeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  tickInFlight = false;
}
