import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { resolveHttpImageCanonicalSource } from "./cloudflareHttpImageBuildOperator";
import { createCloudflareHttpImageProvisionRuntime } from "./cloudflareHttpImageProvisionExecutor";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB, httpImageProvisionPlanDigest,
  httpImageProvisionGrantSchema, type HttpImageProvisionPlan } from "./cloudflareHttpImageProvisionContract";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { createControlPlaneJob } from "./jobControlPlaneGateway";

const CATEGORY = "cloudflare_http_image_submissions";
const RUNTIMES = ["node-http", "python-http"] as const;
type Scope = { tenantId: string; projectId: string; actorUserId: number };
type Build = { sourceSha: string; buildId: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function httpImagePairJobId(submissionId: string, runtime: string) {
  const bytes = createHash("sha256").update(`cloudflare-http-image-pair:v1:${submissionId}:${runtime}`).digest();
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

async function assertOwner(db: DrizzleDB, scope: Scope) {
  const rows = await db.execute(sql`SELECT 1 FROM tenants t JOIN users u ON u.id=${scope.actorUserId}
    JOIN canonical_projects p ON p.tenant_id=t.id AND p.project_id=${scope.projectId}
    WHERE t.id=${scope.tenantId} AND t."ownerId"=u.id AND t."isActive" AND u.role='admin' AND NOT u."isDisabled"
    AND p.lifecycle='ACTIVE' AND p.owner_principal_id=${`user:${scope.actorUserId}`}`);
  if (rows.length !== 1) throw Error("HTTP_IMAGE_OWNER_SCOPE_DENIED");
}

/** Both images use the existing exact-project staging publication namespace.
 * Immutable receipts may later be selected by Production; this does not create
 * applications, activate runtime bindings, change M2, or mint CLI authority. */
export async function getHttpImagePairPreflight(db: DrizzleDB, scope: Scope, expectedDigest?: string) {
  await assertOwner(db, scope);
  try {
    const runtime = createCloudflareHttpImageProvisionRuntime();
    const identity = { tenantId: scope.tenantId, projectId: scope.projectId, provider: "cloudflare", environment: "staging" };
    const accountRef = await runtime.resolveAccount(identity);
    if (!accountRef || !/^[a-f0-9]{32}$/.test(accountRef)) throw Error("HTTP_IMAGE_STAGING_TARGET_REQUIRED");
    await runtime.withCredential(identity, async () => undefined);
    const executorId = process.env.CLOUDFLARE_STAGING_EXECUTOR_ID?.trim();
    if (!executorId) throw Error("HTTP_IMAGE_EXECUTOR_REQUIRED");
    const namespace = nativeProvisionNamespace(scope.tenantId, scope.projectId);
    // An intervening Admin release must not silently replace the immutable
    // source the Owner reviewed. Resolve that exact still-valid canonical
    // receipt by packet digest, even when a newer build has appeared.
    const source = await resolveHttpImageCanonicalSource(candidate => !expectedDigest ||
      hash({ ...candidate, accountRef, executorId, namespace }) === expectedDigest);
    const registered = await db.execute(sql`SELECT 1 FROM runner_nodes WHERE "tenantId"=${scope.tenantId} AND "runnerId"=${executorId}
      AND "ownerUserId"=${scope.actorUserId} AND profile='cloudflare_staging_executor' AND "trustState"='trusted'
      AND "revokedAt" IS NULL AND "snapshotExpiresAt">now()+interval '46 minutes'`);
    if (registered.length !== 1) throw Error("HTTP_IMAGE_EXECUTOR_SNAPSHOT_EXPIRING");
    // Verify registered signing identity before spending Owner policy budget.
    const plan: HttpImageProvisionPlan = { namespace: nativeProvisionNamespace(scope.tenantId, scope.projectId), runtime: "node-http", ...source,
      configurationExpiresAt: new Date(Date.now()+45*60_000).toISOString(), buildBudgetSeconds: 360, maxImageBytes: 1_073_741_824, maxPublishedImages: 1 };
    const probeId = "00000000-0000-4000-8000-000000000001";
    const probe = { schemaVersion: "cloudflare.staging-http-image-provision-grant.v1" as const, grantRef: probeId, jobId: probeId,
      tenantId: scope.tenantId, projectId: scope.projectId, requesterUserId: scope.actorUserId, executorId, accountRef, targetId: "smartspec-cloudflare-staging" as const,
      environment: "staging" as const, actions: ["provision"] as ["provision"], plan, planDigest: httpImageProvisionPlanDigest(plan),
      expiresAt: plan.configurationExpiresAt, revokedAt: null };
    if (await runtime.verifyExecutor(probe) !== executorId) throw Error("HTTP_IMAGE_EXECUTOR_DENIED");
    const packet = { ...source, accountRef, executorId, namespace: plan.namespace };
    return { ready: true as const, reason: null, ...packet, planDigest: hash(packet), maxImages: 2, trafficMutation: false };
  } catch (error) {
    const reason = error instanceof Error && /^[A-Z_]{5,120}$/.test(error.message) ? error.message : "HTTP_IMAGE_PREFLIGHT_UNAVAILABLE";
    return { ready: false as const, reason };
  }
}

type Submission = Scope & Build & { submissionId: string; planDigest: string; accountRef: string; executorId: string; namespace: string;
  expiresAt: string; policies: Partial<Record<typeof RUNTIMES[number], { started: boolean; id?: string; rejectedCode?: string }>> };
function assertSubmission(value: Submission, scope: Scope & { submissionId: string; planDigest?: string }) {
  if (!value || value.tenantId !== scope.tenantId || value.projectId !== scope.projectId || value.actorUserId !== scope.actorUserId ||
      value.submissionId !== scope.submissionId || scope.planDigest && value.planDigest !== scope.planDigest)
    throw Error("HTTP_IMAGE_SUBMISSION_SCOPE_DENIED");
}
function whereSubmission(id: string) { return and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, id)); }

export async function readHttpImagePairSubmission(db: DrizzleDB, scope: Scope & { submissionId: string }) {
  await assertOwner(db, scope);
  const [row] = await db.select().from(systemSettings).where(whereSubmission(scope.submissionId)).limit(1);
  if (!row) return null;
  const submission = row.valueJson as Submission;
  assertSubmission(submission, scope);
  const jobs = [];
  for (const runtime of RUNTIMES) {
    const jobId = httpImagePairJobId(scope.submissionId, runtime);
    const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
    const plan: HttpImageProvisionPlan = { namespace: submission.namespace, runtime, sourceSha: submission.sourceSha, buildId: submission.buildId,
      configurationExpiresAt: submission.expiresAt, buildBudgetSeconds: 360, maxImageBytes: 1_073_741_824, maxPublishedImages: 1 };
    if (job && (job.tenantId !== scope.tenantId || job.requestedByUserId !== scope.actorUserId || job.jobType !== HTTP_IMAGE_PROVISION_JOB ||
        job.contractVersion !== HTTP_IMAGE_PROVISION_CONTRACT || job.inputJson?.projectId !== scope.projectId ||
        job.inputJson?.planDigest !== httpImageProvisionPlanDigest(plan)))
      throw Error("HTTP_IMAGE_JOB_SCOPE_DENIED");
    const output = job?.outputJson as Record<string, unknown> | null;
    const verified = output?.schemaVersion === "cloudflare-http-image-receipt-v1" && output.registryVerified === true && output.jobId === jobId &&
      output.sourceSha === submission.sourceSha && output.runtime === runtime && output.planDigest === httpImageProvisionPlanDigest(plan) &&
      output.accountRef === submission.accountRef && output.namespace === submission.namespace && typeof output.image === "string" &&
      new RegExp(`^registry\\.cloudflare\\.com/${submission.accountRef}/${submission.namespace}-${runtime}@sha256:[a-f0-9]{64}$`).test(output.image);
    jobs.push({ runtime, jobId, status: job ? job.status : "NOT_ADMITTED" as const, errorCode: job?.errorCode ?? null,
      image: verified ? String(output?.image) : null, registryVerified: verified });
  }
  return { submissionId: scope.submissionId, sourceSha: submission.sourceSha, buildId: submission.buildId, jobs,
    diagnostics: RUNTIMES.flatMap(runtime => submission.policies[runtime]?.rejectedCode ? [{ runtime, stage: "POLICY_CREATE", code: submission.policies[runtime]!.rejectedCode! }] : []),
    published: jobs.every(job => job.status === "succeeded" && job.registryVerified), trafficMutation: false };
}

/** Existing ApprovalRule -> exact job grant -> canonical worker_jobs/outbox.
 * A stable two-job intent survives HTTP loss. An uncertain non-idempotent policy
 * create is reconciled by exact definition; never blindly issued a second time. */
export async function queueHttpImagePair(db: DrizzleDB, input: Scope & {
  submissionId: string; planDigest: string; userToken: string; correlationId: string;
}) {
  await assertOwner(db, input);
  if (!input.userToken) throw Error("HTTP_IMAGE_OWNER_SESSION_REQUIRED");
  const submission = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`http-image-pair-scope:${input.tenantId}:${input.projectId}`}))`);
    const [existing] = await tx.select().from(systemSettings).where(whereSubmission(input.submissionId)).limit(1);
    if (existing) { const value = existing.valueJson as Submission; assertSubmission(value, input); return value; }
    const preflight = await getHttpImagePairPreflight(db, input, input.planDigest);
    if (!preflight.ready) throw Error(preflight.reason);
    if (preflight.planDigest !== input.planDigest) throw Error("HTTP_IMAGE_PLAN_CHANGED");
    const retained = await tx.select().from(systemSettings).where(and(eq(systemSettings.category, CATEGORY),
      sql`${systemSettings.valueJson}->>'tenantId'=${input.tenantId}`,
      sql`${systemSettings.valueJson}->>'projectId'=${input.projectId}`,
      sql`${systemSettings.valueJson}->>'sourceSha'=${preflight.sourceSha}`));
    for (const row of retained) {
      const value = row.valueJson as Submission;
      if (value.actorUserId === input.actorUserId && value.planDigest === input.planDigest && Date.parse(value.expiresAt) > Date.now()+60_000)
        return value;
    }
    const value: Submission = { tenantId: input.tenantId, projectId: input.projectId, actorUserId: input.actorUserId,
      submissionId: input.submissionId, planDigest: input.planDigest, sourceSha: preflight.sourceSha, buildId: preflight.buildId,
      accountRef: preflight.accountRef, executorId: preflight.executorId, namespace: preflight.namespace,
      expiresAt: new Date(Date.now()+45*60_000).toISOString(), policies: {} };
    await tx.insert(systemSettings).values({ category: CATEGORY, key: input.submissionId, valueJson: value,
      updatedBy: input.actorUserId, description: "Exact paired HTTP image admission intent; no runtime activation" });
    return value;
  });
  // Another tab can discover the same exact source under a different browser
  // UUID. Reuse the original canonical pair before issuing any further policy.
  input = { ...input, submissionId: submission.submissionId, planDigest: submission.planDigest };
  const config = await getAppRuntimeConfig();
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${config.pythonBackendUrl}${path}`, { method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${input.userToken}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    // Do not surface provider bodies or credentials from the approval service.
    const value = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      const detail = typeof value.detail === "string" && /^[A-Z][A-Z0-9_]{4,119}$/.test(value.detail) ? `:${value.detail}` : "";
      throw Error(`HTTP_IMAGE_APPROVAL_HTTP_${response.status}${detail}`);
    }
    return value;
  };
  for (const runtime of RUNTIMES) {
    const jobId = httpImagePairJobId(input.submissionId, runtime);
    const current = await readHttpImagePairSubmission(db, input);
    if (current?.jobs.find(job => job.runtime === runtime)?.status !== "NOT_ADMITTED") continue;
    if (Date.parse(submission.expiresAt) <= Date.now()+60_000) throw Error("HTTP_IMAGE_SUBMISSION_EXPIRED");
    const plan: HttpImageProvisionPlan = { namespace: submission.namespace, runtime, sourceSha: submission.sourceSha, buildId: submission.buildId,
      configurationExpiresAt: submission.expiresAt, buildBudgetSeconds: 360, maxImageBytes: 1_073_741_824, maxPublishedImages: 1 };
    const planDigest = httpImageProvisionPlanDigest(plan);
    const definition = { contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, accountRef: submission.accountRef, executorId: submission.executorId,
      actorUserId: input.actorUserId, targetId: "smartspec-cloudflare-staging", environment: "staging", plan, planDigest,
      maxOperations: 1, expiresAt: submission.expiresAt };
    const policy = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`http-image-pair:${input.submissionId}`}))`);
      const [row] = await tx.select().from(systemSettings).where(whereSubmission(input.submissionId)).limit(1);
      const value = row.valueJson as Submission; assertSubmission(value, input);
      const previous = value.policies[runtime];
      if (previous?.started) return { ...previous, create: false };
      value.policies[runtime] = { started: true };
      await tx.update(systemSettings).set({ valueJson: value, updatedAt: new Date() }).where(whereSubmission(input.submissionId));
      return { started: true, create: true, id: undefined as string | undefined };
    });
    let policyId = policy.id, policyError: unknown;
    if (policy.create) {
      try {
        const created = await post("/api/v1/approvals/cloudflare-staging-policies", { projectId: input.projectId, definition });
        policyId = created.policyId;
      } catch (error) { policyError = error; /* Reconcile committed policy even when its HTTP response failed. */ }
    }
    if (!policyId) {
      const matches = await db.execute(sql`SELECT id FROM approval_rules WHERE tenant_id=${input.tenantId} AND project_id=${input.projectId}
        AND is_active=true AND conditions::jsonb->'definition'=${JSON.stringify(definition)}::jsonb LIMIT 2`);
      if (matches.length === 1) policyId = String(matches[0].id);
    }
    if (!policyId || !/^[a-f0-9-]{36}$/.test(policyId)) {
      if (policyError instanceof Error && /^HTTP_IMAGE_APPROVAL_HTTP_4[0-9]{2}(?::[A-Z0-9_]+)?$/.test(policyError.message)) {
        const rejectedCode = policyError.message;
        await db.transaction(async tx => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`http-image-pair:${input.submissionId}`}))`);
          const [row] = await tx.select().from(systemSettings).where(whereSubmission(input.submissionId)).limit(1);
          const value = row.valueJson as Submission; assertSubmission(value, input);
          value.policies[runtime] = { started: false, rejectedCode };
          await tx.update(systemSettings).set({ valueJson: value, updatedAt: new Date() }).where(whereSubmission(input.submissionId));
        });
        throw policyError;
      }
      throw Error("HTTP_IMAGE_POLICY_ADMISSION_UNKNOWN");
    }
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`http-image-pair:${input.submissionId}`}))`);
      const [row] = await tx.select().from(systemSettings).where(whereSubmission(input.submissionId)).limit(1);
      const value = row.valueJson as Submission; assertSubmission(value, input);
      value.policies[runtime] = { started: true, id: policyId };
      await tx.update(systemSettings).set({ valueJson: value, updatedAt: new Date() }).where(whereSubmission(input.submissionId));
    });
    const approved = await post("/api/v1/approvals/cloudflare-staging-http-image-grants/policy", {
      idempotencyKey: `cf-http-image:${jobId}`, policyId, projectId: input.projectId, jobId,
      executorId: submission.executorId, accountRef: submission.accountRef, plan, planDigest, expiresAt: submission.expiresAt });
    if (approved.status !== "approved" || typeof approved.id !== "string") throw Error("HTTP_IMAGE_GRANT_NOT_APPROVED");
    const resolved = httpImageProvisionGrantSchema.parse(await createCloudflareHttpImageProvisionRuntime().resolveGrant(approved.id));
    if (resolved.jobId !== jobId || resolved.tenantId !== input.tenantId || resolved.projectId !== input.projectId ||
        resolved.requesterUserId !== input.actorUserId || resolved.planDigest !== planDigest || Date.parse(resolved.expiresAt) !== Date.parse(submission.expiresAt) ||
        resolved.executorId !== submission.executorId || resolved.accountRef !== submission.accountRef || Date.parse(resolved.expiresAt) <= Date.now())
      throw Error("HTTP_IMAGE_GRANT_SCOPE_DENIED");
    try {
      const admitted = await createControlPlaneJob({ context: { tenantId: input.tenantId, actorType: "user", actorId: input.actorUserId,
        authorizationScope: "infrastructure.cloudflare_http_image_publish", correlationId: input.correlationId },
        definition: { jobType: HTTP_IMAGE_PROVISION_JOB, contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, executionClass: "long", priority: 50,
          input: { contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, grantRef: approved.id, projectId: input.projectId, planDigest },
          idempotencyKey: `cloudflare-http-image:${jobId}`, activeDedupeKey: `cloudflare-http-image:${input.tenantId}:${input.projectId}:${runtime}:${submission.sourceSha}`,
          retryPolicy: { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 5000, jitter: "bounded", deadlineMode: "fixed", deadlineMs: 15*60_000,
            allowedErrorClasses: ["retryable"] }, timeoutPolicy: { softTimeoutMs: 360_000, hardTimeoutMs: 15*60_000 } },
        createOptions: { canonicalJobId: jobId, runtimeType: "node_job_worker" } });
      if (admitted.jobId !== jobId) throw Error("HTTP_IMAGE_EXISTING_JOB_RECONCILIATION_REQUIRED");
    } catch (error) {
      const reconciled = await readHttpImagePairSubmission(db, input);
      if (reconciled?.jobs.find(job => job.runtime === runtime)?.status === "NOT_ADMITTED") throw error;
      // Do not revoke a grant after an ambiguous job/outbox response.
    }
  }
  return readHttpImagePairSubmission(db, input);
}
