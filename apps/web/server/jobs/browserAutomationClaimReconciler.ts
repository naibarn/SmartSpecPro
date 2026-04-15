import { inArray } from "drizzle-orm";

import { getDb } from "../db";
import { workAutomationBrowserTaskClaims } from "../../drizzle/schema";
import { reconcileBrowserAutomationTaskClaims } from "../services/workAutomationBrowserTaskService";

const RECONCILE_INTERVAL_MS = 30_000;
const MAX_TENANTS_PER_TICK = 50;

let intervalId: NodeJS.Timeout | null = null;
let inFlight = false;

async function runBrowserAutomationClaimReconciler(): Promise<{
  tenantsScanned: number;
  processed: number;
  completed: number;
  failed: number;
  cancelled: number;
  pending: number;
}> {
  if (inFlight) {
    return { tenantsScanned: 0, processed: 0, completed: 0, failed: 0, cancelled: 0, pending: 0 };
  }
  inFlight = true;

  try {
    const db = await getDb();
    if (!db) {
      return { tenantsScanned: 0, processed: 0, completed: 0, failed: 0, cancelled: 0, pending: 0 };
    }

    const rows = await db
      .select({ tenantId: workAutomationBrowserTaskClaims.tenantId })
      .from(workAutomationBrowserTaskClaims)
      .where(inArray(workAutomationBrowserTaskClaims.status, ["claimed", "queued", "running"]))
      .orderBy(workAutomationBrowserTaskClaims.createdAt)
      .limit(MAX_TENANTS_PER_TICK * 10);

    const tenantIds = Array.from(new Set(rows.map((row) => row.tenantId))).slice(0, MAX_TENANTS_PER_TICK);

    let processed = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let pending = 0;

    const now = new Date();
    for (const tenantId of tenantIds) {
      const result = await reconcileBrowserAutomationTaskClaims(tenantId, { limit: 20, now });
      processed += result.processed;
      completed += result.completed;
      failed += result.failed;
      cancelled += result.cancelled;
      pending += result.pending;
    }

    return {
      tenantsScanned: tenantIds.length,
      processed,
      completed,
      failed,
      cancelled,
      pending,
    };
  } finally {
    inFlight = false;
  }
}

async function tick(): Promise<void> {
  try {
    const result = await runBrowserAutomationClaimReconciler();
    if (result.tenantsScanned > 0) {
      console.log(
        `[browser-automation-reconciler] tenants=${result.tenantsScanned} processed=${result.processed} completed=${result.completed} failed=${result.failed} cancelled=${result.cancelled} pending=${result.pending}`,
      );
    }
  } catch (error) {
    console.error("[browser-automation-reconciler] Job failed:", error instanceof Error ? error.message : error);
  }
}

export async function initializeBrowserAutomationClaimReconcilerJob(): Promise<void> {
  if (intervalId) return;
  await tick();
  intervalId = setInterval(() => {
    void tick();
  }, RECONCILE_INTERVAL_MS);
}

export async function shutdownBrowserAutomationClaimReconcilerJob(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

