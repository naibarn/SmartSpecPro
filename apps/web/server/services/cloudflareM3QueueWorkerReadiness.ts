import type { CloudflareStagingBundle } from "./cloudflareStagingApiTransport";

const M3_PARITY_JOB_PREFIX = "cloudflare.production.m3.parity.acceptance.";
const M3_PARITY_CONTRACT = "cloudflare-m3-parity-acceptance-v1";
const QUEUE_NAME = "smartspec-canonical-job-queue-production";

export type ActiveWorkerVersion = Readonly<{
  checked: boolean;
  hasVerifiedReleaseIdentity: boolean;
  sourceSha?: string;
  buildDigest?: string;
  bindingNames: readonly string[];
}>;

/** Verifies that the active provider version is the exact immutable bundle
 * whose code contains the M3 queue contracts. A Linux release or a ready Node
 * outbox transport alone cannot establish Cloudflare consumer readiness. */
export async function verifyM3QueueWorkerReadiness(
  version: ActiveWorkerVersion | null | undefined,
  resolveBundle: (
    artifactRef: string,
    sourceSha: string
  ) => Promise<Pick<
    CloudflareStagingBundle,
    "sourceSha" | "buildDigest" | "moduleFiles"
  > | null>
) {
  if (
    !version?.checked ||
    !version.hasVerifiedReleaseIdentity ||
    !version.sourceSha ||
    !version.buildDigest
  ) {
    return {
      ready: false as const,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED" as const,
    };
  }
  if (!version.bindingNames.includes("JOB_QUEUE")) {
    return {
      ready: false as const,
      reason: "M3_PARITY_PRODUCTION_QUEUE_BINDING_NOT_ACTIVE" as const,
    };
  }
  const artifactRef = `sha256:${version.buildDigest}`;
  const bundle = await resolveBundle(artifactRef, version.sourceSha).catch(
    () => null
  );
  if (
    !bundle ||
    bundle.sourceSha.toLowerCase() !== version.sourceSha.toLowerCase() ||
    bundle.buildDigest.toLowerCase() !== version.buildDigest.toLowerCase()
  ) {
    return {
      ready: false as const,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_ARTIFACT_NOT_VERIFIED" as const,
    };
  }
  const modules = Object.values(bundle.moduleFiles).map(file =>
    new TextDecoder().decode(file.bytes)
  );
  const source = modules.join("\n");
  const queueContractReady =
    source.includes(`${M3_PARITY_JOB_PREFIX}credit_billing_acceptance`) &&
    source.includes(`${M3_PARITY_JOB_PREFIX}queue_recovery_acceptance`) &&
    source.includes(M3_PARITY_CONTRACT) &&
    source.includes(QUEUE_NAME);
  return queueContractReady
    ? {
        ready: true as const,
        reason: null,
        sourceSha: version.sourceSha,
        buildDigest: version.buildDigest,
        artifactRef,
      }
    : {
        ready: false as const,
        reason: "M3_PARITY_CLOUDFLARE_WORKER_CONTRACT_NOT_ACTIVE" as const,
      };
}
