import { getDb } from "../db";
import {
  getAppRuntimeConfig,
  getPreferredInternalToken,
} from "./appRuntimeConfig";
import {
  CLOUDFLARE_STAGING_TARGET_ID,
  bindCloudflareStagingDeploymentAuthorities,
  type CloudflareStagingDeploymentRuntime,
  type CloudflareStagingGrant,
} from "./cloudflareStagingDeploymentExecutor";
import { createCloudflareStagingApiTransport } from "./cloudflareStagingApiTransport";
import {
  createCloudflareStagingExecutorProof,
  verifyCloudflareStagingExecutorProof,
  type CloudflareStagingExecutorAttemptBinding,
} from "./cloudflareStagingExecutorIdentityService";
import {
  resolveCloudflareStagingArtifact,
  resolveCloudflareStagingBundle,
} from "./cloudflareStagingArtifactAuthority";

type GrantDocument = {
  schemaVersion: "cloudflare.staging-deployment-grant.v1";
  grantRef: string;
  tenantId: string;
  requesterUserId: number;
  projectId: string;
  executorId: string;
  targetId: typeof CLOUDFLARE_STAGING_TARGET_ID;
  environment: "staging";
  artifactRef: string;
  sourceSha: string;
  buildDigest: string;
  actions: Array<"deploy" | "rollback">;
  rollbackDeploymentId: string;
  rollbackArtifactRef: string;
  rollbackSourceSha: string;
  rollbackBuildDigest: string;
  expiresAt: string;
  revokedAt: null;
};

function parseGrant(value: unknown): CloudflareStagingGrant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const grant = value as Partial<GrantDocument>;
  if (
    grant.schemaVersion !== "cloudflare.staging-deployment-grant.v1" ||
    typeof grant.grantRef !== "string" ||
    typeof grant.tenantId !== "string" ||
    !Number.isSafeInteger(grant.requesterUserId) ||
    typeof grant.projectId !== "string" ||
    typeof grant.executorId !== "string" ||
    grant.targetId !== CLOUDFLARE_STAGING_TARGET_ID ||
    grant.environment !== "staging" ||
    typeof grant.artifactRef !== "string" ||
    typeof grant.sourceSha !== "string" ||
    typeof grant.buildDigest !== "string" ||
    !Array.isArray(grant.actions) ||
    grant.actions.length === 0 ||
    grant.actions.some(action => action !== "deploy" && action !== "rollback") ||
    typeof grant.rollbackDeploymentId !== "string" ||
    typeof grant.rollbackArtifactRef !== "string" ||
    typeof grant.rollbackSourceSha !== "string" ||
    typeof grant.rollbackBuildDigest !== "string" ||
    typeof grant.expiresAt !== "string" ||
    grant.revokedAt !== null
  ) {
    return null;
  }
  return { ...grant, revoked: false } as CloudflareStagingGrant;
}

function assertGrantRef(grantRef: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(grantRef)) {
    throw new Error("CLOUDFLARE_STAGING_GRANT_REF_INVALID");
  }
  return grantRef;
}

/**
 * Compose the existing grant, target/credential, artifact, executor identity,
 * and Cloudflare transport authorities. All external inputs are server-side;
 * absent authority/configuration remains fail-closed in the job executor.
 */
export function createCloudflareStagingDeploymentRuntime(input: {
  fetchImpl?: typeof fetch;
  resolvePrivateKey?: () => Promise<{
    executorId: string;
    privateKey: string;
  } | null>;
} = {}): CloudflareStagingDeploymentRuntime | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  const fetchImpl = input.fetchImpl ?? fetch;
  const cloudflare = createCloudflareStagingApiTransport({
    resolveBundle: resolveCloudflareStagingBundle,
    fetchImpl,
  });
  const runtime = bindCloudflareStagingDeploymentAuthorities({
    db: getDb(),
    cloudflare,
    resolveArtifact: resolveCloudflareStagingArtifact,
    resolveGrant: async rawGrantRef => {
      const grantRef = assertGrantRef(rawGrantRef);
      const [config, token] = await Promise.all([
        getAppRuntimeConfig(),
        getPreferredInternalToken(),
      ]);
      if (!token) throw new Error("CLOUDFLARE_STAGING_GRANT_AUTH_UNAVAILABLE");
      const url = `${config.pythonBackendUrl}/api/v1/approvals/internal/cloudflare-staging-grants/${encodeURIComponent(grantRef)}`;
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { "x-internal-token": token, Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("CLOUDFLARE_STAGING_GRANT_RESOLVER_FAILED");
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new Error("CLOUDFLARE_STAGING_GRANT_RESPONSE_INVALID");
      }
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope))
        return null;
      const grant = parseGrant((envelope as { grant?: unknown }).grant);
      return grant?.grantRef === grantRef ? grant : null;
    },
    executorIdentity: async binding => {
      const attempt: CloudflareStagingExecutorAttemptBinding = {
        jobId: binding.jobId,
        tenantId: binding.tenantId,
        target: binding.target,
        artifactSha256: binding.artifactSha256,
        action: binding.action,
        idempotencyKey: binding.idempotencyKey,
      };
      const proof = await createCloudflareStagingExecutorProof(attempt, {
        resolvePrivateKey: input.resolvePrivateKey,
      });
      return verifyCloudflareStagingExecutorProof(proof, {
        expectedBinding: attempt,
      });
    },
  });
  return runtime;
}
