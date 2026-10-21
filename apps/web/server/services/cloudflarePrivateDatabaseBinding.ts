import { publicRunnerReleaseView } from "./cloudflarePublicReleases";
import { X509Certificate } from "node:crypto";
import { z } from "zod";
import { PRIVATE_DATABASE_CONTRACT, PRIVATE_DATABASE_JOB, certificateDigest, privateDatabaseJobSchema,
  privateDatabasePlanSchema, privateDatabasePlanDigest, privateDatabaseResourceDigest, privateDatabaseRole } from "./cloudflarePrivateDatabaseContract";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { privateDatabaseCheckpointSchema } from "./cloudflarePrivateDatabaseTransport";

const id = z.string().regex(/^[a-f0-9]{32}$|^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
export const privateDatabaseBindingSchema = z.object({
  provisionJobId: z.string().uuid(), plan: privateDatabasePlanSchema, planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  hyperdriveId: id, caId: id, accessApplicationId: id, accessPolicyId: id, serviceTokenId: id, dnsRecordId: id,
}).strict().refine(value => value.planDigest === privateDatabasePlanDigest(value.plan));
export type PrivateDatabaseBinding = z.infer<typeof privateDatabaseBindingSchema>;
const ids = ["hyperdriveId", "caId", "accessApplicationId", "accessPolicyId", "serviceTokenId", "dnsRecordId"] as const;
function denied(code: string): never { throw Object.assign(new Error(code), { diagnosticCode: code, class: "permanent" }); }

export function validatePrivateDatabaseBinding(value: PrivateDatabaseBinding, scope: { tenantId: string; projectId: string; expiresAt: string }, now = Date.now()) {
  const descriptor = privateDatabaseBindingSchema.parse(value);
  if (descriptor.plan.namespace !== nativeProvisionNamespace(scope.tenantId, scope.projectId)
    || Date.parse(descriptor.plan.configurationExpiresAt) <= now || Date.parse(descriptor.plan.configurationExpiresAt) < Date.parse(scope.expiresAt))
    denied("PRIVATE_DATABASE_BINDING_SCOPE_DENIED");
  return descriptor;
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
  descriptor: PrivateDatabaseBinding; accountRef: string; token: string; fetchImpl?: typeof fetch;
}) {
  const d = privateDatabaseBindingSchema.parse(input.descriptor), p = d.plan;
  if (!/^[a-f0-9]{32}$/.test(input.accountRef) || Date.parse(p.configurationExpiresAt) <= Date.now()) denied("PRIVATE_DATABASE_BINDING_SCOPE_DENIED");
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
  let caDigest: string | undefined;
  try { caDigest = certificateDigest(new X509Certificate(ca?.certificates).raw); } catch {}
  if (hyperdrive?.id !== d.hyperdriveId || hyperdrive.name !== marker || hyperdrive.origin?.host !== p.hostname
    || hyperdrive.origin?.database !== p.databaseName || hyperdrive.origin?.user !== privateDatabaseRole(p.namespace)
    || hyperdrive.origin?.access_client_id !== token?.client_id || !token?.client_id || hyperdrive.caching?.disabled !== true
    || hyperdrive.mtls?.sslmode !== "verify-full" || hyperdrive.mtls?.ca_certificate_id !== d.caId || hyperdrive.origin_connection_limit !== 5
    || ca?.id !== d.caId || ca.name !== marker || ca.ca !== true || caDigest !== p.caSha256
    || app?.id !== d.accessApplicationId || app.domain !== p.hostname || app.name !== marker || app.type !== "self_hosted"
    || token?.id !== d.serviceTokenId || token.name !== marker || !Number.isFinite(Date.parse(token.expires_at)) || Date.parse(token.expires_at) < Date.parse(p.configurationExpiresAt)
    || !Array.isArray(policies) || policies.length !== 1 || policies[0].id !== d.accessPolicyId || policies[0].name !== marker
    || policies[0].decision !== "non_identity" || JSON.stringify(policies[0].include) !== JSON.stringify([{ service_token: { token_id: d.serviceTokenId } }])
    || policies[0].exclude?.length || policies[0].require?.length
    || dns?.id !== d.dnsRecordId || dns.name !== p.hostname || dns.type !== "CNAME" || dns.proxied !== true || dns.content !== `${p.tunnelId}.cfargotunnel.com` || dns.comment !== marker
    || tunnel?.id !== p.tunnelId || tunnel.status !== "healthy" || tunnel.config_src !== "local" || tunnel.deleted_at
    || zone?.name !== "smartaihub.app" || zone.account?.id !== input.accountRef)
    denied("PRIVATE_DATABASE_PROVIDER_RESOURCE_DRIFT");
}
