import { X509Certificate } from "node:crypto";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest, type ApplicationDatabaseRolePlan } from "./cloudflareApplicationDatabaseRole";
import { cloudflareHttpApplicationSecretsSchema, httpApplicationVersionBindings, validateHttpApplicationSettings, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { HTTP_DATABASE_ORIGIN_CA } from "./cloudflareHttpDatabaseTrust";
import type { readHttpDatabaseNetwork } from "./cloudflareHttpDatabaseNetwork";

// Explicit application-purpose keys only. Never inherit the operator's shell,
// Cloudflare token, DB owner credential, SSH keys or loader/command settings.
const NODE_KEYS = ["APP_ID", "OWNER_OPEN_ID", "JWT_SECRET", "API_KEY_HMAC_SECRET", "LLM_ENCRYPTION_KEY", "CONTROL_PLANE_API_KEY", "CONTROL_PLANE_URL",
  "INTERNAL_API_TOKEN", "SMARTSPEC_WEB_GATEWAY_TOKEN", "SMARTSPEC_MCP_TOKEN", "MCP_SERVER_TOKEN", "OAUTH_SERVER_URL", "PUBLIC_URL", "CORS_ALLOWED_ORIGINS"];
const PYTHON_KEYS = ["SECRET_KEY", "JWT_SECRET", "ENCRYPTION_MASTER_KEY", "SMARTSPEC_WEB_GATEWAY_TOKEN", "SMARTSPEC_MCP_TOKEN", "MCP_SERVER_TOKEN",
  "INTERNAL_API_TOKEN", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENROUTER_API_KEY", "OPENROUTER_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET_NAME", "CLOUDFLARE_R2_ENDPOINT", "CLOUDFLARE_R2_PUBLIC_URL", "CORS_ORIGINS", "SITE_URL"];
const pick = (source: Record<string, string | undefined>, keys: string[]) => Object.fromEntries(keys.filter(key => source[key]).map(key => [key, source[key]!])) as Record<string, string>;
const deny = (): never => { throw Error("HTTP_RUNTIME_COMPOSITION_DENIED"); };

/** In-memory composition for a trusted, fenced canonical runtime executor.
 * Inputs are exact receipts + its encrypted role checkpoint, not an Admin form.
 * Return bindings contain secrets: persist through the existing encrypted
 * origin/configuration store and NEVER return this object from a router.
 * This function grants no authority and performs no provider/DB operations. */
export function composeHttpRuntime(input: {
  scope: { tenantId: string; projectId: string; accountRef: string; environment: "production" };
  configurationRef: string; settings: HttpApplicationSettings;
  network: Awaited<ReturnType<typeof readHttpDatabaseNetwork>>;
  rolePlan: ApplicationDatabaseRolePlan;
  roleSecret: { role: string; password: string; planDigest: string };
  nodeEnvironment: Record<string, string | undefined>; pythonEnvironment: Record<string, string | undefined>;
  canaryToken: string;
}) {
  const { scope, settings, network, rolePlan, roleSecret } = input;
  validateHttpApplicationSettings(settings, scope);
  const end = Date.parse(settings.expiresAt), now = Date.now();
  if (settings.traffic || settings.realtime || settings.maxStarts > 2 || settings.maxComputeSeconds > 1200 ||
      end - now > 600_000 || end - now < 60_000 || settings.hardLifetimeSeconds > 600 ||
      network.transport !== "private-vpc-websocket-v1" || !network.providerReadbackVerified || !network.m1Preserved ||
      network.hostname !== "db.smartaihub.app" || network.port !== 5433 || !/^[a-f0-9-]{36}$/.test(network.tunnelId) ||
      rolePlan.tenantId !== scope.tenantId || rolePlan.projectId !== scope.projectId || rolePlan.databaseName !== network.databaseName ||
      roleSecret.role !== applicationDatabaseRoleName(scope) || roleSecret.planDigest !== applicationDatabaseRolePlanDigest(rolePlan) ||
      !/^[a-f0-9]{64}$/.test(roleSecret.password) || Date.parse(rolePlan.expiresAt) < end || !/^[a-f0-9]{64}$/.test(input.canaryToken)) deny();
  const ca = new X509Certificate(HTTP_DATABASE_ORIGIN_CA);
  if (!ca.ca || Date.parse(ca.validTo) < end || Date.parse(ca.validFrom) > now) deny();
  const node = pick(input.nodeEnvironment, NODE_KEYS), python = pick(input.pythonEnvironment, PYTHON_KEYS);
  for (const [value, minimum] of [[node.JWT_SECRET, 32], [node.API_KEY_HMAC_SECRET, 32], [node.LLM_ENCRYPTION_KEY, 32],
    [node.CONTROL_PLANE_API_KEY, 24], [python.JWT_SECRET, 32], [python.SECRET_KEY, 32], [python.ENCRYPTION_MASTER_KEY, 32],
    [python.SMARTSPEC_WEB_GATEWAY_TOKEN, 24]] as const)
    if (!value || value.length < minimum || /change.this.in.production|dev.secret|dev_jwt|dev_token/i.test(value)) deny();
  if (python.STRIPE_SECRET_KEY?.startsWith("sk_test_")) deny();
  const common = { DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: HTTP_DATABASE_ORIGIN_CA,
    DATABASE_CONNECTOR_HOSTNAME: network.hostname, CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT: "private-vpc-websocket-v1" };
  const address = new URL(`postgresql://db.smartaihub.app:5433/${network.databaseName}`);
  address.username = roleSecret.role; address.password = roleSecret.password;
  Object.assign(node, common, { DATABASE_URL: address.href, DB_POOL_SIZE: "2" });
  Object.assign(python, common, { DATABASE_URL: address.href.replace("postgresql:", "postgresql+asyncpg:"),
    DATABASE_POOL_SIZE: "2", DATABASE_MAX_OVERFLOW: "0", SMARTSPEC_USE_WEB_GATEWAY: "true", LOG_LEVEL: "INFO" });
  const secrets = cloudflareHttpApplicationSecretsSchema.parse({ node, python });
  const policy = { transport: network.transport, configurationRef: input.configurationRef, namespace: settings.namespace,
    tunnelId: network.tunnelId, hostname: network.hostname, port: network.port, expiresAt: settings.expiresAt };
  const bindings = [...httpApplicationVersionBindings(settings, { ...scope, configurationRef: input.configurationRef }, secrets),
    { name: "CLOUDFLARE_ENVIRONMENT", type: "plain_text", text: "production" },
    { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "disabled" },
    { name: "CLOUDFLARE_APPLICATION_DATABASE_POLICY", type: "plain_text", text: JSON.stringify(policy) },
    { name: "CLOUDFLARE_APPLICATION_CANARY_TOKEN", type: "secret_text", text: input.canaryToken }];
  return { secrets, bindings, policy, vpcNetworks: [{ binding: "DATABASE_NETWORK", tunnel_id: network.tunnelId }],
    // Safe projection only; independent live acceptance remains mandatory.
    summary: { transport: network.transport, role: roleSecret.role, rolePlanDigest: roleSecret.planDigest, expiresAt: settings.expiresAt,
      nodeImage: settings.node.image, pythonImage: settings.python.image, maxStartsPerRuntime: settings.maxStarts,
      maxComputeSecondsPerRuntime: settings.maxComputeSeconds, trafficMutation: false, imagePublication: false,
      accessApplicationCreated: false, dnsMutation: false, runtimeAcceptance: false } };
}
