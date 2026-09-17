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

function requiredText(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string") invalid(`${field} is invalid`);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength)
    invalid(`${field} is invalid`);
  return normalized;
}

function stringList(
  value: unknown,
  field: string,
  maxItems = 128,
  maxItemLength = 160
): string[] {
  if (!Array.isArray(value) || value.length > maxItems)
    invalid(`${field} is invalid`);
  const values = (value as unknown[]).map(item =>
    requiredText(item, `${field}[]`, maxItemLength)
  );
  if (new Set(values).size !== values.length) invalid(`${field} is invalid`);
  return values;
}

export function validateRunnerIdentity(
  identity: RunnerIdentity
): RunnerIdentity {
  if (!identity || typeof identity !== "object" || Array.isArray(identity))
    invalid("runner identity is invalid");
  const raw = identity as unknown as Record<string, unknown>;
  const runnerId = requiredText(raw.runnerId, "runnerId", 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(runnerId))
    invalid("runnerId is invalid");
  const tenantId = requiredText(raw.tenantId, "tenantId", 36);
  const deviceId = requiredText(raw.deviceId, "deviceId", 160);
  if (!(
    typeof raw.runtime === "string" &&
    ["desktop", "container", "worker"].includes(raw.runtime)
  ))
    invalid("runtime is invalid");
  if (!(
    typeof raw.trustState === "string" &&
    ["pending", "trusted", "revoked", "quarantined"].includes(raw.trustState)
  ))
    invalid("trustState is invalid");
  if (
    typeof raw.registeredAt !== "string" ||
    Number.isNaN(Date.parse(raw.registeredAt))
  )
    invalid("registeredAt is invalid");
  return {
    runnerId,
    tenantId,
    deviceId,
    runtime: raw.runtime as RunnerRuntime,
    trustState: raw.trustState as RunnerTrustState,
    registeredAt: new Date(raw.registeredAt).toISOString(),
  };
}

export function validateRunnerCapabilitySnapshot(
  snapshot: RunnerCapabilitySnapshot
): RunnerCapabilitySnapshot {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    invalid("runner capability snapshot is invalid");
  const raw = snapshot as unknown as Record<string, unknown>;
  const runnerId = requiredText(raw.runnerId, "snapshot.runnerId", 128);
  const revision = requiredText(raw.revision, "snapshot.revision", 128);
  const observedAt = raw.observedAt;
  const expiresAt = raw.expiresAt;
  if (
    typeof observedAt !== "string" ||
    Number.isNaN(Date.parse(observedAt)) ||
    typeof expiresAt !== "string" ||
    Number.isNaN(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.parse(observedAt)
  )
    invalid("snapshot timestamps are invalid");
  if (!["small", "medium", "large"].includes(String(raw.resourceClass)))
    invalid("snapshot.resourceClass is invalid");
  return {
    runnerId,
    revision,
    observedAt: new Date(observedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    capabilities: stringList(raw.capabilities, "snapshot.capabilities"),
    workspaceIds: stringList(raw.workspaceIds, "snapshot.workspaceIds"),
    resourceClass:
      raw.resourceClass as RunnerCapabilitySnapshot["resourceClass"],
  };
}

export function isRunnerSnapshotFresh(
  snapshot: RunnerCapabilitySnapshot,
  now = new Date()
): boolean {
  try {
    const normalized = validateRunnerCapabilitySnapshot(snapshot);
    return Date.parse(normalized.expiresAt) > now.getTime();
  } catch (error) {
    if (error instanceof JobControlPlaneError) return false;
    throw error;
  }
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
  let runner: RunnerIdentity;
  let snapshot: RunnerCapabilitySnapshot;
  let requiredCapabilities: string[];
  try {
    runner = validateRunnerIdentity(input.runner);
    snapshot = validateRunnerCapabilitySnapshot(input.snapshot);
    requiredCapabilities = stringList(
      input.requiredCapabilities,
      "requiredCapabilities"
    );
  } catch (error) {
    if (error instanceof JobControlPlaneError) return null;
    throw error;
  }
  if (
    runner.trustState !== "trusted" ||
    runner.tenantId !== input.tenantId ||
    snapshot.runnerId !== runner.runnerId ||
    !isRunnerSnapshotFresh(snapshot, now)
  )
    return null;
  if (
    !requiredCapabilities.every(capability =>
      snapshot.capabilities.includes(capability)
    )
  )
    return null;
  const expiresAt = new Date(
    Math.min(
      now.getTime() + Math.max(1_000, Math.min(input.ttlMs ?? 30_000, 300_000)),
      Date.parse(snapshot.expiresAt)
    )
  );
  return {
    offerId: `offer:${input.jobId}:${runner.runnerId}:${snapshot.revision}`,
    jobId: input.jobId,
    tenantId: input.tenantId,
    runnerId: runner.runnerId,
    capabilitySnapshotRevision: snapshot.revision,
    expiresAt: expiresAt.toISOString(),
    requiredCapabilities,
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
  if (typeof workspaceRoot !== "string" || typeof candidatePath !== "string")
    return false;
  if (!isAbsolute(workspaceRoot) || !isAbsolute(candidatePath)) return false;
  const root = resolve(workspaceRoot);
  const candidate = resolve(candidatePath);
  const remainder = relative(root, candidate);
  return (
    remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder))
  );
}
