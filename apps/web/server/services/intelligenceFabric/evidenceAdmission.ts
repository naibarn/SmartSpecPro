import { createHash } from "node:crypto";
import { parseEvidenceItem, validateEvidenceLineageGraph, type EvidenceItem } from "./contracts";
import type { PersistedRegistryDataset, PersistedRegistryEvidence, PersistedRegistrySource } from "./registryPersistence";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTENT_IDENTITY_MAX_BYTES = 131_072;

export type EvidenceAdmissionErrorCode =
  | "EVIDENCE_ADMISSION_INVALID"
  | "EVIDENCE_TENANT_MISMATCH"
  | "EVIDENCE_SOURCE_UNAVAILABLE"
  | "EVIDENCE_DATASET_UNAVAILABLE"
  | "EVIDENCE_RIGHTS_UNAVAILABLE"
  | "EVIDENCE_RIGHTS_DENIED"
  | "EVIDENCE_RIGHTS_EXPIRED"
  | "EVIDENCE_TEMPORAL_INVALID"
  | "EVIDENCE_LINEAGE_INVALID"
  | "EVIDENCE_CONCURRENT_WRITE";

export class EvidenceAdmissionError extends Error {
  constructor(readonly code: EvidenceAdmissionErrorCode) {
    super(code);
    this.name = "EvidenceAdmissionError";
  }
}

export interface EvidenceAdmissionScope {
  readonly tenantId: string;
}

/** This port is server-owned: it resolves current rights, never a caller assertion. */
export interface EvidenceRightsResolver {
  resolve(input: {
    readonly tenantId: string;
    readonly source: PersistedRegistrySource;
    readonly dataset: PersistedRegistryDataset;
    readonly purpose: string;
  }): Promise<EvidenceRightsReceipt>;
}

/** Immutable receipt from the authoritative rights-policy store. */
export interface EvidenceRightsReceipt {
  readonly status: "granted" | "unknown" | "revoked" | "expired";
  readonly tenantId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly purpose: string;
  readonly rightsPolicyRef: string;
  readonly policyRevision: string;
  readonly termsRef: string;
  readonly issuedAt: string;
  readonly reviewerRef: string;
  readonly expiresAt: string;
}

/**
 * The durable writer is deliberately injected. The current registry schema has no
 * authoritative rights-policy receipt or activation writer, so runtime composition
 * must provide those before this admission seam is exposed to callers.
 */
export interface EvidenceAdmissionStore {
  findSource(input: { readonly tenantId: string; readonly sourceId: string }): Promise<PersistedRegistrySource | undefined>;
  findDataset(input: { readonly tenantId: string; readonly datasetId: string }): Promise<PersistedRegistryDataset | undefined>;
  /** Serializes the entire lineage validation and immutable append for one source. */
  serializeEvidenceAppend<T>(input: { readonly tenantId: string; readonly sourceId: string }, operation: (transaction: EvidenceAppendTransaction) => Promise<T>): Promise<T>;
}

export interface EvidenceAppendTransaction {
  /** Returns the authorized transitive closure and all revisions for requested references. */
  loadEvidenceClosure(input: { readonly tenantId: string; readonly sourceId: string; readonly evidenceRefs: readonly string[] }): Promise<readonly PersistedRegistryEvidence[]>;
  /** Atomically inserts this immutable revision, or returns undefined on a uniqueness collision. */
  appendIfAbsent(input: Omit<PersistedRegistryEvidence, "id" | "createdAt">): Promise<PersistedRegistryEvidence | undefined>;
}

export interface EvidenceCaptureReceipt {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly captureRef: string;
  readonly capturedAt: string;
  /** A server-authenticated actor reference. This module never accepts a user display name. */
  readonly actorRef: string;
  readonly capturePolicyRef: string;
  readonly acquisitionMode: "pull" | "push" | "manual" | "derived";
  readonly provenanceRef: string;
  readonly reproducibilityRef: string;
}

/** Creates capture receipts from server authentication/capture state, never request JSON. */
export interface EvidenceCaptureReceiptResolver {
  resolve(input: {
    readonly tenantId: string;
    readonly sourceId: string;
    readonly datasetId: string;
  }): Promise<EvidenceCaptureReceipt>;
}

function fail(code: EvidenceAdmissionErrorCode): never {
  throw new EvidenceAdmissionError(code);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 8) fail("EVIDENCE_ADMISSION_INVALID");
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    if (typeof value === "number" && !Number.isFinite(value)) fail("EVIDENCE_ADMISSION_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 256) fail("EVIDENCE_ADMISSION_INVALID");
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) fail("EVIDENCE_ADMISSION_INVALID");
    }
    return `[${value.map(item => canonicalJson(item, depth + 1)).join(",")}]`;
  }
  if (!isPlainRecord(value) || Object.keys(value).length > 128) fail("EVIDENCE_ADMISSION_INVALID");
  return `{${Object.keys(value).sort().map(key => {
    if (key.length > 80) fail("EVIDENCE_ADMISSION_INVALID");
    return `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`;
  }).join(",")}}`;
}

function evidenceFromRow(row: PersistedRegistryEvidence): EvidenceItem {
  if (!isPlainRecord(row.evidenceJson) || !Object.prototype.hasOwnProperty.call(row.evidenceJson, "contract")) fail("EVIDENCE_LINEAGE_INVALID");
  const parsed = parseEvidenceItem(row.evidenceJson.contract);
  if (!parsed.ok) fail("EVIDENCE_LINEAGE_INVALID");
  return parsed.value;
}

function sameAdmission(row: PersistedRegistryEvidence, input: Omit<PersistedRegistryEvidence, "id" | "createdAt" | "revision">): boolean {
  return row.tenantId === input.tenantId && row.visibility === input.visibility && row.sourceId === input.sourceId &&
    row.datasetId === input.datasetId && row.evidenceRef === input.evidenceRef && row.contentHash === input.contentHash &&
    row.observedAt?.toISOString() === input.observedAt?.toISOString() && canonicalJson(row.evidenceJson) === canonicalJson(input.evidenceJson);
}

function assertCapture(receipt: EvidenceCaptureReceipt): void {
  const fields = new Set(["tenantId", "sourceId", "datasetId", "captureRef", "capturedAt", "actorRef", "capturePolicyRef", "acquisitionMode", "provenanceRef", "reproducibilityRef"]);
  if (!isPlainRecord(receipt) || Reflect.ownKeys(receipt).some(key => typeof key !== "string" || !fields.has(key)) || !isId(receipt.tenantId) || !isId(receipt.sourceId) || !isId(receipt.datasetId) || !isId(receipt.captureRef) || !isId(receipt.actorRef) || !isId(receipt.capturePolicyRef) || !isId(receipt.provenanceRef) || !isId(receipt.reproducibilityRef) ||
    !["pull", "push", "manual", "derived"].includes(receipt.acquisitionMode) || !isInstant(receipt.capturedAt)) fail("EVIDENCE_ADMISSION_INVALID");
}

function assertRightsReceipt(receipt: EvidenceRightsReceipt): void {
  const fields = new Set(["status", "tenantId", "sourceId", "datasetId", "purpose", "rightsPolicyRef", "policyRevision", "termsRef", "issuedAt", "reviewerRef", "expiresAt"]);
  if (!isPlainRecord(receipt) || Reflect.ownKeys(receipt).some(key => typeof key !== "string" || !fields.has(key)) || !["granted", "unknown", "revoked", "expired"].includes(receipt.status) ||
    !isId(receipt.tenantId) || !isId(receipt.sourceId) || !isId(receipt.datasetId) || !isId(receipt.purpose) || !isId(receipt.rightsPolicyRef) || !isId(receipt.policyRevision) || !isId(receipt.termsRef) || !isId(receipt.reviewerRef) || !isInstant(receipt.issuedAt) || !isInstant(receipt.expiresAt) ||
    Date.parse(receipt.issuedAt) > Date.parse(receipt.expiresAt)) fail("EVIDENCE_RIGHTS_UNAVAILABLE");
}

function assertTemporalAdmission(evidence: EvidenceItem, receipt: EvidenceCaptureReceipt, now: Date): void {
  const observedAt = evidence.temporal.observedAt;
  if (!observedAt || Date.parse(observedAt) > Date.parse(receipt.capturedAt)) fail("EVIDENCE_TEMPORAL_INVALID");
  for (const field of ["staleAt", "expiresAt"] as const) {
    const value = evidence.temporal[field];
    if (value === undefined) continue;
    if (Date.parse(value) < Date.parse(observedAt) || Date.parse(value) <= now.getTime()) fail("EVIDENCE_TEMPORAL_INVALID");
  }
}

export async function appendEvidence(input: {
  readonly scope: EvidenceAdmissionScope;
  readonly purpose: string;
  readonly evidence: unknown;
  /** The identity is hashed and never persisted as payload. */
  readonly contentIdentity: unknown;
  readonly store: EvidenceAdmissionStore;
  readonly rights: EvidenceRightsResolver;
  readonly capture: EvidenceCaptureReceiptResolver;
  readonly now?: Date;
}): Promise<{ readonly created: boolean; readonly evidence: PersistedRegistryEvidence }> {
  if (!isId(input.scope?.tenantId) || !isId(input.purpose)) fail("EVIDENCE_ADMISSION_INVALID");
  const parsed = parseEvidenceItem(input.evidence);
  if (!parsed.ok) fail("EVIDENCE_ADMISSION_INVALID");
  const evidence = parsed.value;
  if (evidence.authorizationScope !== "TENANT" || evidence.tenantId !== input.scope.tenantId || !evidence.sourceId || !evidence.datasetId) fail("EVIDENCE_TENANT_MISMATCH");

  const source = await input.store.findSource({ tenantId: input.scope.tenantId, sourceId: evidence.sourceId });
  if (!source || source.tenantId !== input.scope.tenantId || source.visibility !== "tenant" || source.status !== "active") fail("EVIDENCE_SOURCE_UNAVAILABLE");
  const dataset = await input.store.findDataset({ tenantId: input.scope.tenantId, datasetId: evidence.datasetId });
  if (!dataset || dataset.tenantId !== input.scope.tenantId || dataset.sourceId !== source.id || dataset.status !== "active") fail("EVIDENCE_DATASET_UNAVAILABLE");
  const receipt = await input.capture.resolve({ tenantId: input.scope.tenantId, sourceId: source.id, datasetId: dataset.id });
  assertCapture(receipt);
  if (receipt.tenantId !== input.scope.tenantId || receipt.sourceId !== source.id || receipt.datasetId !== dataset.id) fail("EVIDENCE_ADMISSION_INVALID");
  if (evidence.capturePolicyRef !== receipt.capturePolicyRef) fail("EVIDENCE_ADMISSION_INVALID");
  assertTemporalAdmission(evidence, receipt, input.now ?? new Date());

  const verdict = await input.rights.resolve({ tenantId: input.scope.tenantId, source, dataset, purpose: input.purpose });
  assertRightsReceipt(verdict);
  if (Date.parse(verdict.issuedAt) > (input.now ?? new Date()).getTime()) fail("EVIDENCE_RIGHTS_UNAVAILABLE");
  if (verdict.status === "expired" || Date.parse(verdict.expiresAt) <= (input.now ?? new Date()).getTime()) fail("EVIDENCE_RIGHTS_EXPIRED");
  if (verdict.status !== "granted") fail("EVIDENCE_RIGHTS_DENIED");
  if (verdict.tenantId !== input.scope.tenantId || verdict.sourceId !== source.id || verdict.datasetId !== dataset.id || verdict.purpose !== input.purpose ||
    verdict.rightsPolicyRef !== evidence.rightsPolicyRef) fail("EVIDENCE_RIGHTS_UNAVAILABLE");

  const contentJson = canonicalJson(input.contentIdentity);
  if (Buffer.byteLength(contentJson, "utf8") > CONTENT_IDENTITY_MAX_BYTES) fail("EVIDENCE_ADMISSION_INVALID");
  const contentHash = createHash("sha256").update(contentJson).digest("hex");
  return input.store.serializeEvidenceAppend({ tenantId: input.scope.tenantId, sourceId: source.id }, async transaction => {
    const existing = (await transaction.loadEvidenceClosure({ tenantId: input.scope.tenantId, sourceId: source.id, evidenceRefs: [...evidence.lineageRefs, evidence.id] }))
      .filter(row => row.tenantId === input.scope.tenantId && row.visibility === "tenant" && row.sourceId === source.id);
    const candidates = existing.filter(row => row.evidenceRef === evidence.id);
    const latestByRef = new Map<string, PersistedRegistryEvidence>();
    for (const row of existing) {
      const current = latestByRef.get(row.evidenceRef);
      if (!current || row.revision > current.revision) latestByRef.set(row.evidenceRef, row);
    }
    const closureIds = new Set(latestByRef.keys());
    const toResolve = [...evidence.lineageRefs];
    const resolved = new Set<string>();
    for (let index = 0; index < toResolve.length; index += 1) {
      const parentRef = toResolve[index]!;
      if (resolved.has(parentRef)) continue;
      resolved.add(parentRef);
      const parent = latestByRef.get(parentRef);
      if (!parent) fail("EVIDENCE_LINEAGE_INVALID");
      const parentContract = evidenceFromRow(parent);
      if (parentContract.authorizationScope !== "TENANT" || parentContract.id !== parent.evidenceRef ||
        parentContract.tenantId !== parent.tenantId || parentContract.sourceId !== parent.sourceId || parentContract.datasetId !== parent.datasetId) {
        fail("EVIDENCE_LINEAGE_INVALID");
      }
      for (const ref of parentContract.lineageRefs) {
        if (!closureIds.has(ref)) fail("EVIDENCE_LINEAGE_INVALID");
        toResolve.push(ref);
      }
    }
    latestByRef.set(evidence.id, {
      id: "unpersisted", tenantId: input.scope.tenantId, visibility: "tenant", sourceId: source.id, datasetId: dataset.id,
      evidenceRef: evidence.id, revision: 0, contentHash, observedAt: new Date(evidence.temporal.observedAt), evidenceJson: { contract: evidence }, createdAt: input.now ?? new Date(),
    });
    const graph = validateEvidenceLineageGraph([...latestByRef.values()].map(evidenceFromRow));
    if (!graph.ok) fail("EVIDENCE_LINEAGE_INVALID");
    const nextRevision = Math.max(0, ...candidates.map(row => row.revision)) + 1;
    const values = {
      tenantId: input.scope.tenantId,
      visibility: "tenant",
      sourceId: source.id,
      datasetId: dataset.id,
      evidenceRef: evidence.id,
      revision: nextRevision,
      contentHash,
      observedAt: new Date(evidence.temporal.observedAt),
      evidenceJson: Object.freeze({ contract: evidence, capture: Object.freeze({ ...receipt }), rights: Object.freeze({ ...verdict }) }),
    } as const;
    const replay = candidates.find(row => sameAdmission(row, values));
    if (replay) return { created: false, evidence: replay };
    const inserted = await transaction.appendIfAbsent(values);
    if (inserted) return { created: true, evidence: inserted };
    const afterCollision = (await transaction.loadEvidenceClosure({ tenantId: input.scope.tenantId, sourceId: source.id, evidenceRefs: [evidence.id] }))
      .filter(row => row.tenantId === input.scope.tenantId && row.visibility === "tenant" && row.sourceId === source.id);
    const resolvedReplay = afterCollision.find(row => row.evidenceRef === evidence.id && sameAdmission(row, values));
    if (resolvedReplay) return { created: false, evidence: resolvedReplay };
    fail("EVIDENCE_CONCURRENT_WRITE");
  });
}
