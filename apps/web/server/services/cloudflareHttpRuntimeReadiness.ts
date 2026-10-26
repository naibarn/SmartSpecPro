import { sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { assertHttpCandidateOwner, resolveHttpCandidatePackage } from "./cloudflareHttpCandidatePreparation";
import { HTTP_CANDIDATE_JOB, HTTP_CANDIDATE_CONTRACT } from "./cloudflareHttpCandidateContract";
import { httpCandidateReceiptSchema, verifyHttpCandidateProviderReceipt } from "./cloudflareHttpCandidateReadback";
import { applicationDatabaseRoleName } from "./cloudflareApplicationDatabaseRole";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";

type Scope = { tenantId: string; projectId: string; actorUserId: number };
type Check = { code: string; status: "VERIFIED" | "MISSING" | "UNVERIFIED"; nextAction: string; permission?: string; http?: number; providerCodes?: number[] };

/** Database connector and runtime checks follow successful Candidate metadata
 * preparation. Missing optional platform capabilities are not prerequisites.
 * This inspection never changes DNS, roles, secrets, traffic or starts a VM. */
export async function getHttpRuntimeReadiness(db: DrizzleDB, scope: Scope, jobId: string) {
  await assertHttpCandidateOwner(db, scope);
  const jobs = await db.execute(sql`SELECT id,"tenantId","requestedByUserId","jobType","contractVersion",status,"operatorReviewRequired","inputJson","outputJson"
    FROM worker_jobs WHERE id=${jobId}`);
  const job = jobs[0];
  if (!job || job.tenantId !== scope.tenantId || job.requestedByUserId !== scope.actorUserId || job.jobType !== HTTP_CANDIDATE_JOB ||
      job.contractVersion !== HTTP_CANDIDATE_CONTRACT || job.status !== "succeeded" || job.operatorReviewRequired ||
      (job.inputJson as any)?.projectId !== scope.projectId) throw Error("HTTP_RUNTIME_CANDIDATE_JOB_DENIED");
  const receipt = httpCandidateReceiptSchema.parse(job.outputJson);
  const { target, packet } = await resolveHttpCandidatePackage(db, scope);
  if (receipt.accountRef !== target.accountRef || receipt.workerName !== packet.config.name || receipt.manifestDigest !== packet.manifestDigest ||
      receipt.imageSourceSha !== packet.imageSourceSha) throw Error("HTTP_RUNTIME_CANONICAL_RECEIPT_DENIED");
  const checks: Check[] = [];
  const role = applicationDatabaseRoleName(scope);
  const roles = await db.execute(sql`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil
    FROM pg_roles WHERE rolname=${role}`);
  const restricted = roles.length === 1 && roles[0].rolcanlogin && !roles[0].rolsuper && !roles[0].rolcreatedb && !roles[0].rolcreaterole &&
    !roles[0].rolinherit && !roles[0].rolreplication && !roles[0].rolbypassrls && roles[0].rolconnlimit === 10 &&
    new Date(String(roles[0].rolvaliduntil)).getTime() > Date.now();
  checks.push({ code: "APPLICATION_DATABASE_ROLE", status: restricted ? "UNVERIFIED" : "MISSING",
    nextAction: restricted ? "Verify exact table grants, immutable plan checkpoint and live tenant isolation before acceptance."
      : "Prepare the separate bounded application role with exact table grants under runtime authority; preserve Linux roles and M1 intake role." });
  const access = await withCloudflareDeploymentCredential(db, { identity: { ...scope, environment: "production", provider: "cloudflare" }, credentialRef: target.credentialRef }, async token => {
    const provider = await verifyHttpCandidateProviderReceipt({ receipt, accountRef: target.accountRef, token });
    const root = `/accounts/${target.accountRef}`;
    const get = async (path: string) => {
      try {
      const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method: "GET", headers: { authorization: `Bearer ${token}` },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000) });
      const body = await response.json();
      return { http: response.status, complete: response.ok && body.success === true && (body.result_info?.total_pages ?? 1) <= 1,
        result: body.result, codes: (body.errors ?? []).map((e: any) => e.code).filter((code: unknown) => Number.isSafeInteger(code)) as number[] };
      } catch { return { http: 0, complete: false, result: undefined, codes: [] as number[] }; }
    };
    const [dns, apps] = await Promise.all([get("/zones/9acd8fe46851607de0919f2b6a462911/dns_records?name=db.smartaihub.app"), get(`${root}/access/apps?per_page=100`)]);
    checks.push({ code: "PRODUCTION_DATABASE_DNS", status: dns.complete && Array.isArray(dns.result) && dns.result.length === 0 ? "MISSING" : "UNVERIFIED",
      http: dns.http, providerCodes: dns.codes, ...(dns.http === 403 ? { permission: "Zone · DNS · Edit — smartaihub.app" } : {}),
      nextAction: dns.http === 403 ? "The production target token cannot inspect the selected hostname. Update that token's zone DNS permission, then rerun this read-only check."
        : !dns.complete ? "DNS inspection is incomplete. Reconcile the authentication, provider response or network error before preparing the hostname."
        : "Reconcile a dedicated Access/Tunnel connector and exact PostgreSQL TLS hostname for the published images; DNS existence alone is not connectivity acceptance." });
    checks.push({ code: "PRODUCTION_DATABASE_ACCESS_CONNECTOR", status: !apps.complete || !Array.isArray(apps.result) || apps.result.some((app: any) => app.domain === "db.smartaihub.app") ? "UNVERIFIED" : "MISSING", http: apps.http, providerCodes: apps.codes,
      nextAction: "Prepare and verify a dedicated self-hosted Access application, service-token policy and Tunnel TCP route for db.smartaihub.app:5433; do not reuse staging credentials." });
    checks.push({ code: "PAIRED_RUNTIME_BINDINGS", status: provider.runtimeBindingsConfigured ? "UNVERIFIED" : "MISSING",
      nextAction: "Bind encrypted Node/Python application configuration, restricted database identity, verify-full CA and short-lived paired profiles to this Candidate only." });
    return provider;
  });
  if (access.status !== "CONFIGURED" || !access.value) throw Error("HTTP_RUNTIME_CREDENTIAL_REQUIRED");
  checks.push({ code: "BOUNDED_RUNTIME_AUTHORITY", status: "MISSING",
    nextAction: "Candidate metadata authority permits zero starts. A runtime operation must cover the exact role, connector, bindings, bounded starts, test scope and compensation; production activation remains separate." });
  checks.push({ code: "LIVE_RUNTIME_ACCEPTANCE", status: "UNVERIFIED",
    nextAction: "After bounded starts, verify Node/Python SQL, HTTP/API, authentication, tenant boundaries, Gateway, billing, jobs, recovery and rollback with authorized synthetic fixtures." });
  return { observedAt: new Date().toISOString(), candidateJobId: jobId, metadata: access.value, databaseRole: role,
    connectorHostname: "db.smartaihub.app", checks, ready: false as const, runtimeAcceptance: false as const,
    activationAuthorized: false as const, providerMutations: 0 as const, databaseMutations: 0 as const, containerStarts: 0 as const };
}
