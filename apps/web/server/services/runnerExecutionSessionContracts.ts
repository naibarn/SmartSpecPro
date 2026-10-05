export const RUNNER_EXECUTION_SESSION_CONTRACT = "spec278-session-v1" as const;

export const executionSessionStates = [
  "provisioning",
  "starting",
  "running",
  "disconnected",
  "recovering",
  "quiescing",
  "quiesced",
  "checkpointing",
  "completed",
  "failed",
  "cancelled",
  "incompatible",
  "unknown",
] as const;
export type ExecutionSessionState = (typeof executionSessionStates)[number];

export const executionContinuityClasses = [
  "process_persistent",
  "reattachable",
  "checkpointable",
  "reconstructable",
  "ephemeral",
] as const;
export type ExecutionContinuityClass =
  (typeof executionContinuityClasses)[number];

export const executionEnforcementLevels = [
  "COMMAND_ONLY",
  "PROCESS_PAUSE",
  "MEDIATED_EFFECTS",
  "SANDBOX_ENFORCED",
] as const;
export type ExecutionEnforcementLevel =
  (typeof executionEnforcementLevels)[number];

export interface ExecutionSessionProjectionInput {
  sessionId: string;
  tenantId: string;
  workerJobId: string;
  workerJobAttempt: number;
  leaseFencingVersion: number;
  runnerId?: string | null;
  generation: number;
  authorityEpoch?: number;
  placementEpoch?: number;
  jobControlRevision: number;
  state: ExecutionSessionState;
  desiredState: ExecutionSessionState;
  continuityClass: ExecutionContinuityClass;
  enforcementLevel: ExecutionEnforcementLevel;
  driverId: string;
  driverVersion?: string | null;
}

export interface RunnerSessionInventoryCandidate {
  sessionId: string;
  workerJobId: string;
  generation: number;
  workerJobAttempt: number;
  leaseFencingVersion: number;
  authorityEpoch: number;
  placementEpoch: number;
  jobControlRevision: number;
  lastState: ExecutionSessionState;
  commandSequence: number;
  eventSequence: number;
  processIdentity: {
    pid: number;
    startedAt: string;
    hostBootId: string;
    identityDigest: string;
  };
  hostIdentity: {
    pid: number;
    startedAt: string;
    hostBootId: string;
    identityDigest: string;
  };
}

export function validateRunnerSessionInventory(
  value: unknown
): { records: RunnerSessionInventoryCandidate[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const records = (value as { records?: unknown }).records;
  if (!Array.isArray(records) || records.length > 64) return null;
  const seen = new Set<string>();
  const normalized: RunnerSessionInventoryCandidate[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const identity = row.processIdentity;
    const hostIdentityValue = row.hostIdentity;
    if (
      !identity ||
      typeof identity !== "object" ||
      Array.isArray(identity) ||
      !hostIdentityValue ||
      typeof hostIdentityValue !== "object" ||
      Array.isArray(hostIdentityValue)
    )
      return null;
    const processIdentity = identity as Record<string, unknown>;
    const hostIdentity = hostIdentityValue as Record<string, unknown>;
    const hasExactlyKeys = (
      object: Record<string, unknown>,
      expected: string[]
    ) => {
      const keys = Object.keys(object).sort();
      const sortedExpected = [...expected].sort();
      return (
        keys.length === expected.length &&
        keys.every((key, index) => key === sortedExpected[index])
      );
    };
    const text = (field: unknown, max: number) =>
      typeof field === "string" && field.length > 0 && field.length <= max;
    const integer = (field: unknown, min = 0) =>
      Number.isSafeInteger(field) && Number(field) >= min;
    const validProcessIdentity = (value: Record<string, unknown>) =>
      hasExactlyKeys(value, ["pid", "startedAt", "hostBootId", "identityDigest"]) &&
      integer(value.pid, 2) &&
      text(value.startedAt, 32) &&
      /^\d+$/.test(value.startedAt as string) &&
      text(value.hostBootId, 64) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.hostBootId as string
      ) &&
      text(value.identityDigest, 71) &&
      /^sha256:[0-9a-f]{64}$/i.test(value.identityDigest as string);
    if (
      !hasExactlyKeys(row, [
        "sessionId",
        "workerJobId",
        "generation",
        "workerJobAttempt",
        "leaseFencingVersion",
        "authorityEpoch",
        "placementEpoch",
        "jobControlRevision",
        "lastState",
        "commandSequence",
        "eventSequence",
        "processIdentity",
        "hostIdentity",
      ]) ||
      !validProcessIdentity(processIdentity) ||
      !validProcessIdentity(hostIdentity) ||
      !text(row.sessionId, 160) ||
      !/^[A-Za-z0-9_-]+$/.test(row.sessionId as string) ||
      !text(row.workerJobId, 36) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        row.workerJobId as string
      ) ||
      !integer(row.generation, 1) ||
      !integer(row.workerJobAttempt, 1) ||
      !integer(row.leaseFencingVersion) ||
      !integer(row.authorityEpoch) ||
      !integer(row.placementEpoch) ||
      !integer(row.jobControlRevision, 1) ||
      !integer(row.commandSequence) ||
      !integer(row.eventSequence) ||
      typeof row.lastState !== "string" ||
      !executionSessionStates.includes(
        row.lastState as ExecutionSessionState
      )
    )
      return null;
    const sessionId = row.sessionId as string;
    if (seen.has(sessionId)) return null;
    seen.add(sessionId);
    normalized.push({
      sessionId,
      workerJobId: row.workerJobId as string,
      generation: row.generation as number,
      workerJobAttempt: row.workerJobAttempt as number,
      leaseFencingVersion: row.leaseFencingVersion as number,
      authorityEpoch: row.authorityEpoch as number,
      placementEpoch: row.placementEpoch as number,
      jobControlRevision: row.jobControlRevision as number,
      lastState: row.lastState as ExecutionSessionState,
      commandSequence: row.commandSequence as number,
      eventSequence: row.eventSequence as number,
      processIdentity: {
        pid: processIdentity.pid as number,
        startedAt: processIdentity.startedAt as string,
        hostBootId: processIdentity.hostBootId as string,
        identityDigest: processIdentity.identityDigest as string,
      },
      hostIdentity: {
        pid: hostIdentity.pid as number,
        startedAt: hostIdentity.startedAt as string,
        hostBootId: hostIdentity.hostBootId as string,
        identityDigest: hostIdentity.identityDigest as string,
      },
    });
  }
  return { records: normalized };
}

const transitions: Record<
  ExecutionSessionState,
  ReadonlySet<ExecutionSessionState>
> = {
  provisioning: new Set(["starting", "failed", "cancelled", "incompatible"]),
  starting: new Set([
    "running",
    "failed",
    "cancelled",
    "incompatible",
    "unknown",
  ]),
  running: new Set([
    "disconnected",
    "quiescing",
    "checkpointing",
    "completed",
    "failed",
    "cancelled",
    "unknown",
  ]),
  disconnected: new Set([
    "recovering",
    "quiescing",
    "quiesced",
    "failed",
    "cancelled",
    "unknown",
  ]),
  recovering: new Set([
    "running",
    "disconnected",
    "quiescing",
    "quiesced",
    "incompatible",
    "failed",
    "cancelled",
    "unknown",
  ]),
  quiescing: new Set([
    "quiesced",
    "recovering",
    "failed",
    "cancelled",
    "unknown",
  ]),
  quiesced: new Set([
    "recovering",
    "checkpointing",
    "failed",
    "cancelled",
    "incompatible",
  ]),
  checkpointing: new Set([
    "running",
    "quiesced",
    "failed",
    "cancelled",
    "unknown",
  ]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  incompatible: new Set(),
  unknown: new Set([
    "recovering",
    "quiescing",
    "quiesced",
    "failed",
    "cancelled",
    "incompatible",
  ]),
};

export function canTransitionExecutionSession(
  from: ExecutionSessionState,
  to: ExecutionSessionState
): boolean {
  return transitions[from]?.has(to) ?? false;
}

export function validateExecutionSessionProjection(
  input: ExecutionSessionProjectionInput
): string | null {
  if (
    ![input.sessionId, input.tenantId, input.workerJobId, input.driverId].every(
      value => value.trim()
    )
  ) {
    return "RUNNER_SESSION_IDENTITY_INVALID";
  }
  if (
    input.sessionId.length > 160 ||
    input.tenantId.length > 36 ||
    input.workerJobId.length > 36 ||
    (input.runnerId?.length ?? 0) > 160 ||
    input.driverId.length > 128 ||
    (input.driverVersion?.length ?? 0) > 64 ||
    !executionSessionStates.includes(input.desiredState)
  ) {
    return "RUNNER_SESSION_IDENTITY_INVALID";
  }
  if (
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1 ||
    !Number.isSafeInteger(input.workerJobAttempt) ||
    input.workerJobAttempt < 1 ||
    !Number.isSafeInteger(input.leaseFencingVersion) ||
    input.leaseFencingVersion < 0 ||
    !Number.isSafeInteger(input.jobControlRevision) ||
    input.jobControlRevision < 1 ||
    !Number.isSafeInteger(input.authorityEpoch ?? 0) ||
    (input.authorityEpoch ?? 0) < 0 ||
    !Number.isSafeInteger(input.placementEpoch ?? 0) ||
    (input.placementEpoch ?? 0) < 0
  ) {
    return "RUNNER_SESSION_REVISION_INVALID";
  }
  if (
    input.continuityClass === "ephemeral" &&
    input.enforcementLevel === "SANDBOX_ENFORCED"
  ) {
    return "RUNNER_SESSION_ENFORCEMENT_CLAIM_INVALID";
  }
  return null;
}

const forbiddenPayloadKey =
  /secret|token|password|credential|private.?key|api.?key|raw.?output|workspace.?path/i;
const forbiddenPayloadValue =
  /(?:^|[\s="'(])\/(?:home|root|tmp|var|mnt|workspace|Users)\/|[A-Za-z]:\\(?:Users|Windows|Program Files)\\|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/;

export function validateExecutionSessionEventPayload(
  value: unknown
): string | null {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return "RUNNER_SESSION_EVENT_PAYLOAD_INVALID";
  }
  if (typeof encoded !== "string")
    return "RUNNER_SESSION_EVENT_PAYLOAD_INVALID";
  if (encoded.length > 16_384) return "RUNNER_SESSION_EVENT_PAYLOAD_TOO_LARGE";
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length > 0) {
    const item = pending.pop();
    visited += 1;
    if (visited > 10_000) return "RUNNER_SESSION_EVENT_PAYLOAD_TOO_COMPLEX";
    if (typeof item === "string" && forbiddenPayloadValue.test(item)) {
      return "RUNNER_SESSION_EVENT_SENSITIVE_VALUE";
    }
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item)) {
      pending.push(...item);
      continue;
    }
    for (const [key, nested] of Object.entries(
      item as Record<string, unknown>
    )) {
      if (forbiddenPayloadKey.test(key))
        return "RUNNER_SESSION_EVENT_SENSITIVE_FIELD";
      pending.push(nested);
    }
  }
  return null;
}
