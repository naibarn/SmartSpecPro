import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

import type {
  CaseSource,
  MetricSnapshot,
  Playbook,
  SimulationRun,
  Workpack,
  WorkpackException,
  WorkpackRun,
  WorkpackSchedule,
  WorkpackVersion,
} from "../../shared/workpackContracts";
import { sanitizeSensitiveRecord } from "../../shared/workpackContracts";
import type {
  BenchmarkPack,
  ImprovementProposal,
  WorkpackPromotionRecord,
} from "../../shared/workpackPromotion";
import type {
  WorkpackIncidentRecord,
  WorkpackTelemetryEvent,
} from "../../shared/workpackTelemetry";

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

type SerializedStoreState = {
  [K in keyof StoreState]: Array<[string, unknown]>;
};

const WORKPACK_STORE_PATH = process.env.WORKPACK_STORE_PATH
  ?? path.join(process.cwd(), ".data", "workpack-store.json");

let loadedFromDisk = false;

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

export function createWorkpackId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
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

function hydrateState(serialized: Partial<SerializedStoreState> | null | undefined): void {
  for (const map of Object.values(state)) {
    map.clear();
  }
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

function ensureWorkpackStoreDir(): void {
  fs.mkdirSync(path.dirname(WORKPACK_STORE_PATH), { recursive: true });
}

function persistState(): void {
  ensureLoaded();
  ensureWorkpackStoreDir();
  pruneExpiredState();
  const payload = JSON.stringify(serializeState());
  const tempPath = `${WORKPACK_STORE_PATH}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, payload, "utf8");
  fs.renameSync(tempPath, WORKPACK_STORE_PATH);
}

function ensureLoaded(): void {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    if (!fs.existsSync(WORKPACK_STORE_PATH)) {
      return;
    }
    const raw = fs.readFileSync(WORKPACK_STORE_PATH, "utf8").trim();
    if (!raw) return;
    hydrateState(JSON.parse(raw) as SerializedStoreState);
    pruneExpiredState();
  } catch (error) {
    console.warn("[workpackPersistence] failed to load durable store, starting empty", error);
    hydrateState(null);
  }
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

export function resetWorkpackStore(): void {
  ensureLoaded();
  for (const map of Object.values(state)) {
    map.clear();
  }
  persistState();
}

export function saveCaseSources(caseSources: CaseSource[]): CaseSource[] {
  ensureLoaded();
  for (const caseSource of caseSources) {
    state.caseSources.set(caseSource.id, applyGovernanceToCaseSource(clone(caseSource)));
  }
  persistState();
  return clone(caseSources);
}

export function savePlaybook(playbook: Playbook): Playbook {
  ensureLoaded();
  state.playbooks.set(playbook.id, clone(playbook));
  persistState();
  return clone(playbook);
}

export function saveWorkpack(workpack: Workpack): Workpack {
  ensureLoaded();
  state.workpacks.set(workpack.id, clone(workpack));
  persistState();
  return clone(workpack);
}

export function saveWorkpackVersion(version: WorkpackVersion): WorkpackVersion {
  ensureLoaded();
  state.versions.set(version.id, applyGovernanceToVersion(clone(version)));
  persistState();
  return clone(version);
}

export function saveWorkpackRun(run: WorkpackRun): WorkpackRun {
  ensureLoaded();
  state.runs.set(run.id, applyGovernanceToRun(clone(run)));
  persistState();
  return clone(run);
}

export function saveSimulationRun(simulationRun: SimulationRun): SimulationRun {
  ensureLoaded();
  state.simulations.set(simulationRun.id, clone(simulationRun));
  persistState();
  return clone(simulationRun);
}

export function saveWorkpackException(exceptionRecord: WorkpackException): WorkpackException {
  ensureLoaded();
  state.exceptions.set(exceptionRecord.id, clone(exceptionRecord));
  persistState();
  return clone(exceptionRecord);
}

export function saveBenchmarkPack(benchmarkPack: BenchmarkPack): BenchmarkPack {
  ensureLoaded();
  state.benchmarks.set(benchmarkPack.id, clone(benchmarkPack));
  persistState();
  return clone(benchmarkPack);
}

export function savePromotionRecord(record: WorkpackPromotionRecord): WorkpackPromotionRecord {
  ensureLoaded();
  state.promotionRecords.set(record.id, clone(record));
  persistState();
  return clone(record);
}

export function saveImprovementProposal(proposal: ImprovementProposal): ImprovementProposal {
  ensureLoaded();
  state.improvementProposals.set(proposal.id, clone(proposal));
  persistState();
  return clone(proposal);
}

export function saveTelemetryEvent(event: WorkpackTelemetryEvent): WorkpackTelemetryEvent {
  ensureLoaded();
  state.telemetryEvents.set(event.id, clone(event));
  persistState();
  return clone(event);
}

export function saveMetricSnapshot(snapshot: MetricSnapshot): MetricSnapshot {
  ensureLoaded();
  state.metricSnapshots.set(snapshot.id, clone(snapshot));
  persistState();
  return clone(snapshot);
}

export function saveIncidentRecord(record: WorkpackIncidentRecord): WorkpackIncidentRecord {
  ensureLoaded();
  state.incidents.set(record.id, clone(record));
  persistState();
  return clone(record);
}

export function saveWorkpackSchedule(schedule: WorkpackSchedule): WorkpackSchedule {
  ensureLoaded();
  state.schedules.set(schedule.id, clone(schedule));
  persistState();
  return clone(schedule);
}

export function getWorkpackRun(runId: string): WorkpackRun | null {
  ensureLoaded();
  return clone(state.runs.get(runId) ?? null);
}

export function getSimulationRun(simulationRunId: string): SimulationRun | null {
  ensureLoaded();
  return clone(state.simulations.get(simulationRunId) ?? null);
}

export function getWorkpackException(exceptionId: string): WorkpackException | null {
  ensureLoaded();
  return clone(state.exceptions.get(exceptionId) ?? null);
}

export function getBenchmarkPack(benchmarkPackId: string): BenchmarkPack | null {
  return clone(state.benchmarks.get(benchmarkPackId) ?? null);
}

export function getPromotionRecord(promotionRecordId: string): WorkpackPromotionRecord | null {
  ensureLoaded();
  return clone(state.promotionRecords.get(promotionRecordId) ?? null);
}

export function getIncidentRecord(incidentId: string): WorkpackIncidentRecord | null {
  ensureLoaded();
  return clone(state.incidents.get(incidentId) ?? null);
}

export function getWorkpackSchedule(scheduleId: string): WorkpackSchedule | null {
  ensureLoaded();
  return clone(state.schedules.get(scheduleId) ?? null);
}

export function updateWorkpackRun(
  runId: string,
  updater: (run: WorkpackRun) => WorkpackRun,
): WorkpackRun | null {
  ensureLoaded();
  const current = state.runs.get(runId);
  if (!current) return null;
  const next = applyGovernanceToRun(updater(clone(current)));
  state.runs.set(runId, clone(next));
  persistState();
  return clone(next);
}

export function updateSimulationRun(
  simulationRunId: string,
  updater: (run: SimulationRun) => SimulationRun,
): SimulationRun | null {
  ensureLoaded();
  const current = state.simulations.get(simulationRunId);
  if (!current) return null;
  const next = updater(clone(current));
  state.simulations.set(simulationRunId, clone(next));
  persistState();
  return clone(next);
}

export function updateBenchmarkPack(
  benchmarkPackId: string,
  updater: (benchmarkPack: BenchmarkPack) => BenchmarkPack,
): BenchmarkPack | null {
  ensureLoaded();
  const current = state.benchmarks.get(benchmarkPackId);
  if (!current) return null;
  const next = updater(clone(current));
  state.benchmarks.set(benchmarkPackId, clone(next));
  persistState();
  return clone(next);
}

export function updatePromotionRecord(
  promotionRecordId: string,
  updater: (record: WorkpackPromotionRecord) => WorkpackPromotionRecord,
): WorkpackPromotionRecord | null {
  ensureLoaded();
  const current = state.promotionRecords.get(promotionRecordId);
  if (!current) return null;
  const next = updater(clone(current));
  state.promotionRecords.set(promotionRecordId, clone(next));
  persistState();
  return clone(next);
}

export function updateIncidentRecord(
  incidentId: string,
  updater: (record: WorkpackIncidentRecord) => WorkpackIncidentRecord,
): WorkpackIncidentRecord | null {
  ensureLoaded();
  const current = state.incidents.get(incidentId);
  if (!current) return null;
  const next = updater(clone(current));
  state.incidents.set(incidentId, clone(next));
  persistState();
  return clone(next);
}

export function updateWorkpackSchedule(
  scheduleId: string,
  updater: (schedule: WorkpackSchedule) => WorkpackSchedule,
): WorkpackSchedule | null {
  ensureLoaded();
  const current = state.schedules.get(scheduleId);
  if (!current) return null;
  const next = updater(clone(current));
  state.schedules.set(scheduleId, clone(next));
  persistState();
  return clone(next);
}

export function getWorkpack(workpackId: string): Workpack | null {
  ensureLoaded();
  return clone(state.workpacks.get(workpackId) ?? null);
}

export function getWorkpackVersion(versionId: string): WorkpackVersion | null {
  ensureLoaded();
  return clone(state.versions.get(versionId) ?? null);
}

export function getCurrentWorkpackVersion(workpackId: string): WorkpackVersion | null {
  const workpack = state.workpacks.get(workpackId);
  if (!workpack) return null;
  return getWorkpackVersion(workpack.currentVersionId);
}

export function updateWorkpack(
  workpackId: string,
  updater: (workpack: Workpack) => Workpack,
): Workpack | null {
  ensureLoaded();
  const current = state.workpacks.get(workpackId);
  if (!current) return null;
  const next = updater(clone(current));
  state.workpacks.set(workpackId, clone(next));
  persistState();
  return clone(next);
}

export function updateWorkpackVersion(
  versionId: string,
  updater: (version: WorkpackVersion) => WorkpackVersion,
): WorkpackVersion | null {
  ensureLoaded();
  const current = state.versions.get(versionId);
  if (!current) return null;
  const next = applyGovernanceToVersion(updater(clone(current)));
  state.versions.set(versionId, clone(next));
  persistState();
  return clone(next);
}

export function listWorkpacksByTenant(tenantId: string): Workpack[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.workpacks.values()).filter((workpack) => workpack.tenantId === tenantId).map(clone),
    (workpack) => workpack.updatedAt,
  );
}

export function listTelemetryEventsForWorkpack(workpackId: string): WorkpackTelemetryEvent[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.telemetryEvents.values()).filter((event) => event.workpackId === workpackId).map(clone),
    (event) => event.createdAt,
  );
}

export function listRunsByTenant(tenantId: string): WorkpackRun[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.runs.values()).filter((run) => run.tenantId === tenantId).map(clone),
    (run) => run.startedAt,
  );
}

export function listAllRuns(): WorkpackRun[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.runs.values()).map(clone),
    (run) => run.startedAt,
  );
}

export function listSimulationsByTenant(tenantId: string): SimulationRun[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.simulations.values()).filter((run) => run.tenantId === tenantId).map(clone),
    (run) => run.createdAt,
  );
}

export function listExceptionsByTenant(tenantId: string): WorkpackException[] {
  ensureLoaded();
  const workpackIds = new Set(
    Array.from(state.workpacks.values())
      .filter((workpack) => workpack.tenantId === tenantId)
      .map((workpack) => workpack.id),
  );
  return sortByTimestamp(
    Array.from(state.exceptions.values())
      .filter((exceptionRecord) => workpackIds.has(exceptionRecord.workpackId))
      .map(clone),
    (exceptionRecord) => exceptionRecord.createdAt,
  );
}

export function listBenchmarksByTenant(tenantId: string): BenchmarkPack[] {
  ensureLoaded();
  const workpackIds = new Set(
    Array.from(state.workpacks.values())
      .filter((workpack) => workpack.tenantId === tenantId)
      .map((workpack) => workpack.id),
  );
  return sortByTimestamp(
    Array.from(state.benchmarks.values())
      .filter((benchmarkPack) => workpackIds.has(benchmarkPack.sourceWorkpackId))
      .map(clone),
    (benchmarkPack) => benchmarkPack.publishedAt,
  );
}

export function listPromotionRecordsByTenant(tenantId: string): WorkpackPromotionRecord[] {
  ensureLoaded();
  const workpackIds = new Set(
    Array.from(state.workpacks.values())
      .filter((workpack) => workpack.tenantId === tenantId)
      .map((workpack) => workpack.id),
  );
  return sortByTimestamp(
    Array.from(state.promotionRecords.values())
      .filter((record) => workpackIds.has(record.workpackId))
      .map(clone),
    (record) => record.evidenceCapturedAt,
  );
}

export function listImprovementProposalsByTenant(tenantId: string): ImprovementProposal[] {
  ensureLoaded();
  const workpackIds = new Set(
    Array.from(state.workpacks.values())
      .filter((workpack) => workpack.tenantId === tenantId)
      .map((workpack) => workpack.id),
  );
  return sortByTimestamp(
    Array.from(state.improvementProposals.values())
      .filter((proposal) => workpackIds.has(proposal.workpackId))
      .map(clone),
    (proposal) => proposal.createdAt,
  );
}

export function listMetricSnapshotsByTenant(tenantId: string): MetricSnapshot[] {
  ensureLoaded();
  const workpackIds = new Set(
    Array.from(state.workpacks.values())
      .filter((workpack) => workpack.tenantId === tenantId)
      .map((workpack) => workpack.id),
  );
  return sortByTimestamp(
    Array.from(state.metricSnapshots.values())
      .filter((snapshot) => workpackIds.has(snapshot.workpackId))
      .map(clone),
    (snapshot) => snapshot.generatedAt,
  );
}

export function listTelemetryEventsByTenant(tenantId: string): WorkpackTelemetryEvent[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.telemetryEvents.values()).filter((event) => event.tenantId === tenantId).map(clone),
    (event) => event.createdAt,
  );
}

export function listIncidentsByTenant(tenantId: string): WorkpackIncidentRecord[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.incidents.values()).filter((incident) => incident.tenantId === tenantId).map(clone),
    (incident) => incident.createdAt,
  );
}

export function listWorkpackDetailsByTenant(tenantId: string): WorkpackDetailRecord[] {
  ensureLoaded();
  return listWorkpacksByTenant(tenantId)
    .map((workpack) => getWorkpackDetail(workpack.id))
    .filter((detail): detail is WorkpackDetailRecord => Boolean(detail));
}

export function listIncidentsForWorkpack(workpackId: string): WorkpackIncidentRecord[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.incidents.values()).filter((incident) => incident.workpackId === workpackId).map(clone),
    (incident) => incident.createdAt,
  );
}

export function listSchedulesByTenant(tenantId: string): WorkpackSchedule[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.schedules.values()).filter((schedule) => schedule.tenantId === tenantId).map(clone),
    (schedule) => schedule.updatedAt,
  );
}

export function listSchedulesForWorkpack(workpackId: string): WorkpackSchedule[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.schedules.values()).filter((schedule) => schedule.workpackId === workpackId).map(clone),
    (schedule) => schedule.updatedAt,
  );
}

export function listAllSchedules(): WorkpackSchedule[] {
  ensureLoaded();
  return sortByTimestamp(
    Array.from(state.schedules.values()).map(clone),
    (schedule) => schedule.updatedAt,
  );
}

export function getWorkpackDetail(workpackId: string): WorkpackDetailRecord | null {
  ensureLoaded();
  const workpack = getWorkpack(workpackId);
  if (!workpack) return null;
  const version = getCurrentWorkpackVersion(workpackId);
  if (!version) return null;

  const playbook = clone(version.playbook);
  const caseSources = workpack.caseSourceIds
    .map((sourceId) => state.caseSources.get(sourceId))
    .filter((value): value is CaseSource => Boolean(value))
    .map(clone)
    .map((source) => applyGovernanceToCaseSource(source));

  return {
    workpack,
    version: applyGovernanceToVersion(version),
    caseSources,
    playbook,
    runs: sortByTimestamp(
      Array.from(state.runs.values()).filter((run) => run.workpackId === workpackId).map(clone).map((run) => applyGovernanceToRun(run)),
      (run) => run.startedAt,
    ),
    simulations: sortByTimestamp(
      Array.from(state.simulations.values()).filter((run) => run.workpackId === workpackId).map(clone),
      (run) => run.createdAt,
    ),
    exceptions: sortByTimestamp(
      Array.from(state.exceptions.values()).filter((exceptionRecord) => exceptionRecord.workpackId === workpackId).map(clone),
      (exceptionRecord) => exceptionRecord.createdAt,
    ),
    benchmarks: sortByTimestamp(
      Array.from(state.benchmarks.values()).filter((benchmarkPack) => benchmarkPack.sourceWorkpackId === workpackId).map(clone),
      (benchmarkPack) => benchmarkPack.publishedAt,
    ),
    promotionRecords: sortByTimestamp(
      Array.from(state.promotionRecords.values()).filter((record) => record.workpackId === workpackId).map(clone),
      (record) => record.evidenceCapturedAt,
    ),
    improvementProposals: sortByTimestamp(
      Array.from(state.improvementProposals.values()).filter((proposal) => proposal.workpackId === workpackId).map(clone),
      (proposal) => proposal.createdAt,
    ),
    telemetryEvents: listTelemetryEventsForWorkpack(workpackId),
    metricSnapshots: sortByTimestamp(
      Array.from(state.metricSnapshots.values()).filter((snapshot) => snapshot.workpackId === workpackId).map(clone),
      (snapshot) => snapshot.generatedAt,
    ),
    incidents: listIncidentsForWorkpack(workpackId),
    schedules: listSchedulesForWorkpack(workpackId),
  };
}
