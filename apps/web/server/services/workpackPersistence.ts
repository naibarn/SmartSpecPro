import { nanoid } from "nanoid";

import type {
  CaseSource,
  MetricSnapshot,
  Playbook,
  SimulationRun,
  Workpack,
  WorkpackException,
  WorkpackRun,
  WorkpackVersion,
} from "../../shared/workpackContracts";
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
};

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

export function resetWorkpackStore(): void {
  for (const map of Object.values(state)) {
    map.clear();
  }
}

export function saveCaseSources(caseSources: CaseSource[]): CaseSource[] {
  for (const caseSource of caseSources) {
    state.caseSources.set(caseSource.id, clone(caseSource));
  }
  return clone(caseSources);
}

export function savePlaybook(playbook: Playbook): Playbook {
  state.playbooks.set(playbook.id, clone(playbook));
  return clone(playbook);
}

export function saveWorkpack(workpack: Workpack): Workpack {
  state.workpacks.set(workpack.id, clone(workpack));
  return clone(workpack);
}

export function saveWorkpackVersion(version: WorkpackVersion): WorkpackVersion {
  state.versions.set(version.id, clone(version));
  return clone(version);
}

export function saveWorkpackRun(run: WorkpackRun): WorkpackRun {
  state.runs.set(run.id, clone(run));
  return clone(run);
}

export function saveSimulationRun(simulationRun: SimulationRun): SimulationRun {
  state.simulations.set(simulationRun.id, clone(simulationRun));
  return clone(simulationRun);
}

export function saveWorkpackException(exceptionRecord: WorkpackException): WorkpackException {
  state.exceptions.set(exceptionRecord.id, clone(exceptionRecord));
  return clone(exceptionRecord);
}

export function saveBenchmarkPack(benchmarkPack: BenchmarkPack): BenchmarkPack {
  state.benchmarks.set(benchmarkPack.id, clone(benchmarkPack));
  return clone(benchmarkPack);
}

export function savePromotionRecord(record: WorkpackPromotionRecord): WorkpackPromotionRecord {
  state.promotionRecords.set(record.id, clone(record));
  return clone(record);
}

export function saveImprovementProposal(proposal: ImprovementProposal): ImprovementProposal {
  state.improvementProposals.set(proposal.id, clone(proposal));
  return clone(proposal);
}

export function saveTelemetryEvent(event: WorkpackTelemetryEvent): WorkpackTelemetryEvent {
  state.telemetryEvents.set(event.id, clone(event));
  return clone(event);
}

export function saveMetricSnapshot(snapshot: MetricSnapshot): MetricSnapshot {
  state.metricSnapshots.set(snapshot.id, clone(snapshot));
  return clone(snapshot);
}

export function saveIncidentRecord(record: WorkpackIncidentRecord): WorkpackIncidentRecord {
  state.incidents.set(record.id, clone(record));
  return clone(record);
}

export function getWorkpackRun(runId: string): WorkpackRun | null {
  return clone(state.runs.get(runId) ?? null);
}

export function getSimulationRun(simulationRunId: string): SimulationRun | null {
  return clone(state.simulations.get(simulationRunId) ?? null);
}

export function getWorkpackException(exceptionId: string): WorkpackException | null {
  return clone(state.exceptions.get(exceptionId) ?? null);
}

export function getBenchmarkPack(benchmarkPackId: string): BenchmarkPack | null {
  return clone(state.benchmarks.get(benchmarkPackId) ?? null);
}

export function getPromotionRecord(promotionRecordId: string): WorkpackPromotionRecord | null {
  return clone(state.promotionRecords.get(promotionRecordId) ?? null);
}

export function getIncidentRecord(incidentId: string): WorkpackIncidentRecord | null {
  return clone(state.incidents.get(incidentId) ?? null);
}

export function updateWorkpackRun(
  runId: string,
  updater: (run: WorkpackRun) => WorkpackRun,
): WorkpackRun | null {
  const current = state.runs.get(runId);
  if (!current) return null;
  const next = updater(clone(current));
  state.runs.set(runId, clone(next));
  return clone(next);
}

export function updateSimulationRun(
  simulationRunId: string,
  updater: (run: SimulationRun) => SimulationRun,
): SimulationRun | null {
  const current = state.simulations.get(simulationRunId);
  if (!current) return null;
  const next = updater(clone(current));
  state.simulations.set(simulationRunId, clone(next));
  return clone(next);
}

export function updateBenchmarkPack(
  benchmarkPackId: string,
  updater: (benchmarkPack: BenchmarkPack) => BenchmarkPack,
): BenchmarkPack | null {
  const current = state.benchmarks.get(benchmarkPackId);
  if (!current) return null;
  const next = updater(clone(current));
  state.benchmarks.set(benchmarkPackId, clone(next));
  return clone(next);
}

export function updatePromotionRecord(
  promotionRecordId: string,
  updater: (record: WorkpackPromotionRecord) => WorkpackPromotionRecord,
): WorkpackPromotionRecord | null {
  const current = state.promotionRecords.get(promotionRecordId);
  if (!current) return null;
  const next = updater(clone(current));
  state.promotionRecords.set(promotionRecordId, clone(next));
  return clone(next);
}

export function updateIncidentRecord(
  incidentId: string,
  updater: (record: WorkpackIncidentRecord) => WorkpackIncidentRecord,
): WorkpackIncidentRecord | null {
  const current = state.incidents.get(incidentId);
  if (!current) return null;
  const next = updater(clone(current));
  state.incidents.set(incidentId, clone(next));
  return clone(next);
}

export function getWorkpack(workpackId: string): Workpack | null {
  return clone(state.workpacks.get(workpackId) ?? null);
}

export function getWorkpackVersion(versionId: string): WorkpackVersion | null {
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
  const current = state.workpacks.get(workpackId);
  if (!current) return null;
  const next = updater(clone(current));
  state.workpacks.set(workpackId, clone(next));
  return clone(next);
}

export function updateWorkpackVersion(
  versionId: string,
  updater: (version: WorkpackVersion) => WorkpackVersion,
): WorkpackVersion | null {
  const current = state.versions.get(versionId);
  if (!current) return null;
  const next = updater(clone(current));
  state.versions.set(versionId, clone(next));
  return clone(next);
}

export function listWorkpacksByTenant(tenantId: string): Workpack[] {
  return sortByTimestamp(
    Array.from(state.workpacks.values()).filter((workpack) => workpack.tenantId === tenantId).map(clone),
    (workpack) => workpack.updatedAt,
  );
}

export function listTelemetryEventsForWorkpack(workpackId: string): WorkpackTelemetryEvent[] {
  return sortByTimestamp(
    Array.from(state.telemetryEvents.values()).filter((event) => event.workpackId === workpackId).map(clone),
    (event) => event.createdAt,
  );
}

export function listRunsByTenant(tenantId: string): WorkpackRun[] {
  return sortByTimestamp(
    Array.from(state.runs.values()).filter((run) => run.tenantId === tenantId).map(clone),
    (run) => run.startedAt,
  );
}

export function listSimulationsByTenant(tenantId: string): SimulationRun[] {
  return sortByTimestamp(
    Array.from(state.simulations.values()).filter((run) => run.tenantId === tenantId).map(clone),
    (run) => run.createdAt,
  );
}

export function listExceptionsByTenant(tenantId: string): WorkpackException[] {
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
  return sortByTimestamp(
    Array.from(state.telemetryEvents.values()).filter((event) => event.tenantId === tenantId).map(clone),
    (event) => event.createdAt,
  );
}

export function listIncidentsByTenant(tenantId: string): WorkpackIncidentRecord[] {
  return sortByTimestamp(
    Array.from(state.incidents.values()).filter((incident) => incident.tenantId === tenantId).map(clone),
    (incident) => incident.createdAt,
  );
}

export function listWorkpackDetailsByTenant(tenantId: string): WorkpackDetailRecord[] {
  return listWorkpacksByTenant(tenantId)
    .map((workpack) => getWorkpackDetail(workpack.id))
    .filter((detail): detail is WorkpackDetailRecord => Boolean(detail));
}

export function listIncidentsForWorkpack(workpackId: string): WorkpackIncidentRecord[] {
  return sortByTimestamp(
    Array.from(state.incidents.values()).filter((incident) => incident.workpackId === workpackId).map(clone),
    (incident) => incident.createdAt,
  );
}

export function getWorkpackDetail(workpackId: string): WorkpackDetailRecord | null {
  const workpack = getWorkpack(workpackId);
  if (!workpack) return null;
  const version = getCurrentWorkpackVersion(workpackId);
  if (!version) return null;

  const playbook = clone(version.playbook);
  const caseSources = workpack.caseSourceIds
    .map((sourceId) => state.caseSources.get(sourceId))
    .filter((value): value is CaseSource => Boolean(value))
    .map(clone);

  return {
    workpack,
    version,
    caseSources,
    playbook,
    runs: sortByTimestamp(
      Array.from(state.runs.values()).filter((run) => run.workpackId === workpackId).map(clone),
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
  };
}
