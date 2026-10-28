import { sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { assertHttpCandidateOwner, resolveHttpCandidatePackage } from "./cloudflareHttpCandidatePreparation";
import { HTTP_CANDIDATE_JOB, HTTP_CANDIDATE_CONTRACT } from "./cloudflareHttpCandidateContract";
import { httpCandidateReceiptSchema, verifyHttpCandidateProviderReceipt } from "./cloudflareHttpCandidateReadback";
import { applicationDatabaseRoleName } from "./cloudflareApplicationDatabaseRole";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { readHttpDatabaseNetwork } from "./cloudflareHttpDatabaseNetwork";
import { readHttpRuntimeOperation } from "./cloudflareHttpRuntimeAdmission";

type Scope = { tenantId: string; projectId: string; actorUserId: number };
type Check = { code: string; status: "VERIFIED" | "MISSING" | "UNVERIFIED"; nextAction: string; permission?: string; http?: number; providerCodes?: number[]; required?: boolean };

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
  const { target, packet } = await resolveHttpCandidatePackage(db, scope, { imageSourceSha: receipt.imageSourceSha });
  if (receipt.accountRef !== target.accountRef || receipt.workerName !== packet.config.name || receipt.manifestDigest !== packet.manifestDigest ||
      receipt.imageSourceSha !== packet.imageSourceSha) throw Error("HTTP_RUNTIME_CANONICAL_RECEIPT_DENIED");
  const checks: Check[] = [];
  const operation = await readHttpRuntimeOperation(db, scope), cleanup = operation?.checkpoint?.cleanup as Record<string, unknown> | undefined;
  const restoredBaseline = operation?.candidateJobId === jobId && cleanup?.candidateRestored === true && cleanup.m2Preserved === true &&
    typeof cleanup.candidateDeploymentId === "string" && cleanup.candidateVersionId === receipt.versionId
    ? { deploymentId: cleanup.candidateDeploymentId, versionId: receipt.versionId } : undefined;
  const databaseNetwork = await readHttpDatabaseNetwork(db, scope);
  checks.push({ code: "PRODUCTION_DATABASE_NETWORK", status: "VERIFIED", required: true,
    nextAction: "Reuse the accepted production Tunnel through a fixed-target private VPC Network/WebSocket bridge. Native drivers retain PostgreSQL TLS verification and a separate app role. No new Access application, DNS record or Hyperdrive is required; Container execution remains unverified." });
  checks.push({ code: "DATABASE_TRANSPORT_BINDING", status: "MISSING", required: true,
    nextAction: "Bind the exact existing Tunnel, private egress bridge and fixed VPC startup programs to this Candidate under bounded runtime authority, then verify real Container-to-PostgreSQL TLS/SQL before acceptance." });
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
    let provider: Awaited<ReturnType<typeof verifyHttpCandidateProviderReceipt>>;
    try {
      provider = await verifyHttpCandidateProviderReceipt({ receipt, accountRef: target.accountRef, token, restoredBaseline });
    } catch (error) {
      // A deployment that moved since Candidate preparation is a normal stale
      // readback state. Keep the strict provider check, but return that state
      // as data so the Admin does not emit a failing 412 query on every visit.
      if (error instanceof Error && error.message === "HTTP_CANDIDATE_DEPLOYMENT_CHANGED") {
        return { status: "STALE" as const, reason: "HTTP_CANDIDATE_DEPLOYMENT_CHANGED" as const };
      }
      throw error;
    }
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
    const zone = await get("/zones/9acd8fe46851607de0919f2b6a462911");
    if (!zone.complete || zone.result?.id !== "9acd8fe46851607de0919f2b6a462911" || zone.result?.name !== "smartaihub.app" || zone.result?.account?.id !== target.accountRef)
      throw Error("HTTP_RUNTIME_DATABASE_ZONE_IDENTITY_DENIED");
    // Optional diagnostics for the alternative Access connector. They cannot
    // gate the selected private VPC transport or justify DNS Write authority.
    const [dns, apps] = await Promise.all([get("/zones/9acd8fe46851607de0919f2b6a462911/dns_records?name=db.smartaihub.app"), get(`${root}/access/apps?per_page=100`)]);
    checks.push({ code: "PRODUCTION_DATABASE_DNS", status: dns.complete && Array.isArray(dns.result) && dns.result.length === 0 ? "MISSING" : "UNVERIFIED",
      required: false, http: dns.http, providerCodes: dns.codes, ...(dns.http === 403 ? { permission: "Zone · DNS · Read — smartaihub.app (optional inspection only)" } : {}),
      nextAction: "Optional Access-alternative inventory only. DNS GET uses DNS Read, never DNS Edit. The selected VPC transport needs no public database DNS or token privilege expansion." });
    checks.push({ code: "PRODUCTION_DATABASE_ACCESS_CONNECTOR", status: !apps.complete || !Array.isArray(apps.result) || apps.result.some((app: any) => app.domain === "db.smartaihub.app") ? "UNVERIFIED" : "MISSING", required: false, http: apps.http, providerCodes: apps.codes,
      nextAction: "Optional alternative, not selected. Do not create an Access application or service token for the private VPC transport." });
    checks.push({ code: "PAIRED_RUNTIME_BINDINGS", status: provider.runtimeBindingsConfigured ? "UNVERIFIED" : "MISSING",
      nextAction: "Bind encrypted Node/Python application configuration, restricted database identity, verify-full CA and short-lived paired profiles to this Candidate only." });
    return provider;
  });
  if (access.status !== "CONFIGURED" || !access.value) throw Error("HTTP_RUNTIME_CREDENTIAL_REQUIRED");
  if ("status" in access.value && access.value.status === "STALE") return { observedAt: new Date().toISOString(), candidateJobId: jobId,
    status: access.value.status, reason: access.value.reason, ready: false as const, runtimeAcceptance: false as const,
    activationAuthorized: false as const, providerMutations: 0 as const, databaseMutations: 0 as const, containerStarts: 0 as const };
  checks.push({ code: "BOUNDED_RUNTIME_AUTHORITY", status: "MISSING",
    nextAction: "Candidate metadata authority permits zero starts. A runtime operation must cover the exact role, connector, bindings, bounded starts, test scope and compensation; production activation remains separate." });
  checks.push({ code: "LIVE_RUNTIME_ACCEPTANCE", status: "UNVERIFIED",
    nextAction: "After bounded starts, verify Node/Python SQL, HTTP/API, authentication, tenant boundaries, Gateway, billing, jobs, recovery and rollback with authorized synthetic fixtures." });
  return { observedAt: new Date().toISOString(), candidateJobId: jobId, status: "VERIFIED" as const, metadata: access.value, databaseRole: role, databaseNetwork,
    connectorHostname: "db.smartaihub.app", checks, ready: false as const, runtimeAcceptance: false as const,
    activationAuthorized: false as const, providerMutations: 0 as const, databaseMutations: 0 as const, containerStarts: 0 as const };
}
