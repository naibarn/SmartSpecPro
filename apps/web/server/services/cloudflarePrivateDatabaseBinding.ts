import { publicRunnerReleaseView } from "./cloudflarePublicReleases";
import { X509Certificate } from "node:crypto";
import { z } from "zod";
import { PRIVATE_DATABASE_CONTRACT, PRIVATE_DATABASE_JOB, certificateDigest, privateDatabaseJobSchema,
  PRIVATE_DATABASE_RENEWAL_CONTRACT, PRIVATE_DATABASE_RENEWAL_JOB, privateDatabaseRenewalJobSchema, privateDatabaseRenewalReceiptSchema,
  privateDatabasePlanSchema, privateDatabasePlanDigest, privateDatabaseRenewalPlanDigest, privateDatabaseResourceDigest, privateDatabaseRole,
  privateDatabaseResourceIdSchema, privateDatabaseResourceIdsSchema } from "./cloudflarePrivateDatabaseContract";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { privateDatabaseCheckpointSchema } from "./cloudflarePrivateDatabaseTransport";

export const privateDatabaseBindingSchema = z.object({
  provisionJobId: z.string().uuid(), plan: privateDatabasePlanSchema, planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  hyperdriveId: privateDatabaseResourceIdSchema, caId: privateDatabaseResourceIdSchema,
  accessApplicationId: privateDatabaseResourceIdSchema, accessPolicyId: privateDatabaseResourceIdSchema,
  serviceTokenId: privateDatabaseResourceIdSchema, dnsRecordId: privateDatabaseResourceIdSchema,
  leaseRenewal: z.object({ jobId: z.string().uuid(), leaseExpiresAt: z.string().datetime({ offset: true }), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sourceConfigurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/), sourceConfigurationDigest: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict().refine(value => value.sourceConfigurationRef === `cf-origin:${value.sourceConfigurationDigest}`).optional(),
}).strict().refine(value => value.planDigest === privateDatabasePlanDigest(value.plan));
export type PrivateDatabaseBinding = z.infer<typeof privateDatabaseBindingSchema>;
export function privateDatabaseEffectiveLeaseExpiresAt(descriptor: Pick<PrivateDatabaseBinding, "plan" | "leaseRenewal">): string {
  return descriptor.leaseRenewal?.leaseExpiresAt ?? descriptor.plan.configurationExpiresAt;
}
const ids = ["hyperdriveId", "caId", "accessApplicationId", "accessPolicyId", "serviceTokenId", "dnsRecordId"] as const;
function denied(code: string, diagnosticDetail?: string): never {
  throw Object.assign(new Error(code), { diagnosticCode: code, class: "permanent", ...(diagnosticDetail ? { diagnosticDetail } : {}) });
}

export function validatePrivateDatabaseBinding(value: PrivateDatabaseBinding, scope: { tenantId: string; projectId: string; expiresAt: string }, now = Date.now()) {
  const descriptor = privateDatabaseBindingSchema.parse(value);
  const leaseExpiresAt = privateDatabaseEffectiveLeaseExpiresAt(descriptor);
  if (descriptor.plan.namespace !== nativeProvisionNamespace(scope.tenantId, scope.projectId)
    // A renewal job has its own immutable operation-plan digest. It must not be
    // compared with the source database provisioning-plan digest above; the
    // exact relationship is verified against the canonical renewal receipt.
    || (descriptor.leaseRenewal && (!Number.isFinite(Date.parse(leaseExpiresAt)) || Date.parse(leaseExpiresAt) <= now))
    || Date.parse(leaseExpiresAt) < Date.parse(scope.expiresAt)
    || (!descriptor.leaseRenewal && Date.parse(leaseExpiresAt) <= now))
    denied("PRIVATE_DATABASE_BINDING_SCOPE_DENIED");
  return descriptor;
}

export function assertPrivateDatabaseRenewalReceipt(value: PrivateDatabaseBinding, receipt: {
  id: string; tenantId: string; requestedByUserId: number | null; jobType: string; contractVersion: string;
  status: string; operatorReviewRequired: boolean; inputJson: unknown; outputJson: unknown;
}, scope: { tenantId: string; projectId: string; actorUserId: number }, checkpoint?: { jobId: string; actorUserId: number; state: unknown }) {
  const descriptor = privateDatabaseBindingSchema.parse(value), renewal = descriptor.leaseRenewal;
  const input = privateDatabaseRenewalJobSchema.safeParse(receipt.inputJson);
  const rawOutput = receipt.outputJson as Record<string, any> | null;
  const rawResourceIds = rawOutput?.resourceIds as Record<string, unknown> | undefined;
  const redactedTokenFields = rawOutput?.serviceTokenRefreshed === "[REDACTED]"
    && rawOutput?.serviceTokenExpiresAt === "[REDACTED]" && rawResourceIds?.serviceTokenId === "[REDACTED]";
  const savedCheckpoint = checkpoint ? z.object({
    status: z.literal("succeeded"), jobId: z.string().uuid(), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/), configurationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sourceProvisionJobId: z.string().uuid(), sourcePlanDigest: z.string().regex(/^[a-f0-9]{64}$/),
    resourceIds: privateDatabaseResourceIdsSchema, leaseExpiresAt: z.string().datetime({ offset: true }),
    serviceTokenRefreshed: z.boolean(), serviceTokenExpiresAt: z.string().datetime({ offset: true }),
    providerResourcesVerified: z.literal(true), databaseRoleReadbackVerified: z.literal(true),
  }).strict().safeParse(checkpoint.state) : null;
  const checkpointVerified = Boolean(renewal && checkpoint && savedCheckpoint?.success
    && checkpoint.jobId === renewal.jobId && savedCheckpoint.data.jobId === renewal.jobId
    && checkpoint.actorUserId === scope.actorUserId && savedCheckpoint.data.planDigest === renewal.planDigest
    && savedCheckpoint.data.configurationRef === renewal.sourceConfigurationRef
    && savedCheckpoint.data.configurationDigest === renewal.sourceConfigurationDigest
    && savedCheckpoint.data.sourceProvisionJobId === descriptor.provisionJobId
    && savedCheckpoint.data.sourcePlanDigest === descriptor.planDigest
    && savedCheckpoint.data.leaseExpiresAt === renewal.leaseExpiresAt
    && Object.entries(savedCheckpoint.data.resourceIds).every(([key, id]) => (descriptor as any)[key] === id));
  const verifiedCheckpoint = checkpointVerified && savedCheckpoint?.success ? savedCheckpoint.data : null;
  const output = privateDatabaseRenewalReceiptSchema.safeParse(redactedTokenFields && checkpointVerified
    ? { ...rawOutput, serviceTokenRefreshed: verifiedCheckpoint!.serviceTokenRefreshed,
      serviceTokenExpiresAt: verifiedCheckpoint!.serviceTokenExpiresAt,
      resourceIds: { ...rawResourceIds, serviceTokenId: verifiedCheckpoint!.resourceIds.serviceTokenId } }
    : receipt.outputJson);
  if (!renewal || !receipt || receipt.id !== renewal.jobId || receipt.tenantId !== scope.tenantId
    || receipt.requestedByUserId !== scope.actorUserId || receipt.jobType !== PRIVATE_DATABASE_RENEWAL_JOB
    || receipt.contractVersion !== PRIVATE_DATABASE_RENEWAL_CONTRACT || receipt.status !== "succeeded" || receipt.operatorReviewRequired
    || !input.success || input.data.planDigest !== renewal.planDigest || input.data.projectId !== scope.projectId
    || input.data.configurationRef !== renewal.sourceConfigurationRef || privateDatabaseRenewalPlanDigest(input.data.plan) !== renewal.planDigest
    || input.data.plan.configurationDigest !== renewal.sourceConfigurationDigest || input.data.plan.sourceProvisionJobId !== descriptor.provisionJobId
    || input.data.plan.sourcePlanDigest !== descriptor.planDigest || input.data.plan.leaseExpiresAt !== renewal.leaseExpiresAt
    || Object.entries(input.data.plan.resources).some(([key, id]) => (descriptor as any)[key] !== id)
    || !output.success || output.data.planDigest !== renewal.planDigest || output.data.configurationRef !== renewal.sourceConfigurationRef
    || output.data.configurationDigest !== renewal.sourceConfigurationDigest || output.data.sourceProvisionJobId !== descriptor.provisionJobId
    || output.data.sourcePlanDigest !== descriptor.planDigest || output.data.leaseExpiresAt !== renewal.leaseExpiresAt
    || output.data.serviceTokenRefreshed !== input.data.plan.refreshServiceTokenExpiry
    || Object.entries(output.data.resourceIds).some(([key, id]) => (descriptor as any)[key] !== id))
    denied("PRIVATE_DATABASE_RENEWAL_RECEIPT_DENIED");
}

export function assertPrivateDatabaseProvisionReceipt(value: PrivateDatabaseBinding, receipt: {
  id: string; tenantId: string; requestedByUserId: number | null; jobType: string; contractVersion: string;
  status: string; operatorReviewRequired: boolean; inputJson: unknown; outputJson: unknown;
} | undefined, scope: { tenantId: string; projectId: string; accountRef: string; actorUserId: number },
checkpoint?: { jobId: string; actorUserId: number; state: unknown }) {
  const descriptor = privateDatabaseBindingSchema.parse(value), input = privateDatabaseJobSchema.safeParse(receipt?.inputJson);
  const output = receipt?.outputJson as Record<string, unknown> | null;
  // Canonical output redaction intentionally hides keys containing "token".
  // Keep that policy intact and corroborate this resource ID using only the
  // same successful job's server-decrypted, actor-owned step checkpoint.
  const state = privateDatabaseCheckpointSchema.safeParse(checkpoint?.state);
  const redactedIdVerified = output?.serviceTokenId === "[REDACTED]" && checkpoint?.jobId === descriptor.provisionJobId
    && checkpoint.actorUserId === scope.actorUserId && state.success && !state.data.pending && !state.data.continuedByJobId
    && state.data.planDigest === descriptor.planDigest && state.data.hyperdriveId === descriptor.hyperdriveId
    && state.data.caId === descriptor.caId && state.data.appId === descriptor.accessApplicationId
    && state.data.policyId === descriptor.accessPolicyId && state.data.dnsRecordId === descriptor.dnsRecordId
    && state.data.serviceToken?.id === descriptor.serviceTokenId;
  const publicCatalog = output?.publicCatalog as Record<string, unknown> | undefined;
  const catalogVerified = !descriptor.plan.publicRunnerCatalogSourceJobId
    ? !publicCatalog
    : state.success && checkpoint?.jobId === descriptor.provisionJobId && checkpoint.actorUserId === scope.actorUserId &&
      state.data.planDigest === descriptor.planDigest && !state.data.pending && !state.data.continuedByJobId &&
      state.data.publicCatalog?.viewName === publicRunnerReleaseView(descriptor.plan.namespace) &&
      state.data.publicCatalog.sourceProvisionJobId === descriptor.plan.publicRunnerCatalogSourceJobId &&
      publicCatalog?.viewName === state.data.publicCatalog.viewName &&
      publicCatalog.sourceProvisionJobId === state.data.publicCatalog.sourceProvisionJobId &&
      publicCatalog.definitionSha256 === state.data.publicCatalog.definitionSha256;
  if (!receipt || receipt.id !== descriptor.provisionJobId || receipt.tenantId !== scope.tenantId || receipt.requestedByUserId !== scope.actorUserId
    || receipt.jobType !== PRIVATE_DATABASE_JOB || receipt.contractVersion !== PRIVATE_DATABASE_CONTRACT || receipt.status !== "succeeded" || receipt.operatorReviewRequired
    || !input.success || input.data.projectId !== scope.projectId || input.data.planDigest !== descriptor.planDigest
    || !output || output.accountRef !== scope.accountRef || output.namespace !== descriptor.plan.namespace || output.planDigest !== descriptor.planDigest
    || output.hostname !== descriptor.plan.hostname || output.tunnelId !== descriptor.plan.tunnelId || output.sslmode !== "verify-full"
    || output.cachingDisabled !== true || output.providerConfigurationVerified !== true || output.activation !== "disabled"
    || !catalogVerified || output.databaseAccess !== (descriptor.plan.publicRunnerCatalogSourceJobId ? "read_only_public_runner_catalog" : "read_only_connection_probe")
    || ids.some(field => output[field] !== descriptor[field] && !(field === "serviceTokenId" && redactedIdVerified)))
    denied("PRIVATE_DATABASE_PROVISION_RECEIPT_DENIED");
}

/** Verify the dedicated provider resources, never just a matching annotation. */
export async function verifyPrivateDatabaseProviderResources(input: {
  descriptor: PrivateDatabaseBinding; accountRef: string; token: string; fetchImpl?: typeof fetch; effectiveLeaseExpiresAt?: string;
  allowServiceTokenExpiryRefresh?: boolean;
}) {
  const d = privateDatabaseBindingSchema.parse(input.descriptor), p = d.plan;
  const effectiveExpiry = input.effectiveLeaseExpiresAt ?? p.configurationExpiresAt;
  if (!/^[a-f0-9]{32}$/.test(input.accountRef) || !Number.isFinite(Date.parse(effectiveExpiry)) || Date.parse(effectiveExpiry) <= Date.now()
    || (!input.effectiveLeaseExpiresAt && Date.parse(p.configurationExpiresAt) <= Date.now())) denied("PRIVATE_DATABASE_BINDING_SCOPE_DENIED");
  const fetchImpl = input.fetchImpl ?? fetch, account = `/accounts/${input.accountRef}`;
  const marker = `${p.namespace}-database-${privateDatabaseResourceDigest(p).slice(0, 12)}`;
  async function get(path: string): Promise<any> {
    let r: Response, body: any;
    try {
      r = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, { headers: { authorization: `Bearer ${input.token}` },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const bytes = await r.arrayBuffer(); if (bytes.byteLength > 1024 * 1024) denied("PRIVATE_DATABASE_PROVIDER_RESPONSE_INVALID");
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return denied("PRIVATE_DATABASE_PROVIDER_READ_UNAVAILABLE"); }
    if (!r.ok || body.success !== true) denied(`PRIVATE_DATABASE_PROVIDER_HTTP_${r.status}`);
    return body.result;
  }
  const [hyperdrive, ca, app, policies, token, dns, tunnel, zone] = await Promise.all([
    get(`${account}/hyperdrive/configs/${d.hyperdriveId}`), get(`${account}/mtls_certificates/${d.caId}`),
    get(`${account}/access/apps/${d.accessApplicationId}`), get(`${account}/access/apps/${d.accessApplicationId}/policies?per_page=100`),
    get(`${account}/access/service_tokens/${d.serviceTokenId}`), get(`/zones/${p.zoneId}/dns_records/${d.dnsRecordId}`),
    get(`${account}/cfd_tunnel/${p.tunnelId}`), get(`/zones/${p.zoneId}`),
  ]);
  let caDigest: string | undefined, caValidTo: number | undefined;
  try {
    const certificate = new X509Certificate(ca?.certificates);
    caDigest = certificateDigest(certificate.raw);
    caValidTo = Date.parse(certificate.validTo);
  } catch {}
  // Report only a reviewed field path and a categorical result. Never include
  // provider values (which can contain hostnames, IDs, or credential material).
  const drift = (field: string): never => denied("PRIVATE_DATABASE_PROVIDER_RESOURCE_DRIFT", `${field} (mismatch)`);
  if (hyperdrive?.id !== d.hyperdriveId) drift("hyperdrive.id");
  if (hyperdrive.name !== marker) drift("hyperdrive.name");
  if (hyperdrive.origin?.host !== p.hostname) drift("hyperdrive.origin.host");
  if (hyperdrive.origin?.database !== p.databaseName) drift("hyperdrive.origin.database");
  if (hyperdrive.origin?.user !== privateDatabaseRole(p.namespace)) drift("hyperdrive.origin.user");
  if (hyperdrive.origin?.access_client_id !== token?.client_id || !token?.client_id) drift("hyperdrive.origin.access_client_id");
  if (hyperdrive.caching?.disabled !== true) drift("hyperdrive.caching.disabled");
  if (hyperdrive.mtls?.sslmode !== "verify-full") drift("hyperdrive.mtls.sslmode");
  if (hyperdrive.mtls?.ca_certificate_id !== d.caId) drift("hyperdrive.mtls.ca_certificate_id");
  if (hyperdrive.origin_connection_limit !== 5) drift("hyperdrive.origin_connection_limit");
  if (ca?.id !== d.caId) drift("ca.id");
  if (ca.name !== marker) drift("ca.name");
  if (ca.ca !== true) drift("ca.ca");
  if (caDigest !== p.caSha256) drift("ca.certificate");
  if (!Number.isFinite(caValidTo) || caValidTo! <= Date.parse(effectiveExpiry)) drift("ca.validity");
  if (app?.id !== d.accessApplicationId) drift("accessApplication.id");
  if (app.domain !== p.hostname) drift("accessApplication.domain");
  if (app.name !== marker) drift("accessApplication.name");
  if (app.type !== "self_hosted") drift("accessApplication.type");
  if (token?.id !== d.serviceTokenId) drift("serviceToken.id");
  if (token.name !== marker) drift("serviceToken.name");
  const serviceTokenExpiresAt = typeof token.expires_at === "string" && Number.isFinite(Date.parse(token.expires_at))
    ? new Date(token.expires_at).toISOString() : null;
  if (!serviceTokenExpiresAt || (!input.allowServiceTokenExpiryRefresh && Date.parse(serviceTokenExpiresAt) < Date.parse(effectiveExpiry)))
    drift("serviceToken.expires_at");
  if (!Array.isArray(policies) || policies.length !== 1) drift("accessPolicy.count");
  if (policies[0].id !== d.accessPolicyId) drift("accessPolicy.id");
  if (policies[0].name !== marker) drift("accessPolicy.name");
  if (policies[0].decision !== "non_identity") drift("accessPolicy.decision");
  if (JSON.stringify(policies[0].include) !== JSON.stringify([{ service_token: { token_id: d.serviceTokenId } }])) drift("accessPolicy.include");
  if (policies[0].exclude?.length) drift("accessPolicy.exclude");
  if (policies[0].require?.length) drift("accessPolicy.require");
  if (dns?.id !== d.dnsRecordId) drift("dnsRecord.id");
  if (dns.name !== p.hostname) drift("dnsRecord.name");
  if (dns.type !== "CNAME") drift("dnsRecord.type");
  if (dns.proxied !== true) drift("dnsRecord.proxied");
  if (dns.content !== `${p.tunnelId}.cfargotunnel.com`) drift("dnsRecord.content");
  if (dns.comment !== marker) drift("dnsRecord.comment");
  if (tunnel?.id !== p.tunnelId) drift("tunnel.id");
  if (tunnel.status !== "healthy") drift("tunnel.status");
  if (tunnel.config_src !== "local") drift("tunnel.config_src");
  if (tunnel.deleted_at) drift("tunnel.deleted_at");
  if (zone?.name !== "smartaihub.app") drift("zone.name");
  if (zone.account?.id !== input.accountRef) drift("zone.account.id");
  return { serviceTokenExpiresAt, serviceTokenExpiryRefreshRequired: Date.parse(serviceTokenExpiresAt) < Date.parse(effectiveExpiry) };
}

/** Refreshes the exact existing Staging Access token without rotating its secret or changing its ID/policy. */
export async function refreshPrivateDatabaseServiceToken(input: {
  accountRef: string; serviceTokenId: string; expectedClientId: string; expectedName: string;
  effectiveLeaseExpiresAt: string; token: string; fetchImpl?: typeof fetch;
}): Promise<{ expiresAt: string }> {
  if (!/^[a-f0-9]{32}$/.test(input.accountRef) || !/^[a-f0-9]{32}$|^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.serviceTokenId)
    || !input.expectedClientId || !input.expectedName || !Number.isFinite(Date.parse(input.effectiveLeaseExpiresAt)))
    denied("PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_SCOPE_DENIED");
  let response: Response, body: any;
  try {
    response = await (input.fetchImpl ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${input.accountRef}/access/service_tokens/${input.serviceTokenId}/refresh`, {
      method: "POST", headers: { authorization: `Bearer ${input.token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 256 * 1024) denied("PRIVATE_DATABASE_PROVIDER_RESPONSE_INVALID");
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if ((error as { diagnosticCode?: unknown })?.diagnosticCode) throw error;
    denied("PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_OUTCOME_UNKNOWN");
  }
  if (!response!.ok || body?.success !== true) denied(`PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_HTTP_${response!.status}`);
  const result = body.result;
  if (result?.id !== input.serviceTokenId || result?.client_id !== input.expectedClientId || result?.name !== input.expectedName
    || result?.enabled !== true || typeof result?.expires_at !== "string" || !Number.isFinite(Date.parse(result.expires_at)))
    denied("PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_READBACK_DENIED");
  const expiresAt = new Date(result.expires_at).toISOString();
  if (Date.parse(expiresAt) < Date.parse(input.effectiveLeaseExpiresAt)) denied("PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_INSUFFICIENT");
  return { expiresAt };
}
