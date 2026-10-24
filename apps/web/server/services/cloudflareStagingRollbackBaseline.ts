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
 * receipt identifies the deployment that is currently serving at Cloudflare.
 * The baseline may use an older still-valid origin configuration: changing the
 * candidate config must not turn an existing deployment into a first-deploy
 * bootstrap or authorize replacing an unowned Worker.
 */
export async function findVerifiedStagingRollbackBaseline(input: {
  candidates: StagingRollbackCandidate[];
  projectId: string;
  activeDeploymentId: string;
  activeDeploymentIsSingleVersion: boolean;
  resolveArtifact: (artifactRef: string, sourceSha: string) => Promise<{ immutable: boolean; buildDigest: string } | null>;
  isConfigurationUsable: (configurationRef: string, configurationDigest: string) => Promise<boolean>;
}): Promise<VerifiedStagingRollbackBaseline | null> {
  for (const candidate of input.candidates) {
    const { input: job, output } = candidate;
    const configurationRef = job.configurationRef;
    const configurationDigest = output.configurationDigest;
    if (job.projectId !== input.projectId || job.environment !== "staging" ||
        job.contractVersion !== "cloudflare-staging-origin-v2" || output.runtimeVerified !== true ||
        output.deploymentId !== input.activeDeploymentId || output.configurationRef !== configurationRef || !input.activeDeploymentIsSingleVersion ||
        output.sourceSha !== job.sourceSha || output.buildDigest !== job.buildDigest ||
        typeof job.artifactRef !== "string" || typeof job.sourceSha !== "string" || typeof job.buildDigest !== "string" ||
        typeof configurationRef !== "string" || typeof configurationDigest !== "string" || !/^cf-origin:[a-f0-9]{64}$/.test(configurationRef) ||
        job.configurationDigest !== configurationDigest || configurationDigest !== configurationRef.slice("cf-origin:".length)) continue;

    if (!await input.isConfigurationUsable(configurationRef, configurationDigest)) continue;
    const artifact = await input.resolveArtifact(job.artifactRef, job.sourceSha);
    if (!artifact?.immutable || artifact.buildDigest !== job.buildDigest) continue;
    return { deploymentId: input.activeDeploymentId, artifactRef: job.artifactRef, sourceSha: job.sourceSha,
      buildDigest: job.buildDigest, configurationRef, configurationDigest };
  }
  return null;
}
