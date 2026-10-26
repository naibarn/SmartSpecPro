import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { resolveVerifiedHttpImagePair, HttpPublishedPairRequired } from "./cloudflareHttpPublishedPair";
import { createHttpCandidateConfiguration } from "./cloudflareHttpCandidateConfiguration";
import { httpApplicationNamespace, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import { resolveLatestPublishedCloudflareStagingArtifact, resolveCloudflareStagingArtifact, resolveCloudflareStagingModules } from "./cloudflareStagingArtifactAuthority";
import { CANDIDATE_MODULE, HTTP_CANDIDATE_CONTRACT, HTTP_CANDIDATE_JOB } from "./cloudflareHttpCandidateContract";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { probeHttpCandidateProvider } from "./cloudflareHttpCandidateProvider";

const CATEGORY = "cloudflare_production_native_preparations";
type Scope = { tenantId: string; projectId: string; actorUserId: number };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const whereIntent = (id: string) => and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, id));

export async function assertHttpCandidateOwner(db: DrizzleDB, scope: Scope) {
  const rows = await db.execute(sql`SELECT 1 FROM tenants t JOIN users u ON u.id=${scope.actorUserId}
    JOIN canonical_projects p ON p.project_id=${scope.projectId} AND p.tenant_id=t.id
    WHERE t.id=${scope.tenantId} AND t."ownerId"=u.id AND t."isActive" AND u.role='admin' AND NOT u."isDisabled"
      AND p.lifecycle='ACTIVE' AND p.owner_principal_id=${`user:${scope.actorUserId}`}`);
  if (rows.length !== 1) throw Error("HTTP_CANDIDATE_OWNER_SCOPE_DENIED");
}

/** Exact completed publication receipts, rather than local tags or a new build
 * of the Node/Python images. No secret or runtime start profile is returned. */
export async function resolveHttpCandidatePackage(db: DrizzleDB, scope: Scope, baseline?: { imageSourceSha: string }) {
  await assertHttpCandidateOwner(db, scope);
  const target = await resolveCloudflareProductionDeploymentTarget({ db, ...scope });
  if (!target) throw Error("HTTP_CANDIDATE_PRODUCTION_TARGET_REQUIRED");
  const resolution = await resolveVerifiedHttpImagePair(db, scope, baseline);
  const pair = resolution.pair;
  if (!pair) throw new HttpPublishedPairRequired(resolution.diagnostics);
  const jobs = await Promise.all(pair.jobs.map(async item => {
    const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, item.jobId)).limit(1); return job;
  }));
  const node = jobs.find(item => item?.outputJson?.runtime === "node-http"), python = jobs.find(item => item?.outputJson?.runtime === "python-http");
  if (!node || !python) throw Error("HTTP_CANDIDATE_IMAGE_RECEIPTS_REQUIRED");
  const image = (job: typeof node) => ({ provisionJobId: job.id, planDigest: String(job.inputJson.planDigest), image: String(job.outputJson!.image) });
  const settings: HttpApplicationSettings = { mode: "private-canary", namespace: httpApplicationNamespace(scope.tenantId, scope.projectId, "production"),
      sourceSha: pair.sourceSha, node: image(node), python: image(python), issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), maxStarts: 2, maxComputeSeconds: 1200,
      hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic" };
  const packet = createHttpCandidateConfiguration({ scope: { ...scope, environment: "production", accountRef: target.accountRef }, settings, receipts: { node, python } });
  return { target, packet, settings, publishedPair: { submissionId: pair.submissionId, sourceSha: pair.sourceSha, jobs: pair.jobs, verified: true as const } };
}

export async function getHttpCandidatePreparationPreflight(db: DrizzleDB, scope: Scope,
  reviewedArtifact?: { artifactRef: string; workerSourceSha: string }) {
  await assertHttpCandidateOwner(db, scope);
  try {
    const { target, packet, publishedPair } = await resolveHttpCandidatePackage(db, scope);
    // A newer Admin build cannot replace the exact artifact reviewed by the
    // Owner between the page read and submission. Existing receipt authority
    // still rejects an unpublished/local/foreign digest.
    const artifact = reviewedArtifact
      ? await resolveCloudflareStagingArtifact(reviewedArtifact.artifactRef, reviewedArtifact.workerSourceSha)
      : await resolveLatestPublishedCloudflareStagingArtifact();
    if (!artifact) throw Error("HTTP_CANDIDATE_CANONICAL_ARTIFACT_REQUIRED");
    const bundle = await resolveCloudflareStagingModules(artifact.artifactRef, artifact.sourceSha);
    if (!bundle?.moduleFiles[CANDIDATE_MODULE]) throw Error("HTTP_CANDIDATE_CANONICAL_MODULE_REQUIRED");
    const executorId = process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim();
    if (!executorId) throw Error("HTTP_CANDIDATE_EXECUTOR_REQUIRED");
    const access = await withCloudflareDeploymentCredential(db, { identity: { tenantId: scope.tenantId, projectId: scope.projectId,
      environment: "production", provider: "cloudflare" }, credentialRef: target.credentialRef }, token => probeHttpCandidateProvider({
        accountRef: target.accountRef, workerName: packet.config.name, applicationNames: packet.config.containers.map(item => item.name), token }));
    if (access.status !== "CONFIGURED" || !access.value) throw Error("HTTP_CANDIDATE_CREDENTIAL_REQUIRED");
    const plan = { accountRef: target.accountRef, credentialRef: target.credentialRef, executorId,
      artifactRef: artifact.artifactRef, workerSourceSha: artifact.sourceSha,
      manifestDigest: packet.manifestDigest, workerName: packet.config.name, imageSourceSha: packet.imageSourceSha,
      images: packet.config.containers.map(item => Object.values(item.images)[0].image) };
    return { ready: true as const, reason: null, plan, publishedPair, providerAccess: access.value, planDigest: digest(plan), dnsRequired: false,
      trafficMutation: false, containerStarts: 0, runtimeAcceptance: false };
  } catch (error) {
    const reason = error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message) ? error.message : "HTTP_CANDIDATE_PREFLIGHT_UNAVAILABLE";
    return { ready: false as const, reason, pairDiagnostics: error instanceof HttpPublishedPairRequired ? error.diagnostics : [], dnsRequired: false, trafficMutation: false, containerStarts: 0, runtimeAcceptance: false };
  }
}

export async function readHttpCandidatePreparation(db: DrizzleDB, scope: Scope) {
  await assertHttpCandidateOwner(db, scope);
  const rows = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, scope.tenantId),
    eq(workerJobs.jobType, HTTP_CANDIDATE_JOB), eq(workerJobs.contractVersion, HTTP_CANDIDATE_CONTRACT),
    eq(workerJobs.requestedByUserId, scope.actorUserId), sql`${workerJobs.inputJson}->>'projectId'=${scope.projectId}`))
    .orderBy(sql`${workerJobs.createdAt} DESC`).limit(1);
  const job = rows[0]; return job ? { jobId: job.id, status: job.status, attempt: job.attempt, maxAttempts: job.maxAttempts,
    errorCode: job.errorCode, receipt: job.outputJson, heartbeatAt: job.heartbeatAt } : null;
}

/** Authenticated Owner admission follows the existing Production Queue/DB
 * control-plane pattern. This exact intent authorizes metadata only, no VM
 * starts, application secrets, DNS, M2 updates, or production activation. */
export async function prepareHttpCandidate(db: DrizzleDB, scope: Scope & { submissionId: string; planDigest: string; correlationId: string;
  artifactRef?: string; workerSourceSha?: string }) {
  await assertHttpCandidateOwner(db, scope);
  const intent = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`native-candidate:${scope.tenantId}:${scope.projectId}`}))`);
    const [old] = await tx.select().from(systemSettings).where(whereIntent(scope.submissionId)).limit(1);
    if (old) {
      const value = old.valueJson as Record<string, any>;
      if (old.updatedBy !== scope.actorUserId || value.tenantId !== scope.tenantId || value.projectId !== scope.projectId ||
          value.planDigest !== scope.planDigest) throw Error("HTTP_CANDIDATE_SUBMISSION_SCOPE_DENIED");
      return value;
    }
    const existing = await tx.select().from(systemSettings).where(and(eq(systemSettings.category, CATEGORY),
      sql`${systemSettings.valueJson}->>'tenantId'=${scope.tenantId}`, sql`${systemSettings.valueJson}->>'projectId'=${scope.projectId}`)).limit(1);
    if (existing.length) throw Error("HTTP_CANDIDATE_EXISTING_SUBMISSION_RECONCILE_REQUIRED");
    if (Boolean(scope.artifactRef) !== Boolean(scope.workerSourceSha)) throw Error("HTTP_CANDIDATE_REVIEWED_ARTIFACT_REQUIRED");
    const preflight = await getHttpCandidatePreparationPreflight(db, scope, scope.artifactRef && scope.workerSourceSha
      ? { artifactRef: scope.artifactRef, workerSourceSha: scope.workerSourceSha } : undefined);
    if (!preflight.ready) throw Error(preflight.reason);
    if (preflight.planDigest !== scope.planDigest) throw Error("HTTP_CANDIDATE_PLAN_CHANGED");
    const value = { tenantId: scope.tenantId, projectId: scope.projectId, actorUserId: scope.actorUserId,
      submissionId: scope.submissionId, planDigest: scope.planDigest, plan: preflight.plan,
      expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(), revokedAt: null,
      containerStarts: 0, dnsMutation: false, trafficMutation: false };
    await tx.insert(systemSettings).values({ category: CATEGORY, key: scope.submissionId, valueJson: value, updatedBy: scope.actorUserId,
      description: "Authenticated Owner exact isolated native metadata preparation; no VM or production traffic authority" });
    return value;
  });
  const [existing] = await db.select().from(workerJobs).where(eq(workerJobs.id, scope.submissionId)).limit(1);
  if (existing) {
    if (existing.tenantId !== scope.tenantId || existing.requestedByUserId !== scope.actorUserId || existing.jobType !== HTTP_CANDIDATE_JOB ||
        existing.inputJson?.planDigest !== scope.planDigest) throw Error("HTTP_CANDIDATE_JOB_SCOPE_DENIED");
    return { jobId: existing.id, status: existing.status };
  }
  if (Date.parse(intent.expiresAt) <= Date.now()) throw Error("HTTP_CANDIDATE_AUTHORIZATION_EXPIRED");
  // An admission timeout retains the exact intent. Reconcile this SAME ID;
  // never delete authorization after an uncertain canonical write.
  return createControlPlaneJob({ context: { tenantId: scope.tenantId, actorType: "user", actorId: scope.actorUserId,
    authorizationScope: "infrastructure.cloudflare_production_native_prepare", correlationId: scope.correlationId,
    idempotencyKey: `native-candidate:${scope.submissionId}` }, definition: {
      contractVersion: HTTP_CANDIDATE_CONTRACT, jobType: HTTP_CANDIDATE_JOB, executionClass: "long", priority: 45,
      input: { contractVersion: HTTP_CANDIDATE_CONTRACT, projectId: scope.projectId, submissionId: scope.submissionId, planDigest: scope.planDigest },
      idempotencyKey: `native-candidate:${scope.submissionId}`, activeDedupeKey: `native-candidate:${scope.tenantId}:${scope.projectId}`,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 2000, maxDelayMs: 5000, jitter: "bounded", deadlineMs: 10 * 60_000, allowedErrorClasses: [] },
      timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 10 * 60_000 } },
    createOptions: { canonicalJobId: scope.submissionId, runtimeType: "node_job_worker" } });
}

export async function readHttpCandidateIntent(db: DrizzleDB, id: string) {
  const [row] = await db.select().from(systemSettings).where(whereIntent(id)).limit(1);
  return row;
}
