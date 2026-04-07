import { and, eq, gte, sql } from "drizzle-orm";

import { getDb } from "../db";
import { creditTransactions, workers } from "../../drizzle/schema";
import {
  readDelegatedWorkerSpendBudgetPolicy,
  type WorkerSpendBudgetPolicy,
} from "./delegatedWorkerPlatformService";
import { auditLogger } from "./auditLogger";

type WorkerRecord = Record<string, any>;

type BudgetWindowDefinition = {
  label: "hourly" | "five_hour" | "daily" | "weekly" | "monthly";
  key: keyof WorkerSpendBudgetPolicy;
  durationMs: number;
};

const BUDGET_WINDOWS: BudgetWindowDefinition[] = [
  { label: "hourly", key: "hourlyCredits", durationMs: 60 * 60 * 1000 },
  { label: "five_hour", key: "fiveHourCredits", durationMs: 5 * 60 * 60 * 1000 },
  { label: "daily", key: "dailyCredits", durationMs: 24 * 60 * 60 * 1000 },
  { label: "weekly", key: "weeklyCredits", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { label: "monthly", key: "monthlyCredits", durationMs: 30 * 24 * 60 * 60 * 1000 },
];

export interface WorkerBudgetWindowSummary {
  label: BudgetWindowDefinition["label"];
  capCredits: number | null;
  usedCredits: number;
  remainingCredits: number | null;
  blocked: boolean;
}

export interface WorkerBudgetSettingsSummary {
  workerId: string;
  displayName: string;
  runtimeType: string;
  ownerUserId: number | null;
  budgets: WorkerSpendBudgetPolicy;
  windows: WorkerBudgetWindowSummary[];
  blockedByBudget: boolean;
}

export class WorkerBudgetError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "WorkerBudgetError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sanitizeBudgetValue(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new WorkerBudgetError("invalid_budget_value", 400, "Budget values must be numeric or empty");
  }
  if (numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}

function sanitizeBudgetUpdate(input: WorkerSpendBudgetPolicy): WorkerSpendBudgetPolicy {
  return {
    hourlyCredits: sanitizeBudgetValue(input.hourlyCredits),
    fiveHourCredits: sanitizeBudgetValue(input.fiveHourCredits),
    dailyCredits: sanitizeBudgetValue(input.dailyCredits),
    weeklyCredits: sanitizeBudgetValue(input.weeklyCredits),
    monthlyCredits: sanitizeBudgetValue(input.monthlyCredits),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadWorker(tenantId: string, workerId: string): Promise<WorkerRecord | null> {
  const db = await getDb();
  const [worker] = await db
    .select()
    .from(workers)
    .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
    .limit(1);
  return worker ?? null;
}

async function sumWorkerUsageCreditsSince(
  userId: number,
  workerId: string,
  since: Date,
): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(case when ${creditTransactions.amount} < 0 then -${creditTransactions.amount} else 0 end), 0)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "usage"),
        gte(creditTransactions.createdAt, since),
        sql`${creditTransactions.metadata} ->> 'workerId' = ${workerId}`,
      ),
    );
  return Number(row?.total ?? 0);
}

function assertWorkerOwnership(worker: WorkerRecord, ownerUserId?: number | null): void {
  if (ownerUserId == null) {
    return;
  }
  if (!worker.registeredByUserId || Number(worker.registeredByUserId) !== Number(ownerUserId)) {
    throw new WorkerBudgetError(
      "worker_scope_mismatch",
      403,
      "You can only manage budgets for your own personal workers",
    );
  }
}

export async function getWorkerBudgetSettings(
  input: {
    tenantId: string;
    workerId: string;
    ownerUserId?: number | null;
  },
): Promise<WorkerBudgetSettingsSummary> {
  const worker = await loadWorker(input.tenantId, input.workerId);
  if (!worker) {
    throw new WorkerBudgetError("worker_not_found", 404, `Worker ${input.workerId} was not found`);
  }
  assertWorkerOwnership(worker, input.ownerUserId);

  const budgets = readDelegatedWorkerSpendBudgetPolicy(worker);
  const ownerUserId = worker.registeredByUserId ? Number(worker.registeredByUserId) : null;

  const windows = ownerUserId == null
    ? BUDGET_WINDOWS.map((windowDef) => ({
        label: windowDef.label,
        capCredits: budgets[windowDef.key] ?? null,
        usedCredits: 0,
        remainingCredits: budgets[windowDef.key] ?? null,
        blocked: false,
      }))
    : await Promise.all(
        BUDGET_WINDOWS.map(async (windowDef) => {
          const capCredits = budgets[windowDef.key] ?? null;
          const usedCredits = await sumWorkerUsageCreditsSince(
            ownerUserId,
            worker.id,
            new Date(Date.now() - windowDef.durationMs),
          );
          return {
            label: windowDef.label,
            capCredits,
            usedCredits,
            remainingCredits: capCredits == null ? null : Math.max(0, capCredits - usedCredits),
            blocked: capCredits == null ? false : usedCredits >= capCredits,
          };
        }),
      );

  return {
    workerId: worker.id,
    displayName: worker.displayName,
    runtimeType: worker.runtimeType,
    ownerUserId,
    budgets,
    windows,
    blockedByBudget: windows.some((window) => window.blocked),
  };
}

export async function updateWorkerBudgetSettings(
  input: {
    tenantId: string;
    workerId: string;
    actorUserId: number | null;
    ownerUserId?: number | null;
    budgets: WorkerSpendBudgetPolicy;
  },
): Promise<WorkerBudgetSettingsSummary> {
  const worker = await loadWorker(input.tenantId, input.workerId);
  if (!worker) {
    throw new WorkerBudgetError("worker_not_found", 404, `Worker ${input.workerId} was not found`);
  }
  assertWorkerOwnership(worker, input.ownerUserId);

  const sanitizedBudgets = sanitizeBudgetUpdate(input.budgets);
  const existingCapabilities = isPlainObject(worker.capabilitiesJson) ? worker.capabilitiesJson : {};
  const nextCapabilities: Record<string, unknown> = {
    ...existingCapabilities,
  };

  const hasAnyBudget = Object.values(sanitizedBudgets).some((value) => value != null);
  if (hasAnyBudget) {
    nextCapabilities.delegatedSpendCaps = sanitizedBudgets;
  } else {
    delete nextCapabilities.delegatedSpendCaps;
  }

  const db = await getDb();
  await db
    .update(workers)
    .set({
      capabilitiesJson: nextCapabilities,
      updatedAt: new Date(),
    })
    .where(and(eq(workers.tenantId, input.tenantId), eq(workers.id, input.workerId)));

  auditLogger.log({
    eventType: "worker_budget_updated",
    userId: input.actorUserId ?? null,
    metadata: {
      tenantId: input.tenantId,
      workerId: input.workerId,
      ownerUserId: worker.registeredByUserId ?? null,
      budgets: sanitizedBudgets,
    },
  });

  return getWorkerBudgetSettings({
    tenantId: input.tenantId,
    workerId: input.workerId,
    ownerUserId: input.ownerUserId ?? null,
  });
}
