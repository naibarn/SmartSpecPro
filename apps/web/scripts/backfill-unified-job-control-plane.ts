import "dotenv/config";

import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db, getDb } from "../server/db";
import { workerJobEvents, workerJobs } from "../drizzle/schema";
import { computeJobDefinitionHash } from "../server/services/jobCanonicalization";
import type { ExecutionClass, RetryPolicy } from "../server/services/jobControlPlaneTypes";

const limitArgument = process.argv.find(value => value.startsWith("--limit="))?.slice("--limit=".length);
const LIMIT = Math.max(1, Math.min(Number(limitArgument ?? process.env.JOB_BACKFILL_LIMIT ?? 200), 1000));
const APPLY = process.argv.includes("--apply");

function executionClass(runtimeType: string): ExecutionClass {
  if (runtimeType.includes("gpu")) return "gpu";
  if (runtimeType.includes("python") || runtimeType.includes("cpu")) return "cpu";
  if (runtimeType.includes("scheduled")) return "scheduled";
  return "external";
}

function retryPolicy(value: Record<string, unknown>): RetryPolicy {
  return {
    maxAttempts: Number.isSafeInteger(value.maxAttempts) && Number(value.maxAttempts) > 0 ? Number(value.maxAttempts) : 1,
    baseDelayMs: Number(value.baseDelayMs) > 0 ? Number(value.baseDelayMs) : 1000,
    maxDelayMs: Number(value.maxDelayMs) > 0 ? Number(value.maxDelayMs) : 900000,
    jitter: value.jitter === "bounded" || value.jitter === "recorded" ? value.jitter : "none",
    deadlineMs: Number(value.deadlineMs) > 0 ? Number(value.deadlineMs) : 3600000,
    allowedErrorClasses: Array.isArray(value.allowedErrorClasses) ? value.allowedErrorClasses.filter((item): item is string => typeof item === "string") : [],
  };
}

function stableLegacyJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableLegacyJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableLegacyJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function legacyDefinitionHash(row: typeof workerJobs.$inferSelect): string {
  return createHash("sha256").update(stableLegacyJson({
    contractVersion: "feature-186-v1",
    tenantId: row.tenantId,
    requestedByUserId: row.requestedByUserId,
    jobType: row.jobType,
    runtimeType: row.runtimeType,
    executionClass: executionClass(row.runtimeType),
    priority: row.priority,
    inputJson: row.inputJson,
    instructionsJson: row.instructionsJson,
    retryPolicyJson: row.retryPolicyJson,
    timeoutSeconds: row.timeoutSeconds,
    capabilityRequirementsJson: row.capabilityRequirementsJson,
  })).digest("hex");
}

async function main() {
  getDb();
  const rows = await db.select().from(workerJobs).where(isNull(workerJobs.definitionHash)).limit(LIMIT);
  let updated = 0;
  let skipped = 0;
  let legacyFallback = 0;
  for (const row of rows) {
    const policy = retryPolicy(row.retryPolicyJson ?? {});
    let hash: string;
    try {
      hash = computeJobDefinitionHash({
      contractVersion: "feature-186-v1",
      tenantId: row.tenantId,
      requestedByUserId: row.requestedByUserId ?? undefined,
      jobType: row.jobType,
      executionClass: executionClass(row.runtimeType),
      priority: row.priority,
      input: { input: row.inputJson ?? {}, instructions: row.instructionsJson ?? {} },
      idempotencyKey: undefined,
      retryPolicy: policy,
      timeoutPolicy: { softTimeoutMs: row.timeoutSeconds * 1000, hardTimeoutMs: row.timeoutSeconds * 1000 },
      requiredCapabilities: row.capabilityRequirementsJson ?? {},
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== "JOB_DEFINITION_INVALID") throw error;
      hash = legacyDefinitionHash(row);
      legacyFallback += 1;
    }
    if (!APPLY) {
      updated += 1;
      continue;
    }
    const result = await db.update(workerJobs).set({ definitionHash: hash, executionClass: executionClass(row.runtimeType), maxAttempts: Math.max(row.maxAttempts, policy.maxAttempts) })
      .where(and(eq(workerJobs.id, row.id), isNull(workerJobs.definitionHash))).returning({ id: workerJobs.id });
    if (result.length) updated += 1;
    else skipped += 1;
  }
  const events = await db.select({ id: workerJobEvents.id, workerJobId: workerJobEvents.workerJobId, eventSequence: workerJobEvents.eventSequence, eventIdempotencyKey: workerJobEvents.eventIdempotencyKey })
    .from(workerJobEvents)
    .where(sql`"eventSequence" IS NULL OR "eventIdempotencyKey" IS NULL`)
    .limit(LIMIT);
  let eventsUpdated = 0;
  for (const event of events) {
    if (!APPLY) {
      eventsUpdated += 1;
      continue;
    }
    await db.transaction(async tx => {
      const query = tx as any;
      await query.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${event.workerJobId}))`);
      if (event.eventSequence === null) {
        const [maxRow] = await query.select({ max: sql<number>`coalesce(max(${workerJobEvents.eventSequence}), 0)` })
          .from(workerJobEvents).where(eq(workerJobEvents.workerJobId, event.workerJobId));
        await query.update(workerJobEvents).set({ eventSequence: Number(maxRow?.max ?? 0) + 1 })
          .where(and(eq(workerJobEvents.id, event.id), isNull(workerJobEvents.eventSequence)));
      }
      if (event.eventIdempotencyKey === null) {
        await query.update(workerJobEvents).set({ eventIdempotencyKey: `legacy:${event.id}` })
          .where(and(eq(workerJobEvents.id, event.id), isNull(workerJobEvents.eventIdempotencyKey)));
      }
    });
    eventsUpdated += 1;
  }
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", scanned: rows.length, updated, skipped, legacyFallback, eventsScanned: events.length, eventsUpdated, limit: LIMIT }));
  if (!APPLY) console.log("Dry run only. Re-run with --apply after backup, migration verification, and an approved maintenance window.");
}

main().catch(error => {
  console.error("[backfill-unified-job-control-plane] failed", error);
  process.exitCode = 1;
});
