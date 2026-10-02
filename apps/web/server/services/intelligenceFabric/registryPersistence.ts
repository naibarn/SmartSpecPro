import { and, asc, eq } from "drizzle-orm";
import {
  intelligenceDatasets,
  intelligenceEvidenceItems,
  intelligenceSources,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ROW_ID_MAX_LENGTH = 36;
const SOURCE_JSON_MAX_BYTES = 65_536;
const DATASET_JSON_MAX_BYTES = 65_536;
const EVIDENCE_JSON_MAX_BYTES = 131_072;
const SECRET_VALUE = /(?:\b(?:api[_-]?key|authorization|cookie|credential|password|secret|token)\b\s*[:=]\s*\S+|\b(?:bearer\s+|sk-|rk_live_)[A-Za-z0-9_\-.]{8,})/i;

const SOURCE_ADMISSION_FIELDS = new Set(["id", "canonicalSourceId", "providerId", "independenceGroup", "sourceJson"]);
const DATASET_ADMISSION_FIELDS = new Set(["id", "sourceId", "datasetRef", "version", "datasetJson"]);
const SOURCE_JSON_FIELDS = new Set([
  "name", "description", "sourceType", "adapterRef", "sourceContractRef", "rightsPolicyRef", "qualityProfileRef",
  "ownerType", "ownerId", "credentialRef", "geographyCoverageRef", "temporalCoverageRef", "refreshPolicyRef",
  "pricingPolicyRef", "executionPlacementPolicyRef", "visibility",
]);
const DATASET_JSON_FIELDS = new Set([
  "name", "description", "schemaRef", "semanticMappingRef", "semanticCapabilities", "geographyCoverageRef",
  "temporalCoverageRef", "updateMode", "evidenceClassDefault", "vectorIndexPolicy",
]);
const SOURCE_TYPES = new Set(["API", "DATABASE", "FILE", "GIS", "STREAM", "WEB", "MCP", "WEBHOOK", "SENSOR", "MEDIA"]);
const UPDATE_MODES = new Set(["STATIC", "PERIODIC", "REALTIME", "EVENT", "ON_DEMAND"]);
const EVIDENCE_CLASSES = new Set(["reference", "official_record", "observation", "derived", "forecast", "model_estimate", "user_asserted", "crowdsourced", "official_warning"]);
const SOURCE_REFERENCE_FIELDS = new Set(["adapterRef", "sourceContractRef", "rightsPolicyRef", "qualityProfileRef", "ownerId", "credentialRef", "geographyCoverageRef", "temporalCoverageRef", "refreshPolicyRef", "pricingPolicyRef", "executionPlacementPolicyRef"]);

export type RegistryPersistenceErrorCode =
  | "REGISTRY_INVALID"
  | "REGISTRY_UNKNOWN_FIELD"
  | "REGISTRY_PAYLOAD_TOO_LARGE"
  | "REGISTRY_PAYLOAD_SECRET"
  | "REGISTRY_SCOPE_MISMATCH"
  | "REGISTRY_DATASET_SOURCE_MISMATCH"
  | "REGISTRY_SOURCE_REPLAY_CONFLICT"
  | "REGISTRY_DATASET_REPLAY_CONFLICT";

export class RegistryPersistenceError extends Error {
  constructor(readonly code: RegistryPersistenceErrorCode) {
    super(code);
    this.name = "RegistryPersistenceError";
  }
}

export interface RegistryTenantScope {
  readonly tenantId: string;
}

export interface PendingReviewSourceAdmission {
  readonly id: string;
  readonly canonicalSourceId: string;
  readonly providerId: string;
  readonly independenceGroup: string;
  readonly sourceJson: Record<string, unknown>;
}

export interface PendingReviewDatasetAdmission {
  readonly id: string;
  readonly sourceId: string;
  readonly datasetRef: string;
  readonly version: string;
  readonly datasetJson: Record<string, unknown>;
}

export interface PersistedRegistrySource {
  readonly id: string;
  readonly tenantId: string | null;
  readonly visibility: string;
  readonly canonicalSourceId: string;
  readonly providerId: string;
  readonly independenceGroup: string;
  readonly status: string;
  readonly sourceJson: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedRegistryDataset {
  readonly id: string;
  readonly sourceId: string;
  readonly tenantId: string | null;
  readonly datasetRef: string;
  readonly version: string;
  readonly status: string;
  readonly datasetJson: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedRegistryEvidence {
  readonly id: string;
  readonly tenantId: string | null;
  readonly visibility: string;
  readonly sourceId: string;
  readonly datasetId: string | null;
  readonly evidenceRef: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly observedAt: Date | null;
  readonly evidenceJson: Record<string, unknown>;
  readonly createdAt: Date;
}

export type PendingReviewSourceInsert = Omit<PersistedRegistrySource, "createdAt" | "updatedAt">;
export type PendingReviewDatasetInsert = Omit<PersistedRegistryDataset, "createdAt" | "updatedAt">;

/** Query port deliberately requires a tenant on every read and binding proof. */
export interface RegistryPersistenceQuery {
  findSourceById(input: { readonly tenantId: string; readonly id: string }): Promise<PersistedRegistrySource | undefined>;
  findSourceByCanonical(input: { readonly tenantId: string; readonly canonicalSourceId: string }): Promise<PersistedRegistrySource | undefined>;
  insertSourceIfAbsent(input: PendingReviewSourceInsert): Promise<PersistedRegistrySource | undefined>;
  listSources(input: { readonly tenantId: string }): Promise<readonly PersistedRegistrySource[]>;
  findDatasetById(input: { readonly tenantId: string; readonly id: string }): Promise<PersistedRegistryDataset | undefined>;
  findDatasetBySourceReference(input: { readonly tenantId: string; readonly sourceId: string; readonly datasetRef: string; readonly version: string }): Promise<PersistedRegistryDataset | undefined>;
  insertDatasetIfAbsent(input: PendingReviewDatasetInsert): Promise<PersistedRegistryDataset | undefined>;
  listDatasets(input: { readonly tenantId: string; readonly sourceId: string }): Promise<readonly PersistedRegistryDataset[]>;
  listEvidence(input: { readonly tenantId: string; readonly sourceId: string }): Promise<readonly PersistedRegistryEvidence[]>;
}

export interface RegistryPersistenceDependencies {
  readonly query?: RegistryPersistenceQuery;
}

function fail(code: RegistryPersistenceErrorCode): never {
  throw new RegistryPersistenceError(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyFields(value: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => fields.has(key));
}

function isReference(value: unknown, maximum = 160): value is string {
  return typeof value === "string" && value.length <= maximum && ID_PATTERN.test(value);
}

function isRowId(value: unknown): value is string {
  return isReference(value, ROW_ID_MAX_LENGTH);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function assertJson(value: unknown, depth = 0, allowedReferenceKeys?: ReadonlySet<string>): void {
  if (depth > 8) fail("REGISTRY_INVALID");
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) fail("REGISTRY_INVALID");
    return;
  }
  if (typeof value === "string") {
    if (value.length > EVIDENCE_JSON_MAX_BYTES) fail("REGISTRY_INVALID");
    if (SECRET_VALUE.test(value)) fail("REGISTRY_PAYLOAD_SECRET");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) fail("REGISTRY_INVALID");
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) fail("REGISTRY_INVALID");
      assertJson(value[index], depth + 1);
    }
    return;
  }
  if (!isPlainRecord(value) || Object.keys(value).length > 128) fail("REGISTRY_INVALID");
  for (const [key, nested] of Object.entries(value)) {
    if (key.length > 80 || (SECRET_VALUE.test(key) && !allowedReferenceKeys?.has(key))) fail("REGISTRY_PAYLOAD_SECRET");
    assertJson(nested, depth + 1);
  }
}

function assertBoundPayload(value: unknown, maximumBytes: number, fields?: ReadonlySet<string>, allowedReferenceKeys?: ReadonlySet<string>): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) fail("REGISTRY_INVALID");
  if (fields && !hasOnlyFields(value, fields)) fail("REGISTRY_UNKNOWN_FIELD");
  assertJson(value, 0, allowedReferenceKeys);
  if (Buffer.byteLength(canonicalJson(value), "utf8") > maximumBytes) fail("REGISTRY_PAYLOAD_TOO_LARGE");
}

function assertScope(scope: RegistryTenantScope): void {
  if (!scope || !isRowId(scope.tenantId)) fail("REGISTRY_INVALID");
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 5 && current && typeof current === "object" && !visited.has(current); depth += 1) {
    visited.add(current);
    const record = current as { code?: unknown; cause?: unknown };
    if (record.code === "23505") return true;
    current = record.cause;
  }
  return false;
}

function parseSource(input: unknown, tenantId: string): PendingReviewSourceAdmission {
  if (!isPlainRecord(input)) fail("REGISTRY_INVALID");
  if (!hasOnlyFields(input, SOURCE_ADMISSION_FIELDS)) fail("REGISTRY_UNKNOWN_FIELD");
  if (!isRowId(input.id) || !isReference(input.canonicalSourceId) || !isReference(input.providerId) || !isReference(input.independenceGroup)) fail("REGISTRY_INVALID");
  assertBoundPayload(input.sourceJson, SOURCE_JSON_MAX_BYTES, SOURCE_JSON_FIELDS, SOURCE_REFERENCE_FIELDS);
  const required = ["name", "sourceType", "adapterRef", "sourceContractRef", "rightsPolicyRef", "qualityProfileRef"];
  if (required.some(key => key === "name"
    ? typeof input.sourceJson[key] !== "string" || !(input.sourceJson[key] as string).trim() || (input.sourceJson[key] as string).length > 256
    : !isReference(input.sourceJson[key]))) fail("REGISTRY_INVALID");
  if (!SOURCE_TYPES.has(input.sourceJson.sourceType as string) ||
    (input.sourceJson.ownerType !== undefined && input.sourceJson.ownerType !== "tenant") ||
    (input.sourceJson.visibility !== undefined && input.sourceJson.visibility !== "tenant") ||
    (input.sourceJson.ownerId !== undefined && input.sourceJson.ownerId !== tenantId)) fail("REGISTRY_INVALID");
  for (const key of SOURCE_REFERENCE_FIELDS) {
    if (input.sourceJson[key] !== undefined && !isReference(input.sourceJson[key])) fail("REGISTRY_INVALID");
  }
  for (const key of ["description"]) {
    if (input.sourceJson[key] !== undefined && (typeof input.sourceJson[key] !== "string" || (input.sourceJson[key] as string).length > 2_000)) fail("REGISTRY_INVALID");
  }
  return { id: input.id, canonicalSourceId: input.canonicalSourceId, providerId: input.providerId, independenceGroup: input.independenceGroup, sourceJson: input.sourceJson };
}

function parseDataset(input: unknown): PendingReviewDatasetAdmission {
  if (!isPlainRecord(input)) fail("REGISTRY_INVALID");
  if (!hasOnlyFields(input, DATASET_ADMISSION_FIELDS)) fail("REGISTRY_UNKNOWN_FIELD");
  if (!isRowId(input.id) || !isRowId(input.sourceId) || !isReference(input.datasetRef) || !isReference(input.version, 80)) fail("REGISTRY_INVALID");
  assertBoundPayload(input.datasetJson, DATASET_JSON_MAX_BYTES, DATASET_JSON_FIELDS);
  if (!isReference(input.datasetJson.schemaRef) || !UPDATE_MODES.has(input.datasetJson.updateMode as string)) fail("REGISTRY_INVALID");
  if (input.datasetJson.name !== undefined && (typeof input.datasetJson.name !== "string" || !(input.datasetJson.name as string).trim() || (input.datasetJson.name as string).length > 256)) fail("REGISTRY_INVALID");
  if (input.datasetJson.description !== undefined && (typeof input.datasetJson.description !== "string" || (input.datasetJson.description as string).length > 2_000)) fail("REGISTRY_INVALID");
  if (input.datasetJson.evidenceClassDefault !== undefined && !EVIDENCE_CLASSES.has(input.datasetJson.evidenceClassDefault as string)) fail("REGISTRY_INVALID");
  return { id: input.id, sourceId: input.sourceId, datasetRef: input.datasetRef, version: input.version, datasetJson: input.datasetJson };
}

function sameSource(row: PersistedRegistrySource, expected: PendingReviewSourceInsert): boolean {
  return row.id === expected.id && row.tenantId === expected.tenantId && row.visibility === expected.visibility &&
    row.canonicalSourceId === expected.canonicalSourceId && row.providerId === expected.providerId &&
    row.independenceGroup === expected.independenceGroup && row.status === expected.status &&
    canonicalJson(row.sourceJson) === canonicalJson(expected.sourceJson);
}

function sameDataset(row: PersistedRegistryDataset, expected: PendingReviewDatasetInsert): boolean {
  return row.id === expected.id && row.tenantId === expected.tenantId && row.sourceId === expected.sourceId &&
    row.datasetRef === expected.datasetRef && row.version === expected.version && row.status === expected.status &&
    canonicalJson(row.datasetJson) === canonicalJson(expected.datasetJson);
}

function defaultQuery(): RegistryPersistenceQuery {
  const database: any = getDb();
  return {
    async findSourceById(input) {
      const rows = await database.select().from(intelligenceSources).where(and(eq(intelligenceSources.id, input.id), eq(intelligenceSources.tenantId, input.tenantId))).limit(1);
      return rows[0];
    },
    async findSourceByCanonical(input) {
      const rows = await database.select().from(intelligenceSources).where(and(eq(intelligenceSources.tenantId, input.tenantId), eq(intelligenceSources.visibility, "tenant"), eq(intelligenceSources.canonicalSourceId, input.canonicalSourceId))).limit(1);
      return rows[0];
    },
    async insertSourceIfAbsent(input) {
      const rows = await database.insert(intelligenceSources).values(input).onConflictDoNothing({ target: intelligenceSources.id }).returning();
      return rows[0];
    },
    async listSources(input) {
      return database.select().from(intelligenceSources).where(and(eq(intelligenceSources.tenantId, input.tenantId), eq(intelligenceSources.visibility, "tenant"), eq(intelligenceSources.status, "pending_review"))).orderBy(asc(intelligenceSources.createdAt));
    },
    async findDatasetById(input) {
      const rows = await database.select().from(intelligenceDatasets).where(and(eq(intelligenceDatasets.id, input.id), eq(intelligenceDatasets.tenantId, input.tenantId))).limit(1);
      return rows[0];
    },
    async findDatasetBySourceReference(input) {
      const rows = await database.select().from(intelligenceDatasets).where(and(eq(intelligenceDatasets.tenantId, input.tenantId), eq(intelligenceDatasets.sourceId, input.sourceId), eq(intelligenceDatasets.datasetRef, input.datasetRef), eq(intelligenceDatasets.version, input.version))).limit(1);
      return rows[0];
    },
    async insertDatasetIfAbsent(input) {
      const rows = await database.insert(intelligenceDatasets).values(input).onConflictDoNothing({ target: intelligenceDatasets.id }).returning();
      return rows[0];
    },
    async listDatasets(input) {
      return database.select().from(intelligenceDatasets).where(and(eq(intelligenceDatasets.tenantId, input.tenantId), eq(intelligenceDatasets.sourceId, input.sourceId))).orderBy(asc(intelligenceDatasets.createdAt));
    },
    async listEvidence(input) {
      return database.select().from(intelligenceEvidenceItems).where(and(eq(intelligenceEvidenceItems.tenantId, input.tenantId), eq(intelligenceEvidenceItems.sourceId, input.sourceId))).orderBy(asc(intelligenceEvidenceItems.createdAt));
    },
  };
}

function assertPendingSource(source: PersistedRegistrySource | undefined): asserts source is PersistedRegistrySource {
  if (!source || source.tenantId === null || source.visibility !== "tenant" || source.status !== "pending_review") fail("REGISTRY_SCOPE_MISMATCH");
}

export async function admitPendingReviewSource(input: {
  readonly query?: RegistryPersistenceQuery;
  readonly scope: RegistryTenantScope;
  readonly source: unknown;
}): Promise<{ readonly created: boolean; readonly source: PersistedRegistrySource }> {
  assertScope(input.scope);
  const query = input.query ?? defaultQuery();
  const source = parseSource(input.source, input.scope.tenantId);
  const values: PendingReviewSourceInsert = { ...source, tenantId: input.scope.tenantId, visibility: "tenant", status: "pending_review" };
  let inserted: PersistedRegistrySource | undefined;
  try {
    inserted = await query.insertSourceIfAbsent(values);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  if (inserted) return { created: true, source: inserted };
  const existing = await query.findSourceById({ tenantId: input.scope.tenantId, id: source.id }) ??
    await query.findSourceByCanonical({ tenantId: input.scope.tenantId, canonicalSourceId: source.canonicalSourceId });
  if (!existing || !sameSource(existing, values)) fail("REGISTRY_SOURCE_REPLAY_CONFLICT");
  return { created: false, source: existing };
}

export async function admitPendingReviewDataset(input: {
  readonly query?: RegistryPersistenceQuery;
  readonly scope: RegistryTenantScope;
  readonly dataset: unknown;
}): Promise<{ readonly created: boolean; readonly dataset: PersistedRegistryDataset }> {
  assertScope(input.scope);
  const query = input.query ?? defaultQuery();
  const dataset = parseDataset(input.dataset);
  assertPendingSource(await query.findSourceById({ tenantId: input.scope.tenantId, id: dataset.sourceId }));
  const values: PendingReviewDatasetInsert = { ...dataset, tenantId: input.scope.tenantId, status: "disabled" };
  let inserted: PersistedRegistryDataset | undefined;
  try {
    inserted = await query.insertDatasetIfAbsent(values);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  if (inserted) return { created: true, dataset: inserted };
  const existing = await query.findDatasetById({ tenantId: input.scope.tenantId, id: dataset.id }) ??
    await query.findDatasetBySourceReference({ tenantId: input.scope.tenantId, sourceId: dataset.sourceId, datasetRef: dataset.datasetRef, version: dataset.version });
  if (!existing || !sameDataset(existing, values)) fail("REGISTRY_DATASET_REPLAY_CONFLICT");
  return { created: false, dataset: existing };
}

export async function getPendingReviewSource(input: {
  readonly query?: RegistryPersistenceQuery;
  readonly scope: RegistryTenantScope;
  readonly sourceId: string;
}): Promise<PersistedRegistrySource | undefined> {
  assertScope(input.scope);
  if (!isRowId(input.sourceId)) fail("REGISTRY_INVALID");
  const query = input.query ?? defaultQuery();
  const source = await query.findSourceById({ tenantId: input.scope.tenantId, id: input.sourceId });
  return source?.status === "pending_review" && source.visibility === "tenant" && source.tenantId === input.scope.tenantId ? source : undefined;
}

export async function listPendingReviewSources(input: {
  readonly query?: RegistryPersistenceQuery;
  readonly scope: RegistryTenantScope;
}): Promise<readonly PersistedRegistrySource[]> {
  assertScope(input.scope);
  const query = input.query ?? defaultQuery();
  return (await query.listSources({ tenantId: input.scope.tenantId })).filter(source => source.tenantId === input.scope.tenantId && source.visibility === "tenant" && source.status === "pending_review");
}

export async function listPendingReviewDatasets(input: {
  readonly query?: RegistryPersistenceQuery;
  readonly scope: RegistryTenantScope;
  readonly sourceId: string;
}): Promise<readonly PersistedRegistryDataset[]> {
  assertScope(input.scope);
  if (!isRowId(input.sourceId)) fail("REGISTRY_INVALID");
  const query = input.query ?? defaultQuery();
  const source = await query.findSourceById({ tenantId: input.scope.tenantId, id: input.sourceId });
  if (!source || source.status !== "pending_review" || source.visibility !== "tenant") return [];
  return (await query.listDatasets({ tenantId: input.scope.tenantId, sourceId: input.sourceId })).filter(dataset => dataset.tenantId === input.scope.tenantId && dataset.sourceId === input.sourceId && dataset.status === "disabled");
}

export async function listEvidence(input: {
  readonly query?: RegistryPersistenceQuery;
  readonly scope: RegistryTenantScope;
  readonly sourceId: string;
}): Promise<readonly PersistedRegistryEvidence[]> {
  assertScope(input.scope);
  if (!isRowId(input.sourceId)) fail("REGISTRY_INVALID");
  const query = input.query ?? defaultQuery();
  const source = await query.findSourceById({ tenantId: input.scope.tenantId, id: input.sourceId });
  if (!source || source.tenantId !== input.scope.tenantId || source.visibility !== "tenant") return [];
  return (await query.listEvidence({ tenantId: input.scope.tenantId, sourceId: input.sourceId })).filter(evidence => evidence.tenantId === input.scope.tenantId && evidence.visibility === "tenant" && evidence.sourceId === input.sourceId);
}

/** Injectable facade exposes pending-review admissions and scoped reads only. */
export function createRegistryPersistence(dependencies: RegistryPersistenceDependencies = {}) {
  return {
    admitSource: (input: Omit<Parameters<typeof admitPendingReviewSource>[0], "query">) => admitPendingReviewSource({ ...input, query: dependencies.query }),
    admitDataset: (input: Omit<Parameters<typeof admitPendingReviewDataset>[0], "query">) => admitPendingReviewDataset({ ...input, query: dependencies.query }),
    getPendingReviewSource: (input: Omit<Parameters<typeof getPendingReviewSource>[0], "query">) => getPendingReviewSource({ ...input, query: dependencies.query }),
    listPendingReviewSources: (input: Omit<Parameters<typeof listPendingReviewSources>[0], "query">) => listPendingReviewSources({ ...input, query: dependencies.query }),
    listPendingReviewDatasets: (input: Omit<Parameters<typeof listPendingReviewDatasets>[0], "query">) => listPendingReviewDatasets({ ...input, query: dependencies.query }),
    listEvidence: (input: Omit<Parameters<typeof listEvidence>[0], "query">) => listEvidence({ ...input, query: dependencies.query }),
  } as const;
}
