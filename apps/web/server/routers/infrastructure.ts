import { getProductionIngressPreflight, getProductionIngressRollbackPreflight, queueProductionIngress } from "../services/cloudflareProductionIngressAdmission";
import { getProductionWorkerCanaryPreflight, queueProductionWorkerCanary } from "../services/cloudflareProductionWorkerDeploymentAdmission";
import { readLatestCloudflareProductionWorkerCanaryJob } from "../services/cloudflareProductionWorkerCanaryJobReadModel";
import { PRODUCTION_INGRESS_CONTRACT } from "../services/cloudflareProductionIngressContract";
import { CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT, CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB } from "../services/cloudflareProductionDeploymentContract";
import { ingressBrowserReceiptSchema, recordIngressBrowserAcceptance } from "../services/cloudflareProductionIngressAcceptance";
import { getVerifiedCloudflarePublicOrigin } from "../_core/cloudflareOriginMiddleware";
import { getCloudflareMigrationMission } from "../services/cloudflareMigrationLifecycle";
import { changeCloudflareMigrationMandate, enrollCloudflareMigrationMandate, getCloudflareMigrationMandatePlan,
  readCloudflareMigrationMandate, readCloudflareMigrationMandateHistory } from "../services/cloudflareProductionMigrationMandate";
import { cloudflareMigrationMandateEnvelopeSchema } from "../services/cloudflareMigrationMandateContract";
import { readHttpImagePublication } from "../services/cloudflareHttpPublishedPair";
import { getHttpImagePairPreflight, queueHttpImagePair } from "../services/cloudflareHttpImageAdmission";
import { getProductionTenantIsolationPreflight, prepareProductionTenantIsolation } from "../services/cloudflareProductionTenantIsolation";
import { getHttpRuntimeReadiness } from "../services/cloudflareHttpRuntimeReadiness";
import { getHttpRuntimePlan } from "../services/cloudflareHttpRuntimePlan";
import { prepareHttpRuntime, readHttpRuntimeOperation, readPendingHttpRuntimeIntent } from "../services/cloudflareHttpRuntimeAdmission";
import { getHttpCandidatePreparationPreflight, prepareHttpCandidate, readHttpCandidatePreparation } from "../services/cloudflareHttpCandidatePreparation";
/**
 * Infrastructure Settings tRPC Router
 *
 * Admin-only routes for Cloudflare runtime configuration and task processing mode
 * (Cloudflare canonical runtime), queue status dashboard, and
 * monitoring/observability settings.
 */

import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, rateLimitedAdminProcedure, protectedProcedure } from "../_core/trpc";
import { fetchWithResilience } from "../_core/fetchWithResilience";
import { getDb } from "../db";
import { canonicalProjects, systemSettings, tenants, users, workerJobs, workerJobOutbox, workerJobDispatches } from "../../drizzle/schema";
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import { getFeatureFlag, setFeatureFlag } from "../services/featureFlags";
import {
  getAllQueueMetrics,
  getDeadLetterCount,
  getFailedTaskEvents,
} from "../services/cloudTasksMetrics";
import { encrypt, decrypt } from "../services/crypto";
import { getAppRuntimeConfig, refreshAppRuntimeConfigCache } from "../services/appRuntimeConfig";
import {
  getMcpRuntimeConfigForAdmin,
  MCP_RUNTIME_CATEGORY,
  refreshMcpRuntimeConfigCache,
} from "../services/mcpRuntimeConfig";
import { MCP_OAUTH_DEFAULT_SCOPES } from "../services/mcpOAuthScopes";
import { generateMcpOAuthSigningKeyMaterial } from "../services/mcpOAuthKeyService";
import {
  SCALE_TIERS,
  SCALE_TIER_IDS,
  applyScaleTier as applyTierConfig,
  detectCurrentTier,
  getDeployMode,
  setDeployMode,
} from "../services/scaleTier";
import type { ScaleTierId, DeployMode, ApplyStepResult } from "../services/scaleTier";
import { cloudflareRuntimeStatus } from "../services/cloudflareRuntimeTarget";
import { refreshSearchResultCacheProvider } from "../services/cloudflareSearchResultCache";
import { clearVectorProviderConfigCache } from "../services/vectorProvider";
import {
  bindPlatformCloudflareCredentialProfile,
  getCloudflareCredentialCenterState,
  getCloudflareDeploymentCredentialState,
  probeCloudflareDeploymentCredential,
  probeCloudflarePermissionCatalog,
  probeCloudflareCredential,
  removeCloudflareCredentialProfile,
  revokeCloudflareDeploymentCredential,
  saveCloudflareDeploymentCredential,
  saveCloudflareCredentialProfile,
} from "../services/cloudflareCredentialCenter";
import { auditLogger } from "../services/auditLogger";
import { cloudflareOriginSettingsSchema, cloudflareOriginSecretsSchema, saveCloudflareOriginConfiguration,
  getCloudflareOriginConfiguration, revokeCloudflareOriginConfiguration, activateCloudflareStagingQueueProfile,
  saveCloudflareStagingConfigurationAfterDatabaseRenewal } from "../services/cloudflareOriginConfiguration";
import { getCloudflarePrivateDatabaseRenewalPreflight } from "../services/cloudflarePrivateDatabaseRenewal";
import { geoMapSettingsSchema, getGeoMapAdminConfiguration, saveGeoMapConfiguration } from "../services/geoMapSettings";
import { getGeoMapProviderHealth, testGoogleMapsConnection } from "../services/geoMapProviderRuntime";
import { getInternalRuntimeEvidence } from "../services/internalRuntimeEvidence";
import { getSpec224DatabaseDiagnostics } from "../services/spec224DatabaseDiagnostics";
import { composeProjectWikiHostedRoutePreflight } from "../services/projectWikiHostedRoutePreflight";
import { createProviderDeploymentTarget, deploymentCredentialRef, disableProviderDeploymentTarget, listProviderDeploymentTargets, resolveProviderDeploymentTarget, updateProviderDeploymentTarget } from "../services/providerDeploymentTargetAuthority";
import {
  PROJECT_WIKI_CANDIDATE,
  createDrizzleProjectWikiCandidateRepository,
  projectWikiCandidateStorage,
  projectWikiStagingEnvelopeSchema,
  readProjectWikiReleaseCandidate,
  registerProjectWikiReleaseCandidate,
  type ProjectWikiApprovalEvidence,
} from "../services/projectWikiReleaseCandidate";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { projectWikiProvisioningIntentMatchesTenant, projectWikiStagingProvisioningRequestSchema } from "../services/projectWikiStagingProvisioning";
import { resolveCloudflareStagingArtifact, resolveLatestPublishedCloudflareStagingArtifact } from "../services/cloudflareStagingArtifactAuthority";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { createJobControlPlane } from "../services/jobControlPlane";
import { CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT, CLOUDFLARE_STAGING_DEPLOYMENT_JOB, CLOUDFLARE_STAGING_RETRY_POLICY, CLOUDFLARE_STAGING_TARGET_ID } from "../services/cloudflareStagingDeploymentExecutor";
import { probeCloudflareStagingRuntimeReadiness } from "../services/cloudflareStagingRuntimeReadiness";
import { probeCloudflareProductionRuntimeReadiness } from "../services/cloudflareProductionRuntimeReadiness";
import { probeCloudflareProductionProviderInventory } from "../services/cloudflareProductionProviderInventory";
import { resolveCloudflareProductionDeploymentTarget } from "../services/cloudflareProductionDeploymentContract";
import { CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT, CLOUDFLARE_PRODUCTION_QUEUE_JOB } from "../services/cloudflareProductionQueueProvision";
import { CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT, CLOUDFLARE_PRODUCTION_DATABASE_JOB,
  createProductionDatabaseGrant, newProductionDatabaseJobId, readCloudflareProductionDatabaseGrant, revokeCloudflareProductionDatabaseGrant,
  renewCloudflareProductionDatabaseGrant, saveCloudflareProductionDatabaseGrant } from "../services/cloudflareProductionDatabaseExecutor";
import { productionDatabaseResourcePlanDigest, productionDatabaseResourcePlanSchema } from "../services/cloudflareProductionDatabaseProvision";
import { cloudflareApprovalFailureCode, cloudflareApprovalResponseObject } from "../services/cloudflareApprovalFailure";
import { PRIVATE_DATABASE_RENEWAL_CONTRACT, PRIVATE_DATABASE_RENEWAL_JOB, privateDatabaseRenewalPlanSchema, privateDatabaseRenewalPlanDigest } from "../services/cloudflarePrivateDatabaseContract";
import { cloudflareStagingActivationBlocker, cloudflareStagingOriginConfigurationBlocker } from "../services/cloudflareStagingActivationReadiness";
import { getPersistedCloudflareWorkerDeploymentEvidence } from "../services/cloudflareRuntimeEvidence";
import { findVerifiedStagingRollbackBaseline } from "../services/cloudflareStagingRollbackBaseline";
import { admitM3ParityOperation, getM3ParityOperation, getM3ParityPreflight } from "../services/cloudflareM3ParityAdmission";
import { cloudflareOriginIdentitySchema as originIdentitySchema, cloudflareOriginReferenceSchema as originReferenceSchema,
  cloudflareStagingActivationInputSchema } from "../../shared/cloudflareOriginIdentity";

const exactAdminProcedure = adminProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

async function isProductionTenantOwner(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, tenantId: string, userId: number) {
  const [owner] = await db.select({ ownerId: tenants.ownerId, active: tenants.isActive, role: users.role, disabled: users.isDisabled })
    .from(tenants).innerJoin(users, eq(users.id, userId)).where(eq(tenants.id, tenantId)).limit(1);
  return Boolean(owner && owner.ownerId === userId && owner.active && owner.role === "admin" && !owner.disabled);
}

function logCloudflareProductionDatabaseAdmission(input: {
  stage: string;
  outcome: "started" | "completed" | "failed" | "unknown";
  requestId: string;
  tenantId: string;
  projectId: string;
  jobId?: string;
  errorCode?: string;
}) {
  // These records intentionally contain identifiers and stage codes only.
  // Never log the Cloudflare token, grant payload, or generated DB password.
  const record = { ...input, at: new Date().toISOString() };
  const serialized = JSON.stringify(record);
  if (input.outcome === "failed" || input.outcome === "unknown") {
    console.error("[CloudflareProductionDatabaseAdmission]", serialized);
  } else {
    console.info("[CloudflareProductionDatabaseAdmission]", serialized);
  }
}

function cloudflareAdmissionErrorCode(error: unknown): string {
  if (error instanceof TRPCError) {
    const message = error.message.trim();
    return /^[A-Z0-9_:-]{1,120}$/.test(message) ? message : error.code;
  }
  if (error && typeof error === "object" && "diagnosticCode" in error) {
    const diagnosticCode = (error as { diagnosticCode?: unknown }).diagnosticCode;
    if (typeof diagnosticCode === "string" && /^[A-Z0-9_:-]{1,120}$/.test(diagnosticCode)) return diagnosticCode;
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_:-]{1,120}$/.test(code)) return code;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && /^[A-Z0-9_:-]{1,120}$/.test(message.trim())) return message.trim();
  }
  return "INTERNAL_SERVER_ERROR";
}

async function fetchProjectWikiApprovalRequest(requestId: string, userToken: string): Promise<ProjectWikiApprovalEvidence | null> {
  const runtime = await getAppRuntimeConfig();
  const response = await fetchWithResilience(`${runtime.pythonBackendUrl}/api/v1/approvals/requests/${requestId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
    timeoutMs: 15000,
    retryPolicy: "transient",
    label: "projectWikiStagingApproval.read",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new TRPCError({ code: response.status === 403 ? "FORBIDDEN" : "BAD_GATEWAY", message: "Unable to verify staging approval" });
  const row = await response.json() as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    requestType: String(row.request_type ?? ""),
    status: String(row.status ?? ""),
    tenantId: typeof row.tenant_id === "string" ? row.tenant_id : null,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    payload: row.payload,
    currentApprovals: Number(row.current_approvals),
    requiredApprovers: Number(row.required_approvers),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
  };
}

async function createProjectWikiApprovalRequest(input: {
  envelope: z.infer<typeof projectWikiStagingEnvelopeSchema>;
  userToken: string;
}): Promise<{ id: string; expiresAt: string | null }> {
  const runtime = await getAppRuntimeConfig();
  const remainingMs = Date.parse(input.envelope.execution.expiresAt) - Date.now();
  const timeoutMinutes = Math.ceil(remainingMs / 60_000);
  if (timeoutMinutes < 5 || timeoutMinutes > 10080) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Approval expiry must be 5 minutes to 7 days from now" });
  }
  const response = await fetchWithResilience(`${runtime.pythonBackendUrl}/api/v1/approvals/requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      request_type: "deployment",
      title: "Project Wiki staging release candidate",
      description: "Review the exact Project Wiki package, host target, database, recovery and verifier envelope before any staging mutation.",
      project_id: input.envelope.identity.projectId,
      payload: input.envelope,
      risk_level: "critical",
      required_approvers: 2,
      timeout_minutes: timeoutMinutes,
    }),
    timeoutMs: 15000,
    retryPolicy: "connect-only",
    label: "projectWikiStagingApproval.create",
  });
  if (!response.ok) throw new TRPCError({ code: response.status === 403 ? "FORBIDDEN" : "BAD_GATEWAY", message: "Unable to create staging approval request" });
  const row = await response.json() as Record<string, unknown>;
  if (typeof row.id !== "string") throw new TRPCError({ code: "BAD_GATEWAY", message: "Approval service returned an invalid request" });
  return { id: row.id, expiresAt: typeof row.expires_at === "string" ? row.expires_at : null };
}

async function createProjectWikiProvisioningApprovalRequest(input: {
  request: z.infer<typeof projectWikiStagingProvisioningRequestSchema>;
  userToken: string;
}): Promise<{ id: string; expiresAt: string | null }> {
  const runtime = await getAppRuntimeConfig();
  const response = await fetchWithResilience(`${runtime.pythonBackendUrl}/api/v1/approvals/requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // The Control Plane persists a closed ApprovalType enum. Keep the
      // operation identity in the strictly validated payload and use CUSTOM.
      request_type: "CUSTOM",
      title: "Project Wiki isolated staging provisioning",
      description: "Authorize the exact staging target and dedicated PostgreSQL provisioning scope. Approval does not execute provisioning or deployment.",
      project_id: input.request.identity.projectId,
      payload: input.request,
      risk_level: "critical",
      required_approvers: 2,
      timeout_minutes: 1440,
    }),
    timeoutMs: 15000,
    retryPolicy: "connect-only",
    label: "projectWikiStagingProvisioningApproval.create",
  });
  if (!response.ok) throw new TRPCError({ code: response.status === 403 ? "FORBIDDEN" : "BAD_GATEWAY", message: "Unable to create staging provisioning approval request" });
  const row = await response.json() as Record<string, unknown>;
  if (typeof row.id !== "string") throw new TRPCError({ code: "BAD_GATEWAY", message: "Approval service returned an invalid request" });
  return { id: row.id, expiresAt: typeof row.expires_at === "string" ? row.expires_at : null };
}

// ============================================================
// Constants
// ============================================================

const CATEGORY = "infrastructure" as const;

const MONITORING_CONFIG_KEYS = [
  "sentry_dsn_node",
  "sentry_dsn_python",
  "analytics_provider",
  "posthog_api_key_node",
  "posthog_api_key_python",
  "posthog_host",
  "ga4_measurement_id",
  "ga4_api_secret",
  "firebase_api_key",
  "firebase_project_id",
  "log_level",
  "sentry_traces_sample_rate",
  "sentry_environment",
] as const;

const MONITORING_ENV_FALLBACK: Record<string, string> = {
  sentry_dsn_node: "SENTRY_DSN_NODE",
  sentry_dsn_python: "SENTRY_DSN",
  analytics_provider: "ANALYTICS_PROVIDER",
  posthog_api_key_node: "POSTHOG_API_KEY",
  posthog_api_key_python: "POSTHOG_API_KEY",
  posthog_host: "POSTHOG_HOST",
  ga4_measurement_id: "GA4_MEASUREMENT_ID",
  ga4_api_secret: "GA4_API_SECRET",
  firebase_api_key: "FIREBASE_API_KEY",
  firebase_project_id: "FIREBASE_PROJECT_ID",
  log_level: "LOG_LEVEL",
  sentry_traces_sample_rate: "SENTRY_TRACES_SAMPLE_RATE",
  sentry_environment: "ENVIRONMENT",
};

const MONITORING_SENSITIVE_KEYS = new Set([
  "sentry_dsn_node",
  "sentry_dsn_python",
  "posthog_api_key_node",
  "posthog_api_key_python",
  "ga4_api_secret",
  "firebase_api_key",
]);

const APP_RUNTIME_CONFIG_KEYS = [
  "python_backend_url",
  "smartspec_proxy_token",
  "smartspec_web_gateway_token",
  "smartspec_mcp_token",
  "smartspec_internal_url",
  "node_server_internal_url",
  "upload_post_api_base_url",
  "public_url",
  "app_public_url",
  "app_url",
  "s3_endpoint",
  "r2_public_url",
  "oauth_server_url",
  "forge_api_url",
  "forge_api_key",
  "llm_gateway_service_account_id",
] as const;

const APP_RUNTIME_ENV_FALLBACK: Record<string, string> = {
  python_backend_url: "PYTHON_BACKEND_URL",
  smartspec_proxy_token: "SMARTSPEC_PROXY_TOKEN",
  smartspec_web_gateway_token: "SMARTSPEC_WEB_GATEWAY_TOKEN",
  smartspec_mcp_token: "SMARTSPEC_MCP_TOKEN",
  smartspec_internal_url: "SMARTSPEC_INTERNAL_URL",
  node_server_internal_url: "NODE_SERVER_INTERNAL_URL",
  upload_post_api_base_url: "UPLOAD_POST_API_BASE_URL",
  public_url: "PUBLIC_URL",
  app_public_url: "APP_PUBLIC_URL",
  app_url: "APP_URL",
  s3_endpoint: "S3_ENDPOINT",
  r2_public_url: "R2_PUBLIC_URL",
  oauth_server_url: "OAUTH_SERVER_URL",
  forge_api_url: "FORGE_API_URL",
  forge_api_key: "FORGE_API_KEY",
  llm_gateway_service_account_id: "LLM_GATEWAY_SERVICE_ACCOUNT_ID",
};

const APP_RUNTIME_SENSITIVE_KEYS = new Set([
  "smartspec_proxy_token",
  "smartspec_web_gateway_token",
  "smartspec_mcp_token",
  "forge_api_key",
]);

const MCP_RUNTIME_UPDATE_KEYS = [
  "modern_protocol_enabled",
  "oauth_inbound_enabled",
  "oauth_protected_resource_enabled",
  "oauth_authorization_server_enabled",
  "oauth_dynamic_registration_enabled",
  "public_base_url",
  "oauth_issuer",
  "oauth_resource",
  "oauth_jwks_uri",
  "oauth_audience",
  "oauth_authorization_servers",
  "oauth_scopes_supported",
  "cors_allowed_origins",
  "session_allowed_origins",
  "session_ttl_seconds",
  "workspace_root",
  "workspace_write_enabled",
  "workspace_write_token",
  "max_read_bytes",
  "max_write_bytes",
  "extension_allowlist",
  "mcp_rpm",
] as const;

// ============================================================
// Helpers
// ============================================================

async function upsertSetting(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  key: string,
  value: string,
  userId?: number,
  sensitive = false,
  category: string = CATEGORY,
) {
  const storedValue = sensitive && value ? encrypt(value) : value;

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(and(eq(systemSettings.category, category), eq(systemSettings.key, key)))
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({ value: storedValue, isSensitive: sensitive, updatedBy: userId, updatedAt: new Date() })
      .where(eq(systemSettings.id, existing.id));
  } else {
    await db.insert(systemSettings).values({
      category,
      key,
      value: storedValue,
      isSensitive: sensitive,
      updatedBy: userId,
    });
  }
}

/** Read a setting value, decrypting if sensitive */
function readSettingValue(row: { value: string | null; isSensitive: boolean }): string {
  if (!row.value) return "";
  if (row.isSensitive) {
    try {
      return decrypt(row.value);
    } catch {
      return row.value;
    }
  }
  return row.value;
}

/** Mask a Sentry DSN (hide auth token: https://TOKEN@sentry.io/123) */
function maskDsn(dsn: string): string {
  if (!dsn) return "";
  try {
    const u = new URL(dsn);
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return dsn.replace(/\/\/[^@]+@/, "//***@");
  }
}

/** Mask a sensitive value for display (show first/last 4 chars) */
function maskApiKey(key: string): string {
  if (!key || key.length < 12) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

async function provisionMcpOAuthSigningKey(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId?: number,
): Promise<string> {
  const { privateJwk, kid } = await generateMcpOAuthSigningKeyMaterial();
  const privateValue = JSON.stringify(privateJwk);
  await upsertSetting(db, "oauth_private_jwk", privateValue, userId, true, MCP_RUNTIME_CATEGORY);
  await upsertSetting(db, "oauth_key_id", kid, userId, false, MCP_RUNTIME_CATEGORY);
  return kid;
}

// ============================================================
// Router
// ============================================================

const deploymentTenantIdSchema = z.string().trim().min(1).max(36);

type CloudflareStagingPreflight = {
  ready: boolean;
  reason: string | null;
  artifact: { artifactRef: string; sourceSha: string; buildDigest: string } | null;
  baseline: { deploymentId: string; artifactRef: string; sourceSha: string; buildDigest: string; configurationRef: string; configurationDigest: string } | null;
  configurationRef: string | null;
  configurationDigest: string | null;
  accountRef: string | null;
};

async function getCloudflareStagingPreflight(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, identity: { tenantId: string; projectId: string }): Promise<CloudflareStagingPreflight> {
  const unavailable = (reason: string): CloudflareStagingPreflight => ({ ready: false, reason, artifact: null, baseline: null, configurationRef: null, configurationDigest: null, accountRef: null });
  const rows = await listProviderDeploymentTargets(db, { ...identity, environment: "staging" });
  const enabledTargets = rows.filter(row => row.provider === "cloudflare" && row.enabled);
  if (enabledTargets.length > 1) return unavailable("STAGING_TARGET_AUTHORITY_CONFLICT");
  const target = enabledTargets[0];
  if (!target?.enabled || target.workerRef !== CLOUDFLARE_STAGING_TARGET_ID || target.containerApplicationRef) return unavailable("STAGING_TARGET_NOT_READY");
  if (target.deploymentTargetId !== CLOUDFLARE_STAGING_TARGET_ID || target.credentialRef !== deploymentCredentialRef({ ...identity, environment: "staging", provider: "cloudflare" })) return unavailable("STAGING_TARGET_AUTHORITY_CONFLICT");
  if (!target.accountRef || !/^([a-f0-9]{32})$/.test(target.accountRef)) return unavailable("STAGING_ACCOUNT_NOT_CONFIGURED");
  const configurationRef = target.runtimePolicy;
  const configurationDigest = configurationRef?.match(/^cf-origin:([a-f0-9]{64})$/)?.[1] ?? null;
  if (!configurationRef || !configurationDigest) return unavailable("STAGING_ORIGIN_CONFIGURATION_REQUIRED");
  const originConfiguration = await getCloudflareOriginConfiguration(db, { identity: { ...identity, environment: "staging", provider: "cloudflare" }, configurationRef })
    .catch(error => ({ blocker: cloudflareStagingOriginConfigurationBlocker(error) } as const));
  if ("blocker" in originConfiguration) return unavailable(originConfiguration.blocker);
  if (originConfiguration.status === "EXPIRED") return unavailable("STAGING_ORIGIN_CONFIGURATION_EXPIRED");
  if (originConfiguration.status === "REVOKED") return unavailable("STAGING_ORIGIN_CONFIGURATION_REVOKED");
  if (originConfiguration.status !== "STORED" || originConfiguration.configurationDigest !== configurationDigest) return unavailable("STAGING_ORIGIN_CONFIGURATION_INVALID");
  const activationBlocker = cloudflareStagingActivationBlocker({ ...originConfiguration.descriptor,
    workflowRuntimeTokenConfigured: originConfiguration.workflowRuntimeTokenConfigured,
    controlPlaneTokenConfigured: originConfiguration.controlPlaneTokenConfigured });
  if (activationBlocker) return unavailable(activationBlocker);
  const artifact = await resolveLatestPublishedCloudflareStagingArtifact();
  if (!artifact) return unavailable("PUBLISHED_CANONICAL_ARTIFACT_UNAVAILABLE");
  const jobs = await db.select({ input: workerJobs.inputJson, output: workerJobs.outputJson, createdAt: workerJobs.createdAt })
    .from(workerJobs).where(and(eq(workerJobs.tenantId, identity.tenantId), eq(workerJobs.jobType, CLOUDFLARE_STAGING_DEPLOYMENT_JOB), eq(workerJobs.status, "succeeded")))
    .orderBy(desc(workerJobs.createdAt)).limit(100);
  const baselineCandidates = jobs.map(row => ({ input: row.input ?? {}, output: row.output ?? {} })).filter(({ input, output }) =>
    input.projectId === identity.projectId && input.environment === "staging" && input.contractVersion === "cloudflare-staging-origin-v2" &&
    output.runtimeVerified === true && typeof output.deploymentId === "string" && typeof input.configurationRef === "string" &&
    typeof input.artifactRef === "string" && typeof input.sourceSha === "string" && typeof input.buildDigest === "string");
  if (baselineCandidates.length) {
    const evidence = await getPersistedCloudflareWorkerDeploymentEvidence({ db, callerTenantId: identity.tenantId,
      projectId: identity.projectId, environment: "staging" });
    const active = evidence.status === "OBSERVED" && evidence.value && typeof evidence.value === "object"
      ? evidence.value as { deploymentId?: unknown; versions?: unknown } : null;
    const versions = Array.isArray(active?.versions) ? active.versions as Array<{ versionId?: unknown; percentage?: unknown }> : [];
    const deploymentIsSingleVersion = versions.length === 1 && versions[0]?.percentage === 100 && typeof versions[0]?.versionId === "string";
    if (typeof active?.deploymentId === "string" && deploymentIsSingleVersion) {
      const baseline = await findVerifiedStagingRollbackBaseline({
        candidates: baselineCandidates, projectId: identity.projectId, activeDeploymentId: active.deploymentId,
        activeDeploymentIsSingleVersion: deploymentIsSingleVersion,
        isConfigurationUsable: async (candidateRef, candidateDigest) => {
          const stored = await getCloudflareOriginConfiguration(db, { identity: { ...identity, environment: "staging", provider: "cloudflare" }, configurationRef: candidateRef })
            .catch(() => null);
          return stored?.status === "STORED" && stored.configurationRef === candidateRef && stored.configurationDigest === candidateDigest;
        },
      });
      if (baseline) return { ready: true, reason: null,
        artifact: { artifactRef: artifact.artifactRef, sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest },
        baseline, configurationRef, configurationDigest, accountRef: target.accountRef };
    }
    return { ready: false, reason: "STAGING_ACTIVE_DEPLOYMENT_UNVERIFIED", artifact: null, baseline: null,
      configurationRef, configurationDigest, accountRef: target.accountRef };
  }
  // A first Staging deployment has no provider rollback deployment ID yet.
  // Return an explicit one-time bootstrap candidate; never invent a baseline.
  return { ready: false, reason: "STAGING_BOOTSTRAP_REQUIRED",
    artifact: { artifactRef: artifact.artifactRef, sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest },
    baseline: null, configurationRef, configurationDigest, accountRef: target.accountRef };
}

function stableOperationUuid(value: string) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const infrastructureRouter = router({
  listDeploymentTargetProjects: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return db.select({
        projectId: canonicalProjects.projectId,
        title: canonicalProjects.title,
        projectType: canonicalProjects.projectType,
      }).from(canonicalProjects).where(and(
        eq(canonicalProjects.tenantId, input.tenantId),
        eq(canonicalProjects.lifecycle, "ACTIVE"),
      )).orderBy(asc(canonicalProjects.title));
    }),

  getGeoMapConfiguration: exactAdminProcedure.query(async () => {
    const configuration = await getGeoMapAdminConfiguration();
    return { ...configuration, providerHealth: getGeoMapProviderHealth() };
  }),

  saveGeoMapConfiguration: rateLimitedAdminProcedure
    .input(z.object({
      settings: geoMapSettingsSchema,
      googleProjectId: z.string().trim().max(256).default(""),
      googleServerApiKey: z.string().trim().min(10).max(512).optional(),
      googleBrowserApiKey: z.string().trim().min(10).max(512).optional(),
      clearGoogleServerApiKey: z.boolean().default(false),
      clearGoogleBrowserApiKey: z.boolean().default(false),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await saveGeoMapConfiguration({ db, settings: input.settings, googleProjectId: input.googleProjectId,
        googleServerApiKey: input.googleServerApiKey, googleBrowserApiKey: input.googleBrowserApiKey,
        clearGoogleServerApiKey: input.clearGoogleServerApiKey, clearGoogleBrowserApiKey: input.clearGoogleBrowserApiKey,
        userId: ctx.user?.id });
      auditLogger.log({ eventType: "map_provider_configuration_changed", userId: ctx.user?.id ?? null,
        requestType: "admin_map_provider_configuration", requestPayload: {
          primaryProvider: input.settings.primaryProvider, fallbackProvider: input.settings.fallbackProvider,
          googleEnabled: input.settings.googleEnabled,
          enabledMapTypes: Object.entries(input.settings.googleMapTypes).filter(([, enabled]) => enabled).map(([type]) => type),
          serverKeyChanged: !!input.googleServerApiKey || input.clearGoogleServerApiKey,
          browserKeyChanged: !!input.googleBrowserApiKey || input.clearGoogleBrowserApiKey,
        }, statusCode: 200 });
      return { success: true };
    }),

  testGeoMapGoogleConnection: rateLimitedAdminProcedure.mutation(async ({ ctx }) => {
    const result = await testGoogleMapsConnection();
    auditLogger.log({ eventType: "map_provider_connection_tested", userId: ctx.user?.id ?? null,
      requestType: "admin_google_maps_connection_test", responsePayload: {
        credentials: result.credentials,
        mapTiles: result.mapTiles.map(({ mapType, status }) => ({ mapType, status })),
        checkedAt: result.checkedAt,
      }, statusCode: result.mapTiles.some(item => item.status === "FAIL") || result.credentials === "FAIL" ? 502 : 200 });
    return result;
  }),

  getCloudflareCredentialCenter: exactAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    return getCloudflareCredentialCenterState(db);
  }),

  saveCloudflareOriginConfiguration: exactAdminProcedure
    .input(originIdentitySchema.extend({ settings: cloudflareOriginSettingsSchema, secrets: cloudflareOriginSecretsSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { settings, secrets, ...identity } = input;
      const result = await saveCloudflareOriginConfiguration(db, { identity, settings, secrets, actorUserId: ctx.user!.id })
        .catch(() => { throw new TRPCError({ code: "BAD_REQUEST", message: "Origin configuration rejected; verify target scope and fields" }); });
      auditLogger.log({ eventType: "cloudflare_origin_configuration_saved", userId: ctx.user!.id,
        requestType: "cloudflare_origin_configuration_save", responsePayload: { ...identity,
          configurationRef: result.configurationRef, configurationDigest: result.configurationDigest, deploymentAuthorized: false }, statusCode: 201 });
      return result;
    }),

  getCloudflareOriginConfiguration: exactAdminProcedure.input(originReferenceSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const { configurationRef, ...identity } = input;
    return getCloudflareOriginConfiguration(db, { identity, configurationRef })
      .catch(() => { throw new TRPCError({ code: "NOT_FOUND", message: "Origin configuration unavailable in this scope" }); });
  }),

  revokeCloudflareOriginConfiguration: exactAdminProcedure.input(originReferenceSchema).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const { configurationRef, ...identity } = input;
    const result = await revokeCloudflareOriginConfiguration(db, { identity, configurationRef, actorUserId: ctx.user!.id })
      .catch(() => { throw new TRPCError({ code: "NOT_FOUND", message: "Origin configuration unavailable in this scope" }); });
    auditLogger.log({ eventType: "cloudflare_origin_configuration_revoked", userId: ctx.user!.id,
      requestType: "cloudflare_origin_configuration_revoke", responsePayload: { ...identity, configurationRef }, statusCode: 200 });
    return result;
  }),

  activateCloudflareStagingQueueProfile: exactAdminProcedure
    .input(cloudflareStagingActivationInputSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match staging target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [owner] = await db.select({ ownerId: tenants.ownerId, active: tenants.isActive, role: users.role, disabled: users.isDisabled })
        .from(tenants).innerJoin(users, eq(users.id, ctx.user!.id)).where(eq(tenants.id, tenantId)).limit(1);
      if (!owner || owner.ownerId !== ctx.user!.id || !owner.active || owner.role !== "admin" || owner.disabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "CLOUDFLARE_STAGING_ACTIVE_TENANT_OWNER_REQUIRED" });
      }
      const { configurationRef, workflowRuntimeToken, controlPlaneToken, ...identity } = input;
      let result: Awaited<ReturnType<typeof activateCloudflareStagingQueueProfile>>;
      try {
        result = await activateCloudflareStagingQueueProfile(db, { identity, configurationRef, actorUserId: ctx.user!.id,
          ...(workflowRuntimeToken ? { workflowRuntimeToken, controlPlaneToken } : {}) });
      } catch (error) {
        const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "STAGING_PROFILE_ACTIVATION_FAILED";
        throw new TRPCError({ code: code.endsWith("_REQUIRED") ? "PRECONDITION_FAILED" : "BAD_REQUEST", message: code });
      }
      auditLogger.log({ eventType: "cloudflare_staging_queue_profile_activated", userId: ctx.user!.id,
        requestType: "cloudflare_staging_queue_profile_activate", responsePayload: { ...identity,
          previousConfigurationRef: configurationRef, configurationRef: result.configurationRef,
          configurationDigest: result.configurationDigest, deploymentAuthorized: false }, statusCode: 200 });
      return result;
    }),

  listProviderDeploymentTargets: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return listProviderDeploymentTargets(db, input);
    }),

  getCloudflareStagingDeployPreflight: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("staging") }).strict())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return getCloudflareStagingPreflight(db, input);
    }),

  getCloudflareStagingPrivateDatabaseRenewalPreflight: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("staging"),
      configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/) }).strict())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match staging target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      try { return await getCloudflarePrivateDatabaseRenewalPreflight(db, { identity: { tenantId, projectId: input.projectId,
        provider: "cloudflare", environment: "staging" }, configurationRef: input.configurationRef, actorUserId: ctx.user.id }); }
      catch (error) { return { ready: false, reason: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : "PRIVATE_DATABASE_RENEWAL_PREFLIGHT_FAILED",
        failureStage: typeof (error as { preflightStage?: unknown })?.preflightStage === "string"
          ? (error as { preflightStage: string }).preflightStage : "PREFLIGHT_REQUEST",
        failureDetail: typeof (error as { preflightFailureDetail?: unknown })?.preflightFailureDetail === "string"
          ? (error as { preflightFailureDetail: string }).preflightFailureDetail : null,
        checkedAt: new Date().toISOString(),
        configurationRef: input.configurationRef, configurationDigest: input.configurationRef.slice("cf-origin:".length), accountRef: null,
        plan: null, planDigest: null, leaseExpiresAt: null, existingJob: null }; }
    }),

  queueCloudflareStagingPrivateDatabaseRenewal: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("staging"),
      configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/), planDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id || !ctx.userToken) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated staging Owner session required" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      let preflight;
      try { preflight = await getCloudflarePrivateDatabaseRenewalPreflight(db, { identity: { tenantId, projectId: input.projectId,
        provider: "cloudflare", environment: "staging" }, configurationRef: input.configurationRef, actorUserId: ctx.user.id }); }
      catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : "PRIVATE_DATABASE_RENEWAL_PREFLIGHT_UNAVAILABLE" }); }
      if (!preflight.ready || !preflight.plan || !preflight.planDigest) throw new TRPCError({ code: "PRECONDITION_FAILED", message: preflight.reason ?? "PRIVATE_DATABASE_RENEWAL_NOT_READY" });
      if (preflight.planDigest !== input.planDigest) throw new TRPCError({ code: "CONFLICT", message: "PRIVATE_DATABASE_RENEWAL_PLAN_CHANGED" });
      if (Date.parse(preflight.plan.authorizationExpiresAt) <= Date.now()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PRIVATE_DATABASE_RENEWAL_PLAN_EXPIRED" });
      const executorId = process.env.CLOUDFLARE_STAGING_EXECUTOR_ID?.trim();
      if (!executorId || !/^cf-staging-executor:[a-z0-9][a-z0-9._-]{2,119}$/.test(executorId)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "STAGING_EXECUTOR_NOT_CONFIGURED" });
      const runtime = await getAppRuntimeConfig();
      if (!runtime.pythonBackendUrl) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "APPROVAL_AUTHORITY_UNAVAILABLE" });
      const headers = { Authorization: `Bearer ${ctx.userToken}`, Accept: "application/json", "Content-Type": "application/json" };
      let approvalStage = "POLICY_LOOKUP";
      const post = async (path: string, body: Record<string, unknown>, stage: string) => {
        approvalStage = stage;
        const response = await fetch(`${runtime.pythonBackendUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
        const payload = await response.json().catch(() => ({})) as unknown;
        if (!response.ok) throw new TRPCError({ code: response.status === 403 ? "FORBIDDEN" : response.status === 422 ? "BAD_REQUEST" : "BAD_GATEWAY",
          message: cloudflareApprovalFailureCode(payload, response.status, stage) });
        return cloudflareApprovalResponseObject(payload);
      };
      const operationId = stableOperationUuid(`cloudflare-private-database-renewal:${preflight.planDigest}`);
      const grantExpiresAt = preflight.plan.authorizationExpiresAt;
      const policyExpiresAt = new Date(Date.parse(grantExpiresAt) + 3 * 60 * 60_000).toISOString();
      let policyId: string | null = null, grantRef: string | null = null, policyCreated = false, jobCreationStarted = false;
      try {
        const campaign = { contractVersion: PRIVATE_DATABASE_RENEWAL_CONTRACT, accountRef: preflight.accountRef,
          executorId, actorUserId: ctx.user.id, targetId: CLOUDFLARE_STAGING_TARGET_ID, environment: "staging",
          plan: preflight.plan, planDigest: preflight.planDigest, maxOperations: 1, expiresAt: policyExpiresAt };
        if (!campaign.accountRef) throw new Error("STAGING_ACCOUNT_NOT_CONFIGURED");
        const reusable = await post("/api/v1/approvals/cloudflare-staging-policies/lookup", { projectId: input.projectId, definition: campaign }, "POLICY_LOOKUP");
        policyId = typeof reusable.policyId === "string" ? reusable.policyId : null;
        if (!policyId) {
          const policy = await post("/api/v1/approvals/cloudflare-staging-policies", { projectId: input.projectId, definition: campaign }, "POLICY_CREATE");
          policyId = typeof policy.policyId === "string" ? policy.policyId : null; policyCreated = true;
        }
        if (!policyId) throw new Error("STAGING_POLICY_CREATE_FAILED");
        const grant = await post("/api/v1/approvals/cloudflare-staging-private-database-renewal-grants/policy", {
          idempotencyKey: `cf-staging-private-db-renewal:${preflight.planDigest}`, policyId, jobId: operationId,
          projectId: input.projectId, executorId, accountRef: campaign.accountRef, plan: preflight.plan, planDigest: preflight.planDigest,
          expiresAt: grantExpiresAt,
        }, "GRANT_CREATE");
        grantRef = typeof grant.id === "string" ? grant.id : null;
        if (!grantRef || grant.status !== "approved") throw new Error("STAGING_GRANT_NOT_APPROVED");
        approvalStage = "JOB_ADMISSION";
        jobCreationStarted = true;
        const job = await createControlPlaneJob({ context: { tenantId, actorType: "user", actorId: ctx.user.id,
          authorizationScope: "infrastructure.cloudflare_staging_private_database_renewal", correlationId: ctx.req.requestId ?? operationId,
          idempotencyKey: `cloudflare-staging-private-db-renewal:${preflight.planDigest}` },
          definition: { contractVersion: PRIVATE_DATABASE_RENEWAL_CONTRACT, jobType: PRIVATE_DATABASE_RENEWAL_JOB, executionClass: "long", priority: 50,
            input: { contractVersion: PRIVATE_DATABASE_RENEWAL_CONTRACT, grantRef, projectId: input.projectId,
              configurationRef: input.configurationRef, planDigest: preflight.planDigest, plan: preflight.plan },
            idempotencyKey: `cloudflare-staging-private-db-renewal:${preflight.planDigest}`,
            activeDedupeKey: `cloudflare-staging-private-db-renewal:${input.configurationRef}`,
            retryPolicy: CLOUDFLARE_STAGING_RETRY_POLICY,
            timeoutPolicy: { softTimeoutMs: 60_000, hardTimeoutMs: 10 * 60_000 } }, createOptions: { runtimeType: "node_job_worker" } });
        auditLogger.log({ eventType: "cloudflare_staging_private_database_renewal_queued", userId: ctx.user.id,
          requestType: "cloudflare_staging_private_database_renewal", responsePayload: { tenantId, projectId: input.projectId,
            jobId: job.jobId, grantRef, configurationRef: input.configurationRef, planDigest: preflight.planDigest }, statusCode: 202 });
        return { jobId: job.jobId, grantRef, policyId, status: "queued" as const, planDigest: preflight.planDigest,
          leaseExpiresAt: preflight.leaseExpiresAt };
      } catch (error) {
        if (!jobCreationStarted) {
          if (grantRef) await fetch(`${runtime.pythonBackendUrl}/api/v1/approvals/cloudflare-staging-grants/${encodeURIComponent(grantRef)}/revoke`,
            { method: "POST", headers, body: JSON.stringify({ reason: "Canonical private database renewal job creation did not start" }), signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
          if (policyCreated && policyId) await fetch(`${runtime.pythonBackendUrl}/api/v1/approvals/cloudflare-staging-policies/${encodeURIComponent(policyId)}/revoke`,
            { method: "POST", headers, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
        }
        if (error instanceof TRPCError) throw error;
        const safeFailure = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
          ? error.message : `PRIVATE_DATABASE_RENEWAL_${approvalStage}_FAILED`;
        auditLogger.log({ eventType: "cloudflare_staging_private_database_renewal_failed", userId: ctx.user.id,
          requestType: "cloudflare_staging_private_database_renewal", statusCode: 502,
          responsePayload: { tenantId, projectId: input.projectId, configurationRef: input.configurationRef,
            planDigest: preflight.planDigest, failureStage: approvalStage, failureCode: safeFailure, jobCreationStarted } });
        throw new TRPCError({ code: "BAD_GATEWAY", message: safeFailure });
      }
    }),

  finalizeCloudflareStagingPrivateDatabaseRenewal: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("staging"),
      configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/), renewalJobId: z.string().uuid() }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated staging Owner session required" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      try {
        const result = await saveCloudflareStagingConfigurationAfterDatabaseRenewal(db, { identity: { tenantId, projectId: input.projectId,
          provider: "cloudflare", environment: "staging" }, configurationRef: input.configurationRef,
          renewalJobId: input.renewalJobId, actorUserId: ctx.user.id });
        auditLogger.log({ eventType: "cloudflare_staging_configuration_renewed", userId: ctx.user.id,
          requestType: "cloudflare_staging_configuration_renewal_finalize", responsePayload: { tenantId, projectId: input.projectId,
            previousConfigurationRef: input.configurationRef, configurationRef: result.configurationRef }, statusCode: 200 });
        return result;
      } catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : "PRIVATE_DATABASE_RENEWAL_FINALIZE_FAILED" }); }
    }),

  getCloudflareStagingRuntimeReadiness: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("staging") }).strict())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const targets = await listProviderDeploymentTargets(db, input);
      const target = targets.find(row => row.provider === "cloudflare" && row.enabled);
      if (
        !target ||
        target.workerRef !== CLOUDFLARE_STAGING_TARGET_ID ||
        target.deploymentTargetId !== CLOUDFLARE_STAGING_TARGET_ID ||
        !/^cf-origin:[a-f0-9]{64}$/.test(target.runtimePolicy ?? "")
      ) {
        return {
          status: "UNAVAILABLE" as const,
          checkedAt: new Date().toISOString(),
          missing: [],
          reason: "STAGING_TARGET_NOT_READY",
        };
      }
      const jobs = await db
        .select({ input: workerJobs.inputJson, output: workerJobs.outputJson })
        .from(workerJobs)
        .where(and(
          eq(workerJobs.tenantId, input.tenantId),
          eq(workerJobs.jobType, CLOUDFLARE_STAGING_DEPLOYMENT_JOB),
          eq(workerJobs.status, "succeeded")
        ))
        .orderBy(desc(workerJobs.createdAt))
        .limit(100);
      const deployment = jobs.find(row => {
        const jobInput = row.input ?? {};
        const output = row.output ?? {};
        return jobInput.projectId === input.projectId &&
          jobInput.environment === "staging" &&
          jobInput.contractVersion === "cloudflare-staging-origin-v2" &&
          jobInput.configurationRef === target.runtimePolicy &&
          output.configurationRef === target.runtimePolicy &&
          output.runtimeVerified === true &&
          typeof output.deploymentId === "string" &&
          typeof output.url === "string";
      })?.output;
      return probeCloudflareStagingRuntimeReadiness({
        url: typeof deployment?.url === "string" ? deployment.url : undefined,
        deploymentId: typeof deployment?.deploymentId === "string" ? deployment.deploymentId : undefined,
      });
    }),

  getCloudflareMigrationMission: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), environment: z.literal("production") }).strict())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "MIGRATION_TENANT_MISMATCH" });
      const mission = await getCloudflareMigrationMission(await getDb(), input);
      if (!ctx.user?.id || !ctx.userToken || !(await isProductionTenantOwner(await getDb(), tenantId, ctx.user.id)))
        return { ...mission, campaignAuthority: "NOT_AUTHORIZED" as const, mandateStatus: "OWNER_ACTION_REQUIRED" as const };
      try {
        const { mandate } = await readCloudflareMigrationMandate({ tenantId, projectId: input.projectId, userToken: ctx.userToken }) as { mandate?: { status?: string; mandateRef?: string } | null };
        const active = mandate?.status === "ACTIVE" && typeof mandate.mandateRef === "string";
        return { ...mission, campaignAuthority: active ? "LIMITED" as const : "NOT_AUTHORIZED" as const,
          mandateStatus: mandate?.status ?? "NOT_ENROLLED", mandateRef: mandate?.mandateRef ?? null,
          mandateExecutionCoverage: active ? "INCOMPLETE" as const : "NOT_ACTIVE" as const,
          authorizedOperations: active ? ["credit_billing_acceptance", "queue_recovery_acceptance"] as const : [] as const };
      } catch {
        return { ...mission, campaignAuthority: "UNAVAILABLE" as const, mandateStatus: "READBACK_UNAVAILABLE" as const };
      }
    }),

  getCloudflareMigrationMandatePlan: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), environment: z.literal("production") }).strict())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (tenantId !== input.tenantId || !ctx.user?.id || !(await isProductionTenantOwner(await getDb(), tenantId, ctx.user.id)))
        return { ready: false as const, reason: "MIGRATION_MANDATE_TENANT_OWNER_REQUIRED", plan: null };
      const mission = await getCloudflareMigrationMission(await getDb(), input);
      if (mission.migrationMode !== "FIRST_MIGRATION" || !mission.completedCheckpoints.includes("M1_ACCEPTED") ||
          !mission.completedCheckpoints.includes("M2_ACCEPTED"))
        return { ready: false as const, reason: "MIGRATION_MANDATE_FIRST_MIGRATION_M1_M2_REQUIRED", plan: null };
      return getCloudflareMigrationMandatePlan(await getDb(), { tenantId, projectId: input.projectId, ownerUserId: ctx.user.id });
    }),

  getCloudflareMigrationMandate: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), environment: z.literal("production") }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id ||
          !(await isProductionTenantOwner(await getDb(), input.tenantId, ctx.user.id)))
        throw new TRPCError({ code: "FORBIDDEN", message: "MIGRATION_MANDATE_TENANT_OWNER_REQUIRED" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "MIGRATION_MANDATE_OWNER_SESSION_REQUIRED" });
      return readCloudflareMigrationMandate({ tenantId: input.tenantId, projectId: input.projectId, userToken: ctx.userToken });
    }),

  enrollCloudflareMigrationMandate: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), environment: z.literal("production"),
      idempotencyKey: z.string().min(8).max(160), expectedPlanDigest: z.string().regex(/^[a-f0-9]{64}$/),
      plan: cloudflareMigrationMandateEnvelopeSchema }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (tenantId !== input.tenantId || !ctx.user?.id || !(await isProductionTenantOwner(await getDb(), tenantId, ctx.user.id)))
        throw new TRPCError({ code: "FORBIDDEN", message: "MIGRATION_MANDATE_TENANT_OWNER_REQUIRED" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "MIGRATION_MANDATE_OWNER_SESSION_REQUIRED" });
      const mission = await getCloudflareMigrationMission(await getDb(), input);
      if (mission.migrationMode !== "FIRST_MIGRATION" || !mission.completedCheckpoints.includes("M1_ACCEPTED") ||
          !mission.completedCheckpoints.includes("M2_ACCEPTED"))
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "MIGRATION_MANDATE_FIRST_MIGRATION_M1_M2_REQUIRED" });
      try {
        return await enrollCloudflareMigrationMandate({ db: await getDb(), tenantId, projectId: input.projectId,
          ownerUserId: ctx.user.id, userToken: ctx.userToken, idempotencyKey: input.idempotencyKey,
          expectedPlanDigest: input.expectedPlanDigest, plan: input.plan });
      } catch (error) {
        const reason = error instanceof Error && /^[A-Z0-9_:-]{5,120}$/.test(error.message) ? error.message : "MIGRATION_MANDATE_ENROLLMENT_FAILED";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: reason });
      }
    }),

  changeCloudflareMigrationMandate: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), environment: z.literal("production"),
      mandateRef: z.string().uuid(), state: z.enum(["suspend", "revoke"]), reason: z.string().trim().min(4).max(500) }).strict())
    .mutation(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id ||
          !(await isProductionTenantOwner(await getDb(), input.tenantId, ctx.user.id)))
        throw new TRPCError({ code: "FORBIDDEN", message: "MIGRATION_MANDATE_TENANT_OWNER_REQUIRED" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "MIGRATION_MANDATE_OWNER_SESSION_REQUIRED" });
      try { return await changeCloudflareMigrationMandate({ mandateRef: input.mandateRef, userToken: ctx.userToken,
        reason: input.reason, state: input.state }); }
      catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error && /^[A-Z0-9_:-]{5,120}$/.test(error.message)
        ? error.message : "MIGRATION_MANDATE_STATE_CHANGE_FAILED" }); }
    }),

  getCloudflareMigrationMandateHistory: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), environment: z.literal("production"),
      mandateRef: z.string().uuid() }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id ||
          !(await isProductionTenantOwner(await getDb(), input.tenantId, ctx.user.id)))
        throw new TRPCError({ code: "FORBIDDEN", message: "MIGRATION_MANDATE_TENANT_OWNER_REQUIRED" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "MIGRATION_MANDATE_OWNER_SESSION_REQUIRED" });
      return readCloudflareMigrationMandateHistory({ mandateRef: input.mandateRef, userToken: ctx.userToken });
    }),

  getCloudflareHttpImagePairPreflight: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36) }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_IMAGE_TENANT_MISMATCH" });
      return getHttpImagePairPreflight(await getDb(), { ...input, actorUserId: ctx.user.id });
    }),

  getCloudflareProductionTenantIsolationPreflight: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), jobId: z.string().uuid() }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "M1_ISOLATION_TENANT_MISMATCH" });
      try { return await getProductionTenantIsolationPreflight(await getDb(), { ...input, actorUserId: ctx.user.id }); }
      catch (error) { return { ready: false as const, reason: error instanceof Error && /^[A-Z0-9_]{5,150}$/.test(error.message)
        ? error.message : "M1_ISOLATION_PREFLIGHT_UNAVAILABLE" }; }
    }),

  prepareCloudflareProductionTenantIsolation: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), jobId: z.string().uuid(),
      actionDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
    .mutation(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "M1_ISOLATION_TENANT_MISMATCH" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "M1_ISOLATION_OWNER_SESSION_REQUIRED" });
      try { return await prepareProductionTenantIsolation(await getDb(), { ...input, actorUserId: ctx.user.id }); }
      catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error && /^[A-Z0-9_]{5,150}$/.test(error.message)
        ? error.message : "M1_ISOLATION_PREPARATION_FAILED" }); }
    }),

  getCloudflareHttpImagePairSubmission: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), submissionId: z.string().uuid().optional() }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_IMAGE_TENANT_MISMATCH" });
      return readHttpImagePublication(await getDb(), { ...input, actorUserId: ctx.user.id });
    }),

  queueCloudflareHttpImagePair: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), submissionId: z.string().uuid(),
      planDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
    .mutation(async ({ input, ctx }) => {
      const trace = { submissionId: input.submissionId, tenantId: input.tenantId, projectId: input.projectId,
        actorUserId: ctx.user.id, requestId: ctx.req.requestId ?? input.submissionId };
      console.info("[CloudflareHttpImageAdmission]", { ...trace, stage: "AUTHENTICATED_REQUEST" });
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_IMAGE_TENANT_MISMATCH" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "HTTP_IMAGE_OWNER_SESSION_REQUIRED" });
      try {
        const result = await queueHttpImagePair(await getDb(), { ...input, actorUserId: ctx.user.id, userToken: ctx.userToken,
          correlationId: ctx.req.requestId ?? input.submissionId });
        console.info("[CloudflareHttpImageAdmission]", { ...trace, stage: "CANONICAL_RECONCILIATION_RETURNED",
          canonicalSubmissionId: result?.submissionId, jobs: result?.jobs.map(job => ({ jobId: job.jobId, status: job.status })) });
        return result;
      } catch (error) {
        const code = error instanceof Error && /^[A-Z][A-Z0-9_:]{3,220}$/.test(error.message) ? error.message : "HTTP_IMAGE_ADMISSION_UNKNOWN";
        console.info("[CloudflareHttpImageAdmission]", { ...trace, stage: "ADMISSION_ERROR", code });
        throw new TRPCError({ code: code.endsWith("UNKNOWN") ? "INTERNAL_SERVER_ERROR" : "PRECONDITION_FAILED", message: code });
      }
    }),

  getCloudflareProductionIngressPreflight: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), environment: z.literal("production") }).strict())
    .query(async ({input,ctx}) => {
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(tenantId!==input.tenantId) throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_INGRESS_TENANT_MISMATCH"});
      if(!ctx.userToken) return {ready:false as const,reason:"OWNER_SESSION_AUTHORITY_UNAVAILABLE"};
      const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"DATABASE_UNAVAILABLE"});
      return getProductionIngressPreflight(db,input);
    }),

  getCloudflareProductionIngressRollbackPreflight: exactAdminProcedure
    .input(z.object({tenantId:deploymentTenantIdSchema,projectId:z.string().min(1).max(36),environment:z.literal("production"),jobId:z.string().uuid()}).strict())
    .query(async({input,ctx})=>{
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(tenantId!==input.tenantId)throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_INGRESS_TENANT_MISMATCH"});
      const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"DATABASE_UNAVAILABLE"});
      return getProductionIngressRollbackPreflight(db,input,input.jobId);
    }),

  queueCloudflareProductionIngress: exactAdminProcedure
    .input(z.object({tenantId:deploymentTenantIdSchema,projectId:z.string().min(1).max(36),environment:z.literal("production"),
      submissionId:z.string().uuid(),planDigest:z.string().regex(/^[a-f0-9]{64}$/),
      exposure:z.literal("100-percent-http-origin-bridge"),rollbackJobId:z.string().uuid().optional()}).strict())
    .mutation(async({input,ctx})=>{
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(tenantId!==input.tenantId)throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_INGRESS_TENANT_MISMATCH"});
      if(!ctx.userToken||!ctx.user?.id)throw new TRPCError({code:"UNAUTHORIZED",message:"OWNER_SESSION_AUTHORITY_UNAVAILABLE"});
      const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"DATABASE_UNAVAILABLE"});
      try {return await queueProductionIngress(db,{...input,actorUserId:ctx.user.id,userToken:ctx.userToken,
        correlationId:ctx.req.requestId??input.submissionId});}
      catch(error){const code=error instanceof Error&&/^[A-Z][A-Z0-9_:.-]{2,180}$/.test(error.message)
        ?error.message:"PRODUCTION_INGRESS_ADMISSION_UNKNOWN";
        throw new TRPCError({code:code==="PRODUCTION_INGRESS_ADMISSION_UNKNOWN"?"INTERNAL_SERVER_ERROR":"PRECONDITION_FAILED",message:code});}
    }),

  getLatestCloudflareProductionIngressJob: exactAdminProcedure
    .input(z.object({tenantId:deploymentTenantIdSchema,projectId:z.string().min(1).max(36),environment:z.literal("production")}).strict())
    .query(async({input,ctx})=>{
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(tenantId!==input.tenantId)throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_INGRESS_TENANT_MISMATCH"});
      const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"DATABASE_UNAVAILABLE"});
      const [job]=await db.select({jobId:workerJobs.id,status:workerJobs.status,errorCode:workerJobs.errorCode,
        output:workerJobs.outputJson,input:workerJobs.inputJson,progress:workerJobs.progressJson,
        requesterUserId:workerJobs.requestedByUserId}).from(workerJobs).where(and(eq(workerJobs.tenantId,input.tenantId),
        eq(workerJobs.jobType,"cloudflare.production.deploy"),eq(workerJobs.contractVersion,PRODUCTION_INGRESS_CONTRACT),
        sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`)).orderBy(desc(workerJobs.createdAt)).limit(1);
      return job??null;
    }),

  getCloudflareProductionWorkerCanaryPreflight: exactAdminProcedure
    .input(z.object({tenantId:deploymentTenantIdSchema,projectId:z.string().min(1).max(36),environment:z.literal("production")}).strict())
    .query(async({input,ctx})=>{
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(tenantId!==input.tenantId)throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_WORKER_TENANT_MISMATCH"});
      const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"DATABASE_UNAVAILABLE"});
      if(!ctx.user?.id||!(await isProductionTenantOwner(db,tenantId,ctx.user.id)))return {ready:false as const,reason:"PRODUCTION_TENANT_OWNER_REQUIRED"};
      return getProductionWorkerCanaryPreflight(db,input);
    }),

  queueCloudflareProductionWorkerCanary: exactAdminProcedure
    .input(z.object({tenantId:deploymentTenantIdSchema,projectId:z.string().min(1).max(36),environment:z.literal("production"),
      submissionId:z.string().uuid(),planDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict())
    .mutation(async({input,ctx})=>{
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(tenantId!==input.tenantId)throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_WORKER_TENANT_MISMATCH"});
      if(!ctx.user?.id||!ctx.userToken)throw new TRPCError({code:"UNAUTHORIZED",message:"PRODUCTION_WORKER_OWNER_SESSION_REQUIRED"});
      const db=await getDb();if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"DATABASE_UNAVAILABLE"});
      if(!(await isProductionTenantOwner(db,tenantId,ctx.user.id)))throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_TENANT_OWNER_REQUIRED"});
      let mandateRef: string | undefined;
      try {
        const state = await readCloudflareMigrationMandate({ tenantId, projectId: input.projectId, userToken: ctx.userToken }) as {
          mandate?: { status?: string; mandateRef?: string } | null;
        };
        if (state.mandate?.status === "ACTIVE" && typeof state.mandate.mandateRef === "string") mandateRef = state.mandate.mandateRef;
      } catch {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "MIGRATION_MANDATE_READBACK_UNAVAILABLE" });
      }
      try{return await queueProductionWorkerCanary(db,{tenantId,projectId:input.projectId,actorUserId:ctx.user.id,
        userToken:ctx.userToken,submissionId:input.submissionId,planDigest:input.planDigest,correlationId:ctx.req.requestId??input.submissionId,
        ...(mandateRef ? { mandateRef } : {})});}
      catch(error){const code=error instanceof Error&&/^[A-Z][A-Z0-9_:.-]{2,180}$/.test(error.message)?error.message:"PRODUCTION_WORKER_ADMISSION_UNKNOWN";
        throw new TRPCError({code:code==="PRODUCTION_WORKER_ADMISSION_UNKNOWN"?"INTERNAL_SERVER_ERROR":"PRECONDITION_FAILED",message:code});}
    }),

  getLatestCloudflareProductionWorkerCanaryJob: exactAdminProcedure
    .input(z.object({tenantId:deploymentTenantIdSchema,projectId:z.string().min(1).max(36),environment:z.literal("production")}).strict())
    .query(async({input,ctx})=>{
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(tenantId!==input.tenantId)throw new TRPCError({code:"FORBIDDEN",message:"PRODUCTION_WORKER_TENANT_MISMATCH"});
      try {
        const db=await getDb();
        if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"DATABASE_UNAVAILABLE"});
        return await readLatestCloudflareProductionWorkerCanaryJob(db,input);
      } catch(error) {
        if(error instanceof TRPCError&&error.message==="DATABASE_UNAVAILABLE")throw error;
        const value=error as {name?:unknown;code?:unknown;cause?:{code?:unknown};stack?:unknown};
        const sqlState=[value?.code,value?.cause?.code].find(code=>typeof code==="string"&&/^[0-9A-Z]{5}$/.test(code));
        const stackFrames=typeof value?.stack==="string"?value.stack.split("\n").slice(1,6).map(line=>line.slice(0,240)):[];
        console.error("[CloudflareProductionWorkerCanaryJobRead]",JSON.stringify({requestId:ctx.req?.requestId??null,
          outcome:"failed",errorCode:"PRODUCTION_WORKER_CANARY_JOB_READ_UNAVAILABLE",exceptionName:typeof value?.name==="string"?value.name:"Error",
          ...(sqlState?{sqlState}:{}),stackFrames}));
        throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"PRODUCTION_WORKER_CANARY_JOB_READ_UNAVAILABLE"});
      }
    }),

  recordCloudflareProductionIngressAcceptance: exactAdminProcedure
    .input(z.object({jobId:z.string().uuid(),receipt:ingressBrowserReceiptSchema,passed:z.boolean()}).strict())
    .mutation(async({input,ctx})=>{
      const tenantId=resolveTenantIdVarchar(ctx.tenantId,ctx.user?.currentTenantId);
      if(!tenantId||!ctx.user?.id)throw new TRPCError({code:"FORBIDDEN",message:"INGRESS_ACCEPTANCE_SCOPE_DENIED"});
      try{return await recordIngressBrowserAcceptance(await getDb(),{...input,actorUserId:ctx.user.id,tenantId,
        verifiedPublicOrigin:getVerifiedCloudflarePublicOrigin(ctx.req)});}
      catch{throw new TRPCError({code:"PRECONDITION_FAILED",message:"INGRESS_ACCEPTANCE_SCOPE_DENIED"});}
    }),

  getCloudflareProductionRuntimeReadiness: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("production") }).strict())
    .query(async () => probeCloudflareProductionRuntimeReadiness()),

  getCloudflareProductionProviderInventory: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("production") }).strict())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return probeCloudflareProductionProviderInventory({ db, tenantId: input.tenantId, projectId: input.projectId });
    }),

  getCloudflareHttpCandidatePreparation: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36) }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_CANDIDATE_AUTHENTICATED_TENANT_REQUIRED" });
      const scope = { ...input, actorUserId: ctx.user.id }, db = getDb();
      return { preflight: await getHttpCandidatePreparationPreflight(db, scope), job: await readHttpCandidatePreparation(db, scope) };
    }),

  getCloudflareHttpRuntimeReadiness: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), jobId: z.string().uuid() }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_RUNTIME_AUTHENTICATED_TENANT_REQUIRED" });
      try { return await getHttpRuntimeReadiness(getDb(), { ...input, actorUserId: ctx.user.id }, input.jobId); }
      catch (error) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message)
        ? error.message : "HTTP_RUNTIME_READBACK_UNAVAILABLE" }); }
    }),

  getCloudflareHttpRuntimeOperation: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), candidateJobId: z.string().uuid(),
      operation: z.enum(["runtime", "application"]).optional() }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_RUNTIME_AUTHENTICATED_TENANT_REQUIRED" });
      const operation = input.operation ?? "runtime", db = getDb(), scope = { ...input, actorUserId: ctx.user.id };
      let job: Awaited<ReturnType<typeof readHttpRuntimeOperation>> = null, pending: Awaited<ReturnType<typeof readPendingHttpRuntimeIntent>> = null;
      try {
        job = await readHttpRuntimeOperation(db, scope, operation);
        if (job && job.status !== "failed") return { job, preflight: null, pending: null };
        const retained = await readPendingHttpRuntimeIntent(db, scope, operation);
        pending = retained?.submissionId === job?.jobId ? null : retained;
      } catch (error) {
        const reason = error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message)
          ? error.message : "HTTP_RUNTIME_PREFLIGHT_REGISTRY_UNAVAILABLE";
        return { job, pending, preflight: { ready: false as const, reason } };
      }
      try { return { job, pending, preflight: await getHttpRuntimePlan(db, scope, input.candidateJobId, { ...(pending ?? {}), operation }) }; }
      catch (error) { return { job, pending, preflight: { ready: false as const, reason: error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message)
        ? error.message : "HTTP_RUNTIME_PREFLIGHT_UNAVAILABLE" } }; }
    }),

  prepareCloudflareHttpRuntime: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), candidateJobId: z.string().uuid(),
      submissionId: z.string().uuid(), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
      artifactRef: z.string().regex(/^sha256:[a-f0-9]{64}$/), workerSourceSha: z.string().regex(/^[a-f0-9]{40}$/),
      operation: z.enum(["runtime", "application"]).optional() }).strict())
    .mutation(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_RUNTIME_AUTHENTICATED_TENANT_REQUIRED" });
      const correlationId = (ctx.req as typeof ctx.req & { requestId?: string }).requestId ?? input.submissionId;
      console.info("cloudflare_http_runtime_admission", { stage: "AUTHENTICATED", submissionId: input.submissionId,
        tenantId: input.tenantId, projectId: input.projectId, actorUserId: ctx.user.id, candidateJobId: input.candidateJobId,
        planDigest: input.planDigest, operation: input.operation ?? "runtime", correlationId });
      try { const result = await prepareHttpRuntime(getDb(), { ...input, actorUserId: ctx.user.id, correlationId });
        return { jobId: result.jobId }; }
      catch (error) {
        const reason = error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message) ? error.message : "HTTP_RUNTIME_ADMISSION_UNKNOWN";
        console.info("cloudflare_http_runtime_admission", { stage: "ERROR", submissionId: input.submissionId, correlationId, reason });
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: reason }); }
    }),

  getCloudflareM3ParityOperation: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), candidateJobId: z.string().uuid(),
      operation: z.enum(["credit_billing_acceptance", "queue_recovery_acceptance"]), submissionId: z.string().uuid().optional() }).strict())
    .query(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "M3_PARITY_TENANT_REQUIRED" });
      const db = getDb(), scope = { tenantId: input.tenantId, projectId: input.projectId,
        actorUserId: ctx.user.id, candidateJobId: input.candidateJobId };
      try {
        const [job, preflight] = await Promise.all([
          getM3ParityOperation(db, scope, input.operation, input.submissionId),
          getM3ParityPreflight(db, scope, input.operation),
        ]);
        return { job, preflight };
      } catch (error) {
        return { job: null, preflight: { ready: false as const, missingLifecycleChecks: [], reason: error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message)
          ? error.message : "M3_PARITY_READBACK_UNAVAILABLE" } };
      }
    }),

  prepareCloudflareM3ParityOperation: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36), candidateJobId: z.string().uuid(),
      operation: z.enum(["credit_billing_acceptance", "queue_recovery_acceptance"]), submissionId: z.string().uuid(),
      planDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
    .mutation(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "M3_PARITY_TENANT_REQUIRED" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "M3_PARITY_OWNER_SESSION_REQUIRED" });
      const correlationId = (ctx.req as typeof ctx.req & { requestId?: string }).requestId ?? input.submissionId;
      console.info("cloudflare_m3_parity_admission", { stage: "AUTHENTICATED_OWNER_SUBMISSION", operation: input.operation,
        submissionId: input.submissionId, tenantId: input.tenantId, projectId: input.projectId, actorUserId: ctx.user.id, correlationId });
      try {
        const { mandate } = await readCloudflareMigrationMandate({ tenantId: input.tenantId, projectId: input.projectId, userToken: ctx.userToken }) as {
          mandate?: { status?: string; mandateRef?: string } | null;
        };
        if (mandate && (mandate.status !== "ACTIVE" || !mandate.mandateRef))
          throw new Error("MIGRATION_MANDATE_OWNER_ENROLLMENT_REQUIRED");
        const result = await admitM3ParityOperation(getDb(), { ...input, ...(mandate?.mandateRef ? { mandateRef: mandate.mandateRef } : {}),
          actorUserId: ctx.user.id, correlationId });
        console.info("cloudflare_m3_parity_admission", { stage: "CANONICAL_JOB_ACCEPTED", operation: input.operation,
          submissionId: input.submissionId, jobId: result.jobId, tenantId: input.tenantId, projectId: input.projectId, correlationId });
        return { jobId: result.jobId, status: result.status };
      } catch (error) {
        const reason = error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message) ? error.message : "M3_PARITY_ADMISSION_UNKNOWN";
        console.info("cloudflare_m3_parity_admission", { stage: "ADMISSION_REJECTED_OR_UNKNOWN", operation: input.operation,
          submissionId: input.submissionId, tenantId: input.tenantId, projectId: input.projectId, correlationId, reason });
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: reason });
      }
    }),

  prepareCloudflareHttpCandidate: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().min(1).max(36),
      submissionId: z.string().uuid(), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
      artifactRef: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(), workerSourceSha: z.string().regex(/^[a-f0-9]{40}$/).optional(),
    }).strict().refine(value => Boolean(value.artifactRef) === Boolean(value.workerSourceSha)))
    .mutation(async ({ input, ctx }) => {
      if (resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "HTTP_CANDIDATE_AUTHENTICATED_TENANT_REQUIRED" });
      try {
        const result = await prepareHttpCandidate(getDb(), { ...input, actorUserId: ctx.user.id, correlationId: ctx.req.requestId ?? input.submissionId });
        return { jobId: result.jobId };
      } catch (error) {
        const reason = error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message) ? error.message : "HTTP_CANDIDATE_ADMISSION_UNKNOWN";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: reason });
      }
    }),

  prepareCloudflareProductionQueue: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("production") }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const target = await resolveCloudflareProductionDeploymentTarget({ db, tenantId, projectId: input.projectId });
      if (!target) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_TARGET_NOT_CONFIGURED" });
      const credential = await getCloudflareDeploymentCredentialState(db, {
        identity: { tenantId, projectId: input.projectId, environment: "production", provider: "cloudflare" },
        credentialRef: target.credentialRef,
      });
      if (credential.status !== "CONFIGURED") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_CREDENTIAL_NOT_CONFIGURED" });
      }
      const operationId = randomUUID();
      const job = await createControlPlaneJob({
        context: { tenantId, actorType: "user", actorId: ctx.user.id, authorizationScope: "infrastructure.cloudflare_production_queue_prepare",
          correlationId: ctx.req.requestId ?? operationId, idempotencyKey: `cloudflare-production-queue:${operationId}` },
        definition: { contractVersion: CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT, jobType: CLOUDFLARE_PRODUCTION_QUEUE_JOB,
          executionClass: "long", priority: 45,
          input: { contractVersion: CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT, projectId: input.projectId,
            targetId: "smartspec-cloudflare-runtime", environment: "production" },
          idempotencyKey: `cloudflare-production-queue:${operationId}`,
          activeDedupeKey: `cloudflare-production-queue:${tenantId}:${input.projectId}`,
          retryPolicy: { maxAttempts: 3, baseDelayMs: 2_000, maxDelayMs: 5_000, jitter: "bounded", deadlineMs: 15 * 60_000, allowedErrorClasses: ["retryable"] },
          timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 3 * 60_000 } },
        createOptions: { runtimeType: "node_job_worker" },
      });
      try {
        auditLogger.log({ eventType: "cloudflare_production_queue_prepare_queued", userId: ctx.user.id,
          requestType: "cloudflare_production_queue_prepare", responsePayload: { tenantId, projectId: input.projectId, jobId: job.jobId }, statusCode: 202 });
      } catch { /* The canonical job and outbox remain authoritative if audit projection is unavailable. */ }
      return { jobId: job.jobId, status: "queued" as const, environment: "production" as const, trafficShifted: false as const };
    }),

  prepareCloudflareProductionDatabase: exactAdminProcedure
    .input(z.object({
      tenantId: deploymentTenantIdSchema,
      projectId: z.string().trim().min(1).max(100),
      environment: z.literal("production"),
      tunnelId: z.string().uuid(),
      submissionId: z.string().uuid().optional(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const jobId = input.submissionId ?? newProductionDatabaseJobId();
      const requestId = ctx.req.requestId ?? jobId;
      let stage = "authenticated_request_received";
      logCloudflareProductionDatabaseAdmission({ stage, outcome: "started", requestId,
        tenantId: input.tenantId, projectId: input.projectId, jobId });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id) {
        logCloudflareProductionDatabaseAdmission({ stage: "tenant_scope_verification", outcome: "failed", requestId,
          tenantId: input.tenantId, projectId: input.projectId, jobId, errorCode: "PRODUCTION_TENANT_SCOPE_MISMATCH" });
        throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      }
      logCloudflareProductionDatabaseAdmission({ stage: "tenant_scope_verified", outcome: "completed", requestId,
        tenantId, projectId: input.projectId, jobId });
      const db = await getDb();
      if (!db) {
        logCloudflareProductionDatabaseAdmission({ stage: "authoritative_database_resolved", outcome: "failed", requestId,
          tenantId, projectId: input.projectId, jobId, errorCode: "DATABASE_NOT_AVAILABLE" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      logCloudflareProductionDatabaseAdmission({ stage: "authoritative_database_resolved", outcome: "completed", requestId,
        tenantId, projectId: input.projectId, jobId });
      const readCanonicalJob = async (candidateId: string) => {
        const [candidate] = await db.select({ id: workerJobs.id, jobType: workerJobs.jobType,
          contractVersion: workerJobs.contractVersion, requestedByUserId: workerJobs.requestedByUserId,
          status: workerJobs.status, inputJson: workerJobs.inputJson })
          .from(workerJobs).where(and(eq(workerJobs.id, candidateId), eq(workerJobs.tenantId, tenantId))).limit(1);
        return candidate ?? null;
      };
      const validateExistingJob = (candidate: NonNullable<Awaited<ReturnType<typeof readCanonicalJob>>>) => {
        const candidateInput = candidate.inputJson as Record<string, unknown> | null;
        if (candidate.jobType !== CLOUDFLARE_PRODUCTION_DATABASE_JOB ||
            candidate.contractVersion !== CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT ||
            candidate.requestedByUserId !== ctx.user?.id || candidateInput?.projectId !== input.projectId ||
            candidateInput?.targetId !== "smartspec-cloudflare-runtime" || candidateInput?.environment !== "production" || !candidateInput) {
          throw new TRPCError({ code: "CONFLICT", message: "CLOUDFLARE_PRODUCTION_DATABASE_ACTIVE_JOB_SCOPE_MISMATCH" });
        }
        return candidateInput;
      };
      const responseForJob = (candidate: NonNullable<Awaited<ReturnType<typeof readCanonicalJob>>>, candidateInput: Record<string, unknown>) => ({
        jobId: candidate.id,
        grantRef: typeof candidateInput.grantRef === "string" ? candidateInput.grantRef : "",
        planDigest: typeof candidateInput.planDigest === "string" ? candidateInput.planDigest : "",
        status: candidate.status === "queued" ? "queued" as const : "existing" as const,
        targetId: "smartspec-cloudflare-runtime" as const,
        environment: "production" as const,
      });
      stage = "canonical_job_reconciliation";
      logCloudflareProductionDatabaseAdmission({ stage, outcome: "started", requestId, tenantId,
        projectId: input.projectId, jobId });
      const existingBySubmission = await readCanonicalJob(jobId);
      if (existingBySubmission) {
        const existingInput = validateExistingJob(existingBySubmission);
        const grant = await readCloudflareProductionDatabaseGrant(db, existingBySubmission.id);
        if (!grant || grant.grantRef !== existingInput.grantRef || grant.planDigest !== existingInput.planDigest ||
            grant.tenantId !== tenantId || grant.projectId !== input.projectId || grant.requesterUserId !== ctx.user.id ||
            grant.plan.tunnelId !== input.tunnelId) {
          logCloudflareProductionDatabaseAdmission({ stage, outcome: "unknown", requestId, tenantId,
            projectId: input.projectId, jobId, errorCode: "CANONICAL_JOB_GRANT_READBACK_MISMATCH" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN" });
        }
        logCloudflareProductionDatabaseAdmission({ stage, outcome: "completed", requestId, tenantId,
          projectId: input.projectId, jobId: existingBySubmission.id });
        return responseForJob(existingBySubmission, existingInput);
      }
      const [activeScopeJob] = await db.select({ id: workerJobs.id, jobType: workerJobs.jobType,
        contractVersion: workerJobs.contractVersion, requestedByUserId: workerJobs.requestedByUserId,
        status: workerJobs.status, inputJson: workerJobs.inputJson })
        .from(workerJobs).where(and(eq(workerJobs.tenantId, tenantId),
          eq(workerJobs.jobType, CLOUDFLARE_PRODUCTION_DATABASE_JOB),
          eq(workerJobs.contractVersion, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT),
          inArray(workerJobs.status, ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing",
            "pending", "leased", "waiting_external", "retry_scheduled", "succeeded", "completed"]),
          sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`,
          sql`${workerJobs.inputJson}->>'targetId' = 'smartspec-cloudflare-runtime'`,
          sql`${workerJobs.inputJson}->>'environment' = 'production'`))
        .orderBy(desc(workerJobs.createdAt)).limit(1);
      if (activeScopeJob) {
        const activeInput = validateExistingJob(activeScopeJob);
        const activeGrant = await readCloudflareProductionDatabaseGrant(db, activeScopeJob.id);
        if (!activeGrant || activeGrant.grantRef !== activeInput.grantRef || activeGrant.planDigest !== activeInput.planDigest ||
            activeGrant.tenantId !== tenantId || activeGrant.projectId !== input.projectId ||
            activeGrant.requesterUserId !== ctx.user.id || activeGrant.plan.tunnelId !== input.tunnelId) {
          logCloudflareProductionDatabaseAdmission({ stage, outcome: "unknown", requestId, tenantId,
            projectId: input.projectId, jobId, errorCode: "CANONICAL_ACTIVE_JOB_GRANT_SCOPE_MISMATCH" });
          throw new TRPCError({ code: "CONFLICT", message: "CLOUDFLARE_PRODUCTION_DATABASE_ACTIVE_JOB_SCOPE_MISMATCH" });
        }
        logCloudflareProductionDatabaseAdmission({ stage, outcome: "completed", requestId, tenantId,
          projectId: input.projectId, jobId: activeScopeJob.id });
        return responseForJob(activeScopeJob, activeInput);
      }
      const target = await resolveCloudflareProductionDeploymentTarget({ db, tenantId, projectId: input.projectId });
      if (!target) {
        logCloudflareProductionDatabaseAdmission({ stage: "production_target_resolution", outcome: "failed", requestId,
          tenantId, projectId: input.projectId, jobId, errorCode: "CLOUDFLARE_PRODUCTION_TARGET_NOT_CONFIGURED" });
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_TARGET_NOT_CONFIGURED" });
      }
      logCloudflareProductionDatabaseAdmission({ stage: "production_target_resolved", outcome: "completed", requestId,
        tenantId, projectId: input.projectId, jobId });
      const credential = await getCloudflareDeploymentCredentialState(db, {
        identity: { tenantId, projectId: input.projectId, environment: "production", provider: "cloudflare" }, credentialRef: target.credentialRef,
      });
      if (credential.status !== "CONFIGURED") {
        logCloudflareProductionDatabaseAdmission({ stage: "production_credential_verification", outcome: "failed", requestId,
          tenantId, projectId: input.projectId, jobId, errorCode: "CLOUDFLARE_PRODUCTION_CREDENTIAL_NOT_CONFIGURED" });
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_CREDENTIAL_NOT_CONFIGURED" });
      }
      logCloudflareProductionDatabaseAdmission({ stage: "production_credential_verified", outcome: "completed", requestId,
        tenantId, projectId: input.projectId, jobId });

      const databaseName = "smartspec";
      const databaseUser = `sah_cf_prod_${createHash("sha256").update(`${input.tunnelId}:${databaseName}`).digest("hex").slice(0, 12)}`;
      let plan: ReturnType<typeof productionDatabaseResourcePlanSchema.parse>;
      try {
        plan = productionDatabaseResourcePlanSchema.parse({ tunnelId: input.tunnelId, databaseHostname: "db.smartaihub.app",
          databaseName, databaseUser,
          vpcTcpPort: 5433,
          connectionLimit: 5, tlsVerification: "verify_full" });
      } catch {
        logCloudflareProductionDatabaseAdmission({ stage: "resource_plan_validation", outcome: "failed", requestId,
          tenantId, projectId: input.projectId, jobId, errorCode: "CLOUDFLARE_PRODUCTION_DATABASE_RESOURCE_PLAN_INVALID" });
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_DATABASE_RESOURCE_PLAN_INVALID" });
      }
      logCloudflareProductionDatabaseAdmission({ stage: "resource_plan_validation", outcome: "completed", requestId,
        tenantId, projectId: input.projectId, jobId });
      const expectedPlanDigest = productionDatabaseResourcePlanDigest(plan);
      const executionReadiness = await (await import("../services/cloudflareExecutionReadiness"))
        .checkCloudflareExecutionReadiness(db);
      if (!executionReadiness.ready) throw new TRPCError({ code: "PRECONDITION_FAILED", message: executionReadiness.reason });
      stage = "encrypted_grant_reconciliation";
      let grant = await readCloudflareProductionDatabaseGrant(db, jobId);
      if (grant) {
        if (grant.tenantId !== tenantId || grant.projectId !== input.projectId || grant.requesterUserId !== ctx.user.id ||
            grant.targetId !== target.targetId || grant.environment !== "production" || grant.accountRef !== target.accountRef ||
            grant.plan.tunnelId !== input.tunnelId || grant.planDigest !== expectedPlanDigest || grant.revokedAt !== null) {
          logCloudflareProductionDatabaseAdmission({ stage, outcome: "failed", requestId, tenantId,
            projectId: input.projectId, jobId, errorCode: "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_SCOPE_MISMATCH" });
          throw new TRPCError({ code: "CONFLICT", message: "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_SCOPE_MISMATCH" });
        }
        if (Date.parse(grant.expiresAt) <= Date.now()) {
          logCloudflareProductionDatabaseAdmission({ stage, outcome: "failed", requestId, tenantId,
            projectId: input.projectId, jobId, errorCode: "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_EXPIRED" });
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_EXPIRED" });
        }
      } else {
        const created = createProductionDatabaseGrant({ jobId, tenantId, projectId: input.projectId,
          requesterUserId: ctx.user.id, accountRef: target.accountRef, plan });
        try {
          await saveCloudflareProductionDatabaseGrant(db, created.grant, created.databasePassword);
          grant = created.grant;
          logCloudflareProductionDatabaseAdmission({ stage: "encrypted_grant_persisted", outcome: "completed", requestId,
            tenantId, projectId: input.projectId, jobId });
        } catch (error) {
          // A transaction timeout may be reported after its INSERT committed.
          // Retain the stable ID; a retry reads and reuses the encrypted grant.
          logCloudflareProductionDatabaseAdmission({ stage, outcome: "unknown", requestId, tenantId,
            projectId: input.projectId, jobId, errorCode: cloudflareAdmissionErrorCode(error) });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN" });
        }
      }
      if (!grant) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_UNAVAILABLE" });
      try {
        stage = "control_plane_job_admission";
        logCloudflareProductionDatabaseAdmission({ stage, outcome: "started", requestId, tenantId,
          projectId: input.projectId, jobId });
        const job = await createControlPlaneJob({
          context: { tenantId, actorType: "user", actorId: ctx.user.id, authorizationScope: "infrastructure.cloudflare_production_database_provision",
            correlationId: requestId, idempotencyKey: `cloudflare-production-database:${jobId}` },
          definition: { contractVersion: CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT, jobType: CLOUDFLARE_PRODUCTION_DATABASE_JOB,
            executionClass: "long", priority: 48,
            input: { contractVersion: CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT, projectId: input.projectId, targetId: "smartspec-cloudflare-runtime",
              environment: "production", grantRef: grant.grantRef, planDigest: grant.planDigest },
            idempotencyKey: `cloudflare-production-database:${jobId}`,
            activeDedupeKey: `cloudflare-production-database:${tenantId}:${input.projectId}`,
            retryPolicy: { maxAttempts: 2, baseDelayMs: 2_000, maxDelayMs: 5_000, jitter: "bounded", deadlineMs: 12 * 60_000, allowedErrorClasses: ["retryable"] },
            timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 12 * 60_000 } },
          createOptions: { canonicalJobId: jobId, runtimeType: "node_job_worker", admissionMode: "durable_queue" },
        });
        if (!job.created) {
          const existing = await readCanonicalJob(job.jobId);
          const existingInput = existing ? validateExistingJob(existing) : null;
          if (!existing || !existingInput) {
            throw new TRPCError({ code: "CONFLICT", message: "CLOUDFLARE_PRODUCTION_DATABASE_ACTIVE_JOB_SCOPE_MISMATCH" });
          }
          const existingGrant = await readCloudflareProductionDatabaseGrant(db, existing.id);
          if (!existingGrant || existingGrant.grantRef !== existingInput.grantRef || existingGrant.planDigest !== existingInput.planDigest ||
              existingGrant.tenantId !== tenantId || existingGrant.projectId !== input.projectId ||
              existingGrant.requesterUserId !== ctx.user.id || existingGrant.plan.tunnelId !== input.tunnelId) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN" });
          }
          return responseForJob(existing, existingInput);
        }
        const canonicalJob = await readCanonicalJob(job.jobId);
        if (!canonicalJob) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN" });
        const canonicalInput = validateExistingJob(canonicalJob);
        const canonicalGrant = await readCloudflareProductionDatabaseGrant(db, canonicalJob.id);
        if (!canonicalGrant || canonicalGrant.grantRef !== canonicalInput.grantRef || canonicalGrant.planDigest !== canonicalInput.planDigest) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN" });
        }
        try {
          auditLogger.log({ eventType: "cloudflare_production_database_provision_queued", userId: ctx.user.id,
            requestType: "cloudflare_production_database_provision", responsePayload: { tenantId, projectId: input.projectId, jobId: canonicalJob.id,
              targetId: target.targetId, environment: "production", planDigest: canonicalGrant.planDigest }, statusCode: 202 });
        } catch { /* The canonical job and outbox remain authoritative if audit projection is unavailable. */ }
        logCloudflareProductionDatabaseAdmission({ stage: "canonical_job_and_grant_verified", outcome: "completed", requestId,
          tenantId, projectId: input.projectId, jobId: canonicalJob.id });
        return responseForJob(canonicalJob, canonicalInput);
      } catch (error) {
        // Never delete a valid grant after an admission error: Control Plane
        // may have committed the canonical job before the response was lost.
        const reconciled = await readCanonicalJob(jobId).catch(() => null);
        if (reconciled) {
          try {
            const reconciledInput = validateExistingJob(reconciled);
            const reconciledGrant = await readCloudflareProductionDatabaseGrant(db, reconciled.id);
            if (reconciledGrant && reconciledGrant.grantRef === reconciledInput.grantRef &&
                reconciledGrant.planDigest === reconciledInput.planDigest && reconciledGrant.tenantId === tenantId &&
                reconciledGrant.projectId === input.projectId && reconciledGrant.requesterUserId === ctx.user.id &&
                reconciledGrant.plan.tunnelId === input.tunnelId) {
              logCloudflareProductionDatabaseAdmission({ stage: "canonical_job_reconciled_after_error", outcome: "completed", requestId,
                tenantId, projectId: input.projectId, jobId: reconciled.id });
              return responseForJob(reconciled, reconciledInput);
            }
          } catch { /* Keep the admission result unknown if scope/readback cannot be verified. */ }
        }
        if (error instanceof TRPCError && error.message === "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN") throw error;
        const errorCode = cloudflareAdmissionErrorCode(error);
        const controlPlaneValidationError = Boolean(error && typeof error === "object" &&
          (error as { name?: unknown }).name === "JobControlPlaneError");
        const definiteRejection = controlPlaneValidationError || (error instanceof TRPCError &&
          !["INTERNAL_SERVER_ERROR", "TIMEOUT", "BAD_GATEWAY"].includes(error.code));
        logCloudflareProductionDatabaseAdmission({ stage, outcome: definiteRejection ? "failed" : "unknown", requestId, tenantId,
          projectId: input.projectId, jobId, errorCode });
        if (controlPlaneValidationError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: errorCode });
        }
        if (definiteRejection) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN" });
      }
    }),

  reconcileCloudflareProductionDatabaseReadback: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100),
      jobId: z.string().uuid(), environment: z.literal("production") }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { reconcileProductionDatabaseReadback } = await import("../services/cloudflareProductionDatabaseReconciliation");
      const { createCloudflareProductionDatabaseRuntime } = await import("../services/cloudflareProductionDatabaseExecutor");
      return reconcileProductionDatabaseReadback({ db, runtime: createCloudflareProductionDatabaseRuntime({ db }),
        jobId: input.jobId, tenantId, projectId: input.projectId, actorUserId: ctx.user.id });
    }),

  resumeExpiredCloudflareProductionDatabaseJob: exactAdminProcedure
    .input(z.object({
      tenantId: deploymentTenantIdSchema,
      projectId: z.string().trim().min(1).max(100),
      jobId: z.string().uuid(),
      tunnelId: z.string().uuid(),
      environment: z.literal("production"),
      authorizeAdditionalAttempt: z.literal(true).optional(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [job] = await db.select().from(workerJobs).where(and(
        eq(workerJobs.id, input.jobId), eq(workerJobs.tenantId, tenantId),
        eq(workerJobs.jobType, CLOUDFLARE_PRODUCTION_DATABASE_JOB),
        eq(workerJobs.contractVersion, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT),
      )).limit(1);
      const jobInput = job?.inputJson as Record<string, unknown> | null;
      const { productionDatabaseRecoveryActionId } = await import("../services/cloudflareProductionDatabaseRecovery");
      const recordedRecoveryAttempt = Number((job?.retryPolicyJson as any)?.productionDatabaseRecovery?.attempt);
      const priorRecoveryRef = typeof jobInput?.planDigest === "string"
        ? productionDatabaseRecoveryActionId(input.jobId, jobInput.planDigest, recordedRecoveryAttempt === 5 ? 5 : undefined)
        : null;
      // A lost accepted response is a canonical read, not a second operation.
      if (input.authorizeAdditionalAttempt === true && job?.requestedByUserId === ctx.user.id && [4, 5].includes(job.attempt) && job.maxAttempts === job.attempt &&
          ["queued", "claimed", "preparing", "running", "waiting_external", "succeeded"].includes(job.status) &&
          jobInput?.projectId === input.projectId && jobInput.targetId === "smartspec-cloudflare-runtime" && jobInput.environment === "production" &&
          recordedRecoveryAttempt === job.attempt && jobInput.grantRef === priorRecoveryRef &&
          (job.retryPolicyJson as any)?.productionDatabaseRecovery?.grantRef === priorRecoveryRef) {
        const reconciled = await readCloudflareProductionDatabaseGrant(db, job.id);
        if (reconciled?.grantRef === priorRecoveryRef && reconciled.requesterUserId === ctx.user.id && reconciled.tenantId === tenantId &&
            reconciled.projectId === input.projectId && reconciled.plan.tunnelId === input.tunnelId && !reconciled.revokedAt)
          return { jobId: job.id, status: job.status, attempt: job.attempt, grantExpiresAt: reconciled.expiresAt, planDigest: reconciled.planDigest };
      }
      const dispatchRecovery = job?.status === "expired" && job.errorCode === "JOB_DEADLINE_EXPIRED" &&
        job.operatorReviewRequired && job.operatorReviewReason === "adapter_contract_unsupported" &&
        job.attempt === 1 && job.maxAttempts >= 2 && !job.startedAt && !job.heartbeatAt && job.fencingVersion === 0;
      const credentialGuardRecovery = input.authorizeAdditionalAttempt === true && job?.status === "failed" &&
        job.errorCode === "CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_UNAVAILABLE" && job.attempt === 2 && job.maxAttempts === 2 &&
        job.fencingVersion === 1 && !job.leaseOwnerToken && !job.leaseExpiresAt && Boolean(job.finishedAt);
      const providerRecovery = input.authorizeAdditionalAttempt === true && job?.status === "failed" &&
        job.errorCode === "CLOUDFLARE_PRODUCTION_DATABASE_HTTP_400_CF_2015" && job.attempt === 3 && job.maxAttempts === 3 &&
        !job.leaseOwnerToken && !job.leaseExpiresAt && Boolean(job.finishedAt);
      const providerReadbackRecovery = input.authorizeAdditionalAttempt === true && job?.status === "failed" &&
        job.errorCode === "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH" && job.attempt === 4 && job.maxAttempts === 4 &&
        job.fencingVersion === 3 && !job.leaseOwnerToken && !job.leaseExpiresAt && Boolean(job.finishedAt);
      const databaseProviderRecovery = providerRecovery || providerReadbackRecovery;
      if (!job || job.requestedByUserId !== ctx.user.id || (!dispatchRecovery && !credentialGuardRecovery && !databaseProviderRecovery) ||
          jobInput?.projectId !== input.projectId || jobInput.targetId !== "smartspec-cloudflare-runtime" ||
          jobInput.environment !== "production" || typeof jobInput.planDigest !== "string" || typeof jobInput.grantRef !== "string") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_DATABASE_JOB_NOT_RECOVERABLE" });
      }
      const concurrentJobs = await db.select({ id: workerJobs.id }).from(workerJobs).where(and(
        eq(workerJobs.tenantId, tenantId), eq(workerJobs.jobType, CLOUDFLARE_PRODUCTION_DATABASE_JOB),
        eq(workerJobs.contractVersion, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT),
        inArray(workerJobs.status, ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing",
          "pending", "leased", "waiting_external", "retry_scheduled"]),
        sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`,
        sql`${workerJobs.inputJson}->>'targetId' = 'smartspec-cloudflare-runtime'`,
        sql`${workerJobs.inputJson}->>'environment' = 'production'`,
      ));
      if (concurrentJobs.some(candidate => candidate.id !== job.id))
        throw new TRPCError({ code: "CONFLICT", message: "CLOUDFLARE_PRODUCTION_DATABASE_ACTIVE_JOB_ALREADY_EXISTS" });
      const outboxes = await db.select().from(workerJobOutbox).where(and(
        eq(workerJobOutbox.workerJobId, job.id), eq(workerJobOutbox.envelopeVersion, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT),
      ));
      const [outbox] = outboxes;
      const dispatches = await db.select({ id: workerJobDispatches.id, consumedAt: workerJobDispatches.consumedAt, failedAt: workerJobDispatches.failedAt }).from(workerJobDispatches)
        .where(eq(workerJobDispatches.workerJobId, job.id)).limit(3);
      const checkpoints = await db.select({ id: systemSettings.id }).from(systemSettings).where(and(
        eq(systemSettings.category, "cloudflare_production_database_runs"), eq(systemSettings.key, job.id),
      )).limit(1);
      const consumedOutbox = outboxes.find(row => row.publishedAt && row.attemptId && !row.cancelledAt && !row.quarantinedAt);
      const unclaimedOutboxSafe = outboxes.length === 1 && outbox && !outbox.publishedAt && outbox.quarantinedAt &&
        (outbox.failedReason === "adapter_contract_unsupported" || (outbox.failedReason === "expired:job_deadline" &&
          outbox.cancelledAt && outbox.cancelledAt.getTime() >= outbox.quarantinedAt.getTime()));
      const credentialGuardSafe = outboxes.length === 2 && consumedOutbox && dispatches.length === 1 &&
        dispatches[0].id === consumedOutbox.id && dispatches[0].consumedAt && !dispatches[0].failedAt;
      if ((!databaseProviderRecovery && checkpoints.length) || (dispatchRecovery && (!unclaimedOutboxSafe || dispatches.length)) ||
          (credentialGuardRecovery && !credentialGuardSafe)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_DATABASE_EXECUTION_OUTCOME_UNCERTAIN" });
      }
      const previousGrant = await readCloudflareProductionDatabaseGrant(db, job.id);
      if (!previousGrant || previousGrant.grantRef !== jobInput.grantRef || previousGrant.tenantId !== tenantId ||
          previousGrant.projectId !== input.projectId || previousGrant.requesterUserId !== ctx.user.id ||
          previousGrant.targetId !== "smartspec-cloudflare-runtime" || previousGrant.environment !== "production" ||
          previousGrant.plan.tunnelId !== input.tunnelId || previousGrant.planDigest !== jobInput.planDigest ||
          previousGrant.revokedAt || (Date.parse(previousGrant.expiresAt) > Date.now() && previousGrant.grantRef !== job.id && !credentialGuardRecovery && !databaseProviderRecovery)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_NOT_RENEWABLE" });
      }
      const target = await resolveCloudflareProductionDeploymentTarget({ db, tenantId, projectId: input.projectId });
      if (!target || target.targetId !== previousGrant.targetId || target.accountRef !== previousGrant.accountRef)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_TARGET_SCOPE_CHANGED" });
      const credential = await getCloudflareDeploymentCredentialState(db, {
        identity: { tenantId, projectId: input.projectId, environment: "production", provider: "cloudflare" },
        credentialRef: target.credentialRef,
      });
      if (credential.status !== "CONFIGURED")
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_CREDENTIAL_NOT_CONFIGURED" });

      // Check dispatch and reconcile the original encrypted credential/VPC
      // before starting a fresh short-lived authorization window.
      const readiness = await (await import("../services/cloudflareExecutionReadiness")).checkCloudflareExecutionReadiness(db);
      if (!readiness.ready) throw new TRPCError({ code: "PRECONDITION_FAILED", message: readiness.reason });
      if (databaseProviderRecovery) {
        const { inspectProductionDatabaseRecovery } = await import("../services/cloudflareProductionDatabaseRecovery");
        const { createCloudflareProductionDatabaseRuntime } = await import("../services/cloudflareProductionDatabaseExecutor");
        try {
          await inspectProductionDatabaseRecovery({ runtime: createCloudflareProductionDatabaseRuntime({ db }),
            jobId: job.id, tenantId, projectId: input.projectId, requesterUserId: ctx.user.id, planDigest: jobInput.planDigest });
        } catch (error) {
          const message = error instanceof Error && /^CLOUDFLARE_[A-Z0-9_]+$/.test(error.message)
            ? error.message : "CLOUDFLARE_PRODUCTION_DATABASE_RECOVERY_INSPECTION_FAILED";
          throw new TRPCError({ code: "PRECONDITION_FAILED", message });
        }
      }
      // Stable same-job identity also reconciles a response lost after grant
      // renewal. It neither replaces the job nor changes its resource plan.
      const providerActionId = productionDatabaseRecoveryActionId(job.id, jobInput.planDigest, providerReadbackRecovery ? 5 : undefined);
      const actionId = databaseProviderRecovery ? providerActionId : credentialGuardRecovery ? consumedOutbox!.attemptId! : job.id;
      const replacementGrantRef = actionId;
      const renewedGrant = await renewCloudflareProductionDatabaseGrant({
        db, jobId: job.id, requesterUserId: ctx.user.id, expectedGrantRef: previousGrant.grantRef,
        replacementGrantRef,
        reauthorizeTerminalFailure: credentialGuardRecovery || databaseProviderRecovery,
        expiresAt: previousGrant.grantRef === replacementGrantRef
          ? previousGrant.expiresAt
          : new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      const recovered = await createJobControlPlane().recoverReviewGatedJob(
        job.id,
        actionId,
        providerReadbackRecovery ? "Owner authorized one same-job Hyperdrive readback recovery after the provider's empty mTLS object was rejected; existing VPC and Hyperdrive verified"
          : providerRecovery ? "Owner authorized one checkpoint-preserving Hyperdrive recovery after CF2015; existing VPC and credential verified"
          : credentialGuardRecovery ? "Owner explicitly authorized one additional attempt after the corrected pre-provider credential guard failure"
          : "Owner reauthorized the same Production database job after the deployed adapter admission repair",
        { disposition: databaseProviderRecovery ? "provider_operation_resolved" : "pre_submission_failure", knownRuntime: providerReadbackRecovery ? "cloudflare_production_database_readback_recovery" : providerRecovery ? "cloudflare_production_database_provider_recovery" : credentialGuardRecovery ? "cloudflare_production_database_credential_guard" : "cloudflare_production_database_dispatch_quarantine",
          operationKey: providerReadbackRecovery ? `production-database-provider-readback:${job.id}:${jobInput.planDigest}:attempt:5` : `${providerRecovery ? "production-database-provider" : credentialGuardRecovery ? "production-database-credential-guard" : "production-database-dispatch"}:${job.id}:${jobInput.planDigest}`, replacementGrantRef: renewedGrant.grantRef,
          replacementGrantExpiresAt: renewedGrant.expiresAt },
        ctx.user.id,
        { tenantId, requestedByUserId: ctx.user.id, authorizationScope: databaseProviderRecovery ? "infrastructure.cloudflare_production_database_provider_reauthorize" : credentialGuardRecovery ? "infrastructure.cloudflare_production_database_guard_reauthorize" : "infrastructure.cloudflare_production_database_recover" },
      );
      if (!recovered) throw new TRPCError({ code: "CONFLICT", message: "CLOUDFLARE_PRODUCTION_DATABASE_JOB_RECOVERY_REJECTED" });
      try {
        auditLogger.log({ eventType: "cloudflare_production_database_job_reauthorized", userId: ctx.user.id,
          requestType: "cloudflare_production_database_job_recovery", responsePayload: { tenantId, projectId: input.projectId,
            jobId: job.id, targetId: target.targetId, environment: "production", planDigest: renewedGrant.planDigest }, statusCode: 202 });
      } catch { /* The canonical operator action is the durable audit record. */ }
      return { jobId: job.id, status: "queued" as const, attempt: job.attempt + 1,
        grantExpiresAt: renewedGrant.expiresAt, planDigest: renewedGrant.planDigest };
    }),

  getLatestCloudflareProductionDatabaseJob: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("production") }).strict())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [job] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, jobType: workerJobs.jobType,
        contractVersion: workerJobs.contractVersion, status: workerJobs.status, errorCode: workerJobs.errorCode,
        operatorReviewRequired: workerJobs.operatorReviewRequired, operatorReviewReason: workerJobs.operatorReviewReason,
        inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson, attempt: workerJobs.attempt,
        maxAttempts: workerJobs.maxAttempts, createdAt: workerJobs.createdAt, startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt, nextRetryAt: workerJobs.nextRetryAt, leaseExpiresAt: workerJobs.leaseExpiresAt,
        heartbeatAt: workerJobs.heartbeatAt })
        .from(workerJobs).where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.jobType, CLOUDFLARE_PRODUCTION_DATABASE_JOB),
          eq(workerJobs.contractVersion, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT),
          sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`,
          sql`${workerJobs.inputJson}->>'targetId' = 'smartspec-cloudflare-runtime'`,
          sql`${workerJobs.inputJson}->>'environment' = 'production'`))
        .orderBy(desc(workerJobs.createdAt)).limit(1);
      if (!job) return null;
      const jobInput = job.inputJson as Record<string, unknown> | null;
      const output = job.outputJson as Record<string, unknown> | null;
      const grant = await readCloudflareProductionDatabaseGrant(db, job.id);
      const { readProductionDatabaseReadbackObservation } = await import("../services/cloudflareProductionDatabaseReconciliation");
      const reconciliation = typeof jobInput?.planDigest === "string" ? await readProductionDatabaseReadbackObservation(db,
        { jobId: job.id, tenantId, projectId: input.projectId, planDigest: jobInput.planDigest }) : null;
      return { jobId: job.id, status: job.status, errorCode: job.errorCode, attempt: job.attempt, maxAttempts: job.maxAttempts,
        reconciliation,
        operatorReviewRequired: job.operatorReviewRequired, operatorReviewReason: job.operatorReviewReason,
        tunnelId: grant?.plan.tunnelId ?? null,
        createdAt: job.createdAt?.toISOString() ?? null, startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null, nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
        leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null, heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
        planDigest: typeof jobInput?.planDigest === "string" ? jobInput.planDigest : null,
        vpcService: output?.vpcService ?? null, hyperdrive: output?.hyperdrive ?? null,
        providerConfigurationVerified: output?.providerConfigurationVerified === true,
        workerBound: output?.workerBound === true, activation: output?.activation === "disabled" ? "disabled" as const : null };
    }),

  revokeCloudflareProductionDatabaseJobGrant: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), jobId: z.string().uuid(), environment: z.literal("production") }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId || !ctx.user?.id) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [job] = await db.select({ inputJson: workerJobs.inputJson }).from(workerJobs)
        .where(and(eq(workerJobs.id, input.jobId), eq(workerJobs.tenantId, tenantId), eq(workerJobs.jobType, CLOUDFLARE_PRODUCTION_DATABASE_JOB),
          eq(workerJobs.contractVersion, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT))).limit(1);
      const jobInput = job?.inputJson as Record<string, unknown> | null;
      if (!job || jobInput?.projectId !== input.projectId || jobInput?.targetId !== "smartspec-cloudflare-runtime" || jobInput?.environment !== "production") {
        throw new TRPCError({ code: "NOT_FOUND", message: "CLOUDFLARE_PRODUCTION_DATABASE_JOB_NOT_FOUND" });
      }
      try { await revokeCloudflareProductionDatabaseGrant(db, input.jobId, ctx.user.id); }
      catch (error) { throw new TRPCError({ code: "FORBIDDEN", message: error instanceof Error ? error.message : "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_DENIED" }); }
      return { jobId: input.jobId, revoked: true as const };
    }),

  getCloudflareProductionQueueJobStatus: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), jobId: z.string().uuid(), environment: z.literal("production") }).strict())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [job] = await db.select({ tenantId: workerJobs.tenantId, jobType: workerJobs.jobType, contractVersion: workerJobs.contractVersion,
        status: workerJobs.status, errorCode: workerJobs.errorCode, inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson,
        attempt: workerJobs.attempt, maxAttempts: workerJobs.maxAttempts, createdAt: workerJobs.createdAt, startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt, scheduledAt: workerJobs.scheduledAt, nextRetryAt: workerJobs.nextRetryAt,
        leaseExpiresAt: workerJobs.leaseExpiresAt, heartbeatAt: workerJobs.heartbeatAt })
        .from(workerJobs).where(and(eq(workerJobs.id, input.jobId), eq(workerJobs.tenantId, tenantId))).limit(1);
      const jobInput = job?.inputJson as Record<string, unknown> | null;
      if (!job || job.jobType !== CLOUDFLARE_PRODUCTION_QUEUE_JOB || job.contractVersion !== CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT || jobInput?.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "CLOUDFLARE_PRODUCTION_QUEUE_JOB_NOT_FOUND" });
      }
      const output = job.outputJson as Record<string, unknown> | null;
      return { jobId: input.jobId, status: job.status, errorCode: job.errorCode,
        attempt: job.attempt, maxAttempts: job.maxAttempts, createdAt: job.createdAt?.toISOString() ?? null,
        startedAt: job.startedAt?.toISOString() ?? null, finishedAt: job.finishedAt?.toISOString() ?? null,
        scheduledAt: job.scheduledAt?.toISOString() ?? null, nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
        leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null, heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
        queueName: typeof output?.queueName === "string" ? output.queueName : null,
        deadLetterQueueName: typeof output?.deadLetterQueueName === "string" ? output.deadLetterQueueName : null,
        providerConfigurationVerified: output?.providerConfigurationVerified === true,
        workerBound: output?.workerBound === true, trafficShifted: output?.trafficShifted === true };
    }),

  getLatestCloudflareProductionQueueJob: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("production") }).strict())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match the Production target" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [job] = await db.select({ id: workerJobs.id, tenantId: workerJobs.tenantId, jobType: workerJobs.jobType,
        contractVersion: workerJobs.contractVersion, status: workerJobs.status, errorCode: workerJobs.errorCode,
        inputJson: workerJobs.inputJson, outputJson: workerJobs.outputJson, attempt: workerJobs.attempt,
        maxAttempts: workerJobs.maxAttempts, createdAt: workerJobs.createdAt, startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt, scheduledAt: workerJobs.scheduledAt, nextRetryAt: workerJobs.nextRetryAt,
        leaseExpiresAt: workerJobs.leaseExpiresAt, heartbeatAt: workerJobs.heartbeatAt })
        .from(workerJobs).where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.jobType, CLOUDFLARE_PRODUCTION_QUEUE_JOB),
          eq(workerJobs.contractVersion, CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT),
          sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`,
          sql`${workerJobs.inputJson}->>'targetId' = 'smartspec-cloudflare-runtime'`,
          sql`${workerJobs.inputJson}->>'environment' = 'production'`))
        .orderBy(desc(workerJobs.createdAt)).limit(1);
      if (!job) return null;
      const output = job.outputJson as Record<string, unknown> | null;
      return { jobId: job.id, status: job.status, errorCode: job.errorCode,
        attempt: job.attempt, maxAttempts: job.maxAttempts, createdAt: job.createdAt?.toISOString() ?? null,
        startedAt: job.startedAt?.toISOString() ?? null, finishedAt: job.finishedAt?.toISOString() ?? null,
        scheduledAt: job.scheduledAt?.toISOString() ?? null, nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
        leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null, heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
        queueName: typeof output?.queueName === "string" ? output.queueName : null,
        deadLetterQueueName: typeof output?.deadLetterQueueName === "string" ? output.deadLetterQueueName : null,
        providerConfigurationVerified: output?.providerConfigurationVerified === true,
        workerBound: output?.workerBound === true, trafficShifted: output?.trafficShifted === true };
    }),

  queueCloudflareStagingDeploy: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.literal("staging") }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant must match staging target" });
      if (!ctx.user?.id || !ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated owner session required" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const preflight = await getCloudflareStagingPreflight(db, input);
      const bootstrap = preflight.reason === "STAGING_BOOTSTRAP_REQUIRED";
      if ((!preflight.ready && !bootstrap) || !preflight.artifact || (!bootstrap && !preflight.baseline) || !preflight.accountRef || !preflight.configurationRef || !preflight.configurationDigest) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: preflight.reason ?? "STAGING_DEPLOY_PREFLIGHT_FAILED" });
      }
      const executorId = process.env.CLOUDFLARE_STAGING_EXECUTOR_ID?.trim();
      if (!executorId || !/^cf-staging-executor:[a-z0-9][a-z0-9._-]{2,119}$/.test(executorId)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "STAGING_EXECUTOR_NOT_CONFIGURED" });
      }
      const runtime = await getAppRuntimeConfig();
      if (!runtime.pythonBackendUrl) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "APPROVAL_AUTHORITY_UNAVAILABLE" });
      const authHeaders = { Authorization: `Bearer ${ctx.userToken}`, Accept: "application/json", "Content-Type": "application/json" };
      const postApproval = async (path: string, body: Record<string, unknown>, stage: "POLICY_CREATE" | "GRANT_CREATE") => {
        const response = await fetch(`${runtime.pythonBackendUrl}${path}`, {
          method: "POST", headers: authHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
        });
        const value = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) {
          const detail = cloudflareApprovalFailureCode(value, response.status, stage);
          throw new TRPCError({ code: response.status === 403 ? "FORBIDDEN" : response.status === 422 ? "BAD_REQUEST" : "BAD_GATEWAY", message: detail });
        }
        return value;
      };
      const operationId = randomUUID();
      const policyExpiresAt = new Date(Date.now() + (bootstrap ? 45 : 3 * 60 + 45) * 60_000).toISOString();
      const grantExpiresAt = new Date(Date.now() + 45 * 60_000).toISOString();
      const candidateRelease = { ...preflight.artifact, configurationRef: preflight.configurationRef, configurationDigest: preflight.configurationDigest };
      const baselineRelease = preflight.baseline ? { artifactRef: preflight.baseline.artifactRef, sourceSha: preflight.baseline.sourceSha, buildDigest: preflight.baseline.buildDigest,
        configurationRef: preflight.baseline.configurationRef, configurationDigest: preflight.baseline.configurationDigest } : null;
      const releases = !baselineRelease || (candidateRelease.artifactRef === baselineRelease.artifactRef && candidateRelease.configurationRef === baselineRelease.configurationRef)
        ? [candidateRelease] : [candidateRelease, baselineRelease];
      let policyId: string | null = null;
      let grantRef: string | null = null;
      let policyCreated = false;
      let canonicalJobCreationStarted = false;
      try {
        const campaign = { contractVersion: "cloudflare-staging-origin-v2", accountRef: preflight.accountRef, executorId, actorUserId: ctx.user.id,
          targetId: CLOUDFLARE_STAGING_TARGET_ID, environment: "staging", releases, maxOperations: bootstrap ? 1 : 4,
          ...(bootstrap ? { allowBootstrap: true } : {}), expiresAt: policyExpiresAt };
        const reusable = await postApproval("/api/v1/approvals/cloudflare-staging-policies/lookup", {
          projectId: input.projectId, definition: campaign,
        }, "POLICY_LOOKUP");
        policyId = typeof reusable?.policyId === "string" ? reusable.policyId : null;
        if (!policyId) {
          const policy = await postApproval("/api/v1/approvals/cloudflare-staging-policies", {
            projectId: input.projectId, definition: campaign,
          }, "POLICY_CREATE");
          policyId = typeof policy.policyId === "string" ? policy.policyId : null;
          policyCreated = true;
        }
        if (!policyId) throw new Error("STAGING_POLICY_CREATE_FAILED");
        const grant = await postApproval("/api/v1/approvals/cloudflare-staging-grants/policy", {
          idempotencyKey: `cf-staging:${operationId}`, policyId, jobId: operationId, projectId: input.projectId, executorId,
          accountRef: preflight.accountRef, schemaVersion: "cloudflare.staging-origin-grant.v2", targetId: CLOUDFLARE_STAGING_TARGET_ID,
          environment: "staging", artifactRef: preflight.artifact.artifactRef, sourceSha: preflight.artifact.sourceSha,
          buildDigest: preflight.artifact.buildDigest, actions: [bootstrap ? "bootstrap" : "deploy"], rollbackDeploymentId: preflight.baseline?.deploymentId ?? null,
          rollbackArtifactRef: preflight.baseline?.artifactRef ?? null, rollbackSourceSha: preflight.baseline?.sourceSha ?? null,
          rollbackBuildDigest: preflight.baseline?.buildDigest ?? null, configurationRef: preflight.configurationRef,
          configurationDigest: preflight.configurationDigest, rollbackConfigurationRef: preflight.baseline?.configurationRef ?? null,
          rollbackConfigurationDigest: preflight.baseline?.configurationDigest ?? null, expiresAt: grantExpiresAt,
        }, "GRANT_CREATE");
        grantRef = typeof grant.id === "string" ? grant.id : null;
        if (!grantRef || grant.status !== "approved") throw new Error("STAGING_GRANT_NOT_APPROVED");
        canonicalJobCreationStarted = true;
        const job = await createControlPlaneJob({
          context: { tenantId, actorType: "user", actorId: ctx.user.id, authorizationScope: "infrastructure.cloudflare_staging_deploy",
            correlationId: ctx.req.requestId ?? operationId, idempotencyKey: `cloudflare-staging-deploy:${operationId}` },
          definition: { contractVersion: "cloudflare-staging-origin-v2", jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB, executionClass: "long", priority: 50,
            input: { contractVersion: "cloudflare-staging-origin-v2", action: bootstrap ? "bootstrap" : "deploy", targetId: CLOUDFLARE_STAGING_TARGET_ID, environment: "staging",
              grantRef, projectId: input.projectId, artifactRef: preflight.artifact.artifactRef, sourceSha: preflight.artifact.sourceSha,
              buildDigest: preflight.artifact.buildDigest, configurationRef: preflight.configurationRef, configurationDigest: preflight.configurationDigest },
            idempotencyKey: `cloudflare-staging-deploy:${operationId}`, activeDedupeKey: `cloudflare-staging-deploy:${preflight.artifact.buildDigest}`,
            retryPolicy: CLOUDFLARE_STAGING_RETRY_POLICY,
            timeoutPolicy: { softTimeoutMs: 60_000, hardTimeoutMs: 15 * 60_000 } },
          createOptions: { runtimeType: "node_job_worker" },
        });
        try {
          auditLogger.log({ eventType: "cloudflare_staging_deploy_queued", userId: ctx.user.id, requestType: bootstrap ? "cloudflare_staging_bootstrap" : "cloudflare_staging_deploy",
            responsePayload: { tenantId, projectId: input.projectId, jobId: job.jobId, grantRef, sourceSha: preflight.artifact.sourceSha,
              buildDigest: preflight.artifact.buildDigest, configurationDigest: preflight.configurationDigest }, statusCode: 202 });
        } catch { /* The canonical job and its outbox remain authoritative if audit projection is temporarily unavailable. */ }
        return { jobId: job.jobId, grantRef, policyId, status: "queued" as const, sourceSha: preflight.artifact.sourceSha, artifactRef: preflight.artifact.artifactRef };
      } catch (error) {
        // Before the canonical insert starts, unused approval state can be revoked.
        // Once job creation starts its transaction outcome may be ambiguous; retain
        // the exact 45-minute, single-job grant so a committed outbox job can run.
        if (!canonicalJobCreationStarted) {
          if (grantRef) await fetch(`${runtime.pythonBackendUrl}/api/v1/approvals/cloudflare-staging-grants/${encodeURIComponent(grantRef)}/revoke`, {
            method: "POST", headers: authHeaders, body: JSON.stringify({ reason: "Canonical staging job creation did not start" }), signal: AbortSignal.timeout(10_000),
          }).catch(() => undefined);
          if (policyCreated && policyId) await fetch(`${runtime.pythonBackendUrl}/api/v1/approvals/cloudflare-staging-policies/${encodeURIComponent(policyId)}/revoke`, {
            method: "POST", headers: authHeaders, signal: AbortSignal.timeout(10_000),
          }).catch(() => undefined);
        }
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_GATEWAY", message: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "STAGING_DEPLOY_QUEUE_FAILED" });
      }
    }),

  createProviderDeploymentTarget: exactAdminProcedure
    .input(z.object({
      tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32),
      provider: z.literal("cloudflare"), deploymentTargetId: z.string().trim().min(1).max(160),
      accountRef: z.string().trim().max(255).nullable().optional(), workerRef: z.string().trim().max(255).nullable().optional(),
      containerApplicationRef: z.string().trim().max(255).nullable().optional(), provenance: z.string().trim().min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { tenantId, projectId, environment, provider, ...target } = input;
      const result = await createProviderDeploymentTarget(db, { identity: { tenantId, projectId, environment, provider }, ...target, actorUserId: ctx.user?.id });
      if (result.status === "TARGET_AUTHORITY_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "An active target already owns this project environment and provider" });
      auditLogger.log({ eventType: "provider_deployment_target_created", userId: ctx.user?.id ?? null,
        requestType: "deployment_target_create", responsePayload: { targetRowId: result.target.id, tenantId, projectId, environment, provider }, statusCode: 201 });
      return result;
    }),

  updateProviderDeploymentTarget: exactAdminProcedure
    .input(z.object({
      tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32),
      provider: z.literal("cloudflare"), targetRowId: z.string().uuid(),
      changes: z.object({ deploymentTargetId: z.string().trim().min(1).max(160), accountRef: z.string().trim().max(255).nullable(),
        workerRef: z.string().trim().max(255).nullable(), containerApplicationRef: z.string().trim().max(255).nullable(),
        credentialRef: z.string().trim().max(255), enabled: z.boolean(), provenance: z.string().trim().min(1).max(500),
        region: z.string().trim().max(100).nullable(), runtimePolicy: z.string().trim().max(160).nullable() }).partial()
        .refine(value => Object.keys(value).length > 0),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { tenantId, projectId, environment, provider, targetRowId, changes } = input;
      const result = await updateProviderDeploymentTarget(db, { identity: { tenantId, projectId, environment, provider }, targetRowId, changes, actorUserId: ctx.user?.id });
      if (result.status === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Deployment target not found in the requested scope" });
      if (result.status === "PERMISSION_DENIED") throw new TRPCError({ code: "FORBIDDEN", message: "Credential reference does not match target scope" });
      if (result.status === "TARGET_AUTHORITY_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "Another active target already owns this project environment and provider" });
      auditLogger.log({ eventType: "provider_deployment_target_updated", userId: ctx.user?.id ?? null,
        requestType: "deployment_target_update", responsePayload: { targetRowId, tenantId, projectId, environment, provider }, statusCode: 200 });
      return result;
    }),

  disableProviderDeploymentTarget: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32),
      provider: z.literal("cloudflare"), targetRowId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const result = await disableProviderDeploymentTarget(db, { identity: input, targetRowId: input.targetRowId, actorUserId: ctx.user?.id });
      if (result.status === "NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Deployment target not found in the requested scope" });
      auditLogger.log({ eventType: "provider_deployment_target_disabled", userId: ctx.user?.id ?? null,
        requestType: "deployment_target_disable", responsePayload: { targetRowId: input.targetRowId, tenantId: input.tenantId, projectId: input.projectId, environment: input.environment, provider: input.provider }, statusCode: 200 });
      return result;
    }),

  getDeploymentCredentialState: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32), provider: z.literal("cloudflare") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const identity = input;
      return getCloudflareDeploymentCredentialState(db, { identity, credentialRef: deploymentCredentialRef(identity) });
    }),

  bindPlatformCloudflareCredentialProfile: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100),
      environment: z.enum(["staging", "production"]), provider: z.literal("cloudflare") }).strict())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      try {
        if (!await isProductionTenantOwner(db, input.tenantId, ctx.user!.id))
          throw new Error("PLATFORM_CREDENTIAL_OWNER_SCOPE_REQUIRED");
        const result = await bindPlatformCloudflareCredentialProfile(db, { identity: input, actorUserId: ctx.user!.id });
        const masked = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;
        auditLogger.log({ eventType: "platform_cloudflare_credential_reference_bound", userId: ctx.user?.id ?? null,
          requestType: "cloudflare_platform_credential_binding", responsePayload: { tenantId: input.tenantId, projectId: input.projectId,
            environment: input.environment, provider: input.provider, workerRef: result.workerRef,
            accountRef: masked(result.accountId), zoneRef: masked(result.zoneId), source: "cloudflare-credential-center:deployment" }, statusCode: 200 });
        return { status: result.status, accountIdMasked: masked(result.accountId), zoneIdMasked: masked(result.zoneId),
          workerRef: result.workerRef, environment: result.environment, source: "platform-credential-center" as const };
      } catch (error) {
        const code = error instanceof Error && /^PLATFORM_CREDENTIAL_[A-Z0-9_]+$/.test(error.message)
          ? error.message : "PLATFORM_CREDENTIAL_BINDING_FAILED";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: code });
      }
    }),

  probeCloudflareDeploymentCredential: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32), provider: z.literal("cloudflare") }).strict())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const target = await resolveProviderDeploymentTarget(db, input);
      if (target.status !== "CONFIGURED" || !target.target?.accountRef) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: target.status === "TARGET_AUTHORITY_CONFLICT"
          ? "TARGET_AUTHORITY_CONFLICT" : target.status === "CONFIGURED" ? "TARGET_ACCOUNT_ID_NOT_CONFIGURED" : "ENABLED_CLOUDFLARE_TARGET_REQUIRED" });
      }
      return probeCloudflareDeploymentCredential(db, input, target.target.accountRef);
    }),

  saveDeploymentCredential: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32),
      provider: z.literal("cloudflare"), token: z.string().trim().min(20).max(512) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { token, ...identity } = input;
      const result = await saveCloudflareDeploymentCredential(db, { identity, token, actorUserId: ctx.user?.id });
      auditLogger.log({ eventType: "provider_deployment_credential_configured", userId: ctx.user?.id ?? null,
        requestType: "deployment_credential_save", responsePayload: { credentialRef: result.credentialRef, tenantId: identity.tenantId,
          projectId: identity.projectId, environment: identity.environment, provider: identity.provider }, statusCode: 200 });
      return result;
    }),

  revokeDeploymentCredential: exactAdminProcedure
    .input(z.object({ tenantId: deploymentTenantIdSchema, projectId: z.string().trim().min(1).max(100), environment: z.string().trim().min(1).max(32), provider: z.literal("cloudflare") }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const result = await revokeCloudflareDeploymentCredential(db, { identity: input, credentialRef: deploymentCredentialRef(input), actorUserId: ctx.user?.id });
      auditLogger.log({ eventType: "provider_deployment_credential_revoked", userId: ctx.user?.id ?? null,
        requestType: "deployment_credential_revoke", responsePayload: { status: result.status, tenantId: input.tenantId,
          projectId: input.projectId, environment: input.environment, provider: input.provider }, statusCode: 200 });
      return result;
    }),

  getInternalRuntimeEvidence: exactAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    return getInternalRuntimeEvidence({ db });
  }),

  getSpec224DatabaseDiagnostics: exactAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    return getSpec224DatabaseDiagnostics({ db });
  }),

  getProjectWikiHostedRoutePreflight: exactAdminProcedure
    .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() }).strict())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return composeProjectWikiHostedRoutePreflight({ db, ...input });
    }),

  requestProjectWikiStagingApproval: exactAdminProcedure
    .input(projectWikiStagingEnvelopeSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.identity.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Approval request must match the authenticated tenant" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated user token required" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const repository = createDrizzleProjectWikiCandidateRepository(db);
      if (!await repository.isActiveBinding(input.identity)) throw new TRPCError({ code: "FORBIDDEN", message: "Project Wiki app is not actively bound to this project" });
      const approval = await createProjectWikiApprovalRequest({ envelope: input, userToken: ctx.userToken });
      auditLogger.log({ eventType: "project_wiki_staging_approval_requested", userId: ctx.user?.id ?? null,
        requestType: "project_wiki_staging_approval", requestPayload: { approvalRef: approval.id, tenantId, projectId: input.identity.projectId,
          packageDigest: input.candidate.packageDigest, archiveSha256: input.candidate.archiveSha256, targetId: input.target.targetId }, statusCode: 201 });
      return { approvalRef: approval.id, expiresAt: approval.expiresAt, status: "pending" as const };
    }),

  requestProjectWikiStagingProvisioningApproval: exactAdminProcedure
    .input(projectWikiStagingProvisioningRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!projectWikiProvisioningIntentMatchesTenant(input, tenantId)) throw new TRPCError({ code: "FORBIDDEN", message: "Provisioning request must match the authenticated tenant" });
      if (!ctx.userToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated user token required" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const identity = { ...input.identity };
      if (!await createDrizzleProjectWikiCandidateRepository(db).isActiveBinding(identity)) throw new TRPCError({ code: "FORBIDDEN", message: "Project Wiki app is not actively bound to this project" });
      const approval = await createProjectWikiProvisioningApprovalRequest({ request: input, userToken: ctx.userToken });
      auditLogger.log({ eventType: "project_wiki_staging_provisioning_approval_requested", userId: ctx.user?.id ?? null,
        requestType: "project_wiki_staging_provisioning", requestPayload: { approvalRef: approval.id, tenantId, projectId: input.identity.projectId,
          accountId: input.target.cloudflareAccountId, credentialRef: input.target.credentialRef,
          targetName: input.target.deploymentTargetName, databaseName: input.database.desiredName,
          budget: input.budget, migrationPlan: input.database.migrationPlan }, statusCode: 201 });
      return { approvalRef: approval.id, expiresAt: approval.expiresAt, status: "pending" as const, mutationPerformed: false as const };
    }),

  registerProjectWikiReleaseCandidate: exactAdminProcedure
    .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), approvalRef: z.string().uuid(), archiveBase64: z.string().min(1).max(32_768) }).strict())
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Candidate registration must match the authenticated tenant" });
      if (!ctx.userToken || !ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated user token required" });
      const archiveBytes = Buffer.from(input.archiveBase64, "base64");
      if (archiveBytes.toString("base64") !== input.archiveBase64) throw new TRPCError({ code: "BAD_REQUEST", message: "Archive must use canonical base64 encoding" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const identity = { tenantId, projectId: input.projectId, appId: PROJECT_WIKI_CANDIDATE.appId } as const;
      try {
        const result = await registerProjectWikiReleaseCandidate({ identity, approvalRef: input.approvalRef,
          archiveBytes, actorUserId: ctx.user.id }, {
          repository: createDrizzleProjectWikiCandidateRepository(db), storage: projectWikiCandidateStorage,
          resolveApproval: ref => fetchProjectWikiApprovalRequest(ref, ctx.userToken!), createId: randomUUID,
        });
        auditLogger.log({ eventType: "project_wiki_release_candidate_registered", userId: ctx.user.id,
          requestType: "project_wiki_candidate_register", responsePayload: { candidateId: result.candidate.id, tenantId, projectId: input.projectId,
            packageDigest: result.candidate.packageDigest, archiveSha256: result.candidate.archiveSha256, created: result.created }, statusCode: result.created ? 201 : 200 });
        return result;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof Error && "code" in error) {
          const code = String((error as Error & { code: unknown }).code);
          if (code.includes("SCOPE") || code.includes("BINDING") || code.includes("APPROVAL")) throw new TRPCError({ code: "FORBIDDEN", message: code });
          if (code.includes("STORAGE") || code.includes("PERSISTENCE") || code.includes("CONCURRENT")) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: code });
          throw new TRPCError({ code: "BAD_REQUEST", message: code });
        }
        throw error;
      }
    }),

  getProjectWikiReleaseCandidate: exactAdminProcedure
    .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() }).strict())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
      if (!tenantId || tenantId !== input.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Candidate lookup must match the authenticated tenant" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      try {
        return await readProjectWikiReleaseCandidate({ tenantId, projectId: input.projectId, appId: PROJECT_WIKI_CANDIDATE.appId },
          createDrizzleProjectWikiCandidateRepository(db), projectWikiCandidateStorage);
      } catch (error) {
        if (error instanceof Error && "code" in error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String((error as Error & { code: unknown }).code) });
        throw error;
      }
    }),

  updateCloudflareAccountId: rateLimitedAdminProcedure
    .input(z.object({ accountId: z.string().trim().regex(/^[a-f0-9]{32}$/i) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // vectorizeAccountId is the existing canonical setting. The center reads and
      // updates this row so old Vectorize callers stay synchronized without a copy.
      await upsertSetting(db, "vectorizeAccountId", input.accountId, ctx.user?.id, false, "vectordb");
      clearVectorProviderConfigCache();
      return { success: true };
    }),

  updateLegacyVectorizeToken: rateLimitedAdminProcedure
    .input(z.object({ token: z.string().trim().min(20).max(512) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // Keep the existing Vectorize secret as the single source of truth.
      await upsertSetting(db, "vectorizeApiToken", input.token, ctx.user?.id, true, "vectordb");
      clearVectorProviderConfigCache();
      return { success: true, configured: true };
    }),

  saveCloudflareCredential: rateLimitedAdminProcedure
    .input(z.object({
      profileId: z.enum(["audit", "deployment"]),
      label: z.string().trim().min(1).max(64),
      token: z.string().trim().min(20).max(512),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await saveCloudflareCredentialProfile(db, input.profileId, input.token, input.label, ctx.user?.id);
      return { success: true, configured: true };
    }),

  removeCloudflareCredential: rateLimitedAdminProcedure
    .input(z.object({ profileId: z.enum(["audit", "deployment"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await removeCloudflareCredentialProfile(db, input.profileId, ctx.user?.id);
      return { success: true };
    }),

  probeCloudflareCredential: rateLimitedAdminProcedure
    .input(z.object({ profileId: z.enum(["audit", "deployment", "vectorize"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return probeCloudflareCredential(db, input.profileId);
    }),

  probeCloudflarePermissionCatalog: rateLimitedAdminProcedure
    .input(z.object({ profileId: z.enum(["audit", "deployment", "vectorize"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return probeCloudflarePermissionCatalog(db, input.profileId);
    }),

  getMcpRuntimeConfig: adminProcedure.query(async () => {
    await refreshMcpRuntimeConfigCache();
    const snapshot = getMcpRuntimeConfigForAdmin();
    return {
      ...snapshot,
      defaults: { scopesSupported: [...MCP_OAUTH_DEFAULT_SCOPES] },
    };
  }),

  updateMcpRuntimeConfig: rateLimitedAdminProcedure
    .input(z.object({
      modern_protocol_enabled: z.boolean(),
      oauth_inbound_enabled: z.boolean(),
      oauth_protected_resource_enabled: z.boolean(),
      oauth_authorization_server_enabled: z.boolean(),
      oauth_dynamic_registration_enabled: z.boolean(),
      public_base_url: z.string().trim().url(),
      oauth_issuer: z.string().trim().url(),
      oauth_resource: z.string().trim().url(),
      oauth_jwks_uri: z.string().trim().url(),
      oauth_audience: z.string().trim().min(1).max(256),
      oauth_authorization_servers: z.string().trim().max(4096),
      oauth_scopes_supported: z.string().trim().min(1).max(4096),
      cors_allowed_origins: z.string().trim().max(4096),
      session_allowed_origins: z.string().trim().max(4096),
      session_ttl_seconds: z.number().int().min(300).max(86_400),
      workspace_root: z.string().trim().max(1024),
      workspace_write_enabled: z.boolean(),
      workspace_write_token: z.string().max(512).optional(),
      max_read_bytes: z.number().int().min(1_024).max(50 * 1024 * 1024),
      max_write_bytes: z.number().int().min(1_024).max(50 * 1024 * 1024),
      extension_allowlist: z.string().trim().max(4096),
      mcp_rpm: z.number().int().min(10).max(10_000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      for (const key of MCP_RUNTIME_UPDATE_KEYS) {
        const value = input[key];
        if (key === "workspace_write_token" && value === "") continue;
        await upsertSetting(
          db,
          key,
          String(value),
          ctx.user?.id,
          key === "workspace_write_token",
          MCP_RUNTIME_CATEGORY,
        );
      }
      await refreshMcpRuntimeConfigCache();
      if (input.oauth_authorization_server_enabled && !getMcpRuntimeConfigForAdmin().keyConfigured) {
        await provisionMcpOAuthSigningKey(db, ctx.user?.id);
        await refreshMcpRuntimeConfigCache();
      }
      return { success: true, config: getMcpRuntimeConfigForAdmin() };
    }),

  generateMcpOAuthSigningKey: rateLimitedAdminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const kid = await provisionMcpOAuthSigningKey(db, ctx.user?.id);
    await refreshMcpRuntimeConfigCache();
    return { success: true, kid, config: getMcpRuntimeConfigForAdmin() };
  }),

  // ----------------------------------------------------------
  // Retired Google runtime configuration
  // ----------------------------------------------------------

  getGcpConfig: adminProcedure.query(async () => ({
    status: "retired" as const,
    target: "cloudflare" as const,
    message: "Google Cloud runtime configuration is retired. Google OAuth and Drive product integrations remain available.",
    gcp_project_id: { value: "", source: "none" as const },
    gcp_region: { value: "", source: "none" as const },
    cloud_run_python_url: { value: "", source: "none" as const },
    cloud_run_node_url: { value: "", source: "none" as const },
    cloud_run_sa_email: { value: "", source: "none" as const },
  })),

  updateGcpConfig: rateLimitedAdminProcedure
    .input(z.object({}))
    .mutation(async () => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Google Cloud runtime is retired; configure the Cloudflare deployment pipeline instead.",
      });
    }),

  getAppRuntimeConfig: adminProcedure.query(async () => {
    const db = await getDb();
    const dbValues: Record<string, { value: string; isSensitive: boolean }> = {};
    if (db) {
      const rows = await db.select().from(systemSettings).where(eq(systemSettings.category, CATEGORY));
      for (const row of rows) {
        if (APP_RUNTIME_CONFIG_KEYS.includes(row.key as any)) {
          dbValues[row.key] = {
            value: readSettingValue(row as any),
            isSensitive: row.isSensitive ?? false,
          };
        }
      }
    }

    const result: Record<string, { value: string; maskedValue: string; source: "db" | "env" | "none" }> = {};
    for (const key of APP_RUNTIME_CONFIG_KEYS) {
      const isSensitive = APP_RUNTIME_SENSITIVE_KEYS.has(key);
      if (dbValues[key]?.value) {
        const val = dbValues[key].value;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive ? maskApiKey(val) : val,
          source: "db",
        };
      } else if (process.env[APP_RUNTIME_ENV_FALLBACK[key]]) {
        const val = process.env[APP_RUNTIME_ENV_FALLBACK[key]]!;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive ? maskApiKey(val) : val,
          source: "env",
        };
      } else {
        result[key] = { value: "", maskedValue: "", source: "none" };
      }
    }

    return result;
  }),

  updateAppRuntimeConfig: rateLimitedAdminProcedure
    .input(z.object({
      python_backend_url: z.string().url().or(z.literal("")).optional(),
      smartspec_proxy_token: z.string().max(512).optional(),
      smartspec_web_gateway_token: z.string().max(512).optional(),
      smartspec_mcp_token: z.string().max(512).optional(),
      smartspec_internal_url: z.string().url().or(z.literal("")).optional(),
      node_server_internal_url: z.string().url().or(z.literal("")).optional(),
      upload_post_api_base_url: z.string().url().or(z.literal("")).optional(),
      public_url: z.string().url().or(z.literal("")).optional(),
      app_public_url: z.string().url().or(z.literal("")).optional(),
      app_url: z.string().url().or(z.literal("")).optional(),
      s3_endpoint: z.string().url().or(z.literal("")).optional(),
      r2_public_url: z.string().url().or(z.literal("")).optional(),
      oauth_server_url: z.string().url().or(z.literal("")).optional(),
      forge_api_url: z.string().url().or(z.literal("")).optional(),
      forge_api_key: z.string().max(512).optional(),
      llm_gateway_service_account_id: z.string().regex(/^\d*$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      for (const key of APP_RUNTIME_CONFIG_KEYS) {
        const value = input[key];
        if (value !== undefined) {
          const sensitive = APP_RUNTIME_SENSITIVE_KEYS.has(key);
          if (sensitive && value === "") continue;
          await upsertSetting(db, key, value, ctx.user?.id, sensitive);
        }
      }

      await refreshAppRuntimeConfigCache();

      return { success: true };
    }),

  // ----------------------------------------------------------
  // Task Processing Mode (Cloudflare only)
  // ----------------------------------------------------------

  getTaskProcessingMode: adminProcedure.query(async () => ({
    mode: "cloudflare" as const,
    source: "hard_cutover" as const,
    runtime: cloudflareRuntimeStatus(),
  })),

  setTaskProcessingMode: rateLimitedAdminProcedure
    .input(
      z.object({
        mode: z.literal("cloudflare"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      console.log(`[infra-audit] Cloudflare runtime is fixed; requested by user=${ctx.user?.id}`);
      return { success: true, mode: "cloudflare" as const };
    }),

  // ----------------------------------------------------------
  // Queue Status Dashboard
  // ----------------------------------------------------------

  getQueueDashboard: adminProcedure.query(async () => {
    const [queues, deadLetterCount, failedTasks] = await Promise.all([
      getAllQueueMetrics(),
      getDeadLetterCount(),
      getFailedTaskEvents(10),
    ]);

    return {
      queues,
      deadLetterCount,
      failedTasks: failedTasks.map((t: any) => ({
        id: t.id,
        taskId: t.taskId,
        queueName: t.queueName,
        status: t.status,
        attemptCount: t.attemptCount,
        errorMessage: t.errorMessage,
        createdAt: t.createdAt,
      })),
      currentMode: "cloudflare" as const,
    };
  }),

  // ----------------------------------------------------------
  // Cache Configuration
  // ----------------------------------------------------------

  getSearchResultCacheConfig: adminProcedure.query(async () => {
    const db = await getDb();
    let provider = "disabled";
    if (db) {
      const [row] = await db.select({ value: systemSettings.value }).from(systemSettings)
        .where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, "search_result_cache_provider"))).limit(1);
      if (row?.value === "cloudflare_kv") provider = "cloudflare_kv";
    }
    return { provider, endpointConfigured: Boolean(process.env.CLOUDFLARE_RUNTIME_URL), tokenConfigured: Boolean(process.env.CLOUDFLARE_SEARCH_CACHE_TOKEN) };
  }),

  probeSearchResultCache: rateLimitedAdminProcedure.mutation(async () => {
    const baseUrl = process.env.CLOUDFLARE_RUNTIME_URL?.trim().replace(/\/$/, "");
    const token = process.env.CLOUDFLARE_SEARCH_CACHE_TOKEN?.trim();
    if (!baseUrl || !token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ตั้งค่า CLOUDFLARE_RUNTIME_URL และ CLOUDFLARE_SEARCH_CACHE_TOKEN ก่อน" });
    try {
      const response = await fetch(`${baseUrl}/internal/cache/search`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ operation: "probe" }), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Worker ตอบ HTTP ${response.status}`);
      const result = await response.json() as { ready?: boolean };
      if (result.ready !== true) throw new Error("Worker ยังไม่พร้อมหรือไม่มี SEARCH_RESULT_CACHE binding");
      return { ready: true };
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "ตรวจ Worker ไม่สำเร็จ" });
    }
  }),

  updateSearchResultCacheProvider: rateLimitedAdminProcedure
    .input(z.object({ provider: z.enum(["disabled", "cloudflare_kv"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      if (input.provider === "cloudflare_kv") {
        const baseUrl = process.env.CLOUDFLARE_RUNTIME_URL?.trim().replace(/\/$/, "");
        const token = process.env.CLOUDFLARE_SEARCH_CACHE_TOKEN?.trim();
        if (!baseUrl || !token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Worker endpoint/token ยังตั้งค่าไม่ครบ" });
        try {
          const response = await fetch(`${baseUrl}/internal/cache/search`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ operation: "probe" }), signal: AbortSignal.timeout(5000) });
          if (!response.ok || (await response.json() as { ready?: boolean }).ready !== true) throw new Error("Worker หรือ KV binding ยังไม่พร้อม");
        } catch (error) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Cloudflare KV probe ไม่สำเร็จ" });
        }
      }
      await upsertSetting(db, "search_result_cache_provider", input.provider, ctx.user?.id, false);
      refreshSearchResultCacheProvider();
      return { success: true, provider: input.provider };
    }),

  getMonitoringConfig: adminProcedure.query(async () => {
    const db = await getDb();

    const dbValues: Record<string, { value: string; isSensitive: boolean }> = {};
    if (db) {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.category, CATEGORY));
      for (const row of rows) {
        if (MONITORING_CONFIG_KEYS.includes(row.key as any)) {
          dbValues[row.key] = {
            value: readSettingValue(row as any),
            isSensitive: row.isSensitive ?? false,
          };
        }
      }
    }

    const result: Record<string, { value: string; maskedValue: string; source: "db" | "env" | "none" }> = {};
    for (const key of MONITORING_CONFIG_KEYS) {
      const isSensitive = MONITORING_SENSITIVE_KEYS.has(key);
      if (dbValues[key]?.value) {
        const val = dbValues[key].value;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive
            ? (key.includes("dsn") ? maskDsn(val) : maskApiKey(val))
            : val,
          source: "db",
        };
      } else if (process.env[MONITORING_ENV_FALLBACK[key]]) {
        const val = process.env[MONITORING_ENV_FALLBACK[key]]!;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive
            ? (key.includes("dsn") ? maskDsn(val) : maskApiKey(val))
            : val,
          source: "env",
        };
      } else {
        result[key] = { value: "", maskedValue: "", source: "none" };
      }
    }

    return result;
  }),

  updateMonitoringConfig: rateLimitedAdminProcedure
    .input(
      z.object({
        sentry_dsn_node: z.string().max(512).optional(),
        sentry_dsn_python: z.string().max(512).optional(),
        analytics_provider: z.enum(["posthog", "ga4", "both", "none"]).optional(),
        posthog_api_key_node: z.string().max(256).optional(),
        posthog_api_key_python: z.string().max(256).optional(),
        posthog_host: z.string().max(256).optional(),
        ga4_measurement_id: z.string().max(64).optional(),
        ga4_api_secret: z.string().max(256).optional(),
        firebase_api_key: z.string().max(256).optional(),
        firebase_project_id: z.string().max(128).optional(),
        log_level: z.enum(["debug", "info", "warn", "error"]).optional(),
        sentry_traces_sample_rate: z.string().max(10).optional(),
        sentry_environment: z.enum(["development", "staging", "production"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      for (const key of MONITORING_CONFIG_KEYS) {
        const value = input[key];
        if (value !== undefined) {
          const sensitive = MONITORING_SENSITIVE_KEYS.has(key);
          // Skip empty strings for sensitive keys — means "keep existing value"
          if (sensitive && value === "") continue;
          await upsertSetting(db, key, value, ctx.user?.id, sensitive);
        }
      }

      return { success: true };
    }),

  getMonitoringStatus: adminProcedure.query(async () => {
    const sentryNodeDsn = process.env.SENTRY_DSN_NODE;
    const sentryPythonDsn = process.env.SENTRY_DSN;
    const posthogKey = process.env.POSTHOG_API_KEY;
    const ga4MeasurementId = process.env.GA4_MEASUREMENT_ID;
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    const logLevel = process.env.LOG_LEVEL || "info";

    return {
      sentry: {
        nodeConfigured: !!sentryNodeDsn,
        pythonConfigured: !!sentryPythonDsn,
        environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
        tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE || "0.05",
      },
      posthog: {
        configured: !!posthogKey,
        host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      },
      ga4: {
        configured: !!ga4MeasurementId,
        measurementId: ga4MeasurementId ? `${ga4MeasurementId.slice(0, 4)}...` : "",
      },
      firebase: {
        configured: !!firebaseApiKey,
        projectId: process.env.FIREBASE_PROJECT_ID || "",
      },
      analyticsProvider: process.env.ANALYTICS_PROVIDER || "posthog",
      logging: {
        level: logLevel,
      },
    };
  }),

  getSystemHealth: adminProcedure.query(async () => {
    const { ENV } = await import("../_core/env");
    const baseUrl = ENV.pythonBackendUrl || "http://localhost:8000";

    try {
      const res = await fetchWithResilience(`${baseUrl}/api/v1/health/system`, {
        headers: { "Content-Type": "application/json" },
        timeoutMs: 5000,
        retryPolicy: "transient",
        label: "infrastructure.getSystemHealth",
      });

      if (!res.ok) {
        return { status: "error" as const, error: `HTTP ${res.status}`, services: null };
      }

      const data = await res.json();
      return {
        status: data.status as string,
        timestamp: data.timestamp as string,
        responseTimeMs: data.response_time_ms as number,
        services: data.services as Record<string, any>,
      };
    } catch (err: any) {
      return {
        status: "unreachable" as const,
        error: err.message ?? "Python backend unreachable",
        services: null,
      };
    }
  }),

  // ----------------------------------------------------------
  // Scale Tier Management
  // ----------------------------------------------------------

  getScaleTier: adminProcedure.query(async () => {
    const db = await getDb();

    let tier: ScaleTierId = detectCurrentTier();
    let appliedAt: string | null = null;

    if (db) {
      const [tierRow] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CATEGORY),
            eq(systemSettings.key, "scale_tier"),
          ),
        )
        .limit(1);

      if (tierRow?.value && SCALE_TIER_IDS.includes(tierRow.value as ScaleTierId)) {
        tier = tierRow.value as ScaleTierId;
      }

      const [appliedAtRow] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CATEGORY),
            eq(systemSettings.key, "scale_tier_applied_at"),
          ),
        )
        .limit(1);

      if (appliedAtRow?.value) {
        appliedAt = appliedAtRow.value;
      }
    }

    const deployModeResult = await getDeployMode();

    return {
      tier,
      appliedAt,
      config: SCALE_TIERS[tier],
      allTiers: Object.values(SCALE_TIERS),
      deployMode: deployModeResult.mode,
      deployModeSource: deployModeResult.source,
    };
  }),

  setScaleTier: rateLimitedAdminProcedure
    .input(
      z.object({
        tier: z.enum(["starter", "growth", "pro", "business", "enterprise"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      console.log(`[infra-audit] setScaleTier: user=${ctx.user?.id}, tier=${input.tier}`);
      await upsertSetting(db, "scale_tier", input.tier, ctx.user?.id);

      return { success: true as const, tier: input.tier as ScaleTierId };
    }),

  applyScaleTier: rateLimitedAdminProcedure
    .input(
      z.object({
        tier: z.enum(["starter", "growth", "pro", "business", "enterprise"]),
        mode: z.enum(["localhost", "cloudflare"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const startTime = Date.now();
      console.log(`[infra-audit] applyScaleTier: user=${ctx.user?.id}, tier=${input.tier}, mode=${input.mode ?? "auto"}`);

      // 1. Persist the tier selection
      await upsertSetting(db, "scale_tier", input.tier, ctx.user?.id);

      // 2. Apply configuration across all services (mode-aware)
      const results: ApplyStepResult[] = await applyTierConfig(
        input.tier as ScaleTierId,
        input.mode as DeployMode | undefined,
      );

      // 3. Record the timestamp of the last successful apply
      await upsertSetting(
        db,
        "scale_tier_applied_at",
        new Date().toISOString(),
        ctx.user?.id,
      );

      const errors = results.filter((r) => r.status === "error");
      console.log(`[infra-audit] applyScaleTier complete: tier=${input.tier}, steps=${results.length}, errors=${errors.length}, durationMs=${Date.now() - startTime}`);

      return { success: true as const, results };
    }),

  // ----------------------------------------------------------
  // Content Automation Feature Flag
  // ----------------------------------------------------------

  getContentAutomationEnabled: protectedProcedure.query(async () => {
    const enabled = await getFeatureFlag("ENABLE_CONTENT_AUTOMATION");
    return { contentAutomation: enabled };
  }),

  // ----------------------------------------------------------
  // Deploy Mode Management
  // ----------------------------------------------------------

  getDeployModeInfo: adminProcedure.query(async () => {
    const result = await getDeployMode();
    return { ...result, target: "cloudflare" as const, runtime: cloudflareRuntimeStatus() };
  }),

  setDeployModeInfo: rateLimitedAdminProcedure
    .input(z.object({ mode: z.enum(["localhost", "cloudflare"]) }))
    .mutation(async ({ input, ctx }) => {
      console.log(`[infra-audit] setDeployMode: user=${ctx.user?.id}, mode=${input.mode}`);
      await setDeployMode(input.mode as DeployMode, ctx.user?.id);
      return { success: true, mode: input.mode };
    }),
});
