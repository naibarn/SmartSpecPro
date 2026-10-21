import { createHash } from "node:crypto";
import { getDb } from "../db";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { and, eq } from "drizzle-orm";
import { systemSettings } from "../../drizzle/schema";
import { createHttpApplicationProvisionPorts, ensureHttpApplications, prepareHttpApplicationImages } from "./cloudflareHttpApplicationProvision";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { withCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";
import {
  cloudflareProductionDeploymentGrantSchema,
  resolveCloudflareProductionDeploymentTarget,
  type CloudflareProductionDeploymentGrant,
} from "./cloudflareProductionDeploymentContract";
import { createCloudflareProductionCanaryTransport } from "./cloudflareProductionCanaryTransport";
import { createCloudflareStagingApiTransport } from "./cloudflareStagingApiTransport";
import { resolveCloudflareStagingArtifact, resolveCloudflareStagingBundle } from "./cloudflareStagingArtifactAuthority";
import { createCloudflareProductionDeploymentExecutor, type CloudflareProductionDeploymentRuntime } from "./cloudflareProductionDeploymentExecutor";

function parseGrant(value: unknown): CloudflareProductionDeploymentGrant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = cloudflareProductionDeploymentGrantSchema.safeParse(value);
  return parsed.success ? { ...parsed.data, revoked: false } : null;
}

/** Compose production operations only from the existing tenant target, credential, immutable config, artifact, and approval authorities. */
export function createCloudflareProductionDeploymentRuntime(input: { fetchImpl?: typeof fetch } = {}): CloudflareProductionDeploymentRuntime | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  const db = getDb();
  const fetchImpl = input.fetchImpl ?? fetch;
  const applicationPorts = async (origin: import("./cloudflareOriginVersionBindings").CloudflareOriginVersionBindings,
    assertAuthorized: () => Promise<void>) => {
    await assertAuthorized();
    const rows = await db.select({ updatedBy: systemSettings.updatedBy, isSensitive: systemSettings.isSensitive })
      .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_origin_versions"), eq(systemSettings.key, origin.configurationRef))).limit(2);
    if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].updatedBy) throw new Error("CLOUDFLARE_HTTP_APPLICATION_CONFIG_OWNER_DENIED");
    const scope = { ...origin.descriptor, actorUserId: rows[0].updatedBy };
    return { scope, ports: createHttpApplicationProvisionPorts(db, scope, assertAuthorized, fetchImpl) };
  };
  const stagingVersionTransport = createCloudflareStagingApiTransport({ resolveBundle: resolveCloudflareStagingBundle, fetchImpl,
    prepareHttpApplications: async (origin, _target, assertAuthorized) => {
      const { scope, ports } = await applicationPorts(origin, assertAuthorized);
      await prepareHttpApplicationImages(origin.descriptor.applicationHttp!, scope, ports,
        origin.descriptor.applicationHttpPhase === "namespace-only" ? origin.descriptor.expiresAt : undefined);
    },
    ensureHttpApplications: async (origin, _target, version, operationKey, assertAuthorized) => {
      const { scope, ports } = await applicationPorts(origin, assertAuthorized);
      return ensureHttpApplications(origin.descriptor.applicationHttp!, scope, version,
        createHash("sha256").update(`${origin.configurationRef}|${operationKey}`).digest("hex"), ports);
    },
  });
  const canaryTransport = createCloudflareProductionCanaryTransport({ fetchImpl });

  return {
    resolveExecutorId: () => process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim() || null,
    now: () => new Date(),
    resolveArtifact: resolveCloudflareStagingArtifact,
    resolveTarget: identity => resolveCloudflareProductionDeploymentTarget({ db, ...identity }),
    resolveGrant: async grantRef => {
      if (!/^[a-f0-9-]{36}$/i.test(grantRef)) return null;
      const config = await getAppRuntimeConfig();
      if (!config.webGatewayToken) throw new Error("CLOUDFLARE_PRODUCTION_GRANT_AUTH_UNAVAILABLE");
      const url = `${config.pythonBackendUrl}/api/v1/approvals/internal/cloudflare-production-grants/${encodeURIComponent(grantRef)}`;
      const response = await fetchImpl(url, { method: "GET", headers: { "x-internal-token": config.webGatewayToken, Accept: "application/json" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("CLOUDFLARE_PRODUCTION_GRANT_RESOLVER_FAILED");
      let envelope: unknown;
      try { envelope = await response.json(); } catch { throw new Error("CLOUDFLARE_PRODUCTION_GRANT_RESPONSE_INVALID"); }
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
      const grant = parseGrant((envelope as { grant?: unknown }).grant);
      return grant?.grantRef === grantRef ? grant : null;
    },
    withOriginConfiguration: ({ target, configurationRef, configurationDigest, operation }) => withCloudflareOriginConfiguration(db, {
      identity: { tenantId: target.tenantId, projectId: target.projectId, environment: "production", provider: "cloudflare" },
      configurationRef, configurationDigest,
    }, operation),
    withCredential: ({ target, operation }) => withCloudflareDeploymentCredential(db, {
      identity: { tenantId: target.tenantId, projectId: target.projectId, environment: "production", provider: "cloudflare" },
      credentialRef: target.credentialRef,
    }, operation),
    prepareVersion: input => stagingVersionTransport.prepareVersion({ ...input, target: input.target }),
    canary: input => canaryTransport.canary(input),
    promote: input => canaryTransport.promote(input),
    rollback: input => canaryTransport.rollback(input),
  };
}

export function getConfiguredCloudflareProductionDeploymentExecutor() {
  return createCloudflareProductionDeploymentExecutor(createCloudflareProductionDeploymentRuntime);
}
