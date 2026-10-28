import type { CloudflareStagingBundle } from "./cloudflareStagingApiTransport";

const M3_PARITY_JOB_PREFIX = "cloudflare.production.m3.parity.acceptance.";
const M3_PARITY_CONTRACT = "cloudflare-m3-parity-acceptance-v1";
const QUEUE_NAME = "smartspec-canonical-job-queue-production";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type ActiveWorkerVersion = Readonly<{
  versionId: string;
  checked: boolean;
  hasVerifiedReleaseIdentity: boolean;
  deploymentId: string;
  percentage: number;
  sourceSha?: string;
  buildDigest?: string;
  configurationDigest?: string;
  bindingNames: readonly string[];
}>;

export type ProductionQueueConsumer = Readonly<{
  consumerId: string;
  queueName: string;
  scriptName: string;
  deadLetterQueueName: string;
}>;

/** Verifies that the active provider version is the exact immutable bundle
 * whose code contains the M3 queue contracts. A Linux release or a ready Node
 * outbox transport alone cannot establish Cloudflare consumer readiness. */
export async function verifyM3QueueWorkerReadiness(
  input: {
    deploymentId: string | null;
    versions: readonly ActiveWorkerVersion[];
    queueId: string | null;
    expectedQueueId: string;
    queueConsumersComplete: boolean;
    consumers: readonly ProductionQueueConsumer[];
  },
  resolveBundle: (
    artifactRef: string,
    sourceSha: string
  ) => Promise<Pick<
    CloudflareStagingBundle,
    "sourceSha" | "buildDigest" | "moduleFiles"
  > | null>
) {
  const active = input.versions.filter(version => version.percentage > 0);
  if (!input.deploymentId || !UUID.test(input.deploymentId) || active.length < 1 || active.length > 2 ||
      active.some(version => version.deploymentId !== input.deploymentId ||
        !UUID.test(version.versionId) || !Number.isFinite(version.percentage) || version.percentage < 0.01 || version.percentage > 100) ||
      new Set(active.map(version => version.versionId)).size !== active.length ||
      Math.abs(active.reduce((total, version) => total + version.percentage, 0) - 100) >= 0.001) {
    return {
      ready: false as const,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED" as const,
    };
  }
  if (active.some(version => !version.checked || !version.hasVerifiedReleaseIdentity || !version.sourceSha || !version.buildDigest || !version.configurationDigest)) {
    return {
      ready: false as const,
      reason: "M3_PARITY_CLOUDFLARE_WORKER_VERSION_NOT_VERIFIED" as const,
    };
  }
  const queueVersions = active.filter(version => version.bindingNames.includes("JOB_QUEUE"));
  if (queueVersions.length === 0) {
    return {
      ready: false as const,
      reason: "M3_PARITY_PRODUCTION_QUEUE_BINDING_NOT_ACTIVE" as const,
    };
  }
  if (queueVersions.some(version => !version.bindingNames.includes("CF_VERSION_METADATA"))) {
    return {
      ready: false as const,
      reason: "M3_PARITY_WORKER_VERSION_METADATA_BINDING_REQUIRED" as const,
    };
  }
  if (!input.queueId || input.queueId !== input.expectedQueueId || !input.queueConsumersComplete) {
    return {
      ready: false as const,
      reason: "M3_PARITY_PRODUCTION_QUEUE_CONSUMER_READBACK_REQUIRED" as const,
    };
  }
  if (!input.consumers.some(consumer => consumer.queueName === QUEUE_NAME &&
      consumer.scriptName === "smartspec-cloudflare-runtime" &&
      consumer.deadLetterQueueName === "smartspec-canonical-job-queue-production-dlq")) {
    return {
      ready: false as const,
      reason: "M3_PARITY_PRODUCTION_QUEUE_CONSUMER_NOT_CONFIGURED" as const,
    };
  }
  const verifiedVersions = [];
  for (const version of queueVersions) {
    const artifactRef = `sha256:${version.buildDigest}`;
    const bundle = await resolveBundle(artifactRef, version.sourceSha!).catch(() => null);
    if (!bundle || bundle.sourceSha.toLowerCase() !== version.sourceSha!.toLowerCase() ||
        bundle.buildDigest.toLowerCase() !== version.buildDigest!.toLowerCase()) {
      return { ready: false as const, reason: "M3_PARITY_CLOUDFLARE_WORKER_ARTIFACT_NOT_VERIFIED" as const };
    }
    const source = Object.values(bundle.moduleFiles).map(file => new TextDecoder().decode(file.bytes)).join("\n");
    if (!(source.includes(`${M3_PARITY_JOB_PREFIX}credit_billing_acceptance`) &&
        source.includes(`${M3_PARITY_JOB_PREFIX}queue_recovery_acceptance`) &&
        source.includes(M3_PARITY_CONTRACT) && source.includes(QUEUE_NAME))) {
      return { ready: false as const, reason: "M3_PARITY_CLOUDFLARE_WORKER_CONTRACT_NOT_ACTIVE" as const };
    }
    verifiedVersions.push({ versionId: version.versionId, percentage: version.percentage,
      sourceSha: version.sourceSha, buildDigest: version.buildDigest,
      configurationDigest: version.configurationDigest, artifactRef });
  }
  return { ready: true as const, reason: null, deploymentId: input.deploymentId,
    queueId: input.queueId, consumerId: input.consumers.find(consumer => consumer.queueName === QUEUE_NAME &&
      consumer.scriptName === "smartspec-cloudflare-runtime" &&
      consumer.deadLetterQueueName === "smartspec-canonical-job-queue-production-dlq")!.consumerId,
    versions: verifiedVersions };
}
