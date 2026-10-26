import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { readProductionDatabaseReadbackObservation } from "./cloudflareProductionDatabaseReconciliation";

const modes = ["FIRST_MIGRATION", "STEADY_STATE_DEPLOYMENT"] as const;
export const migrationContinuationSchema = z.object({
  migrationMode: z.enum(modes),
  architecture: z.literal("HYBRID_INGRESS"),
  agentCapacity: z.enum(["AVAILABLE", "WAITING_AGENT_CAPACITY"]),
  engineeringCheckpoint: z.enum(["ENGINEERING", "READY_FOR_EXECUTION", "REPAIR_REQUIRED", "WAITING_EXTERNAL_AUTHORITY"]),
  handoffRef: z.literal("orchestra/tasks/cloudflare-delegated-staging-20261017/origin-completion/production-cutover/implementation/HANDOFF.md"),
}).strict();
export type MigrationContinuation = z.infer<typeof migrationContinuationSchema>;
type Scope = { tenantId: string; projectId: string };
type Job = {
  id: string; tenantId: string; status: string; jobType: string; contractVersion: string;
  inputJson: Record<string, unknown>; outputJson: Record<string, unknown> | null;
  errorCode: string | null; leaseExpiresAt?: Date | null;
};

export function migrationMissionId(scope: Scope) {
  return `cf-migration:${createHash("sha256").update(`${scope.tenantId}|${scope.projectId}|production|smartspec-cloudflare-runtime`).digest("hex").slice(0, 32)}`;
}

/** Read model, never an approval or a second job/receipt registry. Successful
 * checkpoints survive later failures, grant expiry, and agent replacement. */
export function projectCloudflareMigration(scope: Scope, continuation: MigrationContinuation | null, jobs: Job[], now = new Date(), verifiedDatabaseJobIds: readonly string[] = []) {
  const scoped = jobs.filter(job => job.tenantId === scope.tenantId && job.inputJson.projectId === scope.projectId &&
    job.inputJson.environment === "production" && job.inputJson.targetId === "smartspec-cloudflare-runtime");
  const ingress = scoped.filter(job => job.jobType === "cloudflare.production.deploy" &&
    job.contractVersion === "cloudflare-production-ingress-v1");
  const acceptedIngress = ingress.findLast(job => job.status === "succeeded" &&
    job.outputJson?.productionTrafficShifted === true &&
    (job.outputJson.authenticatedAcceptance as { verified?: boolean } | undefined)?.verified === true &&
    typeof job.outputJson.routeId === "string" && typeof job.outputJson.deploymentId === "string" &&
    typeof job.outputJson.versionId === "string");
  // Provider readback by itself never constitutes real SQL acceptance.
  const acceptedDatabase = scoped.findLast(job => job.jobType === "cloudflare.production.database.provision" &&
    ((job.status === "succeeded" && job.outputJson?.databaseConnectionVerified === true && job.outputJson?.tenantIsolationVerified === true) ||
      verifiedDatabaseJobIds.includes(job.id)));
  const active = scoped.findLast(job => ["pending", "queued", "claimed", "leased", "preparing", "running", "waiting_external", "retry_scheduled"].includes(job.status));
  const lastIngress = ingress.at(-1);
  const ingressRolledBack = lastIngress?.status === "succeeded" && lastIngress.inputJson.action === "ingress-rollback";
  // Reconciled SQL/isolation evidence closes the database milestone without
  // rewriting its historical failed provisioning attempt or issuing Attempt 5.
  const last = scoped.filter(job => job.id !== acceptedDatabase?.id).at(-1);
  const databaseFailure = scoped.findLast(job => job.jobType === "cloudflare.production.database.provision" && job.status === "failed");
  let state: string = continuation?.engineeringCheckpoint ?? "ENGINEERING";
  if (active) state = ["pending", "queued", "retry_scheduled"].includes(active.status) ? "AUTHORIZED" : "EXECUTING";
  else if (last && ["failed", "expired", "cancelled"].includes(last.status)) state = "REPAIR_REQUIRED";
  else if (acceptedIngress) state = acceptedDatabase ? "M1_ACCEPTED" : "M2_ACCEPTED";
  if (!active && continuation?.agentCapacity === "WAITING_AGENT_CAPACITY") state = "WAITING_AGENT_CAPACITY";
  const staleLease = active?.status === "running" && (!active.leaseExpiresAt || active.leaseExpiresAt <= now);
  if (staleLease) state = "REPAIR_REQUIRED";
  if (last?.errorCode && /COMPENSATION_REQUIRES_REVIEW|ROUTE_SUBMISSION_UNKNOWN|WRITE_UNCERTAIN/.test(last.errorCode)) state = "ROLLBACK_REQUIRED";
  return {
    campaignId: migrationMissionId(scope), migrationMode: continuation?.migrationMode ?? "STEADY_STATE_DEPLOYMENT",
    state, architecture: continuation?.architecture ?? "HYBRID_INGRESS",
    // No mission expiry, operation-budget reset, or inferred delegation.
    missionExpiresAt: null, campaignAuthority: "NOT_AUTHORIZED" as const,
    agentCapacity: continuation?.agentCapacity ?? "AVAILABLE", handoffRef: continuation?.handoffRef ?? null,
    engineeringCheckpoint: continuation?.engineeringCheckpoint ?? "ENGINEERING",
    completedCheckpoints: [acceptedIngress && "M2_ACCEPTED", acceptedDatabase && "M1_ACCEPTED"].filter(Boolean),
    currentMilestone: !acceptedIngress || ingressRolledBack ? "M2" : !acceptedDatabase ? "M1" : "M3",
    nextOperation: staleLease ? "RECONCILE_CANONICAL_LEASE" : active ? "MONITOR_EXISTING_CANONICAL_JOB" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack ? "M3_RUNTIME_ACCEPTANCE" :
      acceptedIngress && !ingressRolledBack ? "PRESERVE_INGRESS_REPAIR_DATABASE_AND_RUNTIME" : "REPAIR_PREFLIGHT_THEN_AUTHORIZE_EXACT_OPERATION",
    activeJobId: active?.id ?? null,
    ingressReceipt: acceptedIngress && !ingressRolledBack ? { jobId: acceptedIngress.id, routeId: String(acceptedIngress.outputJson!.routeId),
      deploymentId: String(acceptedIngress.outputJson!.deploymentId), versionId: String(acceptedIngress.outputJson!.versionId) } : null,
    jobHistory: scoped.map(job => ({ jobId: job.id, status: job.status, errorCode: job.errorCode,
      grantRef: typeof job.inputJson.grantRef === "string" ? job.inputJson.grantRef : null,
      artifactRef: typeof job.inputJson.artifactRef === "string" ? job.inputJson.artifactRef : null })),
    blocker: staleLease ? "CANONICAL_LEASE_RECONCILIATION_REQUIRED" : last?.errorCode ?? (!acceptedDatabase ? databaseFailure?.errorCode ?? null : null),
    finalAcceptance: "M2 + real Cloudflare SQL/tenant isolation + native application parity + production/dev separation",
  };
}

const category = "cloudflare_production_ingress_submissions";
async function readSubmissionRows(db: DrizzleDB, scope: Scope) {
  return db.select().from(systemSettings).where(and(eq(systemSettings.category, category),
    sql`${systemSettings.valueJson}->>'tenantId' = ${scope.tenantId}`,
    sql`${systemSettings.valueJson}->>'projectId' = ${scope.projectId}`)).orderBy(asc(systemSettings.id));
}

/** Engineering metadata extends the first existing mission submission. It does
 * not mint grants, impersonate its Owner, or copy provider/job authorities. */
export async function recordMigrationContinuation(db: DrizzleDB, scope: Scope, value: MigrationContinuation) {
  const continuation = migrationContinuationSchema.parse(value);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${migrationMissionId(scope)}))`);
    const rows = await readSubmissionRows(tx as unknown as DrizzleDB, scope);
    const first = rows[0];
    if (!first || first.isSensitive) throw new Error("MIGRATION_EXISTING_MISSION_REQUIRED");
    await tx.update(systemSettings).set({
      valueJson: { ...first.valueJson, migrationContinuation: continuation }, updatedAt: new Date(),
    }).where(eq(systemSettings.id, first.id));
    return { campaignId: migrationMissionId(scope), authorityChanged: false };
  });
}

export async function getCloudflareMigrationMission(db: DrizzleDB, scope: Scope) {
  const rows = await readSubmissionRows(db, scope);
  const parsed = migrationContinuationSchema.safeParse((rows[0]?.valueJson as Record<string, unknown> | null)?.migrationContinuation);
  const jobs = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, scope.tenantId),
    sql`${workerJobs.inputJson}->>'projectId' = ${scope.projectId}`,
    sql`${workerJobs.jobType} IN ('cloudflare.production.deploy', 'cloudflare.production.database.provision')`)).orderBy(asc(workerJobs.createdAt));
  const verifiedDatabaseJobIds: string[] = [];
  for (const job of jobs) {
    if (job.jobType !== "cloudflare.production.database.provision" || typeof job.inputJson.planDigest !== "string") continue;
    const evidence = await readProductionDatabaseReadbackObservation(db, {
      ...scope, jobId: job.id, planDigest: job.inputJson.planDigest,
    });
    if (evidence?.acceptance === "M1_ACCEPTED" && evidence.databaseConnectionVerified && evidence.tenantIsolationVerified)
      verifiedDatabaseJobIds.push(job.id);
  }
  return projectCloudflareMigration(scope, parsed.success ? parsed.data : null, jobs as Job[], new Date(), verifiedDatabaseJobIds);
}
