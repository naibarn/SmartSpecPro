import { isAbsolute, relative, resolve } from "node:path";

import {
  JobControlPlaneError,
  type LeaseContext,
} from "./jobControlPlaneTypes";

export const RUNNER_CONTRACT_VERSION = "sah-runner-v1";

export type RunnerTrustState =
  "pending" | "trusted" | "revoked" | "quarantined";
export type RunnerRuntime = "desktop" | "container" | "worker";

export type RunnerIdentity = {
  runnerId: string;
  tenantId: string;
  deviceId: string;
  runtime: RunnerRuntime;
  trustState: RunnerTrustState;
  registeredAt: string;
};

export type RunnerCapabilitySnapshot = {
  runnerId: string;
  revision: string;
  observedAt: string;
  expiresAt: string;
  capabilities: string[];
  workspaceIds: string[];
  resourceClass: "small" | "medium" | "large";
};

export type WorkOffer = {
  offerId: string;
  jobId: string;
  tenantId: string;
  runnerId: string;
  capabilitySnapshotRevision: string;
  expiresAt: string;
  requiredCapabilities: string[];
};

export type RunnerControlCommand = {
  commandId: string;
  jobId: string;
  attemptId: string;
  fencingVersion: number;
  kind: "cancel" | "pause" | "resume" | "steer" | "reconcile";
  sequence: number;
  payload?: Record<string, unknown>;
};

export type RunnerControlEvent = {
  eventId: string;
  commandId: string;
  jobId: string;
  sequence: number;
  observed: "accepted" | "applied" | "rejected" | "unknown";
  reason?: string;
};

function invalid(message: string): never {
  throw new JobControlPlaneError("RUNNER_CONTRACT_INVALID", message);
}

export function validateRunnerIdentity(
  identity: RunnerIdentity
): RunnerIdentity {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(identity.runnerId))
    invalid("runnerId is invalid");
  if (!identity.tenantId || identity.tenantId.length > 36)
    invalid("tenantId is invalid");
  if (!identity.deviceId || identity.deviceId.length > 160)
    invalid("deviceId is invalid");
  if (!["desktop", "container", "worker"].includes(identity.runtime))
    invalid("runtime is invalid");
  if (
    !["pending", "trusted", "revoked", "quarantined"].includes(
      identity.trustState
    )
  )
    invalid("trustState is invalid");
  if (Number.isNaN(Date.parse(identity.registeredAt)))
    invalid("registeredAt is invalid");
  return {
    ...identity,
    registeredAt: new Date(identity.registeredAt).toISOString(),
  };
}

export function isRunnerSnapshotFresh(
  snapshot: RunnerCapabilitySnapshot,
  now = new Date()
): boolean {
  return (
    snapshot.expiresAt.length > 0 &&
    Date.parse(snapshot.expiresAt) > now.getTime()
  );
}

export function buildWorkOffer(input: {
  jobId: string;
  tenantId: string;
  requiredCapabilities: string[];
  runner: RunnerIdentity;
  snapshot: RunnerCapabilitySnapshot;
  now?: Date;
  ttlMs?: number;
}): WorkOffer | null {
  const now = input.now ?? new Date();
  if (
    input.runner.trustState !== "trusted" ||
    input.runner.tenantId !== input.tenantId ||
    input.snapshot.runnerId !== input.runner.runnerId ||
    !isRunnerSnapshotFresh(input.snapshot, now)
  )
    return null;
  if (
    !input.requiredCapabilities.every(capability =>
      input.snapshot.capabilities.includes(capability)
    )
  )
    return null;
  const expiresAt = new Date(
    Math.min(
      now.getTime() + Math.max(1_000, Math.min(input.ttlMs ?? 30_000, 300_000)),
      Date.parse(input.snapshot.expiresAt)
    )
  );
  return {
    offerId: `offer:${input.jobId}:${input.runner.runnerId}:${input.snapshot.revision}`,
    jobId: input.jobId,
    tenantId: input.tenantId,
    runnerId: input.runner.runnerId,
    capabilitySnapshotRevision: input.snapshot.revision,
    expiresAt: expiresAt.toISOString(),
    requiredCapabilities: [...input.requiredCapabilities],
  };
}

export function assertOfferClaim(input: {
  offer: WorkOffer;
  tenantId: string;
  runnerId: string;
  snapshotRevision: string;
  lease: LeaseContext;
  now?: Date;
}): void {
  if (
    input.offer.tenantId !== input.tenantId ||
    input.offer.runnerId !== input.runnerId ||
    input.offer.capabilitySnapshotRevision !== input.snapshotRevision ||
    Date.parse(input.offer.expiresAt) <= (input.now ?? new Date()).getTime() ||
    input.lease.jobId !== input.offer.jobId
  ) {
    throw new JobControlPlaneError(
      "RUNNER_OFFER_STALE",
      "Runner offer is no longer eligible"
    );
  }
}

export function acceptRunnerEvent(
  lastSequence: number,
  event: RunnerControlEvent
): "accepted" | "duplicate" | "out_of_order" {
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1)
    invalid("event sequence is invalid");
  if (event.sequence <= lastSequence) return "duplicate";
  if (event.sequence !== lastSequence + 1) return "out_of_order";
  return "accepted";
}

/** Reject absolute paths and traversal outside the server-approved workspace. */
export function isWorkspacePathAllowed(
  workspaceRoot: string,
  candidatePath: string
): boolean {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(candidatePath)) return false;
  const root = resolve(workspaceRoot);
  const candidate = resolve(candidatePath);
  const remainder = relative(root, candidate);
  return (
    remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder))
  );
}
