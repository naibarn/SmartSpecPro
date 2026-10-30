import { describe, expect, it, vi } from "vitest";
import { findVerifiedStagingRollbackBaseline, type StagingRollbackCandidate } from "./cloudflareStagingRollbackBaseline";

const digest = "a".repeat(64);
const candidate: StagingRollbackCandidate = {
  input: { projectId: "project-1", environment: "staging", contractVersion: "cloudflare-staging-origin-v2",
    artifactRef: `sha256:${"b".repeat(64)}`, sourceSha: "1".repeat(40), buildDigest: "b".repeat(64),
    configurationRef: `cf-origin:${digest}`, configurationDigest: digest },
  output: { runtimeVerified: true, deploymentId: "33333333-3333-4333-8333-333333333333", configurationRef: `cf-origin:${digest}`, configurationDigest: digest,
    sourceSha: "1".repeat(40), buildDigest: "b".repeat(64) },
};
const fixture = (changes: { input?: Record<string, unknown>; output?: Record<string, unknown> } = {}) => ({
  candidates: [{ ...candidate, ...changes }], projectId: "project-1", activeDeploymentId: "33333333-3333-4333-8333-333333333333", activeDeploymentIsSingleVersion: true,
  isConfigurationUsable: vi.fn(async () => true),
});

describe("findVerifiedStagingRollbackBaseline", () => {
  it("accepts an active verified deployment from its canonical receipt without requiring its old bundle to remain cached", async () => {
    const input = fixture();
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toMatchObject({
      deploymentId: "33333333-3333-4333-8333-333333333333", artifactRef: `sha256:${"b".repeat(64)}`, sourceSha: "1".repeat(40),
      buildDigest: "b".repeat(64), configurationRef: `cf-origin:${digest}`, configurationDigest: digest,
    });
  });

  it("rejects a canonical receipt that is not the exact active provider deployment and version", async () => {
    const input = fixture({ output: { ...candidate.output, deploymentId: "another-deployment" } });
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toBeNull();
  });

  it("accepts a new rollback deployment only when Cloudflare confirms its immutable version matches a prior receipt", async () => {
    const priorDeploymentId = "33333333-3333-4333-8333-333333333333";
    const activeDeploymentId = "44444444-4444-4444-8444-444444444444";
    const activeVersionId = "55555555-5555-4555-8555-555555555555";
    const isActiveVersionFromVerifiedDeployment = vi.fn(async (deploymentId: string, versionId: string) =>
      deploymentId === priorDeploymentId && versionId === activeVersionId);
    const baseline = fixture({ output: { ...candidate.output, deploymentId: priorDeploymentId } });
    const input = { ...baseline, activeDeploymentId, activeVersionId, isActiveVersionFromVerifiedDeployment };
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toMatchObject({
      deploymentId: activeDeploymentId, sourceSha: "1".repeat(40), buildDigest: "b".repeat(64), configurationDigest: digest,
    });
    expect(isActiveVersionFromVerifiedDeployment).toHaveBeenCalledWith(priorDeploymentId, activeVersionId);
    await expect(findVerifiedStagingRollbackBaseline({ ...input,
      isActiveVersionFromVerifiedDeployment: vi.fn(async () => false) })).resolves.toBeNull();
  });

  it("rejects revoked, expired, or unavailable origin configuration versions", async () => {
    const input = fixture();
    input.isConfigurationUsable.mockResolvedValue(false);
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toBeNull();
  });

  it("rejects an artifact reference that is not bound to its canonical content digest", async () => {
    const input = fixture({ input: { ...candidate.input, artifactRef: `sha256:${"c".repeat(64)}` } });
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toBeNull();
  });
});
