/**
 * Boundary contracts for approved geospatial providers. These parsers only
 * validate bounded data and provenance. They intentionally do not authorize a
 * caller, resolve a URL, or decide an effective audience.
 */

export type GeoSourceContractError =
  | "GEO_SOURCE_CONTRACT_INVALID"
  | "GEO_SOURCE_CONTRACT_UNKNOWN_FIELD"
  | "GEO_SOURCE_POLICY_INVALID";

export type GeoSourceContractResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: GeoSourceContractError };

export interface GeoSourceRecordContract {
  readonly itemRef: string;
  readonly observedAt: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly crs: "EPSG:4326";
  readonly value: number;
  readonly unit: string;
  readonly originalValue?: string;
  readonly properties?: Readonly<Record<string, string | number | boolean>>;
}

export interface GeoSourceContract {
  readonly providerId: string;
  readonly contractVersion: string;
  readonly sourceRef: string;
  readonly sourceRevision: number;
  readonly acquiredAt: string;
  readonly observedAt: string;
  readonly schemaVersion: string;
  readonly contentHash: string;
  readonly licenseRef: string;
  readonly attribution: string;
  readonly allowedPurposes: readonly string[];
  readonly retentionClass: string;
  readonly freshness: { readonly cadenceSeconds: number; readonly staleAfterSeconds: number };
  readonly records: readonly GeoSourceRecordContract[];
  /** Additive fields are preserved only when the declared adapter permits it. */
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface GeoSourcePolicy {
  readonly sourceStatus: "active";
  readonly ownerRef: string;
  readonly rightsStatus: "granted";
  readonly licenseRef: string;
  readonly attribution: string;
  readonly allowedPurposes: readonly string[];
  readonly retentionClass: string;
  readonly configurationRevision: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA_256 = /^[a-f0-9]{64}$/;
const PURPOSE = /^[a-z][a-z0-9-]{0,63}$/;
const UNIT = /^[A-Za-z][A-Za-z0-9%*/^._-]{0,31}$/;
const PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_RECORDS = 2_000;
const MAX_TEXT = 512;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function isBoundedText(value: unknown, pattern = ID, maximum = MAX_TEXT): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && pattern.test(value);
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 32 || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}

const SECRET_FIELD = /(?:api[_-]?key|authorization|cookie|credential|password|secret|token)/i;
function boundedExtension(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  budget.nodes += 1;
  if (budget.nodes > 256 || depth > 5) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 1_024;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 64 && value.every(item => boundedExtension(item, depth + 1, budget));
  if (!isPlainRecord(value) || Object.keys(value).length > 64) return false;
  return Object.entries(value).every(([key, item]) => key.length <= 64 && !SECRET_FIELD.test(key) && boundedExtension(item, depth + 1, budget));
}

function isHttpsReference(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_TEXT) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parsePurposes(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16 || value.some(item => !isBoundedText(item, PURPOSE, 64))) return undefined;
  return [...new Set(value as string[])];
}

function parseProperties(value: unknown): Readonly<Record<string, string | number | boolean>> | undefined {
  if (value === undefined) return {};
  if (!isPlainRecord(value) || Object.keys(value).length > 32) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!PROPERTY_KEY.test(key) || (typeof item === "string" && item.length > MAX_TEXT) ||
      !["string", "number", "boolean"].includes(typeof item) || (typeof item === "number" && !Number.isFinite(item))) return undefined;
    result[key] = item as string | number | boolean;
  }
  return result;
}

function parseRecord(value: unknown): GeoSourceRecordContract | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["itemRef", "observedAt", "latitude", "longitude", "crs", "value", "unit", "originalValue", "properties"]) ||
    !isBoundedText(value.itemRef) || !isInstant(value.observedAt) ||
    typeof value.latitude !== "number" || !Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90 ||
    typeof value.longitude !== "number" || !Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180 ||
    value.crs !== "EPSG:4326" || typeof value.value !== "number" || !Number.isFinite(value.value) ||
    !isBoundedText(value.unit, UNIT, 32) || (value.originalValue !== undefined && (typeof value.originalValue !== "string" || value.originalValue.length > MAX_TEXT))) return undefined;
  const properties = parseProperties(value.properties);
  if (!properties) return undefined;
  return {
    itemRef: value.itemRef, observedAt: value.observedAt, latitude: value.latitude, longitude: value.longitude,
    crs: "EPSG:4326", value: value.value, unit: value.unit,
    ...(value.originalValue === undefined ? {} : { originalValue: value.originalValue }),
    ...(Object.keys(properties).length === 0 ? {} : { properties }),
  };
}

/** Parses a declared adapter version. Unknown top-level fields are rejected unless the adapter explicitly permits additive fields. */
export function parseGeoSourceContract(value: unknown, adapterPolicy: { readonly allowAdditionalFields: boolean } = { allowAdditionalFields: false }): GeoSourceContractResult<GeoSourceContract> {
  if (!isPlainRecord(value)) return { ok: false, code: "GEO_SOURCE_CONTRACT_INVALID" };
  const known = ["providerId", "contractVersion", "sourceRef", "sourceRevision", "acquiredAt", "observedAt", "schemaVersion", "contentHash", "licenseRef", "attribution", "allowedPurposes", "retentionClass", "freshness", "records"];
  const adapterAllowsExtensions = adapterPolicy.allowAdditionalFields === true;
  const unknown = Object.keys(value).filter(key => !known.includes(key));
  if (unknown.length && !adapterAllowsExtensions) return { ok: false, code: "GEO_SOURCE_CONTRACT_UNKNOWN_FIELD" };
  if (!isBoundedText(value.providerId) || !isBoundedText(value.contractVersion, VERSION, 64) || !isBoundedText(value.sourceRef) ||
    !Number.isInteger(value.sourceRevision) || (value.sourceRevision as number) < 1 || (value.sourceRevision as number) > 2_147_483_647 ||
    !isInstant(value.acquiredAt) || !isInstant(value.observedAt) || !isBoundedText(value.schemaVersion, VERSION, 64) ||
    typeof value.contentHash !== "string" || !SHA_256.test(value.contentHash) || !isHttpsReference(value.licenseRef) ||
    typeof value.attribution !== "string" || value.attribution.trim().length === 0 || value.attribution.length > MAX_TEXT ||
    !isBoundedText(value.retentionClass, PURPOSE, 64) || !isPlainRecord(value.freshness) ||
    !hasOnlyKeys(value.freshness, ["cadenceSeconds", "staleAfterSeconds"]) || !Number.isInteger(value.freshness.cadenceSeconds) ||
    !Number.isInteger(value.freshness.staleAfterSeconds) || (value.freshness.cadenceSeconds as number) < 1 ||
    (value.freshness.staleAfterSeconds as number) < (value.freshness.cadenceSeconds as number) ||
    (value.freshness.staleAfterSeconds as number) > 31 * 24 * 60 * 60 || !Array.isArray(value.records) || value.records.length > MAX_RECORDS) {
    return { ok: false, code: "GEO_SOURCE_CONTRACT_INVALID" };
  }
  const allowedPurposes = parsePurposes(value.allowedPurposes);
  const records = value.records.map(parseRecord);
  if (!allowedPurposes || records.some(record => !record)) return { ok: false, code: "GEO_SOURCE_CONTRACT_INVALID" };
  const extensionValues = unknown.map(key => [key, value[key]] as const);
  const extensions = adapterAllowsExtensions && unknown.length ? Object.fromEntries(extensionValues) : undefined;
  if (extensions && (!boundedExtension(extensions) || Buffer.byteLength(JSON.stringify(extensions), "utf8") > 16_384)) return { ok: false, code: "GEO_SOURCE_CONTRACT_INVALID" };
  return { ok: true, value: {
    providerId: value.providerId, contractVersion: value.contractVersion, sourceRef: value.sourceRef, sourceRevision: value.sourceRevision,
    acquiredAt: value.acquiredAt, observedAt: value.observedAt, schemaVersion: value.schemaVersion, contentHash: value.contentHash,
    licenseRef: value.licenseRef, attribution: value.attribution.normalize("NFC"), allowedPurposes, retentionClass: value.retentionClass,
    freshness: { cadenceSeconds: value.freshness.cadenceSeconds, staleAfterSeconds: value.freshness.staleAfterSeconds }, records: records as GeoSourceRecordContract[],
    ...(extensions ? { extensions } : {}),
  } };
}

/** Active approval and rights must exist before the registry can authorize acquisition. */
export function parseGeoSourcePolicy(value: unknown): GeoSourceContractResult<GeoSourcePolicy> {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["sourceStatus", "ownerRef", "rightsStatus", "licenseRef", "attribution", "allowedPurposes", "retentionClass", "configurationRevision"]) ||
    value.sourceStatus !== "active" || !isBoundedText(value.ownerRef) || value.rightsStatus !== "granted" || !isHttpsReference(value.licenseRef) ||
    typeof value.attribution !== "string" || value.attribution.trim().length === 0 || value.attribution.length > MAX_TEXT ||
    !isBoundedText(value.retentionClass, PURPOSE, 64) || !Number.isInteger(value.configurationRevision) ||
    (value.configurationRevision as number) < 1 || (value.configurationRevision as number) > 2_147_483_647) return { ok: false, code: "GEO_SOURCE_POLICY_INVALID" };
  const allowedPurposes = parsePurposes(value.allowedPurposes);
  if (!allowedPurposes) return { ok: false, code: "GEO_SOURCE_POLICY_INVALID" };
  return { ok: true, value: { sourceStatus: "active", ownerRef: value.ownerRef, rightsStatus: "granted", licenseRef: value.licenseRef,
    attribution: value.attribution.normalize("NFC"), allowedPurposes, retentionClass: value.retentionClass, configurationRevision: value.configurationRevision } };
}
