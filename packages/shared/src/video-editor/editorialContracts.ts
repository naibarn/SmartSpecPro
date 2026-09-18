import {
  assertCanonicalTimebase,
  type CanonicalTimebase,
} from "./canonicalTime";

export const EDITORIAL_EVIDENCE_SCHEMA = "editorial.evidence.v1" as const;
export const EDITORIAL_INTENT_SCHEMA = "editorial.intent.v1" as const;
export const EDITORIAL_PLAN_SCHEMA = "editorial.executable_plan.v1" as const;
export const EDITORIAL_CHANGE_SET_SCHEMA = "editorial.change_set.v1" as const;
export const EDITORIAL_EXECUTION_SNAPSHOT_SCHEMA =
  "editorial.execution_snapshot.v1" as const;
export const EDITORIAL_ARTIFACT_SCHEMA = "editorial.artifact.v1" as const;

export type EditorialEvidenceStatus =
  "pending" | "available" | "degraded" | "invalid" | "expired";
export type EditorialOperationType =
  | "cut"
  | "trim"
  | "ripple"
  | "reframe"
  | "camera"
  | "audio_mix"
  | "caption"
  | "marker"
  | "metadata";
export type EditorialCapabilityState =
  | "eligible"
  | "queued"
  | "running"
  | "waiting_agent"
  | "capability_blocked"
  | "degraded"
  | "completed"
  | "failed"
  | "canceled";

export interface EditorialExecutionSnapshot {
  schemaVersion: typeof EDITORIAL_EXECUTION_SNAPSHOT_SCHEMA;
  snapshotId: string;
  tenantId: string;
  projectId: string;
  revisionId: string;
  idempotencyKey: string;
  sourceFingerprints: string[];
  capabilityProfile: Record<string, unknown>;
  policy: Record<string, unknown>;
  contractHash: string;
}

export interface EditorialArtifactManifest {
  schemaVersion: typeof EDITORIAL_ARTIFACT_SCHEMA;
  artifactId: string;
  tenantId: string;
  projectId: string;
  revisionId: string;
  snapshotId: string;
  jobId: string;
  role: string;
  mediaHash: string;
  durationMs: number;
  width: number;
  height: number;
  qcStatus: "passed" | "warning" | "failed";
}

export interface EditorialEvidenceBundle {
  schemaVersion: typeof EDITORIAL_EVIDENCE_SCHEMA;
  evidenceId: string;
  tenantId: string;
  projectId: string;
  revisionId: string;
  snapshotId: string;
  sourceFingerprint: string;
  status: EditorialEvidenceStatus;
  confidence: number;
  provenance: Record<string, unknown>;
  evidenceRefs: string[];
  warnings: string[];
  evidenceHash: string;
  timebase?: CanonicalTimebase;
}

export interface EditorialIntentOperation {
  id: string;
  type: EditorialOperationType;
  startTick: number;
  endTick: number;
  dependsOn?: string[];
  payload?: Record<string, unknown>;
}

export interface EditorialIntentPlan {
  schemaVersion: typeof EDITORIAL_INTENT_SCHEMA;
  intentId: string;
  tenantId: string;
  projectId: string;
  revisionId: string;
  snapshotId: string;
  evidenceRefs: string[];
  policyVersion: string;
  reviewRequired: boolean;
  operations: EditorialIntentOperation[];
}

export interface ExecutableEditOperation extends EditorialIntentOperation {
  dependsOn: string[];
}

export interface ExecutableEditPlan {
  schemaVersion: typeof EDITORIAL_PLAN_SCHEMA;
  planId: string;
  planHash: string;
  tenantId: string;
  projectId: string;
  revisionId: string;
  snapshotId: string;
  operations: ExecutableEditOperation[];
  outputRoles: string[];
  validatorVersion: string;
}

export interface EditorialChangeSetOperation {
  id: string;
  type: EditorialOperationType;
  payload: Record<string, unknown>;
}

export interface EditorialChangeSet {
  schemaVersion: typeof EDITORIAL_CHANGE_SET_SCHEMA;
  changeSetId: string;
  tenantId: string;
  projectId: string;
  expectedRevisionId: string;
  planHash: string;
  operations: EditorialChangeSetOperation[];
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_HASH = /^[A-Za-z0-9._:-]{1,256}$/;
const SAFE_REF = /^[A-Za-z0-9._:/-]{1,256}$/;
const OPERATION_TYPES = new Set<EditorialOperationType>([
  "cut",
  "trim",
  "ripple",
  "reframe",
  "camera",
  "audio_mix",
  "caption",
  "marker",
  "metadata",
]);
const EVIDENCE_STATUSES = new Set<EditorialEvidenceStatus>([
  "pending",
  "available",
  "degraded",
  "invalid",
  "expired",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertSafeValue(value: unknown): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("EDITORIAL_UNSAFE_INPUT");
  }
  if (
    /(?:^|[\\/])(?:home|Users|tmp|var)(?:[\\/])|(?:^|[\\/])\.\.(?:[\\/])|child_process|shell\.exec|<script/i.test(
      serialized,
    )
  ) {
    throw new Error("EDITORIAL_UNSAFE_INPUT");
  }
}

function assertId(
  value: unknown,
  code = "EDITORIAL_ID_INVALID",
): asserts value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(code);
}

function assertStringArray(
  value: unknown,
  code: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !SAFE_ID.test(item))
  )
    throw new Error(code);
}

function assertRange(operation: {
  startTick?: unknown;
  endTick?: unknown;
}): void {
  if (
    !Number.isSafeInteger(operation.startTick) ||
    !Number.isSafeInteger(operation.endTick) ||
    (operation.startTick as number) < 0 ||
    (operation.endTick as number) <= (operation.startTick as number)
  ) {
    throw new Error("EDITORIAL_TIME_RANGE_INVALID");
  }
}

function assertOperation(
  value: unknown,
  requireDependencies: boolean,
): asserts value is EditorialIntentOperation | ExecutableEditOperation {
  if (!isRecord(value)) throw new Error("EDITORIAL_OPERATION_INVALID");
  assertSafeValue(value);
  assertId(value.id);
  if (
    typeof value.type !== "string" ||
    !OPERATION_TYPES.has(value.type as EditorialOperationType)
  )
    throw new Error("EDITORIAL_OPERATION_UNSUPPORTED");
  assertRange(value);
  if (requireDependencies || value.dependsOn !== undefined)
    assertStringArray(value.dependsOn ?? [], "PLAN_DEPENDENCY_INVALID");
  if (value.payload !== undefined && !isRecord(value.payload))
    throw new Error("EDITORIAL_OPERATION_INVALID");
}

function assertCommonBinding(value: Record<string, unknown>): void {
  assertId(value.tenantId);
  assertId(value.projectId);
  assertId(value.revisionId);
  assertId(value.snapshotId);
}

function assertAcyclic(
  operations: Array<{ id: string; dependsOn?: string[] }>,
): void {
  const ids = new Set(operations.map((operation) => operation.id));
  if (
    ids.size !== operations.length ||
    operations.some((operation) =>
      (operation.dependsOn ?? []).some(
        (dependency) => !ids.has(dependency) || dependency === operation.id,
      ),
    )
  ) {
    throw new Error("PLAN_DEPENDENCY_INVALID");
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(
    operations.map((operation) => [operation.id, operation]),
  );
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const operation = byId.get(id);
    if (!operation) return false;
    visiting.add(id);
    for (const dependency of operation.dependsOn ?? [])
      if (!visit(dependency)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  if (operations.some((operation) => !visit(operation.id)))
    throw new Error("PLAN_DEPENDENCY_INVALID");
}

export function assertEditorialEvidence(
  value: unknown,
): EditorialEvidenceBundle {
  if (!isRecord(value)) throw new Error("EVIDENCE_INVALID");
  assertSafeValue(value);
  if (value.schemaVersion !== EDITORIAL_EVIDENCE_SCHEMA)
    throw new Error("EVIDENCE_VERSION_UNSUPPORTED");
  assertId(value.evidenceId);
  assertCommonBinding(value);
  assertId(value.sourceFingerprint);
  if (
    typeof value.status !== "string" ||
    !EVIDENCE_STATUSES.has(value.status as EditorialEvidenceStatus)
  )
    throw new Error("EVIDENCE_STATUS_INVALID");
  if (
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  )
    throw new Error("EVIDENCE_CONFIDENCE_INVALID");
  if (
    !isRecord(value.provenance) ||
    !Array.isArray(value.evidenceRefs) ||
    value.evidenceRefs.some(
      (ref) => typeof ref !== "string" || !SAFE_REF.test(ref),
    )
  )
    throw new Error("EVIDENCE_PROVENANCE_INVALID");
  if (
    !Array.isArray(value.warnings) ||
    value.warnings.some(
      (warning) => typeof warning !== "string" || warning.length > 512,
    )
  )
    throw new Error("EVIDENCE_WARNING_INVALID");
  assertId(value.evidenceHash, "EVIDENCE_HASH_INVALID");
  if (value.timebase !== undefined) assertCanonicalTimebase(value.timebase);
  return value as unknown as EditorialEvidenceBundle;
}

export function assertEditorialIntent(value: unknown): EditorialIntentPlan {
  if (!isRecord(value)) throw new Error("INTENT_INVALID");
  assertSafeValue(value);
  if (value.schemaVersion !== EDITORIAL_INTENT_SCHEMA)
    throw new Error("INTENT_VERSION_UNSUPPORTED");
  assertId(value.intentId);
  assertCommonBinding(value);
  assertStringArray(value.evidenceRefs, "INTENT_EVIDENCE_INVALID");
  assertId(value.policyVersion);
  if (
    typeof value.reviewRequired !== "boolean" ||
    !Array.isArray(value.operations)
  )
    throw new Error("INTENT_INVALID");
  value.operations.forEach((operation) => assertOperation(operation, false));
  assertAcyclic(value.operations);
  return value as unknown as EditorialIntentPlan;
}

export function assertExecutableEditPlan(value: unknown): ExecutableEditPlan {
  if (!isRecord(value)) throw new Error("PLAN_INVALID");
  assertSafeValue(value);
  if (value.schemaVersion !== EDITORIAL_PLAN_SCHEMA)
    throw new Error("PLAN_VERSION_UNSUPPORTED");
  assertId(value.planId);
  assertId(value.planHash, "PLAN_HASH_INVALID");
  assertCommonBinding(value);
  if (
    !Array.isArray(value.operations) ||
    value.operations.some((operation) => {
      try {
        assertOperation(operation, true);
        return false;
      } catch {
        return true;
      }
    })
  )
    throw new Error("PLAN_OPERATION_INVALID");
  assertAcyclic(
    value.operations as Array<{ id: string; dependsOn?: string[] }>,
  );
  assertStringArray(value.outputRoles, "PLAN_OUTPUT_INVALID");
  if (
    typeof value.validatorVersion !== "string" ||
    !SAFE_ID.test(value.validatorVersion)
  )
    throw new Error("PLAN_VALIDATOR_INVALID");
  return value as unknown as ExecutableEditPlan;
}

export function assertEditorialChangeSet(value: unknown): EditorialChangeSet {
  if (!isRecord(value)) throw new Error("CHANGE_SET_INVALID");
  assertSafeValue(value);
  if (value.schemaVersion !== EDITORIAL_CHANGE_SET_SCHEMA)
    throw new Error("CHANGE_SET_VERSION_UNSUPPORTED");
  assertId(value.changeSetId);
  assertId(value.tenantId);
  assertId(value.projectId);
  assertId(value.expectedRevisionId);
  assertId(value.planHash, "CHANGE_SET_PLAN_INVALID");
  if (!Array.isArray(value.operations) || value.operations.length === 0)
    throw new Error("CHANGE_SET_INVALID");
  const ids = new Set<string>();
  for (const operation of value.operations) {
    if (!isRecord(operation)) throw new Error("CHANGE_SET_OPERATION_INVALID");
    assertId(operation.id);
    if (ids.has(operation.id)) throw new Error("CHANGE_SET_OPERATION_INVALID");
    ids.add(operation.id);
    if (
      typeof operation.type !== "string" ||
      !OPERATION_TYPES.has(operation.type as EditorialOperationType) ||
      !isRecord(operation.payload)
    )
      throw new Error("CHANGE_SET_OPERATION_INVALID");
  }
  return value as unknown as EditorialChangeSet;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortValue(item)]),
  );
}

export async function computeEditorialContractHash(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(sortValue(value)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
