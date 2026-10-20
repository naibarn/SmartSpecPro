import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { workerJobs, workerJobOutbox, workerJobDispatches } from "../../drizzle/schema";
import type { CloudflareJobEnvelope, CloudflareWorkerAppBinding } from "./cloudflareJobAdapters";
import { createJobControlPlane } from "./jobControlPlane";

type Job = { id: string; tenantId: string; requestedByUserId: number | null; runtimeType: string;
  jobType: string; contractVersion: string; attempt: number; status: string; operatorReviewRequired: boolean };
type Intent = { id: string; dedupeKey: string; cancelledAt: Date | null; quarantinedAt: Date | null; envelopeJson: Record<string, unknown> };
export type RegisteredWorkerAppScope = { tenantId: string; actorUserId: number; expiresAt: string; jobTypes: ReadonlySet<string> };
export type RegisteredWorkerAppPorts = {
  publication(envelope: CloudflareJobEnvelope): Promise<{ job: Job; intent: Intent } | undefined>;
  reference(input: { jobId?: string; dedupeKey?: string }): Promise<Job | undefined>;
  cancel(jobId: string, scope: { tenantId: string; requestedByUserId: number }): Promise<void>;
};
const ADAPTER = "cloudflare-worker-app";
const RUNTIMES = new Set(["external_runtime", "remotion_executor", "hermes_agent_gateway", "local_llm_worker"]);
const jobProjection = { id: workerJobs.id, tenantId: workerJobs.tenantId, requestedByUserId: workerJobs.requestedByUserId,
  runtimeType: workerJobs.runtimeType, jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion,
  attempt: workerJobs.attempt, status: workerJobs.status, operatorReviewRequired: workerJobs.operatorReviewRequired };

function postgresPorts(scope: RegisteredWorkerAppScope): RegisteredWorkerAppPorts {
  return {
    async publication(envelope) {
      const [row] = await getDb().select({ job: jobProjection, intent: workerJobOutbox }).from(workerJobs)
        .innerJoin(workerJobOutbox, eq(workerJobOutbox.workerJobId, workerJobs.id))
        .where(and(eq(workerJobs.tenantId, scope.tenantId), eq(workerJobs.requestedByUserId, scope.actorUserId),
          eq(workerJobs.id, envelope.job_id), eq(workerJobOutbox.id, envelope.dispatch_id), eq(workerJobOutbox.dedupeKey, envelope.dedupe_key))).limit(1);
      return row;
    },
    async reference(input) {
      const [row] = await getDb().select(jobProjection).from(workerJobs)
        .innerJoin(workerJobDispatches, and(eq(workerJobDispatches.workerJobId, workerJobs.id), eq(workerJobDispatches.adapter, ADAPTER)))
        .innerJoin(workerJobOutbox, eq(workerJobOutbox.id, workerJobDispatches.id))
        .where(and(eq(workerJobs.tenantId, scope.tenantId), eq(workerJobs.requestedByUserId, scope.actorUserId),
          eq(workerJobDispatches.providerJobId, workerJobs.id), isNotNull(workerJobDispatches.publishedAt), isNull(workerJobDispatches.failedAt),
          inArray(workerJobDispatches.publicationStatus, ["published", "consumed"]),
          isNull(workerJobOutbox.cancelledAt), isNull(workerJobOutbox.quarantinedAt),
          sql`${workerJobOutbox.envelopeJson}->>'businessAttempt'=${workerJobs.attempt}::text`,
          input.jobId ? eq(workerJobs.id, input.jobId) : eq(workerJobDispatches.dedupeKey, input.dedupeKey!))).limit(1);
      return row;
    },
    async cancel(jobId, owner) {
      await createJobControlPlane().cancel(jobId, "registered_worker_app_cancel_requested", undefined, scope.actorUserId, owner);
    },
  };
}

/** Registered desktop/runtime workers already pull these canonical rows and
 * enforce capability, sharing, heartbeat and lease policies at claim time.
 * Publication validates the existing intent and returns its job reference;
 * it never pushes a copied job or creates a second ledger/provider namespace.
 * Composition must supply an existing authorized tenant/actor/time scope. */
export function createRegisteredWorkerAppBinding(scope: RegisteredWorkerAppScope,
  suppliedPorts?: RegisteredWorkerAppPorts): CloudflareWorkerAppBinding {
  const allowedJobTypes = new Set(scope.jobTypes);
  const owner = { tenantId: scope.tenantId, actorUserId: scope.actorUserId, expiresAt: scope.expiresAt };
  const ports = suppliedPorts ?? postgresPorts({ ...owner, jobTypes: allowedJobTypes });
  function assertScope() {
    if (!owner.tenantId || !Number.isSafeInteger(owner.actorUserId) || owner.actorUserId < 1 ||
        !(Date.parse(owner.expiresAt) > Date.now()) || allowedJobTypes.size === 0) throw Error("REGISTERED_WORKER_APP_SCOPE_DENIED");
  }
  function admitted(job: Job | undefined): job is Job {
    return Boolean(job && job.tenantId === owner.tenantId && job.requestedByUserId === owner.actorUserId &&
      RUNTIMES.has(job.runtimeType) && allowedJobTypes.has(job.jobType) && job.contractVersion === "feature-186-v1" && !job.operatorReviewRequired);
  }
  return {
    async dispatch({ envelope }) {
      assertScope();
      const row = await ports.publication(envelope);
      assertScope();
      if (!row || !admitted(row.job) || row.job.id !== envelope.job_id || row.job.attempt !== envelope.business_attempt ||
          row.job.contractVersion !== envelope.contract_version || row.intent.id !== envelope.dispatch_id ||
          row.intent.dedupeKey !== envelope.dedupe_key || row.intent.cancelledAt || row.intent.quarantinedAt ||
          row.intent.envelopeJson.jobId !== envelope.job_id || row.intent.envelopeJson.businessAttempt !== envelope.business_attempt ||
          row.intent.envelopeJson.contractVersion !== envelope.contract_version || row.intent.envelopeJson.dedupeKey !== envelope.dedupe_key ||
          !["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"].includes(row.job.status)) {
        throw Error("REGISTERED_WORKER_APP_PUBLICATION_DENIED");
      }
      return { referenceId: row.job.id };
    },
    async findByDedupeKey(dedupeKey) {
      assertScope(); const job = await ports.reference({ dedupeKey });
      assertScope();
      return admitted(job) ? { referenceId: job.id } : null;
    },
    async inspect(jobId) {
      assertScope(); const job = await ports.reference({ jobId });
      assertScope();
      if (!admitted(job)) return "unknown";
      if (["failed", "expired"].includes(job.status)) return "failed";
      return job.status === "queued" ? "published" : "consumed";
    },
    async cancel(jobId) {
      assertScope(); const job = await ports.reference({ jobId });
      assertScope();
      if (!admitted(job)) throw Error("REGISTERED_WORKER_APP_SCOPE_DENIED");
      await ports.cancel(job.id, { tenantId: owner.tenantId, requestedByUserId: owner.actorUserId });
    },
  };
}
