import { emergencyIntakeEvent } from "../../../packages/shared/src/emergencyIntakeEvent";
import type { CanonicalWorkerExecution } from "./contracts";
import { withBoundedCanonicalTransaction, type HyperdriveSqlClient } from "./hyperdrive";

type Delivery = Parameters<CanonicalWorkerExecution>[0];
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function denied(code: string): never { throw new Error(code); }

/** Existing Node authority still admits/claims/settles the job. Only this one
 * domain transaction moves to Hyperdrive; it cannot create or claim jobs.
 * No network work occurs while locks are held. The fence is locked first,
 * rechecked against the DB clock before commit, and never written here. */
export async function executeHyperdriveEmergencyIntake(delivery: Delivery, client: HyperdriveSqlClient): Promise<{}> {
  const { env, job, envelope, claim } = delivery;
  if (env.CLOUDFLARE_ACTIVATION !== "enabled" || !["workflows", "queues"].includes(env.CLOUDFLARE_JOB_TRANSPORT ?? "") ||
      env.CLOUDFLARE_WORKFLOW_DATABASE !== "hyperdrive-intake" ||
      (env.CLOUDFLARE_ENVIRONMENT === "production" && env.CLOUDFLARE_PRODUCTION_FENCE_MODE !== "security-definer-v1") ||
      !(Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now()) ||
      job.tenantId !== env.CLOUDFLARE_WORKFLOW_TENANT_ID || job.jobType !== "emergency.report.intake" ||
      job.contractVersion !== "feature-186-v1" || job.executionClass !== "short" ||
      envelope.job_id !== job.jobId || envelope.business_attempt !== job.businessAttempt ||
      envelope.contract_version !== job.contractVersion || job.operatorReviewRequired ||
      job.input.tenantId !== job.tenantId || typeof job.input.reportId !== "string" ||
      !job.input.reportId || job.input.reportId.length > 36 ||
      Object.keys(job.input).some(key => key !== "tenantId" && key !== "reportId") ||
      !claim.attemptId || !claim.leaseToken || !Number.isSafeInteger(claim.fencingVersion) || claim.fencingVersion < 1) {
    denied("HYPERDRIVE_INTAKE_NOT_ADMITTED");
  }
  const leaseHash = await sha256(claim.leaseToken);
  return withBoundedCanonicalTransaction(client, async tx => {
    await tx.unsafe("SET LOCAL lock_timeout = '2s'");
    await tx.unsafe("SET LOCAL statement_timeout = '5s'");
    const parameters = [job.jobId, job.tenantId, job.businessAttempt, claim.attemptId, claim.fencingVersion,
      leaseHash, envelope.dispatch_id, envelope.dedupe_key, JSON.stringify(job.input)];
    const directFenceQuery = `SELECT w.id FROM worker_jobs w
      JOIN worker_job_attempts a ON a."workerJobId"=w.id AND a.attempt=w.attempt
      JOIN worker_job_dispatches d ON d."workerJobId"=w.id AND d.id=$7 AND d."dedupeKey"=$8
      JOIN worker_job_outbox o ON o.id=d.id AND o."workerJobId"=w.id AND o."dedupeKey"=d."dedupeKey"
      WHERE w.id=$1 AND w."tenantId"=$2 AND w.attempt=$3 AND a.id=$4
        AND w."fencingVersion"=$5 AND a."leaseGeneration"=$5
        AND w."leaseOwnerToken"=$6 AND a."leaseTokenHash"=$6
        AND w.status='running' AND w."operatorReviewRequired"=false
        AND w."leaseExpiresAt">clock_timestamp() AND a."leaseExpiresAt">clock_timestamp()
        AND EXTRACT(EPOCH FROM (clock_timestamp()-COALESCE(w."startedAt",w."createdAt")))*1000 <
          CASE WHEN (w."timeoutPolicyJson"->>'hardTimeoutMs') ~ '^[0-9]+([.][0-9]+)?$'
            AND (w."timeoutPolicyJson"->>'hardTimeoutMs')::numeric>0
          THEN (w."timeoutPolicyJson"->>'hardTimeoutMs')::numeric ELSE w."timeoutSeconds"::numeric*1000 END
        AND w."jobType"='emergency.report.intake' AND w."executionClass"='short'
        AND w."runtimeType"='node_job_worker' AND w."contractVersion"='feature-186-v1'
        AND w."inputJson"=$9::text::jsonb AND d.adapter=$10
        AND d."publicationStatus" IN ('published','consumed') AND d."publishedAt" IS NOT NULL AND d."failedAt" IS NULL
        AND o."publishedAt" IS NOT NULL AND o."cancelledAt" IS NULL AND o."quarantinedAt" IS NULL
        AND (o."envelopeJson"->>'businessAttempt')::int=$3
      FOR UPDATE OF w, a`;
    async function fence() {
      if (!(Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now())) denied("HYPERDRIVE_INTAKE_LEASE_STALE");
      const adapter = env.CLOUDFLARE_JOB_TRANSPORT === "queues" ? "cloudflare-queues" : "cloudflare-workflows";
      if (env.CLOUDFLARE_ENVIRONMENT === "production") {
        const [result] = await tx.unsafe<Array<{ accepted: boolean }>>(
          `SELECT public.cloudflare_validate_emergency_intake_v1($1,$2,$3,$4,$5,$6,$7,$8,$9::text::jsonb,$10) AS accepted`, [...parameters, adapter]);
        if (result?.accepted !== true) denied("HYPERDRIVE_INTAKE_LEASE_STALE");
        return;
      }
      if ((await tx.unsafe<unknown[]>(directFenceQuery, [...parameters, adapter])).length !== 1) denied("HYPERDRIVE_INTAKE_LEASE_STALE");
    }
    await fence();
    const [report] = await tx.unsafe<Array<{ status: string; workerJobId: string }>>(
      `SELECT status, "workerJobId" FROM emergency_reports WHERE id=$1 AND "tenantId"=$2 FOR UPDATE`, [job.input.reportId, job.tenantId]);
    if (!report || report.workerJobId !== job.jobId) denied("HYPERDRIVE_INTAKE_REPORT_SCOPE_DENIED");
    if (report.status !== "received") return {};
    const [caseRow] = await tx.unsafe<Array<{ id: string; revision: number }>>(
      `SELECT id, revision FROM emergency_cases WHERE "reportId"=$1 AND "tenantId"=$2 ORDER BY id LIMIT 1 FOR UPDATE`, [job.input.reportId, job.tenantId]);
    if (!caseRow) denied("HYPERDRIVE_INTAKE_CASE_MISSING");
    const [previous] = await tx.unsafe<Array<{ eventHash: string }>>(
      `SELECT "eventHash" FROM emergency_case_events WHERE "caseId"=$1 AND "tenantId"=$2 ORDER BY revision DESC LIMIT 1`, [caseRow.id, job.tenantId]);
    const now = new Date().toISOString();
    const event = emergencyIntakeEvent({ tenantId: job.tenantId, caseId: caseRow.id,
      previousHash: previous?.eventHash ?? null, revision: caseRow.revision + 1, createdAt: now });
    const eventHash = await sha256(JSON.stringify(event));
    await tx.unsafe(`INSERT INTO emergency_case_events
      ("tenantId","caseId","eventIdempotencyKey","actorType","actorRef","eventType",reason,revision,"previousHash","eventHash","payloadJson","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
    [job.tenantId, caseRow.id, `triage-available:${job.input.reportId}`, event.actorType, event.actorRef, event.eventType,
      event.reason, event.revision, event.previousHash, eventHash, event.payload, now]);
    const reportUpdate = await tx.unsafe<unknown[]>(`UPDATE emergency_reports SET status='triage',"updatedAt"=$3
      WHERE id=$1 AND "tenantId"=$2 AND status='received' RETURNING id`, [job.input.reportId, job.tenantId, now]);
    const caseUpdate = await tx.unsafe<unknown[]>(`UPDATE emergency_cases
      SET revision=revision+1,"caseContextJson"="caseContextJson"||$4::jsonb,"updatedAt"=$5
      WHERE id=$1 AND "tenantId"=$2 AND revision=$3 RETURNING id`,
    [caseRow.id, job.tenantId, caseRow.revision, { intakeStatus: "triage_available" }, now]);
    if (reportUpdate.length !== 1 || caseUpdate.length !== 1) denied("HYPERDRIVE_INTAKE_REVISION_CONFLICT");
    await fence();
    return {};
  });
}
