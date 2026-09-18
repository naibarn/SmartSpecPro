import { isAbsolute, relative, resolve } from "node:path";

import {
  JobControlPlaneError,
  type LeaseContext,
} from "./jobControlPlaneTypes";

export const RUNNER_CONTRACT_VERSION = "sah-runner-v1";

export type RunnerProfile = "local_device" | "shared_container";
export type RunnerNodeKind = "local_device" | "managed_container";
export type RunnerAckState =
  | "accepted"
  | "applied"
  | "rejected"
  | "unknown"
  | "duplicate"
  | "out_of_order";

export type RunnerProtocolEnvelope = {
  protocolVersion: typeof RUNNER_CONTRACT_VERSION;
  profile: RunnerProfile;
  nodeKind: RunnerNodeKind;
  runnerId: string;
  nodeId: string;
  jobId: string | null;
  attemptId: string | null;
  leaseId: string | null;
  fencingVersion: number | null;
  correlationId: string;
  sequence: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  ackState?: RunnerAckState;
};

export type RunnerTrustState =
  "pending" | "trusted" | "revoked" | "quarantined";
export type RunnerRuntime = "desktop" | "container" | "worker";

export type RunnerToolKind =
  | "agent_cli"
  | "agent_harness"
  | "agent_runtime"
  | "media"
  | "browser"
  | "desktop"
  | "local_ai"
  | "mcp"
  | "generic_cli";
export type RunnerInventoryTrustState =
  | "discovered"
  | "probed"
  | "verified"
  | "ready"
  | "busy"
  | "degraded"
  | "auth_required"
  | "unsupported"
  | "disabled";
export type RunnerInstallState = "unknown" | "not_installed" | "installed";
export type RunnerConfigurationState =
  "unknown" | "not_configured" | "configured";
export type RunnerAuthState =
  | "unknown"
  | "not_required"
  | "auth_required"
  | "authenticated"
  | "auth_failed";
export type RunnerHealthState = "unknown" | "unhealthy" | "healthy";
export type RunnerAvailabilityState =
  "unknown" | "unavailable" | "available" | "busy" | "stale" | "disabled";
export type RunnerPolicyDecision = "pending" | "allowed" | "denied";

export type RunnerToolInventoryEntry = {
  toolId: string;
  kind: RunnerToolKind;
  displayName: string;
  version: string | null;
  adapterId: string | null;
  adapterVersion: string | null;
  discoverySource: string;
  installState: RunnerInstallState;
  configurationState: RunnerConfigurationState;
  authState: RunnerAuthState;
  healthState: RunnerHealthState;
  availabilityState: RunnerAvailabilityState;
  trustState: RunnerInventoryTrustState;
  fingerprint: string;
  observedAt: string;
  expiresAt: string;
  reasonCodes: string[];
};

export type RunnerCapabilityInventoryEntry = {
  capabilityId: string;
  contractVersion: string;
  implementationId: string;
  controlProfile: string;
  resourceProfile: string;
  maxConcurrency: number;
  availabilityState: RunnerAvailabilityState;
  policyDecision: RunnerPolicyDecision;
  confidence: number;
  observedAt: string;
  expiresAt: string;
  reasonCodes: string[];
};

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
  /** Redacted platform identity safe for Task Control and scheduling projection. */
  platform?: {
    os: string;
    architecture: string;
    target: string;
  };
  /** Additive fields; omitted by legacy snapshots and normalized to empty lists. */
  toolInventory?: RunnerToolInventoryEntry[];
  capabilityInventory?: RunnerCapabilityInventoryEntry[];
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

const RUNNER_ENVELOPE_SECRET_KEYS = new Set([
  "accessToken",
  "apiKey",
  "authorization",
  "credential",
  "credentials",
  "executablePath",
  "mcpUrl",
  "password",
  "privateKey",
  "prompt",
  "rawConfiguration",
  "refreshToken",
  "secret",
  "token",
]);

function assertSafeRunnerPayload(
  value: unknown,
  path = "payload",
  depth = 0
): void {
  if (depth > 6) invalid(`${path} is too deeply nested`);
  if (typeof value === "string") {
    if (value.length > 8_000) invalid(`${path} is too large`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 64) invalid(`${path} has too many items`);
    value.forEach((item, index) =>
      assertSafeRunnerPayload(item, `${path}[${index}]`, depth + 1)
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (RUNNER_ENVELOPE_SECRET_KEYS.has(key))
      invalid(`${path}.${key} is not allowed`);
    assertSafeRunnerPayload(child, `${path}.${key}`, depth + 1);
  }
}

export function validateRunnerProtocolEnvelope(
  envelope: RunnerProtocolEnvelope
): RunnerProtocolEnvelope {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope))
    invalid("runner protocol envelope is invalid");
  const raw = envelope as unknown as Record<string, unknown>;
  const profile = enumText(raw.profile, "envelope.profile", [
    "local_device",
    "shared_container",
  ] as const);
  const nodeKind = enumText(raw.nodeKind, "envelope.nodeKind", [
    "local_device",
    "managed_container",
  ] as const);
  if (
    (profile === "local_device" && nodeKind !== "local_device") ||
    (profile === "shared_container" && nodeKind !== "managed_container")
  )
    invalid("envelope profile and node kind are incompatible");
  const jobId = nullableText(raw.jobId, "envelope.jobId", 128);
  const attemptId = nullableText(raw.attemptId, "envelope.attemptId", 128);
  const leaseId = nullableText(raw.leaseId, "envelope.leaseId", 128);
  if (profile === "shared_container" && (!jobId || !attemptId || !leaseId))
    invalid("shared container envelope requires job, attempt and lease");
  const fencingVersion =
    raw.fencingVersion === null || raw.fencingVersion === undefined
      ? null
      : raw.fencingVersion;
  if (
    fencingVersion !== null &&
    (!Number.isSafeInteger(fencingVersion) || Number(fencingVersion) < 0)
  )
    invalid("envelope.fencingVersion is invalid");
  const sequence = raw.sequence;
  if (!Number.isSafeInteger(sequence) || Number(sequence) < 0)
    invalid("envelope.sequence is invalid");
  const payload = raw.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    invalid("envelope.payload is invalid");
  assertSafeRunnerPayload(payload);
  const protocolVersion = requiredText(
    raw.protocolVersion,
    "envelope.protocolVersion",
    40
  );
  if (protocolVersion !== RUNNER_CONTRACT_VERSION)
    invalid("envelope.protocolVersion is unsupported");
  const normalized = {
    protocolVersion: RUNNER_CONTRACT_VERSION,
    profile,
    nodeKind,
    runnerId: requiredText(raw.runnerId, "envelope.runnerId", 128),
    nodeId: requiredText(raw.nodeId, "envelope.nodeId", 160),
    jobId,
    attemptId,
    leaseId,
    fencingVersion: fencingVersion as number | null,
    correlationId: requiredText(
      raw.correlationId,
      "envelope.correlationId",
      160
    ),
    sequence: sequence as number,
    idempotencyKey: requiredText(
      raw.idempotencyKey,
      "envelope.idempotencyKey",
      200
    ),
    payload: payload as Record<string, unknown>,
    ackState:
      raw.ackState === undefined
        ? undefined
        : enumText(raw.ackState, "envelope.ackState", [
            "accepted",
            "applied",
            "rejected",
            "unknown",
            "duplicate",
            "out_of_order",
          ] as const),
  } satisfies RunnerProtocolEnvelope;
  if (
    normalized.profile === "local_device" &&
    normalized.fencingVersion !== null &&
    !normalized.jobId
  )
    invalid("local device envelope cannot fence a job without a job id");
  return normalized;
}

function nullableText(
  value: unknown,
  field: string,
  maxLength: number
): string | null {
  if (value === null || value === undefined) return null;
  return requiredText(value, field, maxLength);
}

function enumText<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    invalid(`${field} is invalid`);
  return value as T;
}

function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    invalid(`${field} is invalid`);
  return new Date(value).toISOString();
}

function validateInventoryWindow(
  raw: Record<string, unknown>,
  prefix: string
): { observedAt: string; expiresAt: string } {
  const observedAt = isoTimestamp(raw.observedAt, `${prefix}.observedAt`);
  const expiresAt = isoTimestamp(raw.expiresAt, `${prefix}.expiresAt`);
  if (Date.parse(expiresAt) <= Date.parse(observedAt))
    invalid(`${prefix} timestamps are invalid`);
  return { observedAt, expiresAt };
}

function validateRunnerToolInventory(
  value: unknown
): RunnerToolInventoryEntry[] {
  if (!Array.isArray(value) || value.length > 128)
    invalid("snapshot.toolInventory is invalid");
  const ids = new Set<string>();
  return (value as unknown[]).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      invalid(`snapshot.toolInventory[${index}] is invalid`);
    const raw = item as Record<string, unknown>;
    const prefix = `snapshot.toolInventory[${index}]`;
    const toolId = requiredText(raw.toolId, `${prefix}.toolId`, 128);
    if (ids.has(toolId)) invalid("snapshot.toolInventory contains duplicates");
    ids.add(toolId);
    const trustState = enumText(raw.trustState, `${prefix}.trustState`, [
      "discovered",
      "probed",
      "verified",
      "ready",
      "busy",
      "degraded",
      "auth_required",
      "unsupported",
      "disabled",
    ] as const);
    const installState = enumText(raw.installState, `${prefix}.installState`, [
      "unknown",
      "not_installed",
      "installed",
    ] as const);
    const configurationState = enumText(
      raw.configurationState,
      `${prefix}.configurationState`,
      ["unknown", "not_configured", "configured"] as const
    );
    const authState = enumText(raw.authState, `${prefix}.authState`, [
      "unknown",
      "not_required",
      "auth_required",
      "authenticated",
      "auth_failed",
    ] as const);
    const healthState = enumText(raw.healthState, `${prefix}.healthState`, [
      "unknown",
      "unhealthy",
      "healthy",
    ] as const);
    const availabilityState = enumText(
      raw.availabilityState,
      `${prefix}.availabilityState`,
      [
        "unknown",
        "unavailable",
        "available",
        "busy",
        "stale",
        "disabled",
      ] as const
    );
    const adapterId = nullableText(raw.adapterId, `${prefix}.adapterId`, 128);
    if (
      trustState === "ready" &&
      (adapterId === null ||
        installState !== "installed" ||
        configurationState !== "configured" ||
        (authState !== "authenticated" && authState !== "not_required") ||
        healthState !== "healthy" ||
        (availabilityState !== "available" && availabilityState !== "busy"))
    )
      invalid(`${prefix} claims ready without verified execution state`);
    const { observedAt, expiresAt } = validateInventoryWindow(raw, prefix);
    return {
      toolId,
      kind: enumText(raw.kind, `${prefix}.kind`, [
        "agent_cli",
        "agent_harness",
        "agent_runtime",
        "media",
        "browser",
        "desktop",
        "local_ai",
        "mcp",
        "generic_cli",
      ] as const),
      displayName: requiredText(raw.displayName, `${prefix}.displayName`, 160),
      version: nullableText(raw.version, `${prefix}.version`, 80),
      adapterId,
      adapterVersion: nullableText(
        raw.adapterVersion,
        `${prefix}.adapterVersion`,
        80
      ),
      discoverySource: requiredText(
        raw.discoverySource,
        `${prefix}.discoverySource`,
        80
      ),
      installState,
      configurationState,
      authState,
      healthState,
      availabilityState,
      trustState,
      fingerprint: requiredText(raw.fingerprint, `${prefix}.fingerprint`, 256),
      observedAt,
      expiresAt,
      reasonCodes: stringList(raw.reasonCodes, `${prefix}.reasonCodes`, 32, 96),
    };
  });
}

function validateRunnerCapabilityInventory(
  value: unknown
): RunnerCapabilityInventoryEntry[] {
  if (!Array.isArray(value) || value.length > 256)
    invalid("snapshot.capabilityInventory is invalid");
  const ids = new Set<string>();
  return (value as unknown[]).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      invalid(`snapshot.capabilityInventory[${index}] is invalid`);
    const raw = item as Record<string, unknown>;
    const prefix = `snapshot.capabilityInventory[${index}]`;
    const capabilityId = requiredText(
      raw.capabilityId,
      `${prefix}.capabilityId`,
      160
    );
    if (ids.has(capabilityId))
      invalid("snapshot.capabilityInventory contains duplicates");
    ids.add(capabilityId);
    const maxConcurrency = raw.maxConcurrency;
    if (
      typeof maxConcurrency !== "number" ||
      !Number.isSafeInteger(maxConcurrency) ||
      maxConcurrency < 1 ||
      maxConcurrency > 1024
    )
      invalid(`${prefix}.maxConcurrency is invalid`);
    const confidence = raw.confidence;
    if (
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    )
      invalid(`${prefix}.confidence is invalid`);
    const { observedAt, expiresAt } = validateInventoryWindow(raw, prefix);
    return {
      capabilityId,
      contractVersion: requiredText(
        raw.contractVersion,
        `${prefix}.contractVersion`,
        80
      ),
      implementationId: requiredText(
        raw.implementationId,
        `${prefix}.implementationId`,
        128
      ),
      controlProfile: requiredText(
        raw.controlProfile,
        `${prefix}.controlProfile`,
        80
      ),
      resourceProfile: requiredText(
        raw.resourceProfile,
        `${prefix}.resourceProfile`,
        80
      ),
      maxConcurrency,
      availabilityState: enumText(
        raw.availabilityState,
        `${prefix}.availabilityState`,
        [
          "unknown",
          "unavailable",
          "available",
          "busy",
          "stale",
          "disabled",
        ] as const
      ),
      policyDecision: enumText(raw.policyDecision, `${prefix}.policyDecision`, [
        "pending",
        "allowed",
        "denied",
      ] as const),
      confidence,
      observedAt,
      expiresAt,
      reasonCodes: stringList(raw.reasonCodes, `${prefix}.reasonCodes`, 32, 96),
    };
  });
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
  let platform: RunnerCapabilitySnapshot["platform"];
  if (raw.platform !== undefined) {
    if (!raw.platform || typeof raw.platform !== "object" || Array.isArray(raw.platform))
      invalid("snapshot.platform is invalid");
    const rawPlatform = raw.platform as Record<string, unknown>;
    platform = {
      os: requiredText(rawPlatform.os, "snapshot.platform.os", 40),
      architecture: requiredText(
        rawPlatform.architecture,
        "snapshot.platform.architecture",
        40
      ),
      target: requiredText(rawPlatform.target, "snapshot.platform.target", 80),
    };
  }
  return {
    runnerId,
    revision,
    observedAt: new Date(observedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    capabilities: stringList(raw.capabilities, "snapshot.capabilities"),
    workspaceIds: stringList(raw.workspaceIds, "snapshot.workspaceIds"),
    resourceClass:
      raw.resourceClass as RunnerCapabilitySnapshot["resourceClass"],
    ...(platform ? { platform } : {}),
    toolInventory:
      raw.toolInventory === undefined
        ? []
        : validateRunnerToolInventory(raw.toolInventory),
    capabilityInventory:
      raw.capabilityInventory === undefined
        ? []
        : validateRunnerCapabilityInventory(raw.capabilityInventory),
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
