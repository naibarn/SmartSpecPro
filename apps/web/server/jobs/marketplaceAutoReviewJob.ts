import crypto from "crypto";
import { asc, inArray } from "drizzle-orm";

import { signBearerToken } from "../_core/tokens";
import { getDb } from "../db";
import { marketplaceAutoReviewRuns } from "../../drizzle/schema";
import {
  advanceMarketplaceAutoReviewRun,
  type MarketplaceAutoReviewStatus,
} from "../services/marketplaceAutoReviewService";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_RUN_LIMIT = 12;
const ACTIVE_STATUSES: MarketplaceAutoReviewStatus[] = ["queued", "running", "waiting_provider"];
const SCHEDULER_MODES = ["auto", "interval", "external"] as const;

let intervalId: NodeJS.Timeout | null = null;
let inFlight = false;

function getIntervalMs(): number {
  const parsed = Number(process.env.MARKETPLACE_AUTO_REVIEW_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 15_000 ? parsed : DEFAULT_INTERVAL_MS;
}

function isJobEnabled(): boolean {
  return process.env.MARKETPLACE_AUTO_REVIEW_JOB_ENABLED !== "false";
}

function getSchedulerMode(): typeof SCHEDULER_MODES[number] {
  const raw = process.env.MARKETPLACE_AUTO_REVIEW_SCHEDULER_MODE;
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

function createMarketplaceAutoReviewToken(input: {
  userId: number;
  tenantId: string;
  runId: string;
}): string {
  return signBearerToken({
    sub: String(input.userId),
    userId: input.userId,
    tenantId: input.tenantId,
    type: "access",
    tokenUse: "marketplace_auto_review_background",
    scopes: ["media:generate"],
    jti: `marketplace_auto_review_${input.runId}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
  }, "30m");
}

export async function runMarketplaceAutoReviewJob(options: {
  db?: any;
  limit?: number;
} = {}): Promise<{
  scannedRuns: number;
  advancedRuns: number;
  skippedRuns: number;
  errors: Array<{ runId: string; message: string }>;
}> {
  if (inFlight) {
    return { scannedRuns: 0, advancedRuns: 0, skippedRuns: 0, errors: [] };
  }

  inFlight = true;
  try {
    const db = options.db ?? await getDb();
    if (!db) return { scannedRuns: 0, advancedRuns: 0, skippedRuns: 0, errors: [] };

    const runs = await db
      .select()
      .from(marketplaceAutoReviewRuns)
      .where(inArray(marketplaceAutoReviewRuns.status, ACTIVE_STATUSES))
      .orderBy(asc(marketplaceAutoReviewRuns.updatedAt))
      .limit(Math.min(Math.max(options.limit ?? DEFAULT_RUN_LIMIT, 1), 50));

    const runtimeConfig = await getAppRuntimeConfig();
    let advancedRuns = 0;
    let skippedRuns = 0;
    const errors: Array<{ runId: string; message: string }> = [];

    for (const run of runs) {
      const tenantId = String(run.tenantId ?? "").trim();
      if (!tenantId) {
        skippedRuns += 1;
        errors.push({ runId: run.id, message: "Missing tenantId; cannot advance durable media workflow." });
        continue;
      }
      try {
        const token = createMarketplaceAutoReviewToken({
          userId: run.userId,
          tenantId,
          runId: run.id,
        });
        await advanceMarketplaceAutoReviewRun(run.id, {
          userId: run.userId,
          tenantId,
        }, {
          userToken: token,
          publicUrl: runtimeConfig.publicUrl,
        });
        advancedRuns += 1;
      } catch (error) {
        errors.push({
          runId: run.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      scannedRuns: runs.length,
      advancedRuns,
      skippedRuns,
      errors,
    };
  } finally {
    inFlight = false;
  }
}

async function tick(): Promise<void> {
  if (!isJobEnabled()) return;
  try {
    const result = await runMarketplaceAutoReviewJob();
    if (result.scannedRuns > 0 || result.errors.length > 0) {
      console.log(
        `[marketplace-auto-review] scanned=${result.scannedRuns} advanced=${result.advancedRuns} skipped=${result.skippedRuns} errors=${result.errors.length}`,
      );
    }
  } catch (error) {
    console.error("[marketplace-auto-review] Job failed:", error instanceof Error ? error.message : error);
  }
}

export async function initializeMarketplaceAutoReviewJob(): Promise<void> {
  if (intervalId) return;
  if (!shouldUseInProcessInterval()) {
    console.log("[marketplace-auto-review] In-process interval disabled; use an external scheduler to advance active auto-review runs.");
    return;
  }
  await tick();
  intervalId = setInterval(() => {
    void tick();
  }, getIntervalMs());
  intervalId.unref?.();
}

export function shutdownMarketplaceAutoReviewJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
