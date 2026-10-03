import { createHash } from "node:crypto";
import { normalizeHydroMeasurement } from "@smartspec/shared";
import { parseGeoSourceContract, parseGeoSourcePolicy, type GeoSourceContract } from "./contracts";
import { normalizeGeoSourceRecord, type NormalizedGeoSourceRecord } from "./normalize";

export interface GeoSourceRefreshJobEnvelope {
  readonly sourceId: string;
  readonly sourceRef: string;
  readonly configurationRevision: number;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly windowStart: string;
}

export interface GeoSourceRefreshPipelineInput {
  readonly tenantId: string;
  readonly purpose: string;
  readonly geography: string;
  readonly lease: unknown;
  readonly job: GeoSourceRefreshJobEnvelope;
}

export interface ActiveGeoSource {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceRef: string;
  readonly status: string;
  readonly policy: unknown;
}

export interface ResolvedGeoSourceAdapter {
  readonly sourceRef: string;
  readonly adapterId: string;
  readonly providerId: string;
  readonly contractVersion: string;
  readonly configurationRevision: number;
}

export interface GeoHydroRecordBinding {
  /** Explicit provider station identity. Never derive this from a source item ref. */
  readonly stationRef: string;
  readonly displayName: string;
  /** Explicit metric semantics. Never derive this from a unit or variable name. */
  readonly metric: "water_level" | "discharge" | "rainfall";
  readonly variableCode: string;
  readonly qualityCode: "unknown" | "valid" | "suspect" | "invalid" | "corrected" | "estimated" | "missing" | "censored" | "rejected";
  readonly freshnessCode: "current" | "stale" | "delayed" | "unknown";
  readonly verticalDatumRef?: string;
}

export interface GeoSourceRefreshPipelineDependencies {
  readonly reporter: { assertActive(lease: unknown): Promise<void> };
  /** Read again after fetch: rights/policy may have changed while the lease ran. */
  readonly sourceAuthorization: { getActiveSource(input: { readonly tenantId: string; readonly sourceId: string }): Promise<ActiveGeoSource | undefined> };
  readonly registry: { resolve(input: { readonly sourceRef: string; readonly purpose: string; readonly geography: string }): { readonly ok: true; readonly value: ResolvedGeoSourceAdapter } | { readonly ok: false; readonly code: string } };
  /** Adapter-owned transport boundary. The parsed envelope and original bytes stay paired for content-hash proof. */
  readonly transport: { fetch(input: Pick<ResolvedGeoSourceAdapter, "sourceRef" | "adapterId" | "configurationRevision">): Promise<{ readonly envelope: unknown; readonly rawBytes: Uint8Array }> };
  readonly bindings: { resolve(input: { readonly sourceRef: string; readonly itemRef: string; readonly sourceRevision: number }): GeoHydroRecordBinding | undefined };
  /** Append or return the same hash-addressed capture; implementations must never overwrite a capture. */
  readonly captureStore: { putImmutable(input: ImmutableCaptureWrite): Promise<{ readonly captureId: string; readonly created: boolean }> };
  /** Narrow append-only hydro persistence ports backed by the current hydro tables. */
  readonly hydroRepository: {
    resolveOrInsertStation(input: HydroStationWrite): Promise<{ readonly stationId: string; readonly created: boolean }>;
    insertObservationIfAbsent(input: HydroObservationWrite): Promise<{ readonly inserted: boolean }>;
  };
  readonly now: () => string;
}

export interface ImmutableCaptureWrite {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly sourceItemRef: string;
  readonly contentHash: string;
  readonly capturedAt: string;
  /** Provider event time, kept separate from acquisition/capture time. */
  readonly observedAt?: string;
  readonly byteLength: number;
  /** Original provider bytes, never a reserialized contract projection. */
  readonly rawBytes: Buffer;
  readonly provenance: Readonly<Record<string, string | number>>;
}

export interface HydroStationWrite {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly stationRef: string;
  readonly displayName: string;
  readonly geometry: NormalizedGeoSourceRecord["geometry"];
  readonly verticalDatumRef?: string;
}

export interface HydroObservationWrite {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly stationId: string;
  readonly captureId: string;
  readonly metric: GeoHydroRecordBinding["metric"];
  readonly variableCode: string;
  readonly sourceObservationRef: string;
  readonly sourceRevision: string;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly normalizedAt: string;
  readonly rawValue: number;
  readonly rawUnit: string;
  readonly normalizedValue: number;
  readonly normalizedUnit: string;
  readonly qualityCode: GeoHydroRecordBinding["qualityCode"];
  readonly freshnessCode: GeoHydroRecordBinding["freshnessCode"];
  readonly verticalDatumRef?: string;
  readonly provenance: Readonly<Record<string, string | number | boolean>>;
}

export type GeoSourceRefreshPipelineResult =
  | { readonly ok: true; readonly captureId: string; readonly captureCreated: boolean; readonly observationsInserted: number; readonly observationsReplayed: number }
  | { readonly ok: false; readonly code: "GEO_SOURCE_JOB_INVALID" | "GEO_SOURCE_REVOKED_OR_REVISED" | "GEO_SOURCE_CONTRACT_INVALID" | "GEO_SOURCE_CONTRACT_UNKNOWN_FIELD" | "GEO_SOURCE_RAW_BYTES_INVALID" | "GEO_SOURCE_CONTENT_HASH_MISMATCH" | "GEO_HYDRO_BINDING_MISSING" | "GEO_HYDRO_BINDING_INVALID" | "GEO_SOURCE_RECORD_INVALID" | "GEO_SOURCE_CRS_UNSUPPORTED" | "GEO_SOURCE_UNIT_UNSUPPORTED" | "GEO_SOURCE_PROPERTIES_TOO_LARGE" | "HYDRO_VALUE_INVALID" | "HYDRO_UNIT_UNSUPPORTED" | "HYDRO_DIMENSION_MISMATCH" | "HYDRO_VERTICAL_DATUM_REQUIRED" };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const VARIABLE_CODE = /^[a-z][a-z0-9._-]{0,63}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isInstant(value: string): boolean {
  return ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isJobEnvelope(value: GeoSourceRefreshJobEnvelope): boolean {
  return ID.test(value.sourceId) && ID.test(value.sourceRef) && ID.test(value.adapterId) && ID.test(value.adapterVersion) &&
    Number.isSafeInteger(value.configurationRevision) && value.configurationRevision >= 1 && value.configurationRevision <= 2_147_483_647 && isInstant(value.windowStart);
}

function validBinding(value: GeoHydroRecordBinding | undefined): value is GeoHydroRecordBinding {
  return Boolean(value) && ID.test(value.stationRef) && typeof value.displayName === "string" && value.displayName.trim().length > 0 && value.displayName.length <= 200 &&
    ["water_level", "discharge", "rainfall"].includes(value.metric) && VARIABLE_CODE.test(value.variableCode) &&
    ["unknown", "valid", "suspect", "invalid", "corrected", "estimated", "missing", "censored", "rejected"].includes(value.qualityCode) &&
    ["current", "stale", "delayed", "unknown"].includes(value.freshnessCode) &&
    (value.verticalDatumRef === undefined || (ID.test(value.verticalDatumRef) && value.verticalDatumRef.length <= 160));
}

function hasMatchingContractPolicy(contract: GeoSourceContract, source: ActiveGeoSource, adapter: ResolvedGeoSourceAdapter, purpose: string): boolean {
  const policy = parseGeoSourcePolicy(source.policy);
  return policy.ok && contract.sourceRef === source.sourceRef && contract.providerId === adapter.providerId &&
    contract.contractVersion === adapter.contractVersion && contract.licenseRef === policy.value.licenseRef &&
    contract.attribution === policy.value.attribution && contract.retentionClass === policy.value.retentionClass &&
    contract.allowedPurposes.includes(purpose) && policy.value.allowedPurposes.includes(purpose);
}

async function resolveAuthorizedAdapter(
  input: GeoSourceRefreshPipelineInput,
  dependencies: GeoSourceRefreshPipelineDependencies,
): Promise<{ readonly source: ActiveGeoSource; readonly adapter: ResolvedGeoSourceAdapter } | undefined> {
  const source = await dependencies.sourceAuthorization.getActiveSource({ tenantId: input.tenantId, sourceId: input.job.sourceId });
  if (!source || source.id !== input.job.sourceId || source.tenantId !== input.tenantId || source.sourceRef !== input.job.sourceRef || source.status !== "active") return undefined;
  const policy = parseGeoSourcePolicy(source.policy);
  if (!policy.ok || policy.value.configurationRevision !== input.job.configurationRevision) return undefined;
  const resolved = dependencies.registry.resolve({ sourceRef: source.sourceRef, purpose: input.purpose, geography: input.geography });
  if (!resolved.ok) return undefined;
  const adapter = resolved.value;
  if (adapter.sourceRef !== input.job.sourceRef || adapter.adapterId !== input.job.adapterId || adapter.contractVersion !== input.job.adapterVersion ||
    adapter.configurationRevision !== input.job.configurationRevision || !ID.test(adapter.providerId)) return undefined;
  return { source, adapter };
}

function captureWrite(input: GeoSourceRefreshPipelineInput, contract: GeoSourceContract, rawBytes: Buffer): ImmutableCaptureWrite {
  return {
    tenantId: input.tenantId,
    sourceId: input.job.sourceId,
    sourceItemRef: `${contract.sourceRef}:${contract.sourceRevision}`,
    contentHash: contract.contentHash,
    capturedAt: contract.acquiredAt,
    observedAt: contract.observedAt,
    byteLength: rawBytes.byteLength,
    rawBytes,
    provenance: { providerId: contract.providerId, contractVersion: contract.contractVersion, sourceRef: contract.sourceRef, sourceRevision: contract.sourceRevision, schemaVersion: contract.schemaVersion },
  };
}

/**
 * Executes a single approved source refresh using only injected ports. It has
 * no provider URL, ORM, queue, or schema dependency, so canonical executor
 * wiring can use it without allowing runtime input to become fetch authority.
 */
export async function runGeoSourceRefreshPipeline(
  input: GeoSourceRefreshPipelineInput,
  dependencies: GeoSourceRefreshPipelineDependencies,
): Promise<GeoSourceRefreshPipelineResult> {
  if (!ID.test(input.tenantId) || !ID.test(input.purpose) || !ID.test(input.geography) || !isJobEnvelope(input.job)) return { ok: false, code: "GEO_SOURCE_JOB_INVALID" };
  const initial = await resolveAuthorizedAdapter(input, dependencies);
  if (!initial) return { ok: false, code: "GEO_SOURCE_REVOKED_OR_REVISED" };

  const fetched = await dependencies.transport.fetch(initial.adapter);
  if (!(fetched.rawBytes instanceof Uint8Array) || fetched.rawBytes.byteLength < 1 || fetched.rawBytes.byteLength > 10_485_760) return { ok: false, code: "GEO_SOURCE_RAW_BYTES_INVALID" };
  const rawBytes = Buffer.from(fetched.rawBytes);
  const parsed = parseGeoSourceContract(fetched.envelope);
  if (!parsed.ok) return { ok: false, code: parsed.code };
  if (createHash("sha256").update(rawBytes).digest("hex") !== parsed.value.contentHash) return { ok: false, code: "GEO_SOURCE_CONTENT_HASH_MISMATCH" };
  if (!hasMatchingContractPolicy(parsed.value, initial.source, initial.adapter, input.purpose)) return { ok: false, code: "GEO_SOURCE_REVOKED_OR_REVISED" };

  const normalized: Array<{ readonly record: NormalizedGeoSourceRecord; readonly binding: GeoHydroRecordBinding; readonly measurement: Extract<ReturnType<typeof normalizeHydroMeasurement>, { readonly ok: true }> }> = [];
  for (const record of parsed.value.records) {
    const normalizedRecord = normalizeGeoSourceRecord({
      providerId: parsed.value.providerId,
      contractVersion: parsed.value.contractVersion,
      sourceRef: parsed.value.sourceRef,
      sourceRevision: parsed.value.sourceRevision,
      captureRef: `${parsed.value.sourceRef}:${parsed.value.sourceRevision}`,
    }, record);
    if (!normalizedRecord.ok) return { ok: false, code: normalizedRecord.code };
    const binding = dependencies.bindings.resolve({ sourceRef: parsed.value.sourceRef, itemRef: normalizedRecord.value.itemRef, sourceRevision: parsed.value.sourceRevision });
    if (!binding) return { ok: false, code: "GEO_HYDRO_BINDING_MISSING" };
    if (!validBinding(binding)) return { ok: false, code: "GEO_HYDRO_BINDING_INVALID" };
    const measurement = normalizeHydroMeasurement({ metric: binding.metric, value: normalizedRecord.value.measurement.value, unit: normalizedRecord.value.measurement.unit, ...(binding.verticalDatumRef === undefined ? {} : { verticalDatumRef: binding.verticalDatumRef }) });
    if (!measurement.ok) return { ok: false, code: measurement.code };
    normalized.push({ record: normalizedRecord.value, binding, measurement });
  }

  // Revalidate immediately before the first durable effect; a revoked/revised
  // source must not gain a capture merely because its request started earlier.
  const beforeCapture = await resolveAuthorizedAdapter(input, dependencies);
  if (!beforeCapture || !hasMatchingContractPolicy(parsed.value, beforeCapture.source, beforeCapture.adapter, input.purpose)) return { ok: false, code: "GEO_SOURCE_REVOKED_OR_REVISED" };
  await dependencies.reporter.assertActive(input.lease);
  const capture = await dependencies.captureStore.putImmutable(captureWrite(input, parsed.value, rawBytes));

  // The source may have been revoked while capture storage was in flight. Keep
  // its immutable audit record but never publish a hydro row after revocation.
  const beforePublish = await resolveAuthorizedAdapter(input, dependencies);
  if (!beforePublish || !hasMatchingContractPolicy(parsed.value, beforePublish.source, beforePublish.adapter, input.purpose)) return { ok: false, code: "GEO_SOURCE_REVOKED_OR_REVISED" };
  // Fence immediately before station/observation persistence.
  await dependencies.reporter.assertActive(input.lease);
  let observationsInserted = 0;
  let observationsReplayed = 0;
  const receivedAt = dependencies.now();
  if (!isInstant(receivedAt)) return { ok: false, code: "GEO_SOURCE_JOB_INVALID" };
  for (const { record, binding, measurement } of normalized) {
    // Pages may contain many observations. Fence each durable write unit so a
    // worker whose lease expired mid-page cannot continue publishing rows.
    await dependencies.reporter.assertActive(input.lease);
    const observationAgeMs = Date.parse(parsed.value.acquiredAt) - Date.parse(record.observedAt);
    const freshnessCode = observationAgeMs < 0
      ? "unknown"
      : observationAgeMs > parsed.value.freshness.staleAfterSeconds * 1_000
        ? "stale"
        : binding.freshnessCode;
    const station = await dependencies.hydroRepository.resolveOrInsertStation({
      tenantId: input.tenantId,
      sourceId: input.job.sourceId,
      stationRef: binding.stationRef,
      displayName: binding.displayName,
      geometry: record.geometry,
      ...(binding.verticalDatumRef === undefined ? {} : { verticalDatumRef: binding.verticalDatumRef }),
    });
    await dependencies.reporter.assertActive(input.lease);
    const write = await dependencies.hydroRepository.insertObservationIfAbsent({
      tenantId: input.tenantId,
      sourceId: input.job.sourceId,
      stationId: station.stationId,
      captureId: capture.captureId,
      metric: binding.metric,
      variableCode: binding.variableCode,
      sourceObservationRef: record.itemRef,
      sourceRevision: String(record.provenance.sourceRevision),
      observedAt: record.observedAt,
      receivedAt,
      normalizedAt: receivedAt,
      rawValue: measurement.rawValue,
      rawUnit: measurement.rawUnit,
      normalizedValue: measurement.normalizedValue,
      normalizedUnit: measurement.normalizedUnit,
      qualityCode: binding.qualityCode,
      freshnessCode,
      ...(binding.verticalDatumRef === undefined ? {} : { verticalDatumRef: binding.verticalDatumRef }),
      provenance: { providerId: record.provenance.providerId, contractVersion: record.provenance.contractVersion, sourceRef: record.provenance.sourceRef, sourceRevision: record.provenance.sourceRevision, schemaVersion: parsed.value.schemaVersion },
    });
    if (write.inserted) observationsInserted += 1;
    else observationsReplayed += 1;
  }
  return { ok: true, captureId: capture.captureId, captureCreated: capture.created, observationsInserted, observationsReplayed };
}
