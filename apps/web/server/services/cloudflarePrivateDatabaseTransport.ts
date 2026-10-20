import { X509Certificate } from "node:crypto";
import { z } from "zod";
import { certificateDigest, privateDatabaseResourceDigest, privateDatabaseGrantSchema, privateDatabaseRole, type PrivateDatabaseGrant } from "./cloudflarePrivateDatabaseContract";

const id = z.string().regex(/^[a-f0-9]{32}$|^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
export const privateDatabaseCheckpointSchema = z.object({
  planDigest: z.string().regex(/^[a-f0-9]{64}$/), pending: z.string().optional(),
  resumedFromJobId: z.string().uuid().optional(), continuedByJobId: z.string().uuid().optional(),
  publicCatalog: z.object({ viewName: z.string().regex(/^sah_cf_releases_[a-f0-9]{12}$/), sourceProvisionJobId: z.string().uuid(),
    definitionSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  databasePassword: z.string().min(32).optional(), databaseRolePrepared: z.literal(true).optional(),
  caId: id.optional(), appId: id.optional(), policyId: id.optional(), dnsRecordId: id.optional(), hyperdriveId: id.optional(),
  serviceToken: z.object({ id, clientId: z.string().min(16), secret: z.string().min(16), expiresAt: z.string().datetime({ offset: true }) }).strict().optional(),
}).strict();
export type PrivateDatabaseCheckpoint = z.infer<typeof privateDatabaseCheckpointSchema>;
export class PrivateDatabaseError extends Error {
  readonly class: "permanent" | "unknown" | "retryable";
  constructor(readonly diagnosticCode: string) {
    super(diagnosticCode);
    this.class = diagnosticCode === "PRIVATE_DATABASE_DNS_NOT_READY" ? "retryable" : diagnosticCode.includes("AMBIGUOUS") ? "unknown" : "permanent";
  }
}
function fail(code: string): never { throw new PrivateDatabaseError(code); }

/** Dedicated Access/Tunnel/CA/Hyperdrive metadata only; no paid plan, IAM, consumer or activation changes. */
export async function provisionCloudflarePrivateDatabase(input: {
  grant: PrivateDatabaseGrant; token: string; caCertificate: string; checkpoint: PrivateDatabaseCheckpoint;
  assertAuthorized(): Promise<void>; saveCheckpoint(state: PrivateDatabaseCheckpoint): Promise<void>;
  fetchImpl?: typeof fetch; readOnly?: boolean;
}) {
  const grant = privateDatabaseGrantSchema.parse(input.grant), plan = grant.plan;
  const state = privateDatabaseCheckpointSchema.parse(input.checkpoint);
  if (state.planDigest !== grant.planDigest || !state.databaseRolePrepared || !state.databasePassword) fail("PRIVATE_DATABASE_CHECKPOINT_DENIED");
  if (plan.publicRunnerCatalogSourceJobId && (!input.readOnly || state.publicCatalog?.sourceProvisionJobId !== plan.publicRunnerCatalogSourceJobId)) fail("PRIVATE_DATABASE_PUBLIC_CATALOG_CHECKPOINT_DENIED");
  if (state.pending) fail("PRIVATE_DATABASE_AMBIGUOUS_WRITE_REVIEW_REQUIRED");
  if (state.continuedByJobId) fail("PRIVATE_DATABASE_CHECKPOINT_CONTINUED");
  let certificate: X509Certificate;
  try { certificate = new X509Certificate(input.caCertificate); } catch { return fail("PRIVATE_DATABASE_CA_INVALID"); }
  if (!certificate.ca || certificateDigest(certificate.raw) !== plan.caSha256
    || Date.parse(certificate.validTo) < Date.parse(plan.configurationExpiresAt)
    || Date.parse(certificate.validFrom) > Date.now()) fail("PRIVATE_DATABASE_CA_INVALID");
  const account = `/accounts/${grant.accountRef}`, marker = `${plan.namespace}-database-${privateDatabaseResourceDigest(plan).slice(0, 12)}`;
  const fetchImpl = input.fetchImpl ?? fetch;
  async function request(path: string, body?: Record<string, unknown>, step?: string): Promise<any> {
    await input.assertAuthorized();
    if (body) {
      if (input.readOnly) fail("PRIVATE_DATABASE_RETRY_WRITE_DENIED");
      state.pending = step; await input.saveCheckpoint(state); await input.assertAuthorized();
    }
    let r: Response, b: any;
    try {
      r = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
        method: body ? "POST" : "GET", headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
      }); b = await r.json();
    } catch { return fail(body ? "PRIVATE_DATABASE_AMBIGUOUS_WRITE_REVIEW_REQUIRED" : "PRIVATE_DATABASE_READ_UNAVAILABLE"); }
    if (!r.ok || b.success !== true) {
      if (body && r.status >= 400 && r.status < 500) { delete state.pending; await input.saveCheckpoint(state); }
      if (step === "hyperdrive.create" && r.status === 400 && Array.isArray(b.errors) && b.errors.some((e: any) => e.code === 2008))
        fail("PRIVATE_DATABASE_DNS_NOT_READY");
      fail(`PRIVATE_DATABASE_HTTP_${r.status}`);
    }
    if (body) delete state.pending;
    return b;
  }
  function list(b: any): any[] {
    if (!Array.isArray(b.result) || b.result.length >= 100 || (b.result_info?.total_pages ?? 1) > 1) fail("PRIVATE_DATABASE_INVENTORY_INCOMPLETE");
    return b.result;
  }
  if (Date.parse(plan.configurationExpiresAt) <= Date.now()) fail("PRIVATE_DATABASE_EXPIRED");
  const zone = (await request(`/zones/${plan.zoneId}`)).result;
  const tunnel = (await request(`${account}/cfd_tunnel/${plan.tunnelId}`)).result;
  if (zone?.name !== "smartaihub.app" || zone.account?.id !== grant.accountRef || tunnel?.id !== plan.tunnelId
    || tunnel.config_src !== "local" || tunnel.deleted_at || tunnel.status !== "healthy") fail("PRIVATE_DATABASE_PROVIDER_SCOPE_DENIED");
  if (!state.caId) {
    if (list(await request(`${account}/mtls_certificates?per_page=100`)).some(c => c.name === marker)) fail("PRIVATE_DATABASE_EXISTING_CA_REVIEW_REQUIRED");
    state.caId = id.parse((await request(`${account}/mtls_certificates`, { name: marker, ca: true, certificates: input.caCertificate }, "ca.create")).result?.id);
    await input.saveCheckpoint(state);
  }
  const ca = (await request(`${account}/mtls_certificates/${state.caId}`)).result;
  let actualCaDigest: string | undefined;
  try { actualCaDigest = certificateDigest(new X509Certificate(ca?.certificates).raw); } catch {}
  if (ca?.id !== state.caId || ca.name !== marker || ca.ca !== true || actualCaDigest !== plan.caSha256) fail("PRIVATE_DATABASE_CA_READBACK_DENIED");
  if (!state.appId) {
    if (list(await request(`${account}/access/apps?per_page=100`)).some(a => a.domain === plan.hostname || a.name === marker)) fail("PRIVATE_DATABASE_EXISTING_APP_REVIEW_REQUIRED");
    state.appId = id.parse((await request(`${account}/access/apps`, { name: marker, domain: plan.hostname, type: "self_hosted", app_launcher_visible: false,
      auto_redirect_to_identity: false, session_duration: "0s", allowed_idps: [] }, "access-app.create")).result?.id);
    await input.saveCheckpoint(state);
  }
  const app = (await request(`${account}/access/apps/${state.appId}`)).result;
  if (app?.id !== state.appId || app.name !== marker || app.domain !== plan.hostname || app.type !== "self_hosted") fail("PRIVATE_DATABASE_ACCESS_APP_DENIED");
  if (!state.serviceToken) {
    if (list(await request(`${account}/access/service_tokens?per_page=100`)).some(t => t.name === marker)) fail("PRIVATE_DATABASE_EXISTING_TOKEN_REVIEW_REQUIRED");
    const token = (await request(`${account}/access/service_tokens`, { name: marker, duration: "720h" }, "service-token.create")).result;
    state.serviceToken = privateDatabaseCheckpointSchema.shape.serviceToken.unwrap().parse({ id: token?.id, clientId: token?.client_id,
      secret: token?.client_secret, expiresAt: token?.expires_at }); await input.saveCheckpoint(state);
  }
  const token = (await request(`${account}/access/service_tokens/${state.serviceToken.id}`)).result;
  if (token?.id !== state.serviceToken.id || token.name !== marker || Date.parse(state.serviceToken.expiresAt) < Date.parse(plan.configurationExpiresAt)) fail("PRIVATE_DATABASE_SERVICE_TOKEN_DENIED");
  if (!state.policyId) {
    if (list(await request(`${account}/access/apps/${state.appId}/policies?per_page=100`)).length) fail("PRIVATE_DATABASE_EXISTING_POLICY_REVIEW_REQUIRED");
    state.policyId = id.parse((await request(`${account}/access/apps/${state.appId}/policies`, { name: marker, decision: "non_identity", precedence: 1,
      include: [{ service_token: { token_id: state.serviceToken.id } }], exclude: [], require: [] }, "access-policy.create")).result?.id); await input.saveCheckpoint(state);
  }
  const policies = list(await request(`${account}/access/apps/${state.appId}/policies?per_page=100`));
  if (policies.length !== 1 || policies[0].id !== state.policyId || policies[0].decision !== "non_identity" || policies[0].name !== marker
    || JSON.stringify(policies[0].include) !== JSON.stringify([{ service_token: { token_id: state.serviceToken.id } }])
    || policies[0].exclude?.length || policies[0].require?.length) fail("PRIVATE_DATABASE_SERVICE_AUTH_DENIED");
  if (!state.dnsRecordId) {
    if (list(await request(`/zones/${plan.zoneId}/dns_records?name=${plan.hostname}&per_page=100`)).length) fail("PRIVATE_DATABASE_EXISTING_DNS_REVIEW_REQUIRED");
    state.dnsRecordId = id.parse((await request(`/zones/${plan.zoneId}/dns_records`, { type: "CNAME", name: plan.hostname,
      content: `${plan.tunnelId}.cfargotunnel.com`, proxied: true, ttl: 1, comment: marker }, "dns.create")).result?.id); await input.saveCheckpoint(state);
  }
  const dns = (await request(`/zones/${plan.zoneId}/dns_records/${state.dnsRecordId}`)).result;
  if (dns?.id !== state.dnsRecordId || dns.name !== plan.hostname || dns.type !== "CNAME" || dns.proxied !== true
    || dns.content !== `${plan.tunnelId}.cfargotunnel.com` || dns.comment !== marker) fail("PRIVATE_DATABASE_DNS_DENIED");
  if (!state.hyperdriveId) {
    if (list(await request(`${account}/hyperdrive/configs?per_page=100`)).some(c => c.name === marker)) fail("PRIVATE_DATABASE_EXISTING_HYPERDRIVE_REVIEW_REQUIRED");
    state.hyperdriveId = id.parse((await request(`${account}/hyperdrive/configs`, { name: marker,
      origin: { host: plan.hostname, scheme: "postgres", database: plan.databaseName, user: privateDatabaseRole(plan.namespace),
        password: state.databasePassword, access_client_id: state.serviceToken.clientId, access_client_secret: state.serviceToken.secret },
      caching: { disabled: true }, mtls: { ca_certificate_id: state.caId, sslmode: "verify-full" }, origin_connection_limit: plan.connectionLimit,
    }, "hyperdrive.create")).result?.id); await input.saveCheckpoint(state);
  }
  const hyperdrive = (await request(`${account}/hyperdrive/configs/${state.hyperdriveId}`)).result;
  if (hyperdrive?.id !== state.hyperdriveId || hyperdrive.name !== marker || hyperdrive.origin?.host !== plan.hostname
    || hyperdrive.origin?.database !== plan.databaseName || hyperdrive.origin?.user !== privateDatabaseRole(plan.namespace)
    || hyperdrive.origin?.access_client_id !== state.serviceToken.clientId || hyperdrive.caching?.disabled !== true
    || hyperdrive.mtls?.sslmode !== "verify-full" || hyperdrive.mtls?.ca_certificate_id !== state.caId
    || hyperdrive.origin_connection_limit !== plan.connectionLimit) fail("PRIVATE_DATABASE_HYPERDRIVE_DENIED");
  await input.assertAuthorized();
  return { accountRef: grant.accountRef, namespace: plan.namespace, planDigest: grant.planDigest, hyperdriveId: state.hyperdriveId,
    caId: state.caId, accessApplicationId: state.appId, accessPolicyId: state.policyId, serviceTokenId: state.serviceToken.id,
    dnsRecordId: state.dnsRecordId, hostname: plan.hostname, tunnelId: plan.tunnelId, sslmode: "verify-full", cachingDisabled: true,
    databaseAccess: plan.publicRunnerCatalogSourceJobId ? "read_only_public_runner_catalog" : "read_only_connection_probe",
    ...(state.publicCatalog ? { publicCatalog: state.publicCatalog } : {}), providerConfigurationVerified: true, workerBound: false, activation: "disabled" };
}
