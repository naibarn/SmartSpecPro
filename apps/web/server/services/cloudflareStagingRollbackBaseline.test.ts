import { describe, expect, it, vi } from "vitest";
import { findVerifiedStagingRollbackBaseline, type StagingRollbackCandidate } from "./cloudflareStagingRollbackBaseline";

const digest = "a".repeat(64);
const candidate: StagingRollbackCandidate = {
  input: { projectId: "project-1", environment: "staging", contractVersion: "cloudflare-staging-origin-v2",
    artifactRef: "artifact:baseline", sourceSha: "1".repeat(40), buildDigest: "b".repeat(64),
    configurationRef: `cf-origin:${digest}`, configurationDigest: digest },
  output: { runtimeVerified: true, deploymentId: "deployment-current", configurationRef: `cf-origin:${digest}`, configurationDigest: digest,
    sourceSha: "1".repeat(40), buildDigest: "b".repeat(64) },
};
const fixture = (changes: { input?: Record<string, unknown>; output?: Record<string, unknown> } = {}) => ({
  candidates: [{ ...candidate, ...changes }], projectId: "project-1", activeDeploymentId: "deployment-current", activeDeploymentIsSingleVersion: true,
  resolveArtifact: vi.fn(async () => ({ immutable: true, buildDigest: "b".repeat(64) })),
  isConfigurationUsable: vi.fn(async () => true),
});

describe("findVerifiedStagingRollbackBaseline", () => {
  it("accepts an active verified baseline with an older configuration than the current candidate", async () => {
    const input = fixture();
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toMatchObject({
      deploymentId: "deployment-current", configurationRef: `cf-origin:${digest}`, configurationDigest: digest,
    });
  });

  it("rejects a canonical receipt that is not the exact active provider deployment and version", async () => {
    const input = fixture({ output: { ...candidate.output, deploymentId: "another-deployment" } });
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toBeNull();
    expect(input.resolveArtifact).not.toHaveBeenCalled();
  });

  it("rejects revoked, expired, or unavailable origin configuration versions", async () => {
    const input = fixture();
    input.isConfigurationUsable.mockResolvedValue(false);
    await expect(findVerifiedStagingRollbackBaseline(input)).resolves.toBeNull();
    expect(input.resolveArtifact).not.toHaveBeenCalled();
  });
});
