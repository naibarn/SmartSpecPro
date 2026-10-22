import { CLOUDFLARE_STAGING_ORIGIN_GRANT, cloudflareStagingOriginGrantSchema } from "./cloudflareStagingOriginContract";
import { getDb } from "../db";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { systemSettings } from "../../drizzle/schema";
import { createHttpApplicationProvisionPorts, prepareHttpApplicationImages, ensureHttpApplications } from "./cloudflareHttpApplicationProvision";
import type { CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import {
  getAppRuntimeConfig,
} from "./appRuntimeConfig";
import {
  CLOUDFLARE_STAGING_TARGET_ID,
  bindCloudflareStagingDeploymentAuthorities,
  type CloudflareStagingDeploymentRuntime,
  type CloudflareStagingGrant,
} from "./cloudflareStagingDeploymentExecutor";
import { createCloudflareStagingApiTransport } from "./cloudflareStagingApiTransport";
import { createCloudflareNativeProvisionRuntime } from "./cloudflareNativeProvisionExecutor";
import { verifyNativeProviderResources } from "./cloudflareNativeBindingDescriptor";
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
  actions: Array<"deploy" | "rollback" | "bootstrap">;
  rollbackDeploymentId: string | null;
  rollbackArtifactRef: string | null;
  rollbackSourceSha: string | null;
  rollbackBuildDigest: string | null;
  expiresAt: string;
  revokedAt: null;
  jobId?: string;
  accountRef?: string;
};

function parseGrant(value: unknown): CloudflareStagingGrant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if ((value as { schemaVersion?: unknown }).schemaVersion === CLOUDFLARE_STAGING_ORIGIN_GRANT) {
    const parsed = cloudflareStagingOriginGrantSchema.safeParse(value);
    return parsed.success ? { ...parsed.data, revoked: false } : null;
  }
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
    grant.actions.some(action => action !== "deploy" && action !== "rollback" && action !== "bootstrap") ||
    (typeof grant.rollbackDeploymentId !== "string" && grant.rollbackDeploymentId !== null) ||
    (typeof grant.rollbackArtifactRef !== "string" && grant.rollbackArtifactRef !== null) ||
    (typeof grant.rollbackSourceSha !== "string" && grant.rollbackSourceSha !== null) ||
    (typeof grant.rollbackBuildDigest !== "string" && grant.rollbackBuildDigest !== null) ||
    typeof grant.expiresAt !== "string" ||
    ((grant.jobId !== undefined || grant.accountRef !== undefined) && (typeof grant.jobId !== "string" || !/^[a-f0-9-]{36}$/i.test(grant.jobId) || typeof grant.accountRef !== "string" || !/^[a-f0-9]{32}$/i.test(grant.accountRef))) ||
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

/** Resolve a grant through the existing approval authority before creating its
 * canonical job. The approval service revalidates owner policy, expiry,
 * revocation and the exact staging scope on every read. */
export async function resolveCloudflareStagingGrantForJobCreation(
  rawGrantRef: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudflareStagingGrant | null> {
  const grantRef = assertGrantRef(rawGrantRef);
  const config = await getAppRuntimeConfig();
  if (!config.webGatewayToken) throw new Error("CLOUDFLARE_STAGING_GRANT_AUTH_UNAVAILABLE");
  const url = `${config.pythonBackendUrl}/api/v1/approvals/internal/cloudflare-staging-grants/${encodeURIComponent(grantRef)}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { "x-internal-token": config.webGatewayToken, Accept: "application/json" },
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
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
  const grant = parseGrant((envelope as { grant?: unknown }).grant);
  return grant?.grantRef === grantRef ? grant : null;
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
  const applicationPorts = async (origin: CloudflareOriginVersionBindings, assertAuthorized: () => Promise<void>) => {
    await assertAuthorized();
    const db = getDb();
    // The existing immutable configuration store owns its actor; neither a
    // job field nor an HTTP header can select another credential owner.
    const rows = await db.select({ updatedBy: systemSettings.updatedBy, isSensitive: systemSettings.isSensitive })
      .from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_origin_versions"), eq(systemSettings.key, origin.configurationRef))).limit(2);
    if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].updatedBy) throw new Error("CLOUDFLARE_HTTP_APPLICATION_CONFIG_OWNER_DENIED");
    const scope = { ...origin.descriptor, actorUserId: rows[0].updatedBy };
    return { scope, ports: createHttpApplicationProvisionPorts(db, scope, assertAuthorized, fetchImpl) };
  };
  const cloudflare = createCloudflareStagingApiTransport({
    resolveBundle: resolveCloudflareStagingBundle,
    fetchImpl,
    verifyNativeResources: async (descriptor, target) => createCloudflareNativeProvisionRuntime({ fetchImpl }).withCredential({
      tenantId: target.tenantId, projectId: target.projectId, environment: "staging", provider: "cloudflare",
    }, token => verifyNativeProviderResources({ descriptor, accountRef: target.accountRef, token, fetchImpl })),
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
  const runtime = bindCloudflareStagingDeploymentAuthorities({
    db: getDb(),
    cloudflare,
    resolveArtifact: resolveCloudflareStagingArtifact,
    resolveGrant: rawGrantRef => resolveCloudflareStagingGrantForJobCreation(rawGrantRef, fetchImpl),
    executorIdentity: async binding => {
      const attempt: CloudflareStagingExecutorAttemptBinding = {
        jobId: binding.jobId,
        tenantId: binding.tenantId,
        target: binding.target,
        artifactSha256: binding.artifactSha256,
        action: binding.action,
        idempotencyKey: binding.idempotencyKey,
        ...(binding.originAuthority ? { originAuthority: binding.originAuthority } : {}),
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
