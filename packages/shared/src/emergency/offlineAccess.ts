/**
 * Pure offline/accessibility contracts for emergency surfaces. They carry no
 * authorization decision and do not persist, send, or replay a mutation.
 */
export type OfflineNetworkState = "online" | "offline" | "constrained" | "unknown";
export type OfflineConnectivity = "LIVE" | "ONLINE_STALE" | "OFFLINE_CACHED" | "OFFLINE_STALE" | "CONSTRAINED_CACHED" | "UNKNOWN";

export interface OfflineAccessState {
  readonly connectivity: OfflineConnectivity;
  readonly dataThrough?: string;
  readonly isLive: boolean;
  /** Material actions must re-check current canonical data and authorization. */
  readonly actionRequiresRevalidation: boolean;
}

const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_FRESHNESS_MS = 31 * 24 * 60 * 60_000;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value));
}

function validRef(value: unknown): value is string {
  return typeof value === "string" && REF.test(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Produces an honest connectivity label. `LIVE` only means the device is online;
 * a caller still applies its data-class freshness policy before a material action.
 */
export function deriveOfflineAccessState(input: {
  readonly network: OfflineNetworkState;
  readonly dataThrough?: string;
  readonly now: string;
  readonly freshForMs: number;
}): OfflineAccessState {
  if (!isDate(input.now) || !["online", "offline", "constrained", "unknown"].includes(input.network) ||
    !Number.isSafeInteger(input.freshForMs) || input.freshForMs < 0 || input.freshForMs > MAX_FRESHNESS_MS ||
    (input.dataThrough !== undefined && !isDate(input.dataThrough))) {
    return { connectivity: "UNKNOWN", isLive: false, actionRequiresRevalidation: true };
  }
  if (input.dataThrough !== undefined && Date.parse(input.dataThrough) > Date.parse(input.now) + MAX_FUTURE_SKEW_MS) {
    return { connectivity: "UNKNOWN", isLive: false, actionRequiresRevalidation: true };
  }
  const hasCachedData = input.dataThrough !== undefined;
  const stale = hasCachedData && Date.parse(input.now) - Date.parse(input.dataThrough) > input.freshForMs;
  if (input.network === "online") {
    return hasCachedData && stale
      ? { connectivity: "ONLINE_STALE", dataThrough: input.dataThrough, isLive: false, actionRequiresRevalidation: true }
      : { connectivity: "LIVE", ...(hasCachedData ? { dataThrough: input.dataThrough } : {}), isLive: true, actionRequiresRevalidation: false };
  }
  if (input.network === "offline") {
    return hasCachedData && !stale
      ? { connectivity: "OFFLINE_CACHED", dataThrough: input.dataThrough, isLive: false, actionRequiresRevalidation: true }
      : hasCachedData
        ? { connectivity: "OFFLINE_STALE", dataThrough: input.dataThrough, isLive: false, actionRequiresRevalidation: true }
        : { connectivity: "UNKNOWN", isLive: false, actionRequiresRevalidation: true };
  }
  if (input.network === "constrained" && hasCachedData) {
    return { connectivity: "CONSTRAINED_CACHED", dataThrough: input.dataThrough, isLive: false, actionRequiresRevalidation: true };
  }
  return { connectivity: "UNKNOWN", isLive: false, actionRequiresRevalidation: true };
}

export interface AccessibleSpatialNarrative {
  readonly featureRef: string;
  readonly text: string;
}

const geometryText: Readonly<Record<string, string>> = {
  point: "location", area: "area", route: "route", corridor: "corridor", unknown: "area of unknown shape",
};
const relationText = new Set(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west", "nearby", "overlaps", "unknown"]);

/**
 * Creates a text-equivalent geometry summary from pre-authorized, generalized
 * relation data. It intentionally accepts no coordinates or raw GeoJSON.
 */
export function buildAccessibleSpatialNarrative(input: {
  readonly featureRef: string;
  readonly label: string;
  readonly geometryKind: "point" | "area" | "route" | "corridor" | "unknown";
  readonly relation: "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west" | "north-west" | "nearby" | "overlaps" | "unknown";
  readonly distanceMeters?: number;
  readonly precision: "approximate" | "generalized";
  readonly dataThrough: string;
}): AccessibleSpatialNarrative | undefined {
  if (!validRef(input.featureRef) || typeof input.label !== "string" || !input.label.trim() || input.label.length > 128 || /[\u0000-\u001F\u007F]/.test(input.label) ||
    !geometryText[input.geometryKind] || !relationText.has(input.relation) || !["approximate", "generalized"].includes(input.precision) || !isDate(input.dataThrough) ||
    (input.distanceMeters !== undefined && (!Number.isFinite(input.distanceMeters) || input.distanceMeters < 0 || input.distanceMeters > 2_000_000))) return undefined;
  if ((input.relation === "overlaps" || input.relation === "unknown") && input.distanceMeters !== undefined) return undefined;
  const relation = input.relation === "unknown" ? "" : input.relation === "overlaps" ? ", overlapping the selected area" : ` ${input.relation}`;
  const distance = input.distanceMeters === undefined ? "" : input.distanceMeters < 1000 ? `, about ${Math.round(input.distanceMeters)} m` : `, about ${(input.distanceMeters / 1000).toFixed(1)} km`;
  return {
    featureRef: input.featureRef,
    text: `${input.label.trim()}: ${input.precision} ${geometryText[input.geometryKind]}${distance}${relation}. Data through ${input.dataThrough}.`,
  };
}

export type OfflineMutationOperation = "emergency-report-create" | "emergency-watch-create" | "emergency-watch-update" | "emergency-watch-revoke";
export type OfflineMutationState = "PENDING" | "UPLOADING" | "CONFLICT";

export interface OfflineMutationEnvelope {
  readonly schemaVersion: 1;
  readonly localOperationId: string;
  readonly idempotencyKey: string;
  readonly environment: "LIVE" | "EXERCISE";
  readonly operationType: OfflineMutationOperation;
  readonly clientCreatedAt: string;
  readonly clientSequence: number;
  readonly targetCanonicalRef?: string;
  readonly baseRevisionRef?: string;
  /** A device-local opaque reference; raw payloads are not replayed by this contract. */
  readonly payloadRef: string;
  readonly mediaUploadRefs?: readonly string[];
  readonly state: OfflineMutationState;
  readonly retryCount: number;
}

const mutationOperations = new Set<OfflineMutationOperation>(["emergency-report-create", "emergency-watch-create", "emergency-watch-update", "emergency-watch-revoke"]);
const mutationStates = new Set<OfflineMutationState>(["PENDING", "UPLOADING", "CONFLICT"]);
const exercisePrefix = "exercise:";

/**
 * Validates local intent before storage or replay. Server authorization,
 * canonical revision checks, idempotent execution, audit, and media handling
 * remain mandatory at reconnect.
 */
export function parseOfflineMutationEnvelope(value: unknown): OfflineMutationEnvelope | undefined {
  const clientSequence = isPlainRecord(value) ? value.clientSequence : undefined;
  const retryCount = isPlainRecord(value) ? value.retryCount : undefined;
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "localOperationId", "idempotencyKey", "environment", "operationType", "clientCreatedAt", "clientSequence", "targetCanonicalRef", "baseRevisionRef", "payloadRef", "mediaUploadRefs", "state", "retryCount"]) ||
    value.schemaVersion !== 1 || !validRef(value.localOperationId) || value.idempotencyKey !== value.localOperationId ||
    (value.environment !== "LIVE" && value.environment !== "EXERCISE") || typeof value.operationType !== "string" || !mutationOperations.has(value.operationType as OfflineMutationOperation) ||
    !isDate(value.clientCreatedAt) || !isSafeInteger(clientSequence) || clientSequence < 1 || clientSequence > 2_147_483_647 ||
    !validRef(value.payloadRef) || typeof value.state !== "string" || !mutationStates.has(value.state as OfflineMutationState) ||
    !isSafeInteger(retryCount) || retryCount < 0 || retryCount > 100) return undefined;
  const target = value.targetCanonicalRef;
  const base = value.baseRevisionRef;
  if ((target !== undefined && !validRef(target)) || (base !== undefined && !validRef(base))) return undefined;
  const needsTarget = value.operationType === "emergency-watch-update" || value.operationType === "emergency-watch-revoke";
  if (needsTarget !== (target !== undefined) || (needsTarget && base === undefined) || (!needsTarget && (target !== undefined || base !== undefined))) return undefined;
  const isExercise = value.environment === "EXERCISE";
  if ((isExercise && (!value.payloadRef.startsWith(exercisePrefix) || (target !== undefined && !target.startsWith(exercisePrefix)))) ||
    (!isExercise && (value.payloadRef.startsWith(exercisePrefix) || (target !== undefined && target.startsWith(exercisePrefix))))) return undefined;
  let mediaUploadRefs: string[] | undefined;
  if (value.mediaUploadRefs !== undefined) {
    if (!Array.isArray(value.mediaUploadRefs) || value.mediaUploadRefs.length > 16 || value.mediaUploadRefs.some(ref => !validRef(ref)) || new Set(value.mediaUploadRefs).size !== value.mediaUploadRefs.length) return undefined;
    mediaUploadRefs = [...value.mediaUploadRefs];
  }
  return {
    schemaVersion: 1,
    localOperationId: value.localOperationId,
    idempotencyKey: value.localOperationId,
    environment: value.environment,
    operationType: value.operationType as OfflineMutationOperation,
    clientCreatedAt: value.clientCreatedAt,
    clientSequence,
    ...(target === undefined ? {} : { targetCanonicalRef: target }),
    ...(base === undefined ? {} : { baseRevisionRef: base }),
    payloadRef: value.payloadRef,
    ...(mediaUploadRefs === undefined ? {} : { mediaUploadRefs }),
    state: value.state as OfflineMutationState,
    retryCount,
  };
}
