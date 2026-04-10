import fs from "fs";
import path from "path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { workpackRecords } from "../../drizzle/schema";
import {
  type CaseSource,
  caseSourceSchema,
  type MetricSnapshot,
  metricSnapshotSchema,
  type Playbook,
  playbookSchema,
  sanitizeSensitiveRecord,
  type SimulationRun,
  simulationRunSchema,
  type Workpack,
  workpackExceptionSchema,
  type WorkpackException,
  type WorkpackRun,
  workpackRunSchema,
  type WorkpackSchedule,
  workpackScheduleSchema,
  workpackSchema,
  type WorkpackVersion,
  workpackVersionSchema,
} from "../../shared/workpackContracts";
import {
  benchmarkPackSchema,
  type BenchmarkPack,
  improvementProposalSchema,
  type ImprovementProposal,
  type WorkpackPromotionRecord,
  workpackPromotionRecordSchema,
} from "../../shared/workpackPromotion";
import {
  type WorkpackIncidentRecord,
  workpackIncidentRecordSchema,
  type WorkpackTelemetryEvent,
  workpackTelemetryEventSchema,
} from "../../shared/workpackTelemetry";
import { getDb, type DrizzleDB } from "../db";

export interface WorkpackDetailRecord {
  workpack: Workpack;
  version: WorkpackVersion;
  caseSources: CaseSource[];
  playbook: Playbook;
  runs: WorkpackRun[];
  simulations: SimulationRun[];
  exceptions: WorkpackException[];
  benchmarks: BenchmarkPack[];
  promotionRecords: WorkpackPromotionRecord[];
  improvementProposals: ImprovementProposal[];
  telemetryEvents: WorkpackTelemetryEvent[];
  metricSnapshots: MetricSnapshot[];
  incidents: WorkpackIncidentRecord[];
  schedules: WorkpackSchedule[];
}

type StoreState = {
  caseSources: Map<string, CaseSource>;
  playbooks: Map<string, Playbook>;
  workpacks: Map<string, Workpack>;
  versions: Map<string, WorkpackVersion>;
  runs: Map<string, WorkpackRun>;
  simulations: Map<string, SimulationRun>;
  exceptions: Map<string, WorkpackException>;
  benchmarks: Map<string, BenchmarkPack>;
  promotionRecords: Map<string, WorkpackPromotionRecord>;
  improvementProposals: Map<string, ImprovementProposal>;
  telemetryEvents: Map<string, WorkpackTelemetryEvent>;
  metricSnapshots: Map<string, MetricSnapshot>;
  incidents: Map<string, WorkpackIncidentRecord>;
  schedules: Map<string, WorkpackSchedule>;
};

type SerializedStoreState = {
  [K in keyof StoreState]: Array<[string, unknown]>;
};

const state: StoreState = {
  caseSources: new Map(),
  playbooks: new Map(),
  workpacks: new Map(),
  versions: new Map(),
  runs: new Map(),
  simulations: new Map(),
  exceptions: new Map(),
  benchmarks: new Map(),
  promotionRecords: new Map(),
  improvementProposals: new Map(),
  telemetryEvents: new Map(),
  metricSnapshots: new Map(),
  incidents: new Map(),
  schedules: new Map(),
};

const persistedRecordTypeValues = [
  "case_source",
  "playbook",
  "workpack",
  "workpack_version",
  "workpack_run",
  "simulation_run",
  "workpack_exception",
  "benchmark_pack",
  "promotion_record",
  "improvement_proposal",
  "telemetry_event",
  "metric_snapshot",
  "incident_record",
  "schedule_record",
] as const;

type PersistedRecordType = (typeof persistedRecordTypeValues)[number];

interface PersistedRecordPayloadMap {
  case_source: CaseSource;
  playbook: Playbook;
  workpack: Workpack;
  workpack_version: WorkpackVersion;
  workpack_run: WorkpackRun;
  simulation_run: SimulationRun;
  workpack_exception: WorkpackException;
  benchmark_pack: BenchmarkPack;
  promotion_record: WorkpackPromotionRecord;
  improvement_proposal: ImprovementProposal;
  telemetry_event: WorkpackTelemetryEvent;
  metric_snapshot: MetricSnapshot;
  incident_record: WorkpackIncidentRecord;
  schedule_record: WorkpackSchedule;
}

type PersistedRecordPayload<T extends PersistedRecordType> = PersistedRecordPayloadMap[T];

const memoryKeyByType: Record<PersistedRecordType, keyof StoreState> = {
  case_source: "caseSources",
  playbook: "playbooks",
  workpack: "workpacks",
  workpack_version: "versions",
  workpack_run: "runs",
  simulation_run: "simulations",
  workpack_exception: "exceptions",
  benchmark_pack: "benchmarks",
  promotion_record: "promotionRecords",
  improvement_proposal: "improvementProposals",
  telemetry_event: "telemetryEvents",
  metric_snapshot: "metricSnapshots",
  incident_record: "incidents",
  schedule_record: "schedules",
};

const WORKPACK_STORE_PATH = process.env.WORKPACK_STORE_PATH
  ?? path.join(process.cwd(), ".data", "workpack-store.json");

let legacyImportAttempted = false;
let legacyImportPromise: Promise<void> | null = null;
let dbWarningIssued = false;

export interface WorkpackPersistenceSession {
  db: DrizzleDB | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortByTimestamp<T>(items: T[], pick: (item: T) => string | null | undefined): T[] {
  return [...items].sort((left, right) => {
    const leftValue = pick(left) ?? "";
    const rightValue = pick(right) ?? "";
    return rightValue.localeCompare(leftValue);
  });
}

function clearState(): void {
  for (const map of Object.values(state)) {
    map.clear();
  }
}

function hydrateState(serialized: Partial<SerializedStoreState> | null | undefined): void {
  clearState();
  if (!serialized) {
    return;
  }

  const entries = Object.entries(serialized) as Array<[keyof StoreState, Array<[string, unknown]>]>;
  for (const [key, value] of entries) {
    if (!Array.isArray(value)) continue;
    const map = state[key];
    for (const [entryKey, entryValue] of value) {
      map.set(entryKey, entryValue as never);
    }
  }
}

function serializeState(): SerializedStoreState {
  return {
    caseSources: Array.from(state.caseSources.entries()),
    playbooks: Array.from(state.playbooks.entries()),
    workpacks: Array.from(state.workpacks.entries()),
    versions: Array.from(state.versions.entries()),
    runs: Array.from(state.runs.entries()),
    simulations: Array.from(state.simulations.entries()),
    exceptions: Array.from(state.exceptions.entries()),
    benchmarks: Array.from(state.benchmarks.entries()),
    promotionRecords: Array.from(state.promotionRecords.entries()),
    improvementProposals: Array.from(state.improvementProposals.entries()),
    telemetryEvents: Array.from(state.telemetryEvents.entries()),
    metricSnapshots: Array.from(state.metricSnapshots.entries()),
    incidents: Array.from(state.incidents.entries()),
    schedules: Array.from(state.schedules.entries()),
  };
}

function isIsoExpired(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now;
}

function sanitizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  return sanitizeSensitiveRecord(payload as Record<string, unknown>);
}

function applyGovernanceToCaseSource(caseSource: CaseSource, now = Date.now()): CaseSource {
  const next = clone(caseSource);
  if (isIsoExpired(next.governance.expiresAt ?? null, now)) {
    next.sourceText = "";
    next.summary = `[Expired] ${next.title}`;
    return next;
  }
  if (next.governance.redactionState === "summary_only" || next.governance.redactionState === "redacted") {
    next.sourceText = "";
  }
  return next;
}

function applyGovernanceToVersion(version: WorkpackVersion, now = Date.now()): WorkpackVersion {
  const next = clone(version);
  next.fixtureCatalog = next.fixtureCatalog.map((fixture) => {
    if (isIsoExpired(fixture.governance.expiresAt ?? null, now)) {
      return {
        ...fixture,
        payload: {},
      };
    }
    if (fixture.governance.redactionState === "summary_only") {
      return {
        ...fixture,
        payload: {},
      };
    }
    if (fixture.governance.redactionState === "redacted") {
      return {
        ...fixture,
        payload: sanitizePayload(fixture.payload) as Record<string, unknown>,
      };
    }
    return fixture;
  });
  next.playbook.localFileIntelligence.notes = next.playbook.localFileIntelligence.notes.slice(0, 10);
  return next;
}

function applyGovernanceToRun(run: WorkpackRun, now = Date.now()): WorkpackRun {
  const next = clone(run);
  next.artifactReferences = next.artifactReferences.map((artifact) => {
    if (isIsoExpired(artifact.governance.expiresAt ?? null, now)) {
      return {
        ...artifact,
        summary: "[Expired evidence]",
      };
    }
    if (artifact.governance.redactionState === "summary_only") {
      return {
        ...artifact,
        summary: artifact.summary.slice(0, 180),
      };
    }
    return artifact;
  });
  return next;
}

function pruneExpiredState(): void {
  const now = Date.now();
  for (const [id, caseSource] of state.caseSources.entries()) {
    state.caseSources.set(id, applyGovernanceToCaseSource(caseSource, now));
  }
  for (const [id, version] of state.versions.entries()) {
    state.versions.set(id, applyGovernanceToVersion(version, now));
  }
  for (const [id, run] of state.runs.entries()) {
    state.runs.set(id, applyGovernanceToRun(run, now));
  }
  for (const [id, schedule] of state.schedules.entries()) {
    if (schedule.status === "retired") {
      continue;
    }
    if (schedule.nextRunAt && isIsoExpired(schedule.nextRunAt, now) && schedule.status === "error" && schedule.lastError) {
      state.schedules.set(id, {
        ...schedule,
        updatedAt: new Date(now).toISOString(),
      });
    }
  }
}

async function getOptionalDb(): Promise<DrizzleDB | null> {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production" && process.env.WORKPACK_ALLOW_IN_MEMORY_FALLBACK !== "1") {
      throw new Error("Workpack persistence requires a durable database in production.");
    }
    return null;
  }

  try {
    return getDb();
  } catch (error) {
    if (process.env.NODE_ENV === "production" && process.env.WORKPACK_ALLOW_IN_MEMORY_FALLBACK !== "1") {
      throw new Error(
        `Workpack persistence database unavailable in production: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!dbWarningIssued) {
      console.warn("[workpackPersistence] database unavailable, using in-memory fallback", error);
      dbWarningIssued = true;
    }
    return null;
  }
}

function mapForType<T extends PersistedRecordType>(type: T): Map<string, PersistedRecordPayload<T>> {
  return state[memoryKeyByType[type]] as Map<string, PersistedRecordPayload<T>>;
}

function getRecordSortTimestamp<T extends PersistedRecordType>(
  type: T,
  payload: PersistedRecordPayload<T>,
): string | null {
  switch (type) {
    case "case_source":
      return (payload as CaseSource).createdAt;
    case "playbook":
      return (payload as Playbook).createdAt;
    case "workpack":
      return (payload as Workpack).updatedAt ?? (payload as Workpack).createdAt;
    case "workpack_version":
      return (payload as WorkpackVersion).publishedAt ?? (payload as WorkpackVersion).createdAt;
    case "workpack_run":
      return (payload as WorkpackRun).startedAt;
    case "simulation_run":
      return (payload as SimulationRun).createdAt;
    case "workpack_exception":
      return (payload as WorkpackException).createdAt;
    case "benchmark_pack":
      return (payload as BenchmarkPack).publishedAt;
    case "promotion_record":
      return (payload as WorkpackPromotionRecord).evidenceCapturedAt;
    case "improvement_proposal":
      return (payload as ImprovementProposal).createdAt;
    case "telemetry_event":
      return (payload as WorkpackTelemetryEvent).createdAt;
    case "metric_snapshot":
      return (payload as MetricSnapshot).generatedAt;
    case "incident_record":
      return (payload as WorkpackIncidentRecord).createdAt;
    case "schedule_record":
      return (payload as WorkpackSchedule).updatedAt ?? (payload as WorkpackSchedule).createdAt;
    default:
      return null;
  }
}

function getWorkpackLink<T extends PersistedRecordType>(
  type: T,
  payload: PersistedRecordPayload<T>,
): string | null {
  switch (type) {
    case "workpack":
      return (payload as Workpack).id;
    case "workpack_version":
      return (payload as WorkpackVersion).workpackId;
    case "workpack_run":
      return (payload as WorkpackRun).workpackId;
    case "simulation_run":
      return (payload as SimulationRun).workpackId;
    case "workpack_exception":
      return (payload as WorkpackException).workpackId;
    case "benchmark_pack":
      return (payload as BenchmarkPack).sourceWorkpackId;
    case "promotion_record":
      return (payload as WorkpackPromotionRecord).workpackId;
    case "improvement_proposal":
      return (payload as ImprovementProposal).workpackId;
    case "telemetry_event":
      return (payload as WorkpackTelemetryEvent).workpackId;
    case "metric_snapshot":
      return (payload as MetricSnapshot).workpackId;
    case "incident_record":
      return (payload as WorkpackIncidentRecord).workpackId ?? null;
    case "schedule_record":
      return (payload as WorkpackSchedule).workpackId;
    default:
      return null;
  }
}

function getMemoryTenantId<T extends PersistedRecordType>(
  type: T,
  payload: PersistedRecordPayload<T>,
): string | null {
  switch (type) {
    case "case_source":
    case "playbook":
    case "workpack":
    case "workpack_run":
    case "simulation_run":
    case "telemetry_event":
    case "incident_record":
    case "schedule_record":
      return (payload as
        | CaseSource
        | Playbook
        | Workpack
        | WorkpackRun
        | SimulationRun
        | WorkpackTelemetryEvent
        | WorkpackIncidentRecord
        | WorkpackSchedule).tenantId;
    case "workpack_version":
      return (payload as WorkpackVersion).playbook.tenantId;
    case "workpack_exception":
    case "promotion_record":
    case "improvement_proposal":
    case "metric_snapshot": {
      const workpack = state.workpacks.get(
        (payload as WorkpackException | WorkpackPromotionRecord | ImprovementProposal | MetricSnapshot).workpackId,
      );
      return workpack?.tenantId ?? null;
    }
    case "benchmark_pack": {
      const workpack = state.workpacks.get((payload as BenchmarkPack).sourceWorkpackId);
      return workpack?.tenantId ?? null;
    }
    default:
      return null;
  }
}

function parsePayload<T extends PersistedRecordType>(
  type: T,
  payload: unknown,
): PersistedRecordPayload<T> {
  switch (type) {
    case "case_source":
      return applyGovernanceToCaseSource(caseSourceSchema.parse(payload)) as PersistedRecordPayload<T>;
    case "playbook":
      return playbookSchema.parse(payload) as PersistedRecordPayload<T>;
    case "workpack":
      return workpackSchema.parse(payload) as PersistedRecordPayload<T>;
    case "workpack_version":
      return applyGovernanceToVersion(workpackVersionSchema.parse(payload)) as PersistedRecordPayload<T>;
    case "workpack_run":
      return applyGovernanceToRun(workpackRunSchema.parse(payload)) as PersistedRecordPayload<T>;
    case "simulation_run":
      return simulationRunSchema.parse(payload) as PersistedRecordPayload<T>;
    case "workpack_exception":
      return workpackExceptionSchema.parse(payload) as PersistedRecordPayload<T>;
    case "benchmark_pack":
      return benchmarkPackSchema.parse(payload) as PersistedRecordPayload<T>;
    case "promotion_record":
      return workpackPromotionRecordSchema.parse(payload) as PersistedRecordPayload<T>;
    case "improvement_proposal":
      return improvementProposalSchema.parse(payload) as PersistedRecordPayload<T>;
    case "telemetry_event":
      return workpackTelemetryEventSchema.parse(payload) as PersistedRecordPayload<T>;
    case "metric_snapshot":
      return metricSnapshotSchema.parse(payload) as PersistedRecordPayload<T>;
    case "incident_record":
      return workpackIncidentRecordSchema.parse(payload) as PersistedRecordPayload<T>;
    case "schedule_record":
      return workpackScheduleSchema.parse(payload) as PersistedRecordPayload<T>;
    default:
      throw new Error(`Unsupported workpack record type: ${String(type)}`);
  }
}

function payloadEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function persistGovernedPayloadIfChanged<T extends PersistedRecordType>(
  type: T,
  rawPayload: unknown,
  normalizedPayload: PersistedRecordPayload<T>,
  db: DrizzleDB,
): Promise<void> {
  if (payloadEquals(rawPayload, normalizedPayload)) {
    return;
  }

  const tenantId = await resolveTenantIdForRecord(type, normalizedPayload, db);
  const workpackId = getWorkpackLink(type, normalizedPayload);
  const sortTimestamp = getRecordSortTimestamp(type, normalizedPayload);

  await db
    .insert(workpackRecords)
    .values({
      tenantId,
      recordType: type,
      recordId: normalizedPayload.id,
      workpackId,
      sortTimestamp: toDateOrNull(sortTimestamp),
      payloadJson: normalizedPayload as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: [
        workpackRecords.tenantId,
        workpackRecords.recordType,
        workpackRecords.recordId,
      ],
      set: {
        workpackId,
        sortTimestamp: toDateOrNull(sortTimestamp),
        payloadJson: normalizedPayload as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
}

function setMemoryRecord<T extends PersistedRecordType>(
  type: T,
  payload: PersistedRecordPayload<T>,
): PersistedRecordPayload<T> {
  const normalized = parsePayload(type, payload);
  mapForType(type).set(normalized.id, clone(normalized));
  return normalized;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

async function getRecordById<T extends PersistedRecordType>(
  type: T,
  recordId: string,
  dbOverride?: DrizzleDB | null,
): Promise<PersistedRecordPayload<T> | null> {
  const db = dbOverride ?? await getOptionalDb();
  if (!db) {
    pruneExpiredState();
    return clone(mapForType(type).get(recordId) ?? null);
  }

  await ensureLegacyImport(db);
  const rows = await db
    .select({ payloadJson: workpackRecords.payloadJson })
    .from(workpackRecords)
    .where(and(
      eq(workpackRecords.recordType, type),
      eq(workpackRecords.recordId, recordId),
    ))
    .orderBy(desc(workpackRecords.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const normalized = parsePayload(type, row.payloadJson);
  await persistGovernedPayloadIfChanged(type, row.payloadJson, normalized, db);
  return clone(normalized);
}

async function getRecordByIdForTenant<T extends PersistedRecordType>(
  type: T,
  tenantId: string,
  recordId: string,
  dbOverride?: DrizzleDB | null,
): Promise<PersistedRecordPayload<T> | null> {
  const db = dbOverride ?? await getOptionalDb();
  if (!db) {
    pruneExpiredState();
    const record = mapForType(type).get(recordId);
    if (!record) {
      return null;
    }
    return getMemoryTenantId(type, record) === tenantId
      ? clone(parsePayload(type, record))
      : null;
  }

  await ensureLegacyImport(db);
  const rows = await db
    .select({ payloadJson: workpackRecords.payloadJson })
    .from(workpackRecords)
    .where(and(
      eq(workpackRecords.recordType, type),
      eq(workpackRecords.tenantId, tenantId),
      eq(workpackRecords.recordId, recordId),
    ))
    .orderBy(desc(workpackRecords.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const normalized = parsePayload(type, row.payloadJson);
  await persistGovernedPayloadIfChanged(type, row.payloadJson, normalized, db);
  return clone(normalized);
}

async function listRecordsByTenant<T extends PersistedRecordType>(
  type: T,
  tenantId: string,
  dbOverride?: DrizzleDB | null,
): Promise<PersistedRecordPayload<T>[]> {
  const db = dbOverride ?? await getOptionalDb();
  if (!db) {
    pruneExpiredState();
    return sortByTimestamp(
      Array.from(mapForType(type).values())
        .filter((record) => getMemoryTenantId(type, record) === tenantId)
        .map((record) => clone(parsePayload(type, record))),
      (record) => getRecordSortTimestamp(type, record),
    );
  }

  await ensureLegacyImport(db);
  const rows = await db
    .select({ payloadJson: workpackRecords.payloadJson })
    .from(workpackRecords)
    .where(and(
      eq(workpackRecords.recordType, type),
      eq(workpackRecords.tenantId, tenantId),
    ))
    .orderBy(desc(workpackRecords.sortTimestamp), desc(workpackRecords.updatedAt));

  const normalizedRows = await Promise.all(rows.map(async (row) => {
    const normalized = parsePayload(type, row.payloadJson);
    await persistGovernedPayloadIfChanged(type, row.payloadJson, normalized, db);
    return clone(normalized);
  }));

  return normalizedRows;
}

async function listRecordsByWorkpack<T extends PersistedRecordType>(
  type: T,
  workpackId: string,
  dbOverride?: DrizzleDB | null,
): Promise<PersistedRecordPayload<T>[]> {
  const db = dbOverride ?? await getOptionalDb();
  if (!db) {
    pruneExpiredState();
    return sortByTimestamp(
      Array.from(mapForType(type).values())
        .filter((record) => getWorkpackLink(type, record) === workpackId)
        .map((record) => clone(parsePayload(type, record))),
      (record) => getRecordSortTimestamp(type, record),
    );
  }

  await ensureLegacyImport(db);
  const rows = await db
    .select({ payloadJson: workpackRecords.payloadJson })
    .from(workpackRecords)
    .where(and(
      eq(workpackRecords.recordType, type),
      eq(workpackRecords.workpackId, workpackId),
    ))
    .orderBy(desc(workpackRecords.sortTimestamp), desc(workpackRecords.updatedAt));

  const normalizedRows = await Promise.all(rows.map(async (row) => {
    const normalized = parsePayload(type, row.payloadJson);
    await persistGovernedPayloadIfChanged(type, row.payloadJson, normalized, db);
    return clone(normalized);
  }));

  return normalizedRows;
}

async function listAllRecordsByType<T extends PersistedRecordType>(
  type: T,
  dbOverride?: DrizzleDB | null,
): Promise<PersistedRecordPayload<T>[]> {
  const db = dbOverride ?? await getOptionalDb();
  if (!db) {
    pruneExpiredState();
    return sortByTimestamp(
      Array.from(mapForType(type).values()).map((record) => clone(parsePayload(type, record))),
      (record) => getRecordSortTimestamp(type, record),
    );
  }

  await ensureLegacyImport(db);
  const rows = await db
    .select({ payloadJson: workpackRecords.payloadJson })
    .from(workpackRecords)
    .where(eq(workpackRecords.recordType, type))
    .orderBy(desc(workpackRecords.sortTimestamp), desc(workpackRecords.updatedAt));

  const normalizedRows = await Promise.all(rows.map(async (row) => {
    const normalized = parsePayload(type, row.payloadJson);
    await persistGovernedPayloadIfChanged(type, row.payloadJson, normalized, db);
    return clone(normalized);
  }));

  return normalizedRows;
}

async function listCaseSourcesByIds(
  caseSourceIds: string[],
  dbOverride?: DrizzleDB | null,
): Promise<CaseSource[]> {
  if (caseSourceIds.length === 0) {
    return [];
  }

  const db = dbOverride ?? await getOptionalDb();
  if (!db) {
    pruneExpiredState();
    return caseSourceIds
      .map((caseSourceId) => state.caseSources.get(caseSourceId))
      .filter((caseSource): caseSource is CaseSource => Boolean(caseSource))
      .map((caseSource) => clone(parsePayload("case_source", caseSource)));
  }

  await ensureLegacyImport(db);
  const rows = await db
    .select({
      recordId: workpackRecords.recordId,
      payloadJson: workpackRecords.payloadJson,
    })
    .from(workpackRecords)
    .where(and(
      eq(workpackRecords.recordType, "case_source"),
      inArray(workpackRecords.recordId, caseSourceIds),
    ));

  const byId = new Map<string, CaseSource>();
  for (const row of rows) {
    const normalized = parsePayload("case_source", row.payloadJson);
    await persistGovernedPayloadIfChanged("case_source", row.payloadJson, normalized, db);
    byId.set(row.recordId, normalized);
  }
  return caseSourceIds
    .map((caseSourceId) => byId.get(caseSourceId))
    .filter((caseSource): caseSource is CaseSource => Boolean(caseSource))
    .map(clone);
}

async function resolveTenantIdForWorkpack(workpackId: string, dbOverride?: DrizzleDB | null): Promise<string> {
  const workpack = await getRecordById("workpack", workpackId, dbOverride);
  if (!workpack) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }
  return workpack.tenantId;
}

async function resolveTenantIdForRecord<T extends PersistedRecordType>(
  type: T,
  payload: PersistedRecordPayload<T>,
  dbOverride?: DrizzleDB | null,
): Promise<string> {
  switch (type) {
    case "case_source":
    case "playbook":
    case "workpack":
    case "workpack_run":
    case "simulation_run":
    case "telemetry_event":
    case "incident_record":
    case "schedule_record":
      return (payload as
        | CaseSource
        | Playbook
        | Workpack
        | WorkpackRun
        | SimulationRun
        | WorkpackTelemetryEvent
        | WorkpackIncidentRecord
        | WorkpackSchedule).tenantId;
    case "workpack_version":
      return (payload as WorkpackVersion).playbook.tenantId;
    case "workpack_exception":
    case "promotion_record":
    case "improvement_proposal":
    case "metric_snapshot":
      return resolveTenantIdForWorkpack(
        (payload as WorkpackException | WorkpackPromotionRecord | ImprovementProposal | MetricSnapshot).workpackId,
        dbOverride,
      );
    case "benchmark_pack":
      return resolveTenantIdForWorkpack((payload as BenchmarkPack).sourceWorkpackId, dbOverride);
    default:
      throw new Error(`Unsupported tenant resolution for record type: ${String(type)}`);
  }
}

async function putRecord<T extends PersistedRecordType>(
  type: T,
  payload: PersistedRecordPayload<T>,
  options?: {
    db?: DrizzleDB | null;
    skipLegacyImport?: boolean;
  },
): Promise<PersistedRecordPayload<T>> {
  const normalized = setMemoryRecord(type, payload);
  const db = options?.db ?? await getOptionalDb();
  if (!db) {
    return clone(normalized);
  }

  if (!options?.skipLegacyImport) {
    await ensureLegacyImport(db);
  }

  const tenantId = await resolveTenantIdForRecord(type, normalized, db);
  const workpackId = getWorkpackLink(type, normalized);
  const sortTimestamp = getRecordSortTimestamp(type, normalized);

  await db
    .insert(workpackRecords)
    .values({
      tenantId,
      recordType: type,
      recordId: normalized.id,
      workpackId,
      sortTimestamp: toDateOrNull(sortTimestamp),
      payloadJson: normalized as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: [
        workpackRecords.tenantId,
        workpackRecords.recordType,
        workpackRecords.recordId,
      ],
      set: {
        workpackId,
        sortTimestamp: toDateOrNull(sortTimestamp),
        payloadJson: normalized as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });

  return clone(normalized);
}

async function ensureLegacyImport(db: DrizzleDB): Promise<void> {
  if (legacyImportAttempted) {
    return;
  }
  if (legacyImportPromise) {
    return legacyImportPromise;
  }

  legacyImportPromise = (async () => {
    legacyImportAttempted = true;

    const existing = await db
      .select({ count: sql<number>`count(*)` })
      .from(workpackRecords);
    if (Number(existing[0]?.count ?? 0) > 0) {
      return;
    }

    try {
      if (!fs.existsSync(WORKPACK_STORE_PATH)) {
        return;
      }
      const raw = fs.readFileSync(WORKPACK_STORE_PATH, "utf8").trim();
      if (!raw) {
        return;
      }

      hydrateState(JSON.parse(raw) as SerializedStoreState);
      pruneExpiredState();

      const importEntries: Array<{ type: PersistedRecordType; payload: PersistedRecordPayload<PersistedRecordType> }> = [
        ...Array.from(state.caseSources.values()).map((payload) => ({ type: "case_source" as const, payload })),
        ...Array.from(state.playbooks.values()).map((payload) => ({ type: "playbook" as const, payload })),
        ...Array.from(state.workpacks.values()).map((payload) => ({ type: "workpack" as const, payload })),
        ...Array.from(state.versions.values()).map((payload) => ({ type: "workpack_version" as const, payload })),
        ...Array.from(state.runs.values()).map((payload) => ({ type: "workpack_run" as const, payload })),
        ...Array.from(state.simulations.values()).map((payload) => ({ type: "simulation_run" as const, payload })),
        ...Array.from(state.exceptions.values()).map((payload) => ({ type: "workpack_exception" as const, payload })),
        ...Array.from(state.benchmarks.values()).map((payload) => ({ type: "benchmark_pack" as const, payload })),
        ...Array.from(state.promotionRecords.values()).map((payload) => ({ type: "promotion_record" as const, payload })),
        ...Array.from(state.improvementProposals.values()).map((payload) => ({ type: "improvement_proposal" as const, payload })),
        ...Array.from(state.telemetryEvents.values()).map((payload) => ({ type: "telemetry_event" as const, payload })),
        ...Array.from(state.metricSnapshots.values()).map((payload) => ({ type: "metric_snapshot" as const, payload })),
        ...Array.from(state.incidents.values()).map((payload) => ({ type: "incident_record" as const, payload })),
        ...Array.from(state.schedules.values()).map((payload) => ({ type: "schedule_record" as const, payload })),
      ];

      for (const entry of importEntries) {
        await putRecord(entry.type, entry.payload, { db, skipLegacyImport: true });
      }
    } catch (error) {
      console.warn("[workpackPersistence] failed to import legacy file-backed store", error);
    }
  })().finally(() => {
    legacyImportPromise = null;
  });

  return legacyImportPromise;
}

export function createWorkpackId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

export async function resetWorkpackStore(): Promise<void> {
  clearState();
  legacyImportAttempted = true;
  legacyImportPromise = null;

  const db = await getOptionalDb();
  if (db) {
    await db.delete(workpackRecords);
  }
}

export async function withWorkpackPersistenceTransaction<T>(
  callback: (session: WorkpackPersistenceSession) => Promise<T>,
): Promise<T> {
  const db = await getOptionalDb();
  if (!db) {
    return callback({ db: null });
  }

  await ensureLegacyImport(db);
  return db.transaction(async (tx) => callback({ db: tx as unknown as DrizzleDB }));
}

export async function runWorkpackGovernanceMaintenance(session?: WorkpackPersistenceSession): Promise<void> {
  const db = session?.db ?? await getOptionalDb();
  if (!db) {
    pruneExpiredState();
    return;
  }

  await ensureLegacyImport(db);
  for (const type of persistedRecordTypeValues) {
    const rows = await db
      .select({
        payloadJson: workpackRecords.payloadJson,
      })
      .from(workpackRecords)
      .where(eq(workpackRecords.recordType, type));

    for (const row of rows) {
      const normalized = parsePayload(type, row.payloadJson);
      await persistGovernedPayloadIfChanged(type, row.payloadJson, normalized, db);
    }
  }
}

export async function saveCaseSources(
  caseSources: CaseSource[],
  session?: WorkpackPersistenceSession,
): Promise<CaseSource[]> {
  return Promise.all(caseSources.map((caseSource) => putRecord("case_source", caseSource, { db: session?.db ?? null })));
}

export async function savePlaybook(playbook: Playbook, session?: WorkpackPersistenceSession): Promise<Playbook> {
  return putRecord("playbook", playbook, { db: session?.db ?? null });
}

export async function saveWorkpack(workpack: Workpack, session?: WorkpackPersistenceSession): Promise<Workpack> {
  return putRecord("workpack", workpack, { db: session?.db ?? null });
}

export async function saveWorkpackVersion(
  version: WorkpackVersion,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackVersion> {
  return putRecord("workpack_version", version, { db: session?.db ?? null });
}

export async function saveWorkpackRun(run: WorkpackRun, session?: WorkpackPersistenceSession): Promise<WorkpackRun> {
  return putRecord("workpack_run", run, { db: session?.db ?? null });
}

export async function saveSimulationRun(
  simulationRun: SimulationRun,
  session?: WorkpackPersistenceSession,
): Promise<SimulationRun> {
  return putRecord("simulation_run", simulationRun, { db: session?.db ?? null });
}

export async function saveWorkpackException(
  exceptionRecord: WorkpackException,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackException> {
  return putRecord("workpack_exception", exceptionRecord, { db: session?.db ?? null });
}

export async function saveBenchmarkPack(
  benchmarkPack: BenchmarkPack,
  session?: WorkpackPersistenceSession,
): Promise<BenchmarkPack> {
  return putRecord("benchmark_pack", benchmarkPack, { db: session?.db ?? null });
}

export async function savePromotionRecord(
  record: WorkpackPromotionRecord,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackPromotionRecord> {
  return putRecord("promotion_record", record, { db: session?.db ?? null });
}

export async function saveImprovementProposal(
  proposal: ImprovementProposal,
  session?: WorkpackPersistenceSession,
): Promise<ImprovementProposal> {
  return putRecord("improvement_proposal", proposal, { db: session?.db ?? null });
}

export async function saveTelemetryEvent(
  event: WorkpackTelemetryEvent,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackTelemetryEvent> {
  return putRecord("telemetry_event", event, { db: session?.db ?? null });
}

export async function saveMetricSnapshot(
  snapshot: MetricSnapshot,
  session?: WorkpackPersistenceSession,
): Promise<MetricSnapshot> {
  return putRecord("metric_snapshot", snapshot, { db: session?.db ?? null });
}

export async function saveIncidentRecord(
  record: WorkpackIncidentRecord,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackIncidentRecord> {
  return putRecord("incident_record", record, { db: session?.db ?? null });
}

export async function saveWorkpackSchedule(
  schedule: WorkpackSchedule,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackSchedule> {
  return putRecord("schedule_record", schedule, { db: session?.db ?? null });
}

export async function getWorkpackRun(runId: string, session?: WorkpackPersistenceSession): Promise<WorkpackRun | null> {
  return getRecordById("workpack_run", runId, session?.db ?? null);
}

export async function getSimulationRun(
  simulationRunId: string,
  session?: WorkpackPersistenceSession,
): Promise<SimulationRun | null> {
  return getRecordById("simulation_run", simulationRunId, session?.db ?? null);
}

export async function getWorkpackException(
  exceptionId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackException | null> {
  return getRecordById("workpack_exception", exceptionId, session?.db ?? null);
}

export async function getWorkpackExceptionForTenant(
  tenantId: string,
  exceptionId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackException | null> {
  return getRecordByIdForTenant("workpack_exception", tenantId, exceptionId, session?.db ?? null);
}

export async function getBenchmarkPack(
  benchmarkPackId: string,
  session?: WorkpackPersistenceSession,
): Promise<BenchmarkPack | null> {
  return getRecordById("benchmark_pack", benchmarkPackId, session?.db ?? null);
}

export async function getPromotionRecord(
  promotionRecordId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackPromotionRecord | null> {
  return getRecordById("promotion_record", promotionRecordId, session?.db ?? null);
}

export async function getPromotionRecordForTenant(
  tenantId: string,
  promotionRecordId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackPromotionRecord | null> {
  return getRecordByIdForTenant("promotion_record", tenantId, promotionRecordId, session?.db ?? null);
}

export async function getIncidentRecord(
  incidentId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackIncidentRecord | null> {
  return getRecordById("incident_record", incidentId, session?.db ?? null);
}

export async function getIncidentRecordForTenant(
  tenantId: string,
  incidentId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackIncidentRecord | null> {
  return getRecordByIdForTenant("incident_record", tenantId, incidentId, session?.db ?? null);
}

export async function getWorkpackSchedule(
  scheduleId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackSchedule | null> {
  return getRecordById("schedule_record", scheduleId, session?.db ?? null);
}

export async function getWorkpackScheduleForTenant(
  tenantId: string,
  scheduleId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackSchedule | null> {
  return getRecordByIdForTenant("schedule_record", tenantId, scheduleId, session?.db ?? null);
}

export async function updateWorkpackRun(
  runId: string,
  updater: (run: WorkpackRun) => WorkpackRun,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackRun | null> {
  const current = await getWorkpackRun(runId, session);
  if (!current) return null;
  return putRecord("workpack_run", updater(current), { db: session?.db ?? null });
}

export async function updateSimulationRun(
  simulationRunId: string,
  updater: (run: SimulationRun) => SimulationRun,
  session?: WorkpackPersistenceSession,
): Promise<SimulationRun | null> {
  const current = await getSimulationRun(simulationRunId, session);
  if (!current) return null;
  return putRecord("simulation_run", updater(current), { db: session?.db ?? null });
}

export async function updateBenchmarkPack(
  benchmarkPackId: string,
  updater: (benchmarkPack: BenchmarkPack) => BenchmarkPack,
  session?: WorkpackPersistenceSession,
): Promise<BenchmarkPack | null> {
  const current = await getBenchmarkPack(benchmarkPackId, session);
  if (!current) return null;
  return putRecord("benchmark_pack", updater(current), { db: session?.db ?? null });
}

export async function updatePromotionRecord(
  promotionRecordId: string,
  updater: (record: WorkpackPromotionRecord) => WorkpackPromotionRecord,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackPromotionRecord | null> {
  const current = await getPromotionRecord(promotionRecordId, session);
  if (!current) return null;
  return putRecord("promotion_record", updater(current), { db: session?.db ?? null });
}

export async function updateIncidentRecord(
  incidentId: string,
  updater: (record: WorkpackIncidentRecord) => WorkpackIncidentRecord,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackIncidentRecord | null> {
  const current = await getIncidentRecord(incidentId, session);
  if (!current) return null;
  return putRecord("incident_record", updater(current), { db: session?.db ?? null });
}

export async function updateWorkpackSchedule(
  scheduleId: string,
  updater: (schedule: WorkpackSchedule) => WorkpackSchedule,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackSchedule | null> {
  const current = await getWorkpackSchedule(scheduleId, session);
  if (!current) return null;
  return putRecord("schedule_record", updater(current), { db: session?.db ?? null });
}

export async function getWorkpack(workpackId: string, session?: WorkpackPersistenceSession): Promise<Workpack | null> {
  return getRecordById("workpack", workpackId, session?.db ?? null);
}

export async function getWorkpackVersion(
  versionId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackVersion | null> {
  return getRecordById("workpack_version", versionId, session?.db ?? null);
}

export async function getCurrentWorkpackVersion(
  workpackId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackVersion | null> {
  const workpack = await getWorkpack(workpackId, session);
  if (!workpack) return null;
  return getWorkpackVersion(workpack.currentVersionId, session);
}

export async function updateWorkpack(
  workpackId: string,
  updater: (workpack: Workpack) => Workpack,
  session?: WorkpackPersistenceSession,
): Promise<Workpack | null> {
  const current = await getWorkpack(workpackId, session);
  if (!current) return null;
  return putRecord("workpack", updater(current), { db: session?.db ?? null });
}

export async function updateWorkpackVersion(
  versionId: string,
  updater: (version: WorkpackVersion) => WorkpackVersion,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackVersion | null> {
  const current = await getWorkpackVersion(versionId, session);
  if (!current) return null;
  return putRecord("workpack_version", updater(current), { db: session?.db ?? null });
}

export async function listWorkpacksByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<Workpack[]> {
  return listRecordsByTenant("workpack", tenantId, session?.db ?? null);
}

export async function listTelemetryEventsForWorkpack(
  workpackId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackTelemetryEvent[]> {
  return listRecordsByWorkpack("telemetry_event", workpackId, session?.db ?? null);
}

export async function listRunsByTenant(tenantId: string, session?: WorkpackPersistenceSession): Promise<WorkpackRun[]> {
  return listRecordsByTenant("workpack_run", tenantId, session?.db ?? null);
}

export async function listAllRuns(session?: WorkpackPersistenceSession): Promise<WorkpackRun[]> {
  return listAllRecordsByType("workpack_run", session?.db ?? null);
}

export async function listSimulationsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<SimulationRun[]> {
  return listRecordsByTenant("simulation_run", tenantId, session?.db ?? null);
}

export async function listExceptionsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackException[]> {
  return listRecordsByTenant("workpack_exception", tenantId, session?.db ?? null);
}

export async function listBenchmarksByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<BenchmarkPack[]> {
  return listRecordsByTenant("benchmark_pack", tenantId, session?.db ?? null);
}

export async function listPromotionRecordsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackPromotionRecord[]> {
  return listRecordsByTenant("promotion_record", tenantId, session?.db ?? null);
}

export async function listImprovementProposalsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<ImprovementProposal[]> {
  return listRecordsByTenant("improvement_proposal", tenantId, session?.db ?? null);
}

export async function listMetricSnapshotsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<MetricSnapshot[]> {
  return listRecordsByTenant("metric_snapshot", tenantId, session?.db ?? null);
}

export async function listTelemetryEventsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackTelemetryEvent[]> {
  return listRecordsByTenant("telemetry_event", tenantId, session?.db ?? null);
}

export async function listIncidentsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackIncidentRecord[]> {
  return listRecordsByTenant("incident_record", tenantId, session?.db ?? null);
}

export async function listWorkpackDetailsByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackDetailRecord[]> {
  const workpacks = await listWorkpacksByTenant(tenantId, session);
  const details = await Promise.all(workpacks.map((workpack) => getWorkpackDetail(workpack.id, session)));
  return details.filter((detail): detail is WorkpackDetailRecord => Boolean(detail));
}

export async function listIncidentsForWorkpack(
  workpackId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackIncidentRecord[]> {
  return listRecordsByWorkpack("incident_record", workpackId, session?.db ?? null);
}

export async function listSchedulesByTenant(
  tenantId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackSchedule[]> {
  return listRecordsByTenant("schedule_record", tenantId, session?.db ?? null);
}

export async function listSchedulesForWorkpack(
  workpackId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackSchedule[]> {
  return listRecordsByWorkpack("schedule_record", workpackId, session?.db ?? null);
}

export async function listAllSchedules(session?: WorkpackPersistenceSession): Promise<WorkpackSchedule[]> {
  return listAllRecordsByType("schedule_record", session?.db ?? null);
}

export async function getWorkpackDetail(
  workpackId: string,
  session?: WorkpackPersistenceSession,
): Promise<WorkpackDetailRecord | null> {
  const workpack = await getWorkpack(workpackId, session);
  if (!workpack) return null;
  const version = await getCurrentWorkpackVersion(workpackId, session);
  if (!version) return null;

  const [
    caseSources,
    runs,
    simulations,
    exceptions,
    benchmarks,
    promotionRecords,
    improvementProposals,
    telemetryEvents,
    metricSnapshots,
    incidents,
    schedules,
  ] = await Promise.all([
    listCaseSourcesByIds(workpack.caseSourceIds, session?.db ?? null),
    listRecordsByWorkpack("workpack_run", workpackId, session?.db ?? null),
    listRecordsByWorkpack("simulation_run", workpackId, session?.db ?? null),
    listRecordsByWorkpack("workpack_exception", workpackId, session?.db ?? null),
    listRecordsByWorkpack("benchmark_pack", workpackId, session?.db ?? null),
    listRecordsByWorkpack("promotion_record", workpackId, session?.db ?? null),
    listRecordsByWorkpack("improvement_proposal", workpackId, session?.db ?? null),
    listRecordsByWorkpack("telemetry_event", workpackId, session?.db ?? null),
    listRecordsByWorkpack("metric_snapshot", workpackId, session?.db ?? null),
    listRecordsByWorkpack("incident_record", workpackId, session?.db ?? null),
    listRecordsByWorkpack("schedule_record", workpackId, session?.db ?? null),
  ]);

  return {
    workpack,
    version: applyGovernanceToVersion(version),
    caseSources,
    playbook: clone(version.playbook),
    runs: runs.map((run) => applyGovernanceToRun(run)),
    simulations,
    exceptions,
    benchmarks,
    promotionRecords,
    improvementProposals,
    telemetryEvents,
    metricSnapshots,
    incidents,
    schedules,
  };
}

export function __debugSerializeInMemoryWorkpackState(): SerializedStoreState {
  pruneExpiredState();
  return serializeState();
}
