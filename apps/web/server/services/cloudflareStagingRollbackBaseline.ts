export type StagingRollbackCandidate = {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type VerifiedStagingRollbackBaseline = {
  deploymentId: string;
  artifactRef: string;
  sourceSha: string;
  buildDigest: string;
  configurationRef: string;
  configurationDigest: string;
};

/** A Full HTTP profile can expire before its enclosing origin configuration.
 * Such a config is not a directly usable rollback baseline; expired versions
 * must pass the separate exact-renewal compatibility check. */
export function isStoredStagingRollbackConfigurationUsable(stored: {
  status?: unknown;
  configurationRef?: unknown;
  configurationDigest?: unknown;
  applicationPreparation?: { applicationHttpExpired?: unknown } | null;
} | null | undefined, configurationRef: string, configurationDigest: string): boolean {
  return stored?.status === "STORED" && stored.configurationRef === configurationRef &&
    stored.configurationDigest === configurationDigest && stored.applicationPreparation?.applicationHttpExpired === false;
}

/**
 * Prove the active Worker belongs to a succeeded canonical receipt, then select
 * the newest available verified release whose origin configuration remains a
 * safe rollback target. An expired active Full HTTP config must not hide an
 * earlier valid Queue release or turn an existing Worker into first-deploy
 * bootstrap. Unowned active deployments still fail closed.
 */
export async function findVerifiedStagingRollbackBaseline(input: {
  candidates: StagingRollbackCandidate[];
  projectId: string;
  activeDeploymentId: string;
  activeDeploymentIsSingleVersion: boolean;
  activeVersionId?: string | null;
  isActiveVersionFromVerifiedDeployment?: (deploymentId: string, activeVersionId: string) => Promise<boolean>;
  isRollbackDeploymentAvailable: (deploymentId: string) => Promise<boolean>;
  isConfigurationUsable: (configurationRef: string, configurationDigest: string) => Promise<boolean>;
}): Promise<VerifiedStagingRollbackBaseline | null> {
  if (!input.activeDeploymentIsSingleVersion ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.activeDeploymentId)) return null;

  const verifiedCandidates = input.candidates.flatMap(candidate => {
    const { input: job, output } = candidate;
    const configurationRef = job.configurationRef;
    const configurationDigest = output.configurationDigest;
    if (job.projectId !== input.projectId || job.environment !== "staging" ||
        job.contractVersion !== "cloudflare-staging-origin-v2" || output.runtimeVerified !== true ||
        typeof output.deploymentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(output.deploymentId) ||
        output.configurationRef !== configurationRef ||
        output.sourceSha !== job.sourceSha || output.buildDigest !== job.buildDigest ||
        typeof job.artifactRef !== "string" || typeof job.sourceSha !== "string" || !/^[a-f0-9]{40}$/i.test(job.sourceSha) ||
        typeof job.buildDigest !== "string" || !/^[a-f0-9]{64}$/i.test(job.buildDigest) ||
        job.artifactRef !== `sha256:${job.buildDigest}` ||
        typeof configurationRef !== "string" || typeof configurationDigest !== "string" || !/^cf-origin:[a-f0-9]{64}$/.test(configurationRef) ||
        job.configurationDigest !== configurationDigest || configurationDigest !== configurationRef.slice("cf-origin:".length)) return [];
    return [{ deploymentId: output.deploymentId, artifactRef: job.artifactRef, sourceSha: job.sourceSha,
      buildDigest: job.buildDigest, configurationRef, configurationDigest }];
  });

  // The active deployment may be owned but no longer a safe rollback. Find the
  // active receipt independently, then select the newest usable verified release.
  let activeDeploymentOwned = false;
  for (const verified of verifiedCandidates) {
    if (verified.deploymentId === input.activeDeploymentId) {
      activeDeploymentOwned = true;
      break;
    }
    if (typeof input.activeVersionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.activeVersionId) &&
        input.isActiveVersionFromVerifiedDeployment &&
        await input.isActiveVersionFromVerifiedDeployment(verified.deploymentId, input.activeVersionId)) {
      activeDeploymentOwned = true;
      break;
    }
  }
  if (!activeDeploymentOwned) return null;

  for (const verified of verifiedCandidates) {
    const { deploymentId, artifactRef, sourceSha, buildDigest, configurationRef, configurationDigest } = verified;
    if (!await input.isConfigurationUsable(configurationRef, configurationDigest)) continue;
    if (deploymentId !== input.activeDeploymentId && !await input.isRollbackDeploymentAvailable(deploymentId)) continue;
    // Rollback reuses the immutable deployed Worker version by deployment ID.
    // The executor verifies its SHA/digest/config annotations against this
    // canonical runtime-verified receipt before any provider mutation, so the
    // old upload bundle need not remain in the current build-results cache.
    return { deploymentId, artifactRef, sourceSha, buildDigest, configurationRef, configurationDigest };
  }
  return null;
}
