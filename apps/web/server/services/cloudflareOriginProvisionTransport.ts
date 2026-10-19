import { randomBytes } from "node:crypto";
import { z } from "zod";
import { originProvisionGrantSchema, type OriginProvisionGrant } from "./cloudflareOriginProvisionContract";

const uuid = z.string().uuid();
export const originProvisionCheckpointSchema = z.object({
  planDigest: z.string(), pending: z.string().optional(),
  app: z.object({ id: uuid, aud: z.string().regex(/^[A-Za-z0-9_-]+$/) }).strict().optional(),
  serviceToken: z.object({ id: uuid, clientId: z.string().min(16), secret: z.string().min(16), expiresAt: z.string() }).strict().optional(),
  policyId: uuid.optional(), dnsRecordId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  token: z.string().min(32).optional(),
  configuration: z.object({ configurationRef: z.string(), configurationDigest: z.string() }).strict().optional(),
}).strict();
export type OriginProvisionCheckpoint = z.infer<typeof originProvisionCheckpointSchema>;

export class OriginProvisionError extends Error {
  readonly class = "permanent";
  constructor(readonly diagnosticCode: string) { super(diagnosticCode); }
}
function fail(code: string): never { throw new OriginProvisionError(code); }

/** Creates only four exact, dedicated resources. No update/delete/global endpoint. */
export async function provisionCloudflareOrigin(input: {
  grant: OriginProvisionGrant; token: string; checkpoint: OriginProvisionCheckpoint;
  saveCheckpoint: (checkpoint: OriginProvisionCheckpoint) => Promise<void>;
  assertAuthorized: () => Promise<void>;
  saveConfiguration: (input: { appId: string; audience: string; token: string; clientId: string; secret: string }) => Promise<{ configurationRef: string; configurationDigest: string }>;
  fetchImpl?: typeof fetch;
}) {
  const grant = originProvisionGrantSchema.parse(input.grant);
  const plan = grant.plan;
  const state = originProvisionCheckpointSchema.parse(input.checkpoint);
  if (state.planDigest !== grant.planDigest) fail("ORIGIN_PROVISION_CHECKPOINT_MISMATCH");
  // A write may have succeeded without a response/checkpoint. Never create twice.
  if (state.pending) fail("ORIGIN_PROVISION_AMBIGUOUS_WRITE_REVIEW_REQUIRED");
  const fetchImpl = input.fetchImpl ?? fetch;
  const account = `/accounts/${grant.accountRef}`;
  const marker = `SmartAIHub staging ${grant.planDigest.slice(0, 32)}`;
  async function request(path: string, body?: Record<string, unknown>, step?: string): Promise<any> {
    if (body) {
      await input.assertAuthorized();
      state.pending = step;
      await input.saveCheckpoint(state);
      // Recheck after durable intent and immediately before the provider write.
      await input.assertAuthorized();
    }
    let response: Response;
    let envelope: any;
    try {
      response = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
        method: body ? "POST" : "GET", headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
      });
      envelope = await response.json();
    } catch { return fail(body ? "ORIGIN_PROVISION_AMBIGUOUS_WRITE_REVIEW_REQUIRED" : "ORIGIN_PROVISION_READ_UNAVAILABLE"); }
    if (!response.ok || envelope.success !== true) {
      // Only a definite client rejection proves a POST did not take effect.
      if (body && response.status >= 400 && response.status < 500) {
        delete state.pending;
        await input.saveCheckpoint(state);
      }
      fail(`ORIGIN_PROVISION_HTTP_${response.status}`);
    }
    if (body) delete state.pending;
    return envelope;
  }
  function listed(envelope: any): any[] {
    if (!Array.isArray(envelope.result) || envelope.result.length >= 100 || (envelope.result_info?.total_pages ?? 1) > 1)
      return fail("ORIGIN_PROVISION_INVENTORY_INCOMPLETE");
    return envelope.result;
  }
  await input.assertAuthorized();
  if (!(Date.now() < Date.parse(plan.configurationExpiresAt) && Date.parse(plan.configurationExpiresAt) <= Date.now() + 30 * 86400_000)) fail("ORIGIN_PROVISION_EXPIRY_INVALID");
  const zone = (await request(`/zones/${plan.zoneId}`)).result;
  const tunnel = (await request(`${account}/cfd_tunnel/${plan.tunnelId}`)).result;
  const organization = (await request(`${account}/access/organizations`)).result;
  if (zone?.name !== "smartaihub.app" || zone?.account?.id !== grant.accountRef || tunnel?.id !== plan.tunnelId ||
      tunnel?.config_src !== "local" || tunnel?.deleted_at || organization?.auth_domain !== `${plan.teamName}.cloudflareaccess.com`)
    fail("ORIGIN_PROVISION_PROVIDER_SCOPE_DENIED");
  if (!state.app) {
    const apps = listed(await request(`${account}/access/apps?per_page=100`));
    if (apps.some(a => a.domain === plan.hostname || a.name === marker)) fail("ORIGIN_PROVISION_EXISTING_APP_REVIEW_REQUIRED");
    const app = (await request(`${account}/access/apps`, { name: marker, domain: plan.hostname, type: "self_hosted",
      session_duration: "1h", auto_redirect_to_identity: false, app_launcher_visible: false }, "access-app.create")).result;
    state.app = originProvisionCheckpointSchema.shape.app.unwrap().parse({ id: app?.id, aud: app?.aud });
    await input.saveCheckpoint(state);
  }
  const app = (await request(`${account}/access/apps/${state.app.id}`)).result;
  if (app?.id !== state.app.id || app?.domain !== plan.hostname || app?.name !== marker || app?.aud !== state.app.aud || app?.type !== "self_hosted")
    fail("ORIGIN_PROVISION_APP_BINDING_DENIED");
  if (!state.serviceToken) {
    if (listed(await request(`${account}/access/service_tokens?per_page=100`)).some(t => t.name === marker))
      fail("ORIGIN_PROVISION_EXISTING_TOKEN_REVIEW_REQUIRED");
    const token = (await request(`${account}/access/service_tokens`, { name: marker, duration: "720h" }, "service-token.create")).result;
    state.serviceToken = originProvisionCheckpointSchema.shape.serviceToken.unwrap().parse({ id: token?.id, clientId: token?.client_id,
      secret: token?.client_secret, expiresAt: token?.expires_at });
    // The write-once secret goes immediately to encrypted storage, never output/events.
    await input.saveCheckpoint(state);
  }
  const serviceToken = (await request(`${account}/access/service_tokens/${state.serviceToken.id}`)).result;
  if (serviceToken?.id !== state.serviceToken.id || serviceToken?.name !== marker ||
      Date.parse(state.serviceToken.expiresAt) < Date.parse(plan.configurationExpiresAt)) fail("ORIGIN_PROVISION_TOKEN_BINDING_DENIED");
  if (!state.policyId) {
    if (listed(await request(`${account}/access/apps/${state.app.id}/policies?per_page=100`)).length)
      fail("ORIGIN_PROVISION_EXISTING_POLICY_REVIEW_REQUIRED");
    const policy = (await request(`${account}/access/apps/${state.app.id}/policies`, {
      name: marker, decision: "non_identity", precedence: 1, include: [{ service_token: { token_id: state.serviceToken.id } }], exclude: [], require: [],
    }, "access-policy.create")).result;
    state.policyId = uuid.parse(policy?.id);
    await input.saveCheckpoint(state);
  }
  const policies = listed(await request(`${account}/access/apps/${state.app.id}/policies?per_page=100`));
  const policy = policies[0];
  if (policies.length !== 1 || policy?.id !== state.policyId || policy?.decision !== "non_identity" || policy?.name !== marker ||
      JSON.stringify(policy?.include) !== JSON.stringify([{ service_token: { token_id: state.serviceToken.id } }]) ||
      policy?.exclude?.length || policy?.require?.length) fail("ORIGIN_PROVISION_SERVICE_AUTH_DENIED");
  if (!state.token) { state.token = randomBytes(48).toString("base64url"); await input.saveCheckpoint(state); }
  if (!state.configuration) {
    await input.assertAuthorized();
    state.configuration = await input.saveConfiguration({ appId: state.app.id, audience: state.app.aud, token: state.token,
      clientId: state.serviceToken.clientId, secret: state.serviceToken.secret });
    await input.saveCheckpoint(state);
  }
  if (!state.dnsRecordId) {
    const records = listed(await request(`/zones/${plan.zoneId}/dns_records?name=${plan.hostname}&per_page=100`));
    if (records.length) fail("ORIGIN_PROVISION_EXISTING_DNS_REVIEW_REQUIRED");
    const record = (await request(`/zones/${plan.zoneId}/dns_records`, { type: "CNAME", name: plan.hostname,
      content: `${plan.tunnelId}.cfargotunnel.com`, proxied: true, ttl: 1, comment: marker }, "dns-record.create")).result;
    state.dnsRecordId = z.string().regex(/^[a-f0-9]{32}$/).parse(record?.id);
    await input.saveCheckpoint(state);
  }
  const record = (await request(`/zones/${plan.zoneId}/dns_records/${state.dnsRecordId}`)).result;
  if (record?.id !== state.dnsRecordId || record?.name !== plan.hostname || record?.type !== "CNAME" || record?.proxied !== true ||
      record?.content !== `${plan.tunnelId}.cfargotunnel.com` || record?.comment !== marker) fail("ORIGIN_PROVISION_DNS_BINDING_DENIED");
  await input.assertAuthorized();
  return { ...state.configuration, accessApplicationId: state.app.id, accessAudience: state.app.aud,
    serviceTokenId: state.serviceToken.id, accessPolicyId: state.policyId, dnsRecordId: state.dnsRecordId,
    hostname: plan.hostname, tunnelId: plan.tunnelId, providerConfigurationVerified: true,
    originRuntimeVerified: false, workerDeployed: false };
}
