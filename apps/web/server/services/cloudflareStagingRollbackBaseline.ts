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

/**
 * Resolve a rollback baseline only when a succeeded canonical job's immutable
 * receipt identifies the active deployment or Cloudflare confirms that a new
 * deployment ID serves the exact same immutable Worker version.
 * The baseline may use an older still-valid origin configuration, or an expired
 * version only when the active immutable config is its exact verified DB-lease
 * renewal. Changing the candidate config must not turn an existing deployment
 * into a first-deploy bootstrap or authorize replacing an unowned Worker.
 */
export async function findVerifiedStagingRollbackBaseline(input: {
  candidates: StagingRollbackCandidate[];
  projectId: string;
  activeDeploymentId: string;
  activeDeploymentIsSingleVersion: boolean;
  activeVersionId?: string | null;
  isActiveVersionFromVerifiedDeployment?: (deploymentId: string, activeVersionId: string) => Promise<boolean>;
  isConfigurationUsable: (configurationRef: string, configurationDigest: string) => Promise<boolean>;
}): Promise<VerifiedStagingRollbackBaseline | null> {
  for (const candidate of input.candidates) {
    const { input: job, output } = candidate;
    const configurationRef = job.configurationRef;
    const configurationDigest = output.configurationDigest;
    if (job.projectId !== input.projectId || job.environment !== "staging" ||
        job.contractVersion !== "cloudflare-staging-origin-v2" || output.runtimeVerified !== true ||
        typeof input.activeDeploymentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.activeDeploymentId) ||
        typeof output.deploymentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(output.deploymentId) ||
        output.configurationRef !== configurationRef || !input.activeDeploymentIsSingleVersion ||
        output.sourceSha !== job.sourceSha || output.buildDigest !== job.buildDigest ||
        typeof job.artifactRef !== "string" || typeof job.sourceSha !== "string" || !/^[a-f0-9]{40}$/i.test(job.sourceSha) ||
        typeof job.buildDigest !== "string" || !/^[a-f0-9]{64}$/i.test(job.buildDigest) ||
        job.artifactRef !== `sha256:${job.buildDigest}` ||
        typeof configurationRef !== "string" || typeof configurationDigest !== "string" || !/^cf-origin:[a-f0-9]{64}$/.test(configurationRef) ||
        job.configurationDigest !== configurationDigest || configurationDigest !== configurationRef.slice("cf-origin:".length)) continue;
    if (!await input.isConfigurationUsable(configurationRef, configurationDigest)) continue;

    const sameActiveDeployment = output.deploymentId === input.activeDeploymentId;
    const sameVerifiedVersion = !sameActiveDeployment &&
      typeof input.activeVersionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.activeVersionId) &&
      input.isActiveVersionFromVerifiedDeployment
      ? await input.isActiveVersionFromVerifiedDeployment(output.deploymentId, input.activeVersionId)
      : false;
    if (!sameActiveDeployment && !sameVerifiedVersion) continue;
    // Rollback reuses the immutable deployed Worker version by deployment ID.
    // The executor verifies its SHA/digest/config annotations against this
    // canonical runtime-verified receipt, so the old upload bundle need not be
    // retained in the current build-results cache.
    return { deploymentId: input.activeDeploymentId, artifactRef: job.artifactRef, sourceSha: job.sourceSha,
      buildDigest: job.buildDigest, configurationRef, configurationDigest };
  }
  return null;
}
