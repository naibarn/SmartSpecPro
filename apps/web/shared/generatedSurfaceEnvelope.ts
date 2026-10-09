/**
 * Bounded contract validation for CompiledGeneratedSurfaceV3 and §35 region
 * patches. This module has no renderer, persistence, authorization, or caller.
 * The component manifest and patch operation validator are explicit trusted
 * inputs supplied by a future owner integration.
 */

export interface GeneratedSurfaceValidationLimits {
  maxPayloadBytes: number;
  maxRegions: number;
  maxComponents: number;
  maxReferences: number;
  maxStringLength: number;
  maxDepth: number;
  maxOperations: number;
}

/** Hard ceilings keep a caller-supplied workload budget bounded. */
export const GENERATED_SURFACE_HARD_LIMITS = Object.freeze({
  maxPayloadBytes: 1_048_576,
  maxRegions: 64,
  maxComponents: 512,
  maxReferences: 256,
  maxStringLength: 4_096,
  maxDepth: 32,
  maxOperations: 512,
});

export const DEFAULT_GENERATED_SURFACE_LIMITS: GeneratedSurfaceValidationLimits =
  GENERATED_SURFACE_HARD_LIMITS;

export interface CompiledGeneratedSurfaceRegionV3 {
  regionId: string;
  revision: number;
  components: unknown[];
  sourceFieldAllowlistRef: string;
}

export interface CompiledGeneratedSurfaceV3 {
  protocol: "smartaihub.generated-ui";
  schemaVersion: "3.0";
  surfaceId: string;
  surfaceRevision: number;
  dataRevision: string;
  sourceResultRef: string;
  provenanceDigest: string;
  scopeRef: string;
  componentManifestRef: string;
  renderPolicyRef: string;
  regions: CompiledGeneratedSurfaceRegionV3[];
  serverActionBindingRefs: string[];
  fallbackResultRef: string;
  retentionPolicyRef: string;
  createdAt: string;
  expiresAt?: string;
}

export interface TrustedGeneratedSurfaceManifest {
  /** Canonical reference and version resolved by the caller from trusted state. */
  ref: string;
  version: string;
  /** Validates each complete region against the authoritative component schemas. */
  validateComponents(regionId: string, components: readonly unknown[]): boolean;
}

export type SurfaceValidationErrorCode =
  | "INVALID_SHAPE"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_RESERVED_FIELD"
  | "INVALID_REFERENCE"
  | "INVALID_REVISION"
  | "DUPLICATE_ID"
  | "MANIFEST_MISMATCH"
  | "COMPONENT_SCHEMA_REJECTED"
  | "BUDGET_EXCEEDED"
  | "INVALID_JSON_VALUE"
  | "INVALID_TIME";

export type SurfaceValidationResult =
  | { ok: true; value: CompiledGeneratedSurfaceV3 }
  | { ok: false; code: SurfaceValidationErrorCode; reason: string };

const SURFACE_KEYS = new Set([
  "protocol",
  "schemaVersion",
  "surfaceId",
  "surfaceRevision",
  "dataRevision",
  "sourceResultRef",
  "provenanceDigest",
  "scopeRef",
  "componentManifestRef",
  "renderPolicyRef",
  "regions",
  "serverActionBindingRefs",
  "fallbackResultRef",
  "retentionPolicyRef",
  "createdAt",
  "expiresAt",
]);
const REGION_KEYS = new Set([
  "regionId",
  "revision",
  "components",
  "sourceFieldAllowlistRef",
]);
const PATCH_KEYS = new Set([
  "surfaceId",
  "regionId",
  "sequence",
  "baseRegionRevision",
  "nextRegionRevision",
  "sourceDataRevision",
  "manifestVersion",
  "operations",
  "contentDigest",
  "traceId",
]);
const REGION_STATE_KEYS = new Set([
  "surfaceId",
  "regionId",
  "revision",
  "sourceDataRevision",
  "componentManifestRef",
  "manifestVersion",
  "lastSequence",
  "components",
  "otherRegionComponentIds",
]);
const MANIFEST_KEYS = new Set(["ref", "version", "validateComponents"]);

// These names must never be smuggled through generated data or component props.
const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "tenantid",
  "principalid",
  "actorid",
  "tenant",
  "principal",
  "ownerid",
  "permissions",
  "permission",
  "authorization",
  "authorizationproof",
  "grant",
  "grants",
  "capabilitygrant",
  "serveraction",
  "serveractions",
  "actiongrant",
  "credential",
  "credentials",
  "secret",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "deviceproof",
  "csrf",
  "nonce",
]);

type PlainRecord = Record<string, unknown>;

function fail(
  code: SurfaceValidationErrorCode,
  reason: string
): SurfaceValidationResult {
  return { ok: false, code, reason };
}

function isRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length > GENERATED_SURFACE_HARD_LIMITS.maxPayloadBytes / 4 ||
      keys.some(key => typeof key !== "string")
    )
      return false;
    return keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key as string);
      return (
        descriptor !== undefined &&
        Object.prototype.hasOwnProperty.call(descriptor, "value") &&
        descriptor.enumerable
      );
    });
  } catch {
    return false;
  }
}

function hasOnlyKeys(
  record: PlainRecord,
  allowed: ReadonlySet<string>
): boolean {
  try {
    return Reflect.ownKeys(record).every(
      key => typeof key === "string" && allowed.has(key)
    );
  } catch {
    return false;
  }
}

function validText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validPositiveSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRfc3339Timestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(
      value
    );
  if (!match) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHour,
    offsetMinute,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (offsetHour !== undefined && Number(offsetHour) > 23) ||
    (offsetMinute !== undefined && Number(offsetMinute) > 59)
  )
    return false;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  return (
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day &&
    Number.isFinite(Date.parse(value))
  );
}

function normalizeLimits(
  input: GeneratedSurfaceValidationLimits
): GeneratedSurfaceValidationLimits | null {
  if (!isRecord(input)) return null;
  const keys = Object.keys(GENERATED_SURFACE_HARD_LIMITS) as Array<
    keyof GeneratedSurfaceValidationLimits
  >;
  const normalized = {} as GeneratedSurfaceValidationLimits;
  for (const key of keys) {
    const value = input[key];
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      value > GENERATED_SURFACE_HARD_LIMITS[key]
    )
      return null;
    normalized[key] = value;
  }
  return Object.freeze(normalized);
}

function forbiddenKeyPresent(
  value: unknown,
  depth: number,
  maxDepth: number
): boolean {
  if (depth > maxDepth) return true;
  if (Array.isArray(value))
    return value.some(item => forbiddenKeyPresent(item, depth + 1, maxDepth));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      FORBIDDEN_KEYS.has(key.toLowerCase().replace(/[_-]/gu, "")) ||
      forbiddenKeyPresent(child, depth + 1, maxDepth)
  );
}

function assertJsonValue(
  value: unknown,
  maxDepth: number,
  maxPayloadBytes: number = GENERATED_SURFACE_HARD_LIMITS.maxPayloadBytes,
  maxStringLength: number = GENERATED_SURFACE_HARD_LIMITS.maxStringLength
): void {
  const visited = new Set<object>();
  let estimatedBytes = 0;
  const account = (bytes: number): void => {
    estimatedBytes += bytes;
    if (estimatedBytes > maxPayloadBytes)
      throw new RangeError("JSON payload budget exceeded");
  };
  const visit = (current: unknown, depth: number): void => {
    if (depth > maxDepth) throw new TypeError("JSON nesting budget exceeded");
    if (current === null) {
      account(4);
      return;
    }
    if (typeof current === "string") {
      if (current.length > maxStringLength)
        throw new RangeError("JSON string budget exceeded");
      // Six bytes per UTF-16 code unit bounds JSON escaping, including controls.
      account(current.length * 6 + 2);
      return;
    }
    if (typeof current === "boolean") {
      account(current ? 4 : 5);
      return;
    }
    if (typeof current === "number" && Number.isFinite(current)) {
      const encoded = JSON.stringify(current);
      if (encoded === undefined)
        throw new TypeError("Value is not JSON-compatible");
      account(encoded.length);
      return;
    }
    if (typeof current !== "object")
      throw new TypeError("Value is not JSON-compatible");
    if (visited.has(current)) throw new TypeError("Cyclic JSON value");
    visited.add(current);
    if (Array.isArray(current)) {
      account(2 + Math.max(0, current.length - 1));
      const ownKeys = Reflect.ownKeys(current);
      if (
        ownKeys.some(
          key =>
            typeof key !== "string" ||
            (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key))
        )
      ) {
        throw new TypeError(
          "Arrays with extra properties are not JSON-compatible"
        );
      }
      for (let index = 0; index < current.length; index += 1) {
        if (!(index in current))
          throw new TypeError("Sparse arrays are not JSON-compatible");
        const descriptor = Object.getOwnPropertyDescriptor(
          current,
          String(index)
        );
        if (
          !descriptor?.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, "value")
        ) {
          throw new TypeError("Array entries must be enumerable data values");
        }
        visit(current[index], depth + 1);
      }
    } else {
      if (!isRecord(current))
        throw new TypeError("Only plain JSON objects are accepted");
      account(2);
      for (const [key, child] of Object.entries(current)) {
        account(key.length * 6 + 4); // quoted key, colon and a possible comma
        visit(child, depth + 1);
      }
    }
    visited.delete(current);
  };
  visit(value, 0);
}

function canonicalJson(
  value: unknown,
  maxDepth: number,
  maxPayloadBytes: number = GENERATED_SURFACE_HARD_LIMITS.maxPayloadBytes,
  maxStringLength: number = GENERATED_SURFACE_HARD_LIMITS.maxStringLength
): string {
  assertJsonValue(value, maxDepth, maxPayloadBytes, maxStringLength);
  const encode = (current: unknown, depth: number): string => {
    if (depth > maxDepth) throw new TypeError("JSON nesting budget exceeded");
    if (current === null || typeof current !== "object") {
      const encoded = JSON.stringify(current);
      if (encoded === undefined)
        throw new TypeError("Value is not JSON-compatible");
      return encoded;
    }
    if (Array.isArray(current))
      return `[${current.map(item => encode(item, depth + 1)).join(",")}]`;
    const record = current as PlainRecord;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${encode(record[key], depth + 1)}`)
      .join(",")}}`;
  };
  return encode(value, 0);
}

function cloneJson<T>(
  value: T,
  maxDepth: number,
  maxPayloadBytes: number = GENERATED_SURFACE_HARD_LIMITS.maxPayloadBytes,
  maxStringLength: number = GENERATED_SURFACE_HARD_LIMITS.maxStringLength
): T {
  return JSON.parse(
    canonicalJson(value, maxDepth, maxPayloadBytes, maxStringLength)
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function payloadBytes(
  value: unknown,
  maxDepth: number,
  maxPayloadBytes: number = GENERATED_SURFACE_HARD_LIMITS.maxPayloadBytes,
  maxStringLength: number = GENERATED_SURFACE_HARD_LIMITS.maxStringLength
): number {
  return new TextEncoder().encode(
    canonicalJson(value, maxDepth, maxPayloadBytes, maxStringLength)
  ).byteLength;
}

function validateComponentList(
  regionId: string,
  components: unknown,
  manifest: TrustedGeneratedSurfaceManifest,
  maxStringLength: number,
  maxDepth: number,
  maxPayloadBytes: number
): components is unknown[] {
  if (!Array.isArray(components)) return false;
  const ids = new Set<string>();
  for (const component of components) {
    if (
      !isRecord(component) ||
      !validText(component.id, maxStringLength) ||
      !validText(component.type, maxStringLength) ||
      forbiddenKeyPresent(component, 0, maxDepth)
    )
      return false;
    if (ids.has(component.id)) return false;
    ids.add(component.id);
  }
  try {
    return (
      manifest.validateComponents(
        regionId,
        deepFreeze(
          cloneJson(components, maxDepth, maxPayloadBytes, maxStringLength)
        )
      ) === true
    );
  } catch {
    return false;
  }
}

/** Validate a server-produced V3 envelope against an explicitly trusted manifest. */
export function validateCompiledGeneratedSurfaceV3(
  input: unknown,
  manifest: TrustedGeneratedSurfaceManifest,
  limitsInput: GeneratedSurfaceValidationLimits,
  nowMs: number
): SurfaceValidationResult {
  try {
    return validateCompiledGeneratedSurfaceV3Inner(
      input,
      manifest,
      limitsInput,
      nowMs
    );
  } catch {
    return fail("INVALID_SHAPE", "Surface validation rejected malformed input");
  }
}

function validateCompiledGeneratedSurfaceV3Inner(
  input: unknown,
  manifest: TrustedGeneratedSurfaceManifest,
  limitsInput: GeneratedSurfaceValidationLimits,
  nowMs: number
): SurfaceValidationResult {
  const limits = normalizeLimits(limitsInput);
  if (!limits)
    return fail(
      "BUDGET_EXCEEDED",
      "Validation limits are missing or exceed hard ceilings"
    );
  if (!isRecord(input))
    return fail("INVALID_SHAPE", "Surface must be a plain object");
  if (
    input.protocol !== "smartaihub.generated-ui" ||
    input.schemaVersion !== "3.0"
  ) {
    return fail(
      "UNSUPPORTED_VERSION",
      "Only CompiledGeneratedSurfaceV3 is accepted"
    );
  }
  if (!hasOnlyKeys(input, SURFACE_KEYS))
    return fail("UNKNOWN_RESERVED_FIELD", "Surface has an unknown field");
  try {
    assertJsonValue(
      input,
      limits.maxDepth,
      limits.maxPayloadBytes,
      limits.maxStringLength
    );
  } catch (error) {
    if (error instanceof RangeError)
      return fail("BUDGET_EXCEEDED", "Surface JSON payload exceeds its budget");
    return fail(
      "INVALID_JSON_VALUE",
      "Surface contains a non-JSON or over-budget value"
    );
  }
  if (forbiddenKeyPresent(input, 0, limits.maxDepth)) {
    return fail(
      "UNKNOWN_RESERVED_FIELD",
      "Surface contains a reserved security or authority field"
    );
  }

  const scalarRefs = [
    "surfaceId",
    "dataRevision",
    "sourceResultRef",
    "provenanceDigest",
    "scopeRef",
    "componentManifestRef",
    "renderPolicyRef",
    "fallbackResultRef",
    "retentionPolicyRef",
  ] as const;
  if (scalarRefs.some(key => !validText(input[key], limits.maxStringLength))) {
    return fail(
      "INVALID_REFERENCE",
      "Surface identifiers, revisions and references must be bounded strings"
    );
  }
  if (
    input.componentManifestRef !== manifest.ref ||
    !validText(manifest.version, limits.maxStringLength)
  ) {
    return fail(
      "MANIFEST_MISMATCH",
      "Surface manifest reference does not match the trusted manifest"
    );
  }
  if (
    !validRevision(input.surfaceRevision) ||
    !Array.isArray(input.regions) ||
    input.regions.length === 0
  ) {
    return fail(
      "INVALID_REVISION",
      "Surface revision or region count is invalid"
    );
  }
  if (input.regions.length > limits.maxRegions)
    return fail("BUDGET_EXCEEDED", "Region budget exceeded");
  if (
    !Array.isArray(input.serverActionBindingRefs) ||
    input.serverActionBindingRefs.length > limits.maxReferences ||
    !input.serverActionBindingRefs.every(ref =>
      validText(ref, limits.maxStringLength)
    ) ||
    new Set(input.serverActionBindingRefs).size !==
      input.serverActionBindingRefs.length
  ) {
    return fail(
      "INVALID_REFERENCE",
      "Server action binding references are invalid or duplicated"
    );
  }
  if (
    !validText(input.createdAt, limits.maxStringLength) ||
    (input.expiresAt !== undefined &&
      !validText(input.expiresAt, limits.maxStringLength))
  ) {
    return fail("INVALID_TIME", "Surface timestamps must be bounded strings");
  }
  const createdAtText = input.createdAt as string;
  const expiresAtText = input.expiresAt as string | undefined;
  if (
    !isRfc3339Timestamp(createdAtText) ||
    (expiresAtText !== undefined && !isRfc3339Timestamp(expiresAtText))
  ) {
    return fail(
      "INVALID_TIME",
      "Surface timestamps must use strict RFC3339 form"
    );
  }
  const createdAt = Date.parse(createdAtText);
  const expiresAt =
    expiresAtText === undefined ? undefined : Date.parse(expiresAtText);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(createdAt) ||
    createdAt > nowMs ||
    (expiresAt !== undefined &&
      (!Number.isFinite(expiresAt) ||
        expiresAt <= nowMs ||
        expiresAt <= createdAt))
  ) {
    return fail(
      "INVALID_TIME",
      "Surface timestamps are invalid, future-dated or expired"
    );
  }

  const regionIds = new Set<string>();
  const componentIds = new Set<string>();
  let componentCount = 0;
  let referenceCount = input.serverActionBindingRefs.length + scalarRefs.length;
  for (const regionValue of input.regions) {
    if (!isRecord(regionValue) || !hasOnlyKeys(regionValue, REGION_KEYS)) {
      return fail(
        "UNKNOWN_RESERVED_FIELD",
        "Region has an unknown field or invalid shape"
      );
    }
    if (
      !validText(regionValue.regionId, limits.maxStringLength) ||
      !validText(regionValue.sourceFieldAllowlistRef, limits.maxStringLength)
    ) {
      return fail(
        "INVALID_REFERENCE",
        "Region identifier or source allowlist reference is invalid"
      );
    }
    if (regionIds.has(regionValue.regionId))
      return fail("DUPLICATE_ID", "Region identifiers must be unique");
    regionIds.add(regionValue.regionId);
    referenceCount += 1;
    if (!validRevision(regionValue.revision))
      return fail("INVALID_REVISION", "Region revision is invalid");
    if (!Array.isArray(regionValue.components))
      return fail("INVALID_SHAPE", "Region components must be an array");
    componentCount += regionValue.components.length;
    if (componentCount > limits.maxComponents)
      return fail("BUDGET_EXCEEDED", "Component budget exceeded");
    if (
      !validateComponentList(
        regionValue.regionId,
        regionValue.components,
        manifest,
        limits.maxStringLength,
        limits.maxDepth,
        limits.maxPayloadBytes
      )
    ) {
      return fail(
        "COMPONENT_SCHEMA_REJECTED",
        "A component failed its trusted manifest schema"
      );
    }
    for (const component of regionValue.components) {
      const id = (component as PlainRecord).id as string;
      if (componentIds.has(id))
        return fail(
          "DUPLICATE_ID",
          "Component identifiers must be unique across the surface"
        );
      componentIds.add(id);
    }
  }
  if (referenceCount > limits.maxReferences)
    return fail("BUDGET_EXCEEDED", "Reference budget exceeded");
  try {
    if (
      payloadBytes(
        input,
        limits.maxDepth,
        limits.maxPayloadBytes,
        limits.maxStringLength
      ) > limits.maxPayloadBytes
    ) {
      return fail("BUDGET_EXCEEDED", "Surface payload byte budget exceeded");
    }
  } catch {
    return fail("INVALID_JSON_VALUE", "Surface cannot be canonically encoded");
  }
  return {
    ok: true,
    value: cloneJson(
      input,
      limits.maxDepth,
      limits.maxPayloadBytes,
      limits.maxStringLength
    ) as unknown as CompiledGeneratedSurfaceV3,
  };
}

export interface GeneratedSurfaceRegionPatchV1 {
  surfaceId: string;
  regionId: string;
  sequence: number;
  baseRegionRevision: number;
  nextRegionRevision: number;
  sourceDataRevision: string;
  manifestVersion: string;
  operations: unknown[];
  contentDigest: string;
  traceId: string;
}

/** State must be loaded from an already-authorized canonical snapshot. */
export interface AuthorizedGeneratedSurfaceRegionState {
  surfaceId: string;
  regionId: string;
  revision: number;
  sourceDataRevision: string;
  componentManifestRef: string;
  manifestVersion: string;
  lastSequence: number;
  components: readonly unknown[];
  /** IDs from the same authorized surface snapshot, excluding this region. */
  otherRegionComponentIds: readonly string[];
}

export type RegionPatchResult =
  | { status: "APPLIED"; state: AuthorizedGeneratedSurfaceRegionState }
  | {
      status: "RECONCILE_SNAPSHOT";
      state: AuthorizedGeneratedSurfaceRegionState;
      reason: string;
    };

export interface RegionPatchDependencies {
  manifest: TrustedGeneratedSurfaceManifest;
  limits: GeneratedSurfaceValidationLimits;
  /** Authoritative operation/schema adapter. It must return a full replacement list. */
  validateAndApplyOperations(
    currentComponents: readonly unknown[],
    operations: readonly unknown[],
    manifestVersion: string
  ): unknown[];
}

async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SHA-256 is unavailable");
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Stable digest contract: SHA-256 over canonical JSON of the complete patch
 * envelope with only `contentDigest` omitted, encoded as `sha256:<hex>`.
 */
export async function computeGeneratedSurfacePatchDigest(
  patch: unknown,
  maxDepth: number = GENERATED_SURFACE_HARD_LIMITS.maxDepth
): Promise<string> {
  if (!isRecord(patch)) throw new TypeError("Patch must be a plain object");
  const { contentDigest: _contentDigest, ...digestInput } = patch;
  void _contentDigest;
  const canonical = canonicalJson(digestInput, maxDepth);
  if (
    new TextEncoder().encode(canonical).byteLength >
    GENERATED_SURFACE_HARD_LIMITS.maxPayloadBytes
  ) {
    throw new RangeError("Patch payload exceeds hard byte limit");
  }
  return `sha256:${await sha256Hex(canonical)}`;
}

function patchShape(
  input: unknown,
  limits: GeneratedSurfaceValidationLimits
): input is GeneratedSurfaceRegionPatchV1 {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, PATCH_KEYS) &&
    input.surfaceId !== undefined &&
    validText(input.surfaceId, limits.maxStringLength) &&
    validText(input.regionId, limits.maxStringLength) &&
    validPositiveSequence(input.sequence) &&
    validRevision(input.baseRegionRevision) &&
    validRevision(input.nextRegionRevision) &&
    input.nextRegionRevision === input.baseRegionRevision + 1 &&
    validText(input.sourceDataRevision, limits.maxStringLength) &&
    validText(input.manifestVersion, limits.maxStringLength) &&
    Array.isArray(input.operations) &&
    input.operations.length <= limits.maxOperations &&
    validText(input.contentDigest, 71) &&
    /^sha256:[a-f0-9]{64}$/u.test(input.contentDigest) &&
    validText(input.traceId, limits.maxStringLength)
  );
}

function reconcile(
  state: AuthorizedGeneratedSurfaceRegionState,
  reason: string
): RegionPatchResult {
  return { status: "RECONCILE_SNAPSHOT", state, reason };
}

function snapshotRegionState(
  input: AuthorizedGeneratedSurfaceRegionState,
  limits: GeneratedSurfaceValidationLimits
): AuthorizedGeneratedSurfaceRegionState | null {
  if (!isRecord(input) || !hasOnlyKeys(input, REGION_STATE_KEYS)) return null;
  try {
    return Object.freeze({
      surfaceId: input.surfaceId as string,
      regionId: input.regionId as string,
      revision: input.revision as number,
      sourceDataRevision: input.sourceDataRevision as string,
      componentManifestRef: input.componentManifestRef as string,
      manifestVersion: input.manifestVersion as string,
      lastSequence: input.lastSequence as number,
      components: deepFreeze(
        cloneJson(
          input.components,
          limits.maxDepth,
          limits.maxPayloadBytes,
          limits.maxStringLength
        )
      ),
      otherRegionComponentIds: deepFreeze(
        cloneJson(
          input.otherRegionComponentIds,
          limits.maxDepth,
          limits.maxPayloadBytes,
          limits.maxStringLength
        )
      ),
    }) as AuthorizedGeneratedSurfaceRegionState;
  } catch {
    return null;
  }
}

/** Verify all fences/digest first, then validate the full replacement atomically. */
export async function reduceGeneratedSurfaceRegionPatch(
  current: AuthorizedGeneratedSurfaceRegionState,
  patchInput: unknown,
  dependencies: RegionPatchDependencies
): Promise<RegionPatchResult> {
  try {
    return await reduceGeneratedSurfaceRegionPatchInner(
      current,
      patchInput,
      dependencies
    );
  } catch {
    return reconcile(current, "MALFORMED_INPUT");
  }
}

async function reduceGeneratedSurfaceRegionPatchInner(
  currentInput: AuthorizedGeneratedSurfaceRegionState,
  patchInput: unknown,
  dependencies: RegionPatchDependencies
): Promise<RegionPatchResult> {
  const limits = normalizeLimits(dependencies.limits);
  if (!limits) return reconcile(currentInput, "INVALID_VALIDATION_BUDGET");
  const current = snapshotRegionState(currentInput, limits);
  if (!current)
    return reconcile(currentInput, "AUTHORIZED_SNAPSHOT_STATE_INVALID");

  const manifestInput = dependencies.manifest;
  const operationApplier = dependencies.validateAndApplyOperations;
  if (
    !isRecord(manifestInput) ||
    !hasOnlyKeys(manifestInput, MANIFEST_KEYS) ||
    !validText(manifestInput.ref, limits.maxStringLength) ||
    !validText(manifestInput.version, limits.maxStringLength) ||
    typeof manifestInput.validateComponents !== "function" ||
    typeof operationApplier !== "function"
  ) {
    return reconcile(current, "TRUSTED_VALIDATOR_DEPENDENCIES_INVALID");
  }
  const manifest: TrustedGeneratedSurfaceManifest = Object.freeze({
    ref: manifestInput.ref,
    version: manifestInput.version,
    validateComponents:
      manifestInput.validateComponents as TrustedGeneratedSurfaceManifest["validateComponents"],
  });

  let patch: GeneratedSurfaceRegionPatchV1;
  try {
    assertJsonValue(
      patchInput,
      limits.maxDepth,
      limits.maxPayloadBytes,
      limits.maxStringLength
    );
    const patchSnapshot = cloneJson(
      patchInput,
      limits.maxDepth,
      limits.maxPayloadBytes,
      limits.maxStringLength
    );
    if (!patchShape(patchSnapshot, limits))
      return reconcile(current, "INVALID_PATCH_ENVELOPE");
    patch = deepFreeze(patchSnapshot);
    if (
      forbiddenKeyPresent(patch, 0, limits.maxDepth) ||
      payloadBytes(
        patch,
        limits.maxDepth,
        limits.maxPayloadBytes,
        limits.maxStringLength
      ) > limits.maxPayloadBytes
    ) {
      return reconcile(current, "PATCH_SECURITY_OR_BUDGET_REJECTED");
    }
  } catch (error) {
    if (error instanceof RangeError)
      return reconcile(current, "PATCH_SECURITY_OR_BUDGET_REJECTED");
    return reconcile(current, "PATCH_JSON_INVALID");
  }
  if (
    !validRevision(current.revision) ||
    !validRevision(current.lastSequence) ||
    !validText(current.surfaceId, limits.maxStringLength) ||
    !validText(current.regionId, limits.maxStringLength) ||
    !validText(current.sourceDataRevision, limits.maxStringLength) ||
    !validText(current.componentManifestRef, limits.maxStringLength) ||
    !validText(current.manifestVersion, limits.maxStringLength) ||
    !Array.isArray(current.otherRegionComponentIds) ||
    !Array.isArray(current.components) ||
    current.components.length + current.otherRegionComponentIds.length >
      limits.maxComponents ||
    current.otherRegionComponentIds.some(
      id => !validText(id, limits.maxStringLength)
    ) ||
    new Set(current.otherRegionComponentIds).size !==
      current.otherRegionComponentIds.length
  ) {
    return reconcile(current, "AUTHORIZED_SNAPSHOT_STATE_INVALID");
  }
  if (
    patch.surfaceId !== current.surfaceId ||
    patch.regionId !== current.regionId
  ) {
    return reconcile(current, "SURFACE_OR_REGION_MISMATCH");
  }
  if (
    patch.baseRegionRevision !== current.revision ||
    patch.sequence !== current.lastSequence + 1
  ) {
    return reconcile(current, "REVISION_OR_SEQUENCE_GAP");
  }
  if (patch.sourceDataRevision !== current.sourceDataRevision) {
    return reconcile(current, "SOURCE_DATA_REVISION_CHANGED");
  }
  if (
    patch.manifestVersion !== current.manifestVersion ||
    manifest.ref !== current.componentManifestRef ||
    manifest.version !== current.manifestVersion
  ) {
    return reconcile(current, "MANIFEST_CHANGED");
  }
  if (
    !validateComponentList(
      current.regionId,
      current.components,
      manifest,
      limits.maxStringLength,
      limits.maxDepth,
      limits.maxPayloadBytes
    )
  ) {
    return reconcile(current, "AUTHORIZED_SNAPSHOT_COMPONENTS_INVALID");
  }
  const snapshotComponentIds = new Set<string>();
  for (const component of current.components) {
    if (
      !isRecord(component) ||
      !validText(component.id, limits.maxStringLength) ||
      snapshotComponentIds.has(component.id) ||
      current.otherRegionComponentIds.includes(component.id)
    ) {
      return reconcile(current, "AUTHORIZED_SNAPSHOT_COMPONENTS_INVALID");
    }
    snapshotComponentIds.add(component.id);
  }
  let expectedDigest: string;
  try {
    expectedDigest = await computeGeneratedSurfacePatchDigest(
      patch,
      limits.maxDepth
    );
  } catch {
    return reconcile(current, "PATCH_DIGEST_UNAVAILABLE");
  }
  if (expectedDigest !== patch.contentDigest)
    return reconcile(current, "PATCH_DIGEST_MISMATCH");

  let replacement: unknown[];
  try {
    const currentComponents = deepFreeze(
      cloneJson(
        current.components,
        limits.maxDepth,
        limits.maxPayloadBytes,
        limits.maxStringLength
      )
    );
    const operations = deepFreeze(
      cloneJson(
        patch.operations,
        limits.maxDepth,
        limits.maxPayloadBytes,
        limits.maxStringLength
      )
    );
    replacement = operationApplier(
      currentComponents,
      operations,
      patch.manifestVersion
    );
  } catch {
    return reconcile(current, "PATCH_OPERATION_REJECTED");
  }
  if (
    !Array.isArray(replacement) ||
    replacement.length > limits.maxComponents ||
    forbiddenKeyPresent(replacement, 0, limits.maxDepth)
  ) {
    return reconcile(current, "PATCH_REPLACEMENT_INVALID");
  }
  try {
    if (
      payloadBytes(
        replacement,
        limits.maxDepth,
        limits.maxPayloadBytes,
        limits.maxStringLength
      ) > limits.maxPayloadBytes ||
      !validateComponentList(
        current.regionId,
        replacement,
        manifest,
        limits.maxStringLength,
        limits.maxDepth,
        limits.maxPayloadBytes
      )
    ) {
      return reconcile(current, "PATCH_REPLACEMENT_SCHEMA_REJECTED");
    }
  } catch {
    return reconcile(current, "PATCH_REPLACEMENT_INVALID");
  }
  const otherIds = new Set(current.otherRegionComponentIds);
  if (
    replacement.some(
      component => isRecord(component) && otherIds.has(component.id as string)
    )
  ) {
    return reconcile(current, "PATCH_COMPONENT_ID_COLLISION");
  }
  const nextState: AuthorizedGeneratedSurfaceRegionState = Object.freeze({
    ...current,
    revision: patch.nextRegionRevision,
    lastSequence: patch.sequence,
    components: deepFreeze(
      cloneJson(
        replacement,
        limits.maxDepth,
        limits.maxPayloadBytes,
        limits.maxStringLength
      )
    ),
  });
  return { status: "APPLIED", state: nextState };
}
