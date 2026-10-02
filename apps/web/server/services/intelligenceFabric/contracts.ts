export type EvidenceClass =
  | "reference" | "official_record" | "observation" | "derived" | "forecast"
  | "model_estimate" | "user_asserted" | "crowdsourced" | "official_warning";

export type VerificationState =
  | "unverified" | "correlated" | "community_supported" | "disputed"
  | "organization_verified" | "authority_verified" | "superseded" | "expired" | "unknown";

export interface TemporalEnvelope {
  readonly observedAt?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly publishedAt?: string;
  readonly fetchedAt?: string;
  readonly ingestedAt?: string;
  readonly staleAt?: string;
  readonly expiresAt?: string;
  readonly sourceSnapshotVersion?: string;
  readonly timezone?: string;
}

export interface EvidenceItem {
  readonly contractVersion: "spec266-evidence-v1";
  readonly id: string;
  readonly authorizationScope: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  readonly sourceId?: string;
  readonly datasetId?: string;
  readonly sourceRecordRef?: string;
  readonly evidenceClass: EvidenceClass;
  readonly semanticType?: string;
  readonly geometryRef?: string;
  readonly temporal: TemporalEnvelope;
  readonly verificationState: VerificationState;
  readonly qualityProfileRef?: string;
  readonly rightsPolicyRef?: string;
  /** Versioned calculation/forecast method for derived and modeled evidence. */
  readonly methodologyRef?: string;
  readonly payloadRef?: string;
  readonly lineageRefs: readonly string[];
  readonly capturePolicyRef?: string;
}

export type EvidenceContractError = "EVIDENCE_CONTRACT_INVALID" | "EVIDENCE_UNKNOWN_FIELD" | "EVIDENCE_SCOPE_INVALID";
export type EvidenceContractResult =
  | { readonly ok: true; readonly value: EvidenceItem }
  | { readonly ok: false; readonly code: EvidenceContractError };
export type EvidenceLineageGraphResult = { readonly ok: true } | { readonly ok: false; readonly code: "EVIDENCE_LINEAGE_GRAPH_INVALID" | "EVIDENCE_LINEAGE_CYCLE" };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const EVIDENCE_CLASSES = new Set<EvidenceClass>([
  "reference", "official_record", "observation", "derived", "forecast", "model_estimate", "user_asserted", "crowdsourced", "official_warning",
]);
const VERIFICATION_STATES = new Set<VerificationState>([
  "unverified", "correlated", "community_supported", "disputed", "organization_verified", "authority_verified", "superseded", "expired", "unknown",
]);
const TEMPORAL_FIELDS = new Set([
  "observedAt", "effectiveFrom", "effectiveUntil", "publishedAt", "fetchedAt", "ingestedAt", "staleAt", "expiresAt", "sourceSnapshotVersion", "timezone",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  let count = 0;
  for (const field in value) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    count += 1;
    if (count > allowed.size || !allowed.has(field)) return false;
  }
  return true;
}

function isDenseArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_INSTANT.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}

function isValidTemporalEnvelope(value: Record<string, unknown>): boolean {
  if (!hasOnlyFields(value, TEMPORAL_FIELDS)) return false;
  for (const [field, temporalValue] of Object.entries(value)) {
    if (field === "timezone" || field === "sourceSnapshotVersion") {
      if (typeof temporalValue !== "string" || temporalValue.length < 1 || temporalValue.length > 128) return false;
      continue;
    }
    if (!isInstant(temporalValue)) return false;
  }
  return value.effectiveFrom === undefined || value.effectiveUntil === undefined || Date.parse(value.effectiveFrom as string) <= Date.parse(value.effectiveUntil as string);
}

function optionalId(record: Record<string, unknown>, field: string): boolean {
  return record[field] === undefined || isId(record[field]);
}

/** Strict parser for the reference-only shared evidence contract. */
export function parseEvidenceItem(value: unknown): EvidenceContractResult {
  if (!isRecord(value)) return { ok: false, code: "EVIDENCE_CONTRACT_INVALID" };
  const fields = [
    "contractVersion", "id", "authorizationScope", "tenantId", "sourceId", "datasetId", "sourceRecordRef", "evidenceClass",
    "semanticType", "geometryRef", "temporal", "verificationState", "qualityProfileRef", "rightsPolicyRef", "methodologyRef", "payloadRef", "lineageRefs", "capturePolicyRef",
  ];
  if (!hasOnlyFields(value, new Set(fields))) return { ok: false, code: "EVIDENCE_UNKNOWN_FIELD" };
  if (value.authorizationScope !== "PUBLIC" && value.authorizationScope !== "TENANT") return { ok: false, code: "EVIDENCE_SCOPE_INVALID" };
  if ((value.authorizationScope === "TENANT" && !isId(value.tenantId)) || (value.authorizationScope === "PUBLIC" && value.tenantId !== undefined)) {
    return { ok: false, code: "EVIDENCE_SCOPE_INVALID" };
  }
  if (value.contractVersion !== "spec266-evidence-v1" || !isId(value.id) ||
    !optionalId(value, "tenantId") || !optionalId(value, "sourceId") || !optionalId(value, "datasetId") ||
    !optionalId(value, "sourceRecordRef") || !optionalId(value, "geometryRef") || !optionalId(value, "qualityProfileRef") ||
    !optionalId(value, "rightsPolicyRef") || !optionalId(value, "methodologyRef") || !optionalId(value, "payloadRef") || !optionalId(value, "capturePolicyRef") ||
    (value.semanticType !== undefined && !isId(value.semanticType)) ||
    typeof value.evidenceClass !== "string" || !EVIDENCE_CLASSES.has(value.evidenceClass as EvidenceClass) ||
    typeof value.verificationState !== "string" || !VERIFICATION_STATES.has(value.verificationState as VerificationState) ||
    !isDenseArray(value.lineageRefs, 128) || value.lineageRefs.some(ref => !isId(ref)) ||
    new Set(value.lineageRefs as string[]).size !== value.lineageRefs.length || (value.lineageRefs as string[]).includes(value.id as string) || !isRecord(value.temporal) ||
    !isValidTemporalEnvelope(value.temporal)) {
    return { ok: false, code: "EVIDENCE_CONTRACT_INVALID" };
  }
  const derivedClass = value.evidenceClass === "derived" || value.evidenceClass === "forecast" || value.evidenceClass === "model_estimate";
  if (derivedClass && (!(value.lineageRefs as string[]).length || !isId(value.rightsPolicyRef) || !isId(value.methodologyRef))) {
    return { ok: false, code: "EVIDENCE_CONTRACT_INVALID" };
  }

  const temporal = Object.freeze({ ...value.temporal }) as TemporalEnvelope;
  const lineageRefs = Object.freeze([...(value.lineageRefs as string[])]);
  return {
    ok: true,
    value: Object.freeze({
      contractVersion: "spec266-evidence-v1",
      id: value.id as string,
      authorizationScope: value.authorizationScope,
      ...(value.tenantId === undefined ? {} : { tenantId: value.tenantId as string }),
      ...(value.sourceId === undefined ? {} : { sourceId: value.sourceId as string }),
      ...(value.datasetId === undefined ? {} : { datasetId: value.datasetId as string }),
      ...(value.sourceRecordRef === undefined ? {} : { sourceRecordRef: value.sourceRecordRef as string }),
      evidenceClass: value.evidenceClass as EvidenceClass,
      ...(value.semanticType === undefined ? {} : { semanticType: value.semanticType as string }),
      ...(value.geometryRef === undefined ? {} : { geometryRef: value.geometryRef as string }),
      temporal,
      verificationState: value.verificationState as VerificationState,
      ...(value.qualityProfileRef === undefined ? {} : { qualityProfileRef: value.qualityProfileRef as string }),
      ...(value.rightsPolicyRef === undefined ? {} : { rightsPolicyRef: value.rightsPolicyRef as string }),
      ...(value.methodologyRef === undefined ? {} : { methodologyRef: value.methodologyRef as string }),
      ...(value.payloadRef === undefined ? {} : { payloadRef: value.payloadRef as string }),
      lineageRefs,
      ...(value.capturePolicyRef === undefined ? {} : { capturePolicyRef: value.capturePolicyRef as string }),
    }),
  };
}

/** Validates cycles across a bounded, already-loaded evidence lineage closure. */
export function validateEvidenceLineageGraph(values: readonly unknown[]): EvidenceLineageGraphResult {
  if (!isDenseArray(values, 10_000)) return { ok: false, code: "EVIDENCE_LINEAGE_GRAPH_INVALID" };
  const nodes = new Map<string, EvidenceItem>();
  for (const value of values) {
    const parsed = parseEvidenceItem(value);
    if (!parsed.ok || nodes.has(parsed.value.id)) return { ok: false, code: "EVIDENCE_LINEAGE_GRAPH_INVALID" };
    nodes.set(parsed.value.id, parsed.value);
  }
  const state = new Map<string, 0 | 1 | 2>();
  for (const startId of nodes.keys()) {
    if (state.get(startId) === 2) continue;
    const stack: Array<{ id: string; nextRef: number }> = [{ id: startId, nextRef: 0 }];
    state.set(startId, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const refs = nodes.get(frame.id)!.lineageRefs;
      if (frame.nextRef >= refs.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const ref = refs[frame.nextRef++]!;
      if (!nodes.has(ref)) continue;
      if (state.get(ref) === 1) return { ok: false, code: "EVIDENCE_LINEAGE_CYCLE" };
      if (state.get(ref) === 2) continue;
      state.set(ref, 1);
      stack.push({ id: ref, nextRef: 0 });
    }
  }
  return { ok: true };
}
