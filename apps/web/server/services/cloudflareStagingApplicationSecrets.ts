import { createHash, X509Certificate } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { decrypt } from "./crypto";
import { nativeProvisionCredentialRef } from "./cloudflareNativeProvisionExecutor";
import { privateDatabaseInputKey } from "./cloudflarePrivateDatabaseExecutor";
import { privateDatabaseBindingSchema, privateDatabaseEffectiveLeaseExpiresAt } from "./cloudflarePrivateDatabaseBinding";
import { certificateDigest, privateDatabasePlanSchema } from "./cloudflarePrivateDatabaseContract";
import { privateDatabaseCheckpointSchema } from "./cloudflarePrivateDatabaseTransport";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest, applicationDatabaseRolePlanSchema } from "./cloudflareApplicationDatabaseRole";
import { cloudflareHttpApplicationSecretsSchema, httpApplicationVersionBindings, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { cloudflareOriginDescriptorDigest } from "./cloudflareOriginVersionBindings";
import { loadHttpRuntimeEnvironments } from "./cloudflareHttpRuntimePlan";

const nodeKeys = ["APP_ID", "OWNER_OPEN_ID", "JWT_SECRET", "API_KEY_HMAC_SECRET", "LLM_ENCRYPTION_KEY", "CONTROL_PLANE_API_KEY", "CONTROL_PLANE_URL",
  "INTERNAL_API_TOKEN", "SMARTSPEC_WEB_GATEWAY_TOKEN", "SMARTSPEC_MCP_TOKEN", "MCP_SERVER_TOKEN", "OAUTH_SERVER_URL", "PUBLIC_URL", "CORS_ALLOWED_ORIGINS"];
const pythonKeys = ["SECRET_KEY", "JWT_SECRET", "ENCRYPTION_MASTER_KEY", "SMARTSPEC_WEB_GATEWAY_TOKEN", "SMARTSPEC_MCP_TOKEN", "MCP_SERVER_TOKEN",
  "INTERNAL_API_TOKEN", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENROUTER_API_KEY", "OPENROUTER_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET_NAME", "CLOUDFLARE_R2_ENDPOINT", "CLOUDFLARE_R2_PUBLIC_URL", "CORS_ORIGINS", "SITE_URL"];
const pick = (source: Record<string, string | undefined>, keys: string[]) => Object.fromEntries(keys
  .filter(key => source[key]).map(key => [key, source[key]!])) as Record<string, string>;
const deny = (): never => { throw Error("STAGING_HTTP_RUNTIME_SECRET_RESOLUTION_DENIED"); };

/** Resolve an exact Staging DB role and application env allowlist server-side.
 * The only outputs containing plaintext are consumed by immutable encrypted
 * origin storage; routers receive the configuration reference only. */
export async function resolveStagingApplicationSecrets(input: {
  db: DrizzleDB;
  identity: { tenantId: string; projectId: string; provider: "cloudflare"; environment: "staging" };
  actorUserId: number;
  applicationHttp: HttpApplicationSettings;
  configurationRef: string;
  applicationDatabaseRole: { role: string; password: string; planDigest: string };
  applicationDatabaseRolePlan: unknown;
  nodeEnvironment?: Record<string, string | undefined>;
  pythonEnvironment?: Record<string, string | undefined>;
}) {
  const target = { ...input.identity, accountRef: input.applicationHttp.node.image.match(/^registry\.cloudflare\.com\/([a-f0-9]{32})\//)?.[1] };
  if (!target.accountRef || input.applicationHttp.traffic !== "staging-full-http-v1" ||
      !/^cf-origin:[a-f0-9]{64}$/.test(input.configurationRef) || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) deny();
  const receipt = input.applicationHttp;
  const nativeScope = { tenantId: input.identity.tenantId, projectId: input.identity.projectId, provider: "cloudflare" as const, environment: "staging" as const };
  const nativeResources = await input.db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
    .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_origin_versions"), eq(systemSettings.key, input.configurationRef))).limit(2);
  if (nativeResources.length !== 1 || nativeResources[0]!.updatedBy !== input.actorUserId || !nativeResources[0]!.isSensitive || !nativeResources[0]!.value) deny();
  let stored: any;
  try { stored = JSON.parse(decrypt(nativeResources[0]!.value)); } catch { return deny(); }
  const privateDatabase = stored?.descriptor?.nativeResources?.privateDatabase;
  if (stored?.descriptor?.tenantId !== input.identity.tenantId || stored?.descriptor?.projectId !== input.identity.projectId ||
      stored?.descriptor?.provider !== "cloudflare" || stored?.descriptor?.environment !== "staging" || stored?.revokedAt !== null ||
      stored?.descriptor?.accountRef !== target.accountRef || `cf-origin:${cloudflareOriginDescriptorDigest(stored.descriptor)}` !== input.configurationRef ||
      !privateDatabase) deny();
  const databaseBinding = privateDatabaseBindingSchema.parse(privateDatabase);
  const plan = privateDatabasePlanSchema.parse(databaseBinding.plan);
  const databaseLeaseExpiresAt = privateDatabaseEffectiveLeaseExpiresAt(databaseBinding);
  if (plan.databaseName !== "smartspec" || plan.namespace !== receipt.namespace || Date.parse(databaseLeaseExpiresAt) <= Date.now() ||
      !/^[a-f0-9]{64}$/.test(privateDatabase.planDigest) || !/^[a-f0-9]{64}$/.test(plan.caSha256)) deny();

  const [checkpointRow, certificateRow] = await Promise.all([
    input.db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
      .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_runs"), eq(systemSettings.key, privateDatabase.provisionJobId))).limit(2),
    input.db.select({ value: systemSettings.value, isSensitive: systemSettings.isSensitive, updatedBy: systemSettings.updatedBy })
      .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_private_database_inputs"),
        eq(systemSettings.key, privateDatabaseInputKey(nativeScope, privateDatabase.planDigest)))).limit(2),
  ]);
  if (checkpointRow.length !== 1 || certificateRow.length !== 1 || checkpointRow[0]!.updatedBy !== input.actorUserId ||
      certificateRow[0]!.updatedBy !== input.actorUserId || !checkpointRow[0]!.isSensitive || !certificateRow[0]!.isSensitive ||
      !checkpointRow[0]!.value || !certificateRow[0]!.value) deny();
  let checkpoint: ReturnType<typeof privateDatabaseCheckpointSchema.parse>, certificateInput: any;
  try {
    checkpoint = privateDatabaseCheckpointSchema.parse(JSON.parse(decrypt(checkpointRow[0]!.value)));
    certificateInput = JSON.parse(decrypt(certificateRow[0]!.value));
  } catch { return deny(); }
  if (checkpoint.planDigest !== privateDatabase.planDigest || !checkpoint.databaseRolePrepared ||
      checkpoint.pending || checkpoint.continuedByJobId || !checkpoint.caId || certificateInput.tenantId !== input.identity.tenantId ||
      certificateInput.projectId !== input.identity.projectId || certificateInput.actorUserId !== input.actorUserId ||
      certificateInput.provider !== "cloudflare" || certificateInput.environment !== "staging" ||
      certificateInput.planDigest !== privateDatabase.planDigest || typeof certificateInput.caCertificate !== "string") deny();
  try {
    const ca = new X509Certificate(certificateInput.caCertificate);
    if (!ca.ca || certificateDigest(ca.raw) !== plan.caSha256 || Date.parse(ca.validTo) < Date.parse(databaseLeaseExpiresAt) ||
        Date.parse(ca.validFrom) > Date.now()) deny();
  } catch { return deny(); }

  const rolePlan = applicationDatabaseRolePlanSchema.parse(input.applicationDatabaseRolePlan);
  const applicationRole = input.applicationDatabaseRole;
  const roleExpiresAt = Date.parse(rolePlan.expiresAt), now = Date.now();
  if (rolePlan.tenantId !== input.identity.tenantId || rolePlan.projectId !== input.identity.projectId ||
      rolePlan.databaseName !== plan.databaseName || roleExpiresAt <= now + 7 * 86_400_000 || roleExpiresAt > now + 30 * 86_400_000 ||
      roleExpiresAt > Date.parse(databaseLeaseExpiresAt) || roleExpiresAt > Date.parse(stored.descriptor.expiresAt) ||
      applicationDatabaseRoleName(input.identity) !== applicationRole.role || applicationDatabaseRolePlanDigest(rolePlan) !== applicationRole.planDigest ||
      !/^[a-f0-9]{64}$/.test(applicationRole.password)) deny();

  const existingEnvironments = input.nodeEnvironment && input.pythonEnvironment ? undefined : await loadHttpRuntimeEnvironments();
  const pythonEnvironment = input.pythonEnvironment ?? existingEnvironments!.pythonEnvironment;
  const nodeEnvironment = input.nodeEnvironment ?? existingEnvironments!.nodeEnvironment;
  const node = pick(nodeEnvironment, nodeKeys), python = pick(pythonEnvironment, pythonKeys);
  const required: Array<[string | undefined, number]> = [[node.JWT_SECRET, 32], [node.API_KEY_HMAC_SECRET, 32], [node.LLM_ENCRYPTION_KEY, 32],
    [node.CONTROL_PLANE_API_KEY, 24], [python.JWT_SECRET, 32], [python.SECRET_KEY, 32], [python.ENCRYPTION_MASTER_KEY, 32],
    [python.SMARTSPEC_WEB_GATEWAY_TOKEN, 24]];
  if (required.some(([value, minimum]) => !value || value.length < minimum) || node.JWT_SECRET !== python.JWT_SECRET ||
      /change.this.in.production|dev.secret|dev_jwt|dev_token/i.test([node.JWT_SECRET, node.LLM_ENCRYPTION_KEY, python.SECRET_KEY, python.ENCRYPTION_MASTER_KEY].join(" ")) ||
      python.STRIPE_SECRET_KEY?.startsWith("sk_test_")) deny();
  const host = "db-staging.smartaihub.app", role = applicationRole.role, password = applicationRole.password;
  const database = new URL(`postgresql://${host}:5432/${plan.databaseName}`);
  database.username = role; database.password = password;
  const common = { DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: certificateInput.caCertificate,
    DATABASE_CONNECTOR_HOSTNAME: host, CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT: "private-vpc-websocket-v1" };
  Object.assign(node, common, { DATABASE_URL: database.href, DB_POOL_SIZE: "2" });
  Object.assign(python, common, { DATABASE_URL: database.href.replace("postgresql:", "postgresql+asyncpg:"), DATABASE_POOL_SIZE: "2",
    DATABASE_MAX_OVERFLOW: "0", SMARTSPEC_USE_WEB_GATEWAY: "true", LOG_LEVEL: "INFO" });
  const secrets = cloudflareHttpApplicationSecretsSchema.parse({ node, python });
  httpApplicationVersionBindings(receipt, { ...target, configurationRef: input.configurationRef }, secrets);
  const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return { secrets, safeReceipt: { configurationRef: input.configurationRef, role, databaseName: plan.databaseName,
    databaseHost: host, tunnelId: plan.tunnelId, tls: "verify-full" as const, credentialFingerprint: fingerprint({ role, password }),
    rolePlanDigest: applicationRole.planDigest, roleExpiresAt: rolePlan.expiresAt,
    resolvedKeys: { node: Object.keys(node).length, python: Object.keys(python).length }, readOnlyRole: false as const,
    databaseIdentityVerified: false as const, networkConnectivityVerified: false as const, writeAcceptance: false as const } };
}
