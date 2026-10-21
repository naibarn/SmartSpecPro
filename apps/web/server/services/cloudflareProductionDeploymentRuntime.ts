import { getDb } from "../db";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
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
  const stagingVersionTransport = createCloudflareStagingApiTransport({ resolveBundle: resolveCloudflareStagingBundle, fetchImpl });
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
