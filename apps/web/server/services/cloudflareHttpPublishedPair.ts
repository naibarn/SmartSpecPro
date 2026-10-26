import { and, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { readHttpImagePairSubmission, assertHttpImageOwner } from "./cloudflareHttpImageAdmission";
import { assertHttpImageProvisionReceipt } from "./cloudflareHttpApplicationBindings";
import { httpImageProvisionPlanDigest, httpImageProvisionPlanSchema } from "./cloudflareHttpImageProvisionContract";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import { createCloudflareHttpImageProvisionRuntime } from "./cloudflareHttpImageProvisionExecutor";

type Scope = { tenantId: string; projectId: string; actorUserId: number };
export type PublishedPairDiagnostic = { submissionId: string; code: string; runtime?: "node-http" | "python-http"; jobId?: string };

/** Completed immutable receipts remain usable after their execution grants
 * expire. This read never renews a grant, publishes an image or admits a job.
 * A browser hint and a newer incomplete submission cannot shadow a valid pair. */
export async function resolveVerifiedHttpImagePair(db: DrizzleDB, scope: Scope) {
  // Candidate admission also has a submissionId, but that identifies a
  // DIFFERENT operation. Never forward extra request fields as an image hint.
  scope = { tenantId: scope.tenantId, projectId: scope.projectId, actorUserId: scope.actorUserId };
  // Keep the existing exact Owner check even when there are no submissions.
  await assertHttpImageOwner(db, scope);
  let latest: Awaited<ReturnType<typeof readHttpImagePairSubmission>> = null;
  const rows = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_http_image_submissions"),
    sql`${systemSettings.valueJson}->>'tenantId'=${scope.tenantId}`,
    sql`${systemSettings.valueJson}->>'projectId'=${scope.projectId}`,
    sql`${systemSettings.valueJson}->>'actorUserId'=${String(scope.actorUserId)}`))
    .orderBy(sql`${systemSettings.id} DESC`);
  const diagnostics: PublishedPairDiagnostic[] = [];
  if (!rows.length) return { pair: null, diagnostics, latest };
  const target = await resolveCloudflareProductionDeploymentTarget({ db, ...scope });
  const accountRef = target?.accountRef ?? await createCloudflareHttpImageProvisionRuntime().resolveAccount({
    tenantId: scope.tenantId, projectId: scope.projectId, provider: "cloudflare", environment: "staging" });
  for (const row of rows) {
    try {
      const submission = row.valueJson as Record<string, any>;
      if (row.updatedBy !== scope.actorUserId) throw Error("HTTP_IMAGE_SUBMISSION_OWNER_DENIED");
      if (!accountRef || !/^[a-f0-9]{32}$/.test(accountRef) || submission.accountRef !== accountRef)
        throw Error("HTTP_IMAGE_SUBMISSION_ACCOUNT_DENIED");
      if (submission.namespace !== nativeProvisionNamespace(scope.tenantId, scope.projectId)) throw Error("HTTP_IMAGE_SUBMISSION_NAMESPACE_DENIED");
      const pair = await readHttpImagePairSubmission(db, { ...scope, submissionId: row.key });
      if (!pair) throw Error("HTTP_IMAGE_SUBMISSION_MISSING");
      latest ??= pair;
      let verified = true;
      for (const item of pair.jobs) {
        const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, item.jobId)).limit(1);
        let code: string | null = null;
        if (!job) code = "HTTP_IMAGE_JOB_MISSING";
        else if (job.status !== "succeeded") code = "HTTP_IMAGE_JOB_NOT_SUCCEEDED";
        else {
          const plan = httpImageProvisionPlanSchema.safeParse({ namespace: submission.namespace, runtime: item.runtime,
            sourceSha: submission.sourceSha, buildId: submission.buildId, configurationExpiresAt: submission.expiresAt,
            buildBudgetSeconds: 360, maxImageBytes: 1_073_741_824, maxPublishedImages: 1 });
          if (!plan.success || httpImageProvisionPlanDigest(plan.data) !== job.inputJson?.planDigest) code = "HTTP_IMAGE_SOURCE_PLAN_DENIED";
          else if (!item.registryVerified || !item.image) code = "HTTP_IMAGE_REGISTRY_RECEIPT_DENIED";
          else {
            const image = { provisionJobId: job.id, planDigest: String(job.inputJson.planDigest), image: item.image };
            try {
              assertHttpImageProvisionReceipt({ sourceSha: pair.sourceSha, node: image, python: image },
                item.runtime === "node-http" ? "node" : "python", job, { ...scope, accountRef });
            } catch { code = "HTTP_IMAGE_CANONICAL_RECEIPT_DENIED"; }
          }
        }
        if (code) { verified = false; diagnostics.push({ submissionId: row.key, runtime: item.runtime, jobId: item.jobId, code }); }
      }
      if (verified && pair.published) return { pair: { ...pair, accountRef }, diagnostics, latest };
    } catch (error) {
      diagnostics.push({ submissionId: row.key, code: error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message)
        ? error.message : "HTTP_IMAGE_SUBMISSION_INVALID" });
    }
  }
  return { pair: null, diagnostics, latest };
}

/** Public Admin status and Candidate Preflight use the same selection. Exact
 * submission reads remain available internally for admission reconciliation. */
export async function readHttpImagePublication(db: DrizzleDB, scope: Scope & { submissionId?: string }) {
  const resolution = await resolveVerifiedHttpImagePair(db, scope);
  const pair = resolution.pair ?? (scope.submissionId ? await readHttpImagePairSubmission(db, scope) : resolution.latest);
  if (pair) return { ...pair, accountRef: resolution.pair?.accountRef ?? null,
    published: Boolean(resolution.pair), pairResolution: resolution.diagnostics };
  return resolution.diagnostics.length ? { submissionId: null, planDigest: null, sourceSha: null, buildId: null, accountRef: null,
    jobs: [], diagnostics: [], published: false, pairResolution: resolution.diagnostics, trafficMutation: false } : null;
}

export class HttpPublishedPairRequired extends Error {
  constructor(readonly diagnostics: PublishedPairDiagnostic[]) { super("HTTP_CANDIDATE_PUBLISHED_PAIR_REQUIRED"); }
}
