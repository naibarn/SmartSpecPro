import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { workerJobs } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { appendJobEvent } from "./jobControlPlane";
import { CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT, CLOUDFLARE_PRODUCTION_DATABASE_JOB,
  type CloudflareProductionDatabaseRuntime } from "./cloudflareProductionDatabaseExecutor";
import { inspectProductionDatabaseRecovery } from "./cloudflareProductionDatabaseRecovery";

// Observations are supplied only by trusted service code after executing the
// authenticated remote probe; the Admin API does not accept caller SQL results.
export const productionDatabaseSqlObservationSchema = z.object({
  runtime: z.literal("cloudflare-remote-preview"), colo: z.string().regex(/^[A-Z]{3}$/),
  cfRay: z.string().regex(/^[a-f0-9]{16,32}-[A-Z]{3}$/i),
  diagnosticBundleDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  observedAt: z.string().datetime(), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  vpcServiceId: z.string().uuid(), hyperdriveId: z.string().regex(/^[a-f0-9]{32}$/),
  sql: z.literal("PASS"), database: z.string(), role: z.string(), readOnly: z.literal(true),
  restrictedRoleVerified: z.literal(true), deniedSchemaAccessVerified: z.literal(true),
  backendSsl: z.boolean(), tenantIsolation: z.enum(["NOT_VERIFIED_NO_AUTHORIZED_FIXTURES", "FAIL"]),
  businessRowsRead: z.literal(0), businessWrites: z.literal(0),
}).strict();

/** Trusted service entrypoint for recording fresh GET-only observations. This
 * does not recover/settle the provisioning job, renew authority or create an
 * attempt/outbox. Browser callers must enter through the exact-Admin router. */
export async function reconcileProductionDatabaseReadback(input: {
  db: DrizzleDB;
  runtime: CloudflareProductionDatabaseRuntime;
  jobId: string;
  tenantId: string;
  projectId: string;
  actorUserId?: number;
  sqlObservation?: unknown;
}) {
  const where = and(eq(workerJobs.id, input.jobId), eq(workerJobs.tenantId, input.tenantId));
  const [job] = await input.db.select().from(workerJobs).where(where).limit(1);
  const definition = job?.inputJson as Record<string, unknown> | null;
  if (!job || job.jobType !== CLOUDFLARE_PRODUCTION_DATABASE_JOB || job.contractVersion !== CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT ||
      job.status !== "failed" || job.errorCode !== "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH" ||
      job.attempt !== 4 || job.maxAttempts !== 4 || job.leaseExpiresAt ||
      definition?.projectId !== input.projectId || definition.environment !== "production" || definition.targetId !== "smartspec-cloudflare-runtime" ||
      typeof definition.planDigest !== "string" ||
      (input.actorUserId !== undefined && job.requestedByUserId !== input.actorUserId)) {
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_RECONCILIATION_SCOPE_DENIED");
  }
  const secure = await input.runtime.resolveGrant(job.id);
  if (!secure || secure.grant.grantRef !== definition.grantRef || secure.grant.requesterUserId !== job.requestedByUserId)
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_RECONCILIATION_GRANT_IDENTITY_DENIED");
  const readback = await inspectProductionDatabaseRecovery({ runtime: input.runtime, jobId: job.id, tenantId: input.tenantId,
    projectId: input.projectId, requesterUserId: job.requestedByUserId, planDigest: definition.planDigest });
  if (!readback.hyperdriveId) throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_RECONCILIATION_HYPERDRIVE_REQUIRED");
  const sqlObservation = input.sqlObservation === undefined ? undefined : productionDatabaseSqlObservationSchema.parse(input.sqlObservation);
  if (sqlObservation && (input.actorUserId !== undefined || sqlObservation.database !== secure.grant.plan.databaseName ||
      sqlObservation.role !== secure.grant.plan.databaseUser || sqlObservation.planDigest !== readback.planDigest ||
      sqlObservation.vpcServiceId !== readback.vpcServiceId || sqlObservation.hyperdriveId !== readback.hyperdriveId ||
      Math.abs(Date.now() - Date.parse(sqlObservation.observedAt)) > 15 * 60_000)) {
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_SQL_OBSERVATION_SCOPE_DENIED");
  }
  const evidence = { schemaVersion: "cloudflare-production-database-readback-observation-v1", ...readback,
    accountRef: secure.grant.accountRef, tenantId: input.tenantId, projectId: input.projectId,
    observedAt: new Date().toISOString(), observedBy: input.actorUserId === undefined ? "authorized_service_cli" : "authenticated_original_requester",
    originalAttempt: job.attempt, originalStatus: job.status, originalErrorCode: job.errorCode,
    providerReadOnly: true, providerMutations: 0, provisioningAttemptConsumed: false, grantRenewed: false,
    ...(sqlObservation ? { sqlObservation } : {}),
    acceptance: "NOT_ACCEPTED" };
  const evidenceDigest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  await input.db.transaction(async tx => {
    const [current] = await tx.select().from(workerJobs).where(where).for("update");
    if (!current || current.status !== job.status || current.attempt !== job.attempt || current.maxAttempts !== job.maxAttempts ||
        current.fencingVersion !== job.fencingVersion || current.errorCode !== job.errorCode || current.leaseExpiresAt ||
        JSON.stringify(current.inputJson) !== JSON.stringify(job.inputJson)) {
      throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_RECONCILIATION_JOB_CHANGED");
    }
    await appendJobEvent(tx, { workerJobId: job.id, eventType: "PRODUCTION_DATABASE_READBACK_RECONCILED",
      eventIdempotencyKey: `production-db-readback:${job.id}:${evidenceDigest}`,
      payloadJson: { ...evidence, evidenceDigest } });
  });
  return { ...evidence, evidenceDigest, canonicalEvidenceRecorded: true as const };
}
