import crypto from "crypto";
import { and, desc, inArray, isNull } from "drizzle-orm";

import { signBearerToken } from "../_core/tokens";
import { getDb } from "../db";
import { mediaProductionSpaces } from "../../drizzle/schema";
import { reconcilePendingProductionExecutions } from "../services/productionSpaceService";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_TENANT_LIMIT = 50;
const DEFAULT_SPACE_LIMIT = 25;
const SCHEDULER_MODES = ["auto", "interval", "external"] as const;
const ACTIVE_PRODUCTION_STATUSES = [
  "asset_generation_running",
  "final_generating",
  "revision_running",
] as const;

let intervalId: NodeJS.Timeout | null = null;
let inFlight = false;

function getIntervalMs(): number {
  const parsed = Number(process.env.FEATURE116_PRODUCTION_RECONCILE_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 5_000 ? parsed : DEFAULT_INTERVAL_MS;
}

function isReconcilerEnabled(): boolean {
  return process.env.FEATURE116_PRODUCTION_RECONCILER_ENABLED !== "false";
}

function getSchedulerMode(): typeof SCHEDULER_MODES[number] {
  const raw = process.env.FEATURE116_PRODUCTION_RECONCILER_SCHEDULER_MODE;
  if (raw && (SCHEDULER_MODES as readonly string[]).includes(raw)) {
    return raw as typeof SCHEDULER_MODES[number];
  }
  return "auto";
}

function shouldUseInProcessInterval(): boolean {
  const mode = getSchedulerMode();
  if (mode === "interval") return true;
  if (mode === "external") return false;
  return process.env.USE_CLOUD_TASKS !== "true";
}

function createProductionReconcileToken(input: {
  userId: number;
  tenantId: string;
  productionRunId: string;
}): string {
  return signBearerToken({
    sub: String(input.userId),
    userId: input.userId,
    tenantId: input.tenantId,
    type: "access",
    tokenUse: "production_execution_reconcile",
    scopes: ["media:generate"],
    jti: `production_reconcile_${input.productionRunId}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
  }, "15m");
}

export async function runProductionExecutionReconciliationJob(options: {
  db?: any;
  tenantLimit?: number;
  spaceLimit?: number;
} = {}): Promise<{
  tenantsScanned: number;
  scannedSpaces: number;
  pendingAttempts: number;
  reconciledAttempts: number;
  skippedAttempts: number;
  alerts: unknown[];
  tenantErrors: Array<{ tenantId: string; message: string }>;
}> {
  if (inFlight) {
    return {
      tenantsScanned: 0,
      scannedSpaces: 0,
      pendingAttempts: 0,
      reconciledAttempts: 0,
      skippedAttempts: 0,
      alerts: [],
      tenantErrors: [],
    };
  }

  inFlight = true;
  try {
    const db = options.db ?? await getDb();
    if (!db) {
      return {
        tenantsScanned: 0,
        scannedSpaces: 0,
        pendingAttempts: 0,
        reconciledAttempts: 0,
        skippedAttempts: 0,
        alerts: [],
        tenantErrors: [],
      };
    }

    const rows = await db
      .select({ tenantId: mediaProductionSpaces.tenantId })
      .from(mediaProductionSpaces)
      .where(
        and(
          inArray(mediaProductionSpaces.status, [...ACTIVE_PRODUCTION_STATUSES]),
          isNull(mediaProductionSpaces.deletedAt),
        ),
      )
      .orderBy(desc(mediaProductionSpaces.updatedAt))
      .limit((options.tenantLimit ?? DEFAULT_TENANT_LIMIT) * 10);

    const tenantIds = Array.from(new Set((rows as Array<{ tenantId: string }>).map((row) => row.tenantId)))
      .slice(0, options.tenantLimit ?? DEFAULT_TENANT_LIMIT);

    let scannedSpaces = 0;
    let pendingAttempts = 0;
    let reconciledAttempts = 0;
    let skippedAttempts = 0;
    const alerts: unknown[] = [];
    const tenantErrors: Array<{ tenantId: string; message: string }> = [];

    for (const tenantId of tenantIds) {
      try {
        const summary = await reconcilePendingProductionExecutions({
          db,
          tenantId,
          limit: options.spaceLimit ?? DEFAULT_SPACE_LIMIT,
          tokenResolver: createProductionReconcileToken,
        });
        scannedSpaces += summary.scannedSpaces;
        pendingAttempts += summary.pendingAttempts;
        reconciledAttempts += summary.reconciledAttempts;
        skippedAttempts += summary.skippedAttempts;
        alerts.push(...summary.alerts);
      } catch (error) {
        tenantErrors.push({
          tenantId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      tenantsScanned: tenantIds.length,
      scannedSpaces,
      pendingAttempts,
      reconciledAttempts,
      skippedAttempts,
      alerts,
      tenantErrors,
    };
  } finally {
    inFlight = false;
  }
}

async function tick(): Promise<void> {
  if (!isReconcilerEnabled()) return;

  try {
    const result = await runProductionExecutionReconciliationJob();
    if (result.tenantsScanned > 0 || result.tenantErrors.length > 0) {
      console.log(
        `[production-execution-reconciler] tenants=${result.tenantsScanned} scannedSpaces=${result.scannedSpaces} pending=${result.pendingAttempts} reconciled=${result.reconciledAttempts} skipped=${result.skippedAttempts} alerts=${result.alerts.length} errors=${result.tenantErrors.length}`,
      );
    }
  } catch (error) {
    console.error("[production-execution-reconciler] Job failed:", error instanceof Error ? error.message : error);
  }
}

export async function initializeProductionExecutionReconciliationJob(): Promise<void> {
  if (intervalId) return;
  if (!shouldUseInProcessInterval()) {
    console.log("[production-execution-reconciler] In-process interval disabled; use Cloud Scheduler to POST /_internal/tasks/production-execution-reconcile.");
    return;
  }
  await tick();
  intervalId = setInterval(() => {
    void tick();
  }, getIntervalMs());
}

export function shutdownProductionExecutionReconciliationJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
