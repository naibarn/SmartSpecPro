import type { CanonicalJobEnvelope, CloudflareEnvironment } from "./contracts";
import { startCanonicalContainer } from "./nativeAdapters";

export type RunnerContainerAssignment = {
  envelope: CanonicalJobEnvelope;
  tenantId: string;
  attemptId: string;
  leaseId: string;
  fencingVersion: number;
  workspaceRef: string;
  artifactRefs: string[];
  resourceProfile: "small" | "medium" | "large";
};

export type RunnerContainerManifest = {
  entrypoint: "smartaihub-runner";
  command: readonly ["smartaihub-runner", "run"];
  imageDigest: string;
  contractVersion: string;
  resourceProfile: RunnerContainerAssignment["resourceProfile"];
  allowedEnvironment: string[];
  healthSignal: "/health/runner";
};

export type RunnerContainerLifecycleState =
  | "unstarted"
  | "running"
  | "reconciling"
  | "stopping"
  | "released";

export type RunnerContainerSession = {
  instanceId: string;
  state: RunnerContainerLifecycleState;
  providerStatus?: string;
  restarted: boolean;
};

const SAFE_SCOPE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/;

export function validateRunnerContainerAssignment(
  input: RunnerContainerAssignment,
): RunnerContainerAssignment {
  if (
    !input.envelope.job_id ||
    input.envelope.job_id !== input.workspaceRef.split(":")[1]
  )
    throw new Error("RUNNER_CONTAINER_JOB_SCOPE_INVALID");
  const envelopeTenantId = input.envelope.routing_metadata.tenantId;
  if (
    typeof envelopeTenantId !== "string" ||
    envelopeTenantId !== input.tenantId
  )
    throw new Error("RUNNER_CONTAINER_TENANT_SCOPE_INVALID");
  if (
    !SAFE_SCOPE.test(input.tenantId) ||
    !SAFE_SCOPE.test(input.attemptId) ||
    !SAFE_SCOPE.test(input.leaseId) ||
    !SAFE_SCOPE.test(input.workspaceRef)
  )
    throw new Error("RUNNER_CONTAINER_SCOPE_INVALID");
  if (!Number.isSafeInteger(input.fencingVersion) || input.fencingVersion < 0)
    throw new Error("RUNNER_CONTAINER_FENCE_INVALID");
  if (
    input.artifactRefs.length > 32 ||
    input.artifactRefs.some(
      (ref) =>
        !SAFE_SCOPE.test(ref) ||
        ref.startsWith("http://") ||
        ref.startsWith("https://"),
    )
  )
    throw new Error("RUNNER_CONTAINER_ARTIFACT_SCOPE_INVALID");
  if (input.envelope.business_attempt < 1)
    throw new Error("RUNNER_CONTAINER_ATTEMPT_INVALID");
  return input;
}

export function buildRunnerContainerManifest(
  input: Pick<RunnerContainerAssignment, "resourceProfile"> & {
    imageDigest: string;
    contractVersion: string;
  },
): RunnerContainerManifest {
  if (!/^sha256:[a-f0-9]{64}$/i.test(input.imageDigest))
    throw new Error("RUNNER_CONTAINER_IMAGE_DIGEST_INVALID");
  return {
    entrypoint: "smartaihub-runner",
    command: ["smartaihub-runner", "run"],
    imageDigest: input.imageDigest,
    contractVersion: input.contractVersion,
    resourceProfile: input.resourceProfile,
    allowedEnvironment: [
      "SAH_RUNNER_PROFILE",
      "SAH_RUNNER_ID",
      "SAH_RUNNER_JOB_ID",
      "SAH_RUNNER_ATTEMPT_ID",
      "SAH_RUNNER_LEASE_ID",
    ],
    healthSignal: "/health/runner",
  };
}

export async function startRunnerContainer(
  env: CloudflareEnvironment,
  assignment: RunnerContainerAssignment,
): Promise<{ id?: string; status?: string }> {
  validateRunnerContainerAssignment(assignment);
  return startCanonicalContainer(
    env,
    `runner:${assignment.envelope.job_id}:${assignment.attemptId}`,
    assignment.envelope,
  );
}

export function runnerContainerInstanceId(assignment: Pick<RunnerContainerAssignment, "envelope" | "attemptId">): string {
  return `runner:${assignment.envelope.job_id}:${assignment.attemptId}`;
}

export function buildRunnerContainerEnvironment(
  assignment: Pick<RunnerContainerAssignment, "envelope" | "attemptId" | "leaseId"> & { runnerId: string },
): Record<string, string> {
  return {
    SAH_RUNNER_PROFILE: "shared_container",
    SAH_RUNNER_ID: assignment.runnerId,
    SAH_RUNNER_JOB_ID: assignment.envelope.job_id,
    SAH_RUNNER_ATTEMPT_ID: assignment.attemptId,
    SAH_RUNNER_LEASE_ID: assignment.leaseId,
  };
}

/**
 * Feature 204 owns scheduling and provider lifecycle. This object owns only the
 * Runner entrypoint's assignment-scoped start/reconcile/cleanup handshake.
 */
export class RunnerContainerLifecycle {
  private readonly instanceId: string;
  private state: RunnerContainerLifecycleState = "unstarted";
  private providerStatus: string | undefined;
  private restarted = false;

  constructor(
    private readonly env: CloudflareEnvironment,
    private readonly assignment: RunnerContainerAssignment,
  ) {
    validateRunnerContainerAssignment(assignment);
    this.instanceId = runnerContainerInstanceId(assignment);
  }

  snapshot(): RunnerContainerSession {
    return {
      instanceId: this.instanceId,
      state: this.state,
      providerStatus: this.providerStatus,
      restarted: this.restarted,
    };
  }

  async start(): Promise<RunnerContainerSession> {
    if (this.state === "released") throw new Error("RUNNER_CONTAINER_ALREADY_RELEASED");
    if (this.state === "running") return this.snapshot();
    const result = await startRunnerContainer(this.env, this.assignment);
    this.providerStatus = result.status;
    this.state = "running";
    return this.snapshot();
  }

  async reconcile(): Promise<RunnerContainerSession> {
    if (this.state === "released") throw new Error("RUNNER_CONTAINER_ALREADY_RELEASED");
    const binding = this.env.JOB_CONTAINERS;
    if (!binding?.find) throw new Error("RUNNER_CONTAINER_RECONCILIATION_UNAVAILABLE");
    this.state = "reconciling";
    const current = await binding.find(this.instanceId);
    if (current && !["failed", "stopped", "terminated"].includes(current.status ?? "")) {
      this.providerStatus = current.status;
      this.state = "running";
      return this.snapshot();
    }
    if (current) this.restarted = true;
    return this.start();
  }

  async release(): Promise<RunnerContainerSession> {
    if (this.state === "released") return this.snapshot();
    const binding = this.env.JOB_CONTAINERS;
    if (!binding?.stop) throw new Error("RUNNER_CONTAINER_CLEANUP_UNAVAILABLE");
    this.state = "stopping";
    await binding.stop(this.instanceId);
    this.state = "released";
    this.providerStatus = "stopped";
    return this.snapshot();
  }
}
