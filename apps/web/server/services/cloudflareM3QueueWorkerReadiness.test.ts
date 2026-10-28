import { describe, expect, it, vi } from "vitest";
import { verifyM3QueueWorkerReadiness } from "./cloudflareM3QueueWorkerReadiness";

const sourceSha = "a".repeat(40);
const buildDigest = "b".repeat(64);
const base = {
  checked: true,
  hasVerifiedReleaseIdentity: true,
  sourceSha,
  buildDigest,
  bindingNames: ["JOB_QUEUE"],
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
    ).resolves.toMatchObject({ ready: true, sourceSha, buildDigest });
  });

  it("fails closed when active version metadata or Queue binding is absent", async () => {
    const resolve = vi.fn();
    await expect(
      verifyM3QueueWorkerReadiness(null, resolve)
    ).resolves.toMatchObject({
      ready: false,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED",
    });
    await expect(
      verifyM3QueueWorkerReadiness({ ...base, bindingNames: [] }, resolve)
    ).resolves.toMatchObject({
      ready: false,
      reason: "M3_PARITY_PRODUCTION_QUEUE_BINDING_NOT_ACTIVE",
    });
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
});
