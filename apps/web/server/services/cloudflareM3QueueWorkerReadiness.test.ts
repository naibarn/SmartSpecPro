import { describe, expect, it, vi } from "vitest";
import { verifyM3QueueWorkerReadiness } from "./cloudflareM3QueueWorkerReadiness";

const sourceSha = "a".repeat(40);
const buildDigest = "b".repeat(64);
const deploymentId = "33333333-3333-4333-8333-333333333333";
const base = {
  deploymentId,
  versions: [{
    versionId: "81e64be8-af01-4efb-ad82-94e78da2510b",
    deploymentId,
    percentage: 100,
  checked: true,
  hasVerifiedReleaseIdentity: true,
  sourceSha,
  buildDigest,
  configurationDigest: "c".repeat(64),
  bindingNames: ["JOB_QUEUE", "CF_VERSION_METADATA"],
  }],
  queueId: "a".repeat(32),
  expectedQueueId: "a".repeat(32),
  queueConsumersComplete: true,
  consumers: [{ consumerId: "c".repeat(32), queueName: "smartspec-canonical-job-queue-production",
    scriptName: "smartspec-cloudflare-runtime", deadLetterQueueName: "smartspec-canonical-job-queue-production-dlq" }],
};

function bundle(source: string) {
  return {
    sourceSha,
    buildDigest,
    moduleFiles: {
      "index.js": {
        contentType: "application/javascript+module",
        bytes: new TextEncoder().encode(source),
      },
    },
  };
}

describe("M3 active Cloudflare Queue Worker readiness", () => {
  it("accepts only the exact immutable active bundle with both parity contracts", async () => {
    const resolve = vi.fn(async (artifactRef: string, sha: string) => {
      expect(artifactRef).toBe(`sha256:${buildDigest}`);
      expect(sha).toBe(sourceSha);
      return bundle(
        [
          "cloudflare.production.m3.parity.acceptance.credit_billing_acceptance",
          "cloudflare.production.m3.parity.acceptance.queue_recovery_acceptance",
          "cloudflare-m3-parity-acceptance-v1",
          "smartspec-canonical-job-queue-production",
        ].join("\n")
      );
    });
    await expect(
      verifyM3QueueWorkerReadiness(base, resolve)
    ).resolves.toMatchObject({ ready: true, deploymentId, queueId: "a".repeat(32),
      versions: [{ sourceSha, buildDigest }] });
  });

  it("accepts a verified two-version active deployment only when both versions and the real consumer match", async () => {
    const second = { ...base.versions[0]!, versionId: "92f40f82-179d-4b94-8a2f-30c6fa0ce63a", percentage: 1,
      sourceSha: "c".repeat(40), buildDigest: "d".repeat(64) };
    const first = { ...base.versions[0]!, percentage: 99 };
    const resolve = vi.fn(async (artifactRef: string, sha: string) => ({
      ...bundle("cloudflare.production.m3.parity.acceptance.credit_billing_acceptance cloudflare.production.m3.parity.acceptance.queue_recovery_acceptance cloudflare-m3-parity-acceptance-v1 smartspec-canonical-job-queue-production"),
      sourceSha: sha,
      buildDigest: artifactRef.slice("sha256:".length),
    }));
    await expect(verifyM3QueueWorkerReadiness({ ...base, versions: [first, second] }, resolve))
      .resolves.toMatchObject({ ready: true, versions: [{ percentage: 99 }, { percentage: 1 }] });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("fails closed when active version metadata or Queue binding is absent", async () => {
    const resolve = vi.fn();
    await expect(
      verifyM3QueueWorkerReadiness({ ...base, deploymentId: null }, resolve)
    ).resolves.toMatchObject({
      ready: false,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED",
    });
    await expect(
      verifyM3QueueWorkerReadiness({ ...base, versions: [{ ...base.versions[0]!, bindingNames: [] }] }, resolve)
    ).resolves.toMatchObject({
      ready: false,
      reason: "M3_PARITY_PRODUCTION_QUEUE_BINDING_NOT_ACTIVE",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects malformed deployment identity, subminimum weights, and duplicate active versions", async () => {
    const resolve = vi.fn();
    await expect(verifyM3QueueWorkerReadiness({ ...base, deploymentId: "deployment-a" }, resolve))
      .resolves.toMatchObject({ ready: false, reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED" });
    await expect(verifyM3QueueWorkerReadiness({ ...base, versions: [{ ...base.versions[0]!, percentage: 0.001 }] }, resolve))
      .resolves.toMatchObject({ ready: false, reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED" });
    await expect(verifyM3QueueWorkerReadiness({ ...base, versions: [base.versions[0]!, base.versions[0]!] }, resolve))
      .resolves.toMatchObject({ ready: false, reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects a missing or identity-mismatched immutable artifact", async () => {
    await expect(
      verifyM3QueueWorkerReadiness(base, async () => null)
    ).resolves.toMatchObject({
      ready: false,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_ARTIFACT_NOT_VERIFIED",
    });
    await expect(
      verifyM3QueueWorkerReadiness(base, async () => ({
        ...bundle(""),
        sourceSha: "c".repeat(40),
      }))
    ).resolves.toMatchObject({
      ready: false,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_ARTIFACT_NOT_VERIFIED",
    });
  });

  it("rejects an immutable active release whose source lacks the M3 consumer contract", async () => {
    await expect(
      verifyM3QueueWorkerReadiness(base, async () =>
        bundle("old Worker release")
      )
    ).resolves.toMatchObject({
      ready: false,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_CONTRACT_NOT_ACTIVE",
    });
  });

  it("requires the exact provisioned queue and matching Worker/DLQ consumer readback", async () => {
    await expect(verifyM3QueueWorkerReadiness({ ...base, queueId: "f".repeat(32) }, vi.fn()))
      .resolves.toMatchObject({ ready: false, reason: "M3_PARITY_PRODUCTION_QUEUE_CONSUMER_READBACK_REQUIRED" });
    await expect(verifyM3QueueWorkerReadiness({ ...base, queueConsumersComplete: false }, vi.fn()))
      .resolves.toMatchObject({ ready: false, reason: "M3_PARITY_PRODUCTION_QUEUE_CONSUMER_READBACK_REQUIRED" });
    await expect(verifyM3QueueWorkerReadiness({ ...base, consumers: [] }, vi.fn()))
      .resolves.toMatchObject({ ready: false, reason: "M3_PARITY_PRODUCTION_QUEUE_CONSUMER_NOT_CONFIGURED" });
  });
});
