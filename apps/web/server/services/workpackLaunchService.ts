import path from "path";
import { desc, inArray } from "drizzle-orm";

import { workerArtifacts, workerJobEvents, workerJobs } from "../../drizzle/schema";
import {
  type AutonomyMode,
  type WorkpackApprovalCheckpoint,
  type WorkpackArtifactReference,
  type WorkpackRun,
  type WorkpackRunStatus,
  type WorkpackRunStep,
  type WorkpackRuntimePath,
  type WorkpackSchedule,
  type WorkpackStep,
  workpackRuntimePathValues,
  workpackScheduleSchema,
} from "../../shared/workpackContracts";
import {
  type WorkpackExecutorLaneDetail,
  workpackBrowserLaneDetailSchema,
  workpackClusterLaneDetailSchema,
  workpackDesktopLocalLaneDetailSchema,
  workpackGenericLaneDetailSchema,
  workpackWorkflowLaneDetailSchema,
} from "../../shared/workpackExecutorLaneDetails";
import {
  openClawBrowserJobPayloadSchema,
  openClawWorkflowJobPayloadSchema,
} from "../../shared/workerOpenClawPayloads";
import { getDb } from "../db";
import { sanitizeWorkerPayload } from "./workerPayloadSanitizer";
import { compileWorkpackExecutionPlan } from "./workpackCompilerService";
import { validateConnectorMaps } from "./workpackConnectorService";
import { normalizeWorkpackException } from "./workpackExceptionService";
import { buildArtifactReference, createReplayGradeLedger, finalizeLedgerRun } from "./workpackLedgerService";
import {
  createWorkpackId,
  getWorkpackDetail,
  getWorkpackSchedule,
  listAllRuns,
  listSchedulesByTenant,
  listRunsByTenant,
  type WorkpackDetailRecord,
  saveTelemetryEvent,
  saveWorkpackSchedule,
  updateWorkpack,
  updateWorkpackRun,
  updateWorkpackSchedule,
} from "./workpackPersistence";
import { evaluateWorkpackRolloutGate } from "./workpackRolloutGateService";
import { captureWorkpackMetricSnapshot } from "./workpackTelemetryService";
import { type QueueWorkerJobByRuntimeInput, queueWorkerJobByRuntime } from "./workerSchedulerService";

const WORKER_QUEUED_STATUSES = new Set(["queued", "claimed", "preparing"]);
const WORKER_RUNNING_STATUSES = new Set(["running", "uploading", "publishing", "indexing"]);
const WORKER_FAILED_STATUSES = new Set(["failed", "canceled", "expired"]);
const WORKER_TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "expired"]);

function nowIso(): string {
  return new Date().toISOString();
}

function computeNextRunAt(schedule: WorkpackSchedule, from = new Date()): string | null {
  if (schedule.status !== "active") return null;
  if (schedule.triggerType === "event") return null;
  if (schedule.triggerType === "interval" && schedule.intervalMinutes) {
    return new Date(from.getTime() + schedule.intervalMinutes * 60 * 1000).toISOString();
  }
  if (schedule.triggerType === "cron") {
    return new Date(from.getTime() + 60 * 60 * 1000).toISOString();
  }
  return null;
}

function buildSucceededStep(
  step: WorkpackRun["plannedSteps"][number],
  runtimePath = step.preferredRuntimePath,
  summary = `${step.expectedOutcome}. Runtime path ${runtimePath} completed under bounded automation.`,
): WorkpackRunStep {
  return {
    stepId: step.id,
    title: step.title,
    runtimePath,
    status: "succeeded",
    sideEffectClass: step.sideEffectClass,
    effectKey: step.idempotency.effectKey ?? null,
    outputSummary: summary,
    executionRef: null,
  };
}

function buildBlockedStep(step: WorkpackRun["plannedSteps"][number], reason: string): WorkpackRunStep {
  return {
    stepId: step.id,
    title: step.title,
    runtimePath: step.preferredRuntimePath,
    status: "blocked",
    sideEffectClass: step.sideEffectClass,
    effectKey: step.idempotency.effectKey ?? null,
    outputSummary: reason,
    executionRef: null,
  };
}

function buildSkippedStep(step: WorkpackRun["plannedSteps"][number], reason: string): WorkpackRunStep {
  return {
    stepId: step.id,
    title: step.title,
    runtimePath: step.preferredRuntimePath,
    status: "skipped",
    sideEffectClass: step.sideEffectClass,
    effectKey: step.idempotency.effectKey ?? null,
    outputSummary: reason,
    executionRef: null,
  };
}

function mapWorkerJobStatusToStepStatus(status: string | null | undefined): WorkpackRunStep["status"] {
  if (status && WORKER_RUNNING_STATUSES.has(status)) return "running";
  if (status && WORKER_FAILED_STATUSES.has(status)) return "failed";
  if (status === "completed") return "succeeded";
  return "queued";
}

function deriveRunStatus(
  actualSteps: WorkpackRunStep[],
  approvalCheckpoints: WorkpackApprovalCheckpoint[],
): WorkpackRunStatus {
  if (approvalCheckpoints.some((checkpoint) => !checkpoint.approved)) {
    return "awaiting_approval";
  }

  if (actualSteps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (actualSteps.some((step) => step.status === "blocked")) {
    return "blocked";
  }

  const hasRunning = actualSteps.some((step) => step.status === "running");
  const hasQueued = actualSteps.some((step) => step.status === "queued");
  const hasCompletedWork = actualSteps.some((step) => step.status === "succeeded" || step.status === "skipped");

  if (hasRunning || (hasQueued && hasCompletedWork)) {
    return "running";
  }

  if (hasQueued) {
    return "queued";
  }

  return "succeeded";
}

function isTerminalRunStatus(status: WorkpackRunStatus): boolean {
  return status !== "queued" && status !== "running";
}

async function markScheduleError(scheduleId: string | null | undefined, code: string): Promise<void> {
  if (!scheduleId) return;
  await updateWorkpackSchedule(scheduleId, (schedule) => ({
    ...schedule,
    status: "error",
    lastError: code,
    updatedAt: nowIso(),
  }));
}

function summarizeWorkerStatus(status: string | null | undefined): string {
  if (!status) return "queued";
  return status.replace(/_/g, " ");
}

function collectDesktopRoots(detail: WorkpackDetailRecord): {
  roots: Array<{ rootId: string; name: string; path: string; requestedWritebackMode: "managed_output_only"; advancedLocalMode: boolean }>;
  allowedSourceRoots: string[];
} | null {
  const rootsByPath = new Map<string, { rootId: string; name: string; path: string; requestedWritebackMode: "managed_output_only"; advancedLocalMode: boolean }>();
  const allowedSourceRoots = new Set<string>();

  for (const source of detail.caseSources) {
    const localFileRef = source.localFileRef;
    if (!localFileRef) continue;
    const normalizedRoot = localFileRef.rootPath?.trim()
      || path.dirname(localFileRef.path);
    if (!normalizedRoot) continue;
    allowedSourceRoots.add(normalizedRoot);
    if (!rootsByPath.has(normalizedRoot)) {
      rootsByPath.set(normalizedRoot, {
        rootId: localFileRef.deviceId?.trim() || source.id,
        name: localFileRef.rootLabel?.trim() || source.title,
        path: normalizedRoot,
        requestedWritebackMode: "managed_output_only",
        advancedLocalMode: false,
      });
    }
  }

  if (rootsByPath.size === 0 || allowedSourceRoots.size === 0) {
    return null;
  }

  return {
    roots: Array.from(rootsByPath.values()),
    allowedSourceRoots: Array.from(allowedSourceRoots.values()),
  };
}

function buildQueueInputForRuntime(input: {
  detail: WorkpackDetailRecord;
  runId: string;
  step: WorkpackStep;
  runtimePath: WorkpackRuntimePath;
  autonomyMode: AutonomyMode;
  requestedBy?: number | null;
}): QueueWorkerJobByRuntimeInput | null {
  const sharedInputJson = {
    workpackId: input.detail.workpack.id,
    versionId: input.detail.version.id,
    runId: input.runId,
    stepId: input.step.id,
    stepTitle: input.step.title,
    stepObjective: input.step.objective,
    expectedOutcome: input.step.expectedOutcome,
    sideEffectClass: input.step.sideEffectClass,
    connectorFamilies: input.step.requiredConnectorFamilies,
    localityHint: input.step.localityHint,
    domainPack: input.detail.workpack.domainPack,
    workpackGoal: input.detail.workpack.goal,
  } as const;

  const sharedInstructionsJson = {
    intent: "workpack_step_execution",
    workpackRuntimePath: input.runtimePath,
    autonomyMode: input.autonomyMode,
    fallbackPaths: input.step.allowedFallbackPaths,
    requiredConnectorFamilies: input.step.requiredConnectorFamilies,
    sourceCount: input.detail.caseSources.length,
  } as const;

  const baseInput = {
    tenantId: input.detail.workpack.tenantId,
    teamId: typeof input.detail.workpack.policyProfile.teamId === "string"
      ? input.detail.workpack.policyProfile.teamId
      : null,
    workflowRunId: input.runId,
    requestedByUserId: input.requestedBy ?? null,
    requestedBySystemComponent: "workpack_launch_service",
    title: `${input.detail.workpack.title}: ${input.step.title}`,
    description: input.step.objective,
    priority: input.step.sideEffectClass === "read_only" ? 20 : 45,
    timeoutSeconds: input.step.sideEffectClass === "read_only" ? 900 : 3_600,
    idempotencyKey: `workpack:${input.detail.workpack.id}:run:${input.runId}:step:${input.step.id}:path:${input.runtimePath}`,
    reservedCredits: input.step.sideEffectClass === "financial" ? 25 : 10,
  } as const;

  switch (input.runtimePath) {
    case "browser":
      return {
        runtimeType: "openclaw_gateway",
        jobType: "browser_automation_task",
        capabilityFamilies: ["browser-automation"],
        resourceProfile: "network_heavy",
        inputJson: sharedInputJson,
        instructionsJson: {
          ...sharedInstructionsJson,
          intent: "workpack_browser_step",
        },
        ...baseInput,
      };
    case "workflow":
      return {
        runtimeType: "openclaw_gateway",
        jobType: "plugin_workflow_task",
        capabilityFamilies: ["plugin-automation"],
        resourceProfile: "cpu_light",
        inputJson: sharedInputJson,
        instructionsJson: {
          ...sharedInstructionsJson,
          intent: "workpack_workflow_step",
        },
        ...baseInput,
      };
    case "skill":
      return {
        runtimeType: "openclaw_gateway",
        jobType: "plugin_workflow_task",
        capabilityFamilies: ["artifact-producing-session"],
        resourceProfile: "cpu_light",
        inputJson: sharedInputJson,
        instructionsJson: {
          ...sharedInstructionsJson,
          intent: "workpack_skill_step",
        },
        ...baseInput,
      };
    case "hybrid":
      return {
        runtimeType: "hiclaw_cluster",
        jobType: "workpack_hybrid_step",
        capabilityFamilies: ["manager-worker-orchestration"],
        resourceProfile: "human_observable",
        inputJson: sharedInputJson,
        instructionsJson: {
          ...sharedInstructionsJson,
          intent: "workpack_hybrid_step",
        },
        ...baseInput,
      };
    case "agency":
      return {
        runtimeType: "hiclaw_cluster",
        jobType: "workpack_agency_step",
        capabilityFamilies: ["multi-agent-cluster", "manager-worker-orchestration"],
        resourceProfile: "human_observable",
        inputJson: sharedInputJson,
        instructionsJson: {
          ...sharedInstructionsJson,
          intent: "workpack_agency_step",
        },
        ...baseInput,
      };
    case "worker_fabric":
      return {
        runtimeType: "hiclaw_cluster",
        jobType: "workpack_worker_fabric_step",
        capabilityFamilies: ["multi-agent-cluster"],
        resourceProfile: "human_observable",
        inputJson: sharedInputJson,
        instructionsJson: {
          ...sharedInstructionsJson,
          intent: "workpack_worker_fabric_step",
        },
        ...baseInput,
      };
    case "desktop_local": {
      const localRoots = collectDesktopRoots(input.detail);
      if (!localRoots) {
        return null;
      }
      return {
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "local_folder_ingest",
        roots: localRoots.roots,
        workspacePolicy: {
          mode: "workspace_scoped",
          allowedSourceRoots: localRoots.allowedSourceRoots,
        },
        ingestPolicy: {
          maxDepth: 6,
          maxFiles: 250,
          includePreviewText: true,
          previewFileLimit: 25,
          snippetQuery: input.step.objective.slice(0, 200),
          snippetFileLimit: 10,
        },
        outputTargets: {
          publishManifestToLibrary: true,
          publishSummaryToLibrary: true,
          triggerIndexing: true,
        },
        ...baseInput,
      };
    }
    default:
      return null;
  }
}

function buildQueuedDispatchStep(input: {
  step: WorkpackStep;
  runtimePath: WorkpackRuntimePath;
  dispatch: Awaited<ReturnType<typeof queueWorkerJobByRuntime>>;
  attemptedPaths: WorkpackRuntimePath[];
}): WorkpackRunStep {
  const job = input.dispatch.job;
  const stepStatus = mapWorkerJobStatusToStepStatus(typeof job.status === "string" ? job.status : null);
  const fallbackSummary = input.attemptedPaths.length > 1
    ? ` after trying ${input.attemptedPaths.join(" -> ")}`
    : "";
  return {
    stepId: input.step.id,
    title: input.step.title,
    runtimePath: input.runtimePath,
    status: stepStatus,
    sideEffectClass: input.step.sideEffectClass,
    effectKey: input.step.idempotency.effectKey ?? null,
    outputSummary: input.dispatch.created
      ? `Queued on ${input.runtimePath} via worker job ${job.id}${fallbackSummary}.`
      : `Reused worker job ${job.id} on ${input.runtimePath} with status ${summarizeWorkerStatus(job.status as string | null | undefined)}${fallbackSummary}.`,
    executionRef: {
      provider: "worker_job",
      executionId: String(job.id),
      runtimeType: typeof job.runtimeType === "string" ? job.runtimeType : null,
      jobType: typeof job.jobType === "string" ? job.jobType : null,
      status: typeof job.status === "string" ? job.status : null,
      queuedAt: nowIso(),
    },
  };
}

async function attemptDispatchStep(input: {
  detail: WorkpackDetailRecord;
  runId: string;
  step: WorkpackStep;
  autonomyMode: AutonomyMode;
  requestedBy?: number | null;
  queueWorkerJobByRuntime: typeof queueWorkerJobByRuntime;
}): Promise<
  | { ok: true; step: WorkpackRunStep; artifacts: WorkpackArtifactReference[] }
  | { ok: false; reason: string }
> {
  const attemptedPaths: WorkpackRuntimePath[] = [];
  const candidatePaths = Array.from(new Set([
    input.step.preferredRuntimePath,
    ...input.step.allowedFallbackPaths,
  ]));

  for (const runtimePath of candidatePaths) {
    attemptedPaths.push(runtimePath);
    const queueInput = buildQueueInputForRuntime({
      detail: input.detail,
      runId: input.runId,
      step: input.step,
      runtimePath,
      autonomyMode: input.autonomyMode,
      requestedBy: input.requestedBy,
    });
    if (!queueInput) {
      continue;
    }

    try {
      const dispatch = await input.queueWorkerJobByRuntime(queueInput);
      const stepResult = buildQueuedDispatchStep({
        step: input.step,
        runtimePath,
        dispatch,
        attemptedPaths,
      });
      return {
        ok: true,
        step: stepResult,
        artifacts: [
          buildArtifactReference({
            label: `${input.step.title} execution dispatch`,
            summary: {
              stepId: input.step.id,
              runtimePath,
              workerJobId: dispatch.job.id,
              created: dispatch.created,
              workerJobStatus: dispatch.job.status,
              jobType: dispatch.job.jobType,
            },
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attemptedPaths.length === candidatePaths.length) {
        return {
          ok: false,
          reason: `${attemptedPaths.join(" -> ")} failed: ${message}`,
        };
      }
    }
  }

  return {
    ok: false,
    reason: `${candidatePaths.join(" -> ")} could not build a supported executor request`,
  };
}

async function updateWorkpackAfterLaunch(input: {
  detail: WorkpackDetailRecord;
  autonomyMode: AutonomyMode;
  runStatus: WorkpackRunStatus;
}): Promise<void> {
  const blockedLike = input.runStatus === "blocked" || input.runStatus === "failed" || input.runStatus === "awaiting_approval";
  await updateWorkpack(input.detail.workpack.id, (workpack) => ({
    ...workpack,
    lifecycleState: blockedLike
      ? "needs_review"
      : input.autonomyMode === "autonomous"
        ? "autonomous"
        : "supervised",
    autonomyMode: blockedLike && input.runStatus !== "awaiting_approval" ? "draft" : input.autonomyMode,
    policyProfile: {
      ...workpack.policyProfile,
      safeResumeRequired: blockedLike,
      safeResumeReason: input.runStatus === "awaiting_approval"
        ? "approval_boundary_pending"
        : input.runStatus === "failed"
          ? "executor_job_failed"
          : blockedLike
            ? "executor_dispatch_blocked"
            : null,
    },
    updatedAt: nowIso(),
  }));
}

async function updateScheduleAfterRun(input: {
  scheduleId?: string | null;
  run: WorkpackRun;
  runStatus: WorkpackRunStatus;
}): Promise<void> {
  if (!input.scheduleId) return;
  await updateWorkpackSchedule(input.scheduleId, (schedule) => ({
    ...schedule,
    lastRunAt: input.run.startedAt,
    nextRunAt: input.runStatus === "succeeded"
      ? computeNextRunAt(schedule, new Date(input.run.endedAt ?? input.run.startedAt))
      : input.runStatus === "queued" || input.runStatus === "running"
        ? schedule.nextRunAt
        : computeNextRunAt(schedule, new Date(input.run.startedAt)),
    status: input.runStatus === "failed" ? "error" : "active",
    lastError: input.runStatus === "failed"
      ? "executor_job_failed"
      : input.runStatus === "awaiting_approval"
        ? "approval_boundary_pending"
        : input.runStatus === "blocked"
          ? "executor_dispatch_blocked"
          : null,
    updatedAt: nowIso(),
  }));
}

async function persistLaunchRun(input: {
  ledgerRunId: string;
  runStatus: WorkpackRunStatus;
  actualSteps: WorkpackRunStep[];
  approvalCheckpoints: WorkpackApprovalCheckpoint[];
  artifacts: WorkpackArtifactReference[];
  connectorSummaries: WorkpackRun["connectorSummaries"];
  notes: string;
}): Promise<WorkpackRun> {
  if (isTerminalRunStatus(input.runStatus)) {
    return finalizeLedgerRun({
      runId: input.ledgerRunId,
      status: input.runStatus,
      actualSteps: input.actualSteps,
      approvalCheckpoints: input.approvalCheckpoints,
      artifactReferences: input.artifacts,
      connectorSummaries: input.connectorSummaries,
      notes: input.notes,
    });
  }

  const run = await updateWorkpackRun(input.ledgerRunId, (current) => ({
    ...current,
    status: input.runStatus,
    actualSteps: input.actualSteps,
    approvalCheckpoints: input.approvalCheckpoints,
    artifactReferences: input.artifacts,
    connectorSummaries: input.connectorSummaries,
    notes: input.notes,
  }));
  if (!run) {
    throw new Error(`Unknown workpack run: ${input.ledgerRunId}`);
  }
  return run;
}

export interface LaunchWorkpackResult {
  run: WorkpackRun;
  exceptionIds: string[];
  readinessReason: string;
}

export interface WorkpackExecutorJobSnapshot {
  id: string;
  status: string;
  runtimeType: string | null;
  jobType: string | null;
  failureReason: string | null;
  outputJson: Record<string, unknown> | null;
}

export interface WorkpackExecutorArtifactSnapshot {
  artifactId: string;
  artifactType: string | null;
  storageRef: string | null;
  publishedItemId: number | null;
  createdAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface WorkpackExecutorEventSnapshot {
  eventId: string;
  eventType: string | null;
  createdAt: string | null;
  payload: Record<string, unknown> | null;
}

export interface WorkpackExecutorMonitorSnapshot {
  executionId: string;
  provider: "worker_job";
  runtimeType: string | null;
  jobType: string | null;
  runtimePathHint: WorkpackRuntimePath | null;
  laneLabel: string;
  status: string | null;
  statusReason: string | null;
  failureReason: string | null;
  workerId: string | null;
  resourceProfile: string | null;
  terminal: boolean;
  artifactCount: number;
  publishedArtifactCount: number;
  latestEventType: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  laneDetails: WorkpackExecutorLaneDetail | null;
  recentEvents: WorkpackExecutorEventSnapshot[];
  artifacts: WorkpackExecutorArtifactSnapshot[];
}

interface WorkpackLaunchDeps {
  queueWorkerJobByRuntime?: typeof queueWorkerJobByRuntime;
  loadWorkerJobsById?: (jobIds: string[]) => Promise<Record<string, WorkpackExecutorJobSnapshot>>;
  loadExecutorSnapshotsById?: (jobIds: string[]) => Promise<Record<string, WorkpackExecutorMonitorSnapshot>>;
}

async function defaultLoadWorkerJobsById(jobIds: string[]): Promise<Record<string, WorkpackExecutorJobSnapshot>> {
  if (jobIds.length === 0) {
    return {};
  }
  const db = await getDb();
  const rows = await db
    .select({
      id: workerJobs.id,
      status: workerJobs.status,
      runtimeType: workerJobs.runtimeType,
      jobType: workerJobs.jobType,
      failureReason: workerJobs.failureReason,
      outputJson: workerJobs.outputJson,
    })
    .from(workerJobs)
    .where(inArray(workerJobs.id, jobIds));

  return Object.fromEntries(rows.map((row) => [row.id, {
    id: row.id,
    status: row.status,
    runtimeType: row.runtimeType ?? null,
    jobType: row.jobType ?? null,
    failureReason: row.failureReason ?? null,
    outputJson: (row.outputJson ?? null) as Record<string, unknown> | null,
  }]));
}

function serializeDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function normalizeRuntimePathHint(value: unknown): WorkpackRuntimePath | null {
  if (typeof value !== "string") return null;
  return workpackRuntimePathValues.includes(value as WorkpackRuntimePath)
    ? value as WorkpackRuntimePath
    : null;
}

function deriveExecutorLaneLabel(
  runtimePathHint: WorkpackRuntimePath | null,
  runtimeType: string | null,
  jobType: string | null,
): string {
  switch (runtimePathHint) {
    case "browser":
      return "Browser automation lane";
    case "workflow":
      return "Workflow automation lane";
    case "skill":
      return "Skill execution lane";
    case "desktop_local":
      return "Desktop-local lane";
    case "worker_fabric":
      return "Worker fabric lane";
    case "hybrid":
      return "Hybrid orchestration lane";
    case "agency":
      return "Agency swarm lane";
    default:
      break;
  }

  if (jobType === "browser_automation_task") return "Browser automation lane";
  if (jobType === "plugin_workflow_task") return "Workflow automation lane";
  if (jobType === "local_folder_ingest") return "Desktop-local lane";
  if (jobType === "workpack_worker_fabric_step") return "Worker fabric lane";
  if (jobType === "workpack_agency_step") return "Agency swarm lane";
  if (jobType === "workpack_hybrid_step") return "Hybrid orchestration lane";
  if (runtimeType === "desktop_zeroclaw_managed") return "Desktop managed lane";
  if (runtimeType === "hiclaw_cluster") return "Cluster orchestration lane";
  if (runtimeType === "openclaw_gateway") return "Gateway automation lane";
  return "Executor lane";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringFromRecord(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

function readNumberFromRecord(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function readBooleanFromRecord(value: unknown, key: string): boolean | null {
  if (!isRecord(value)) return null;
  return typeof value[key] === "boolean" ? value[key] as boolean : null;
}

function readStringArrayFromRecord(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) return [];
  return (value[key] as unknown[])
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function readFirstStringFromEvents(
  events: WorkpackExecutorEventSnapshot[],
  keys: string[],
): string | null {
  for (const event of events) {
    for (const key of keys) {
      const value = readStringFromRecord(event.payload, key);
      if (value) return value;
    }
  }
  return null;
}

function readFirstNumberFromEvents(
  events: WorkpackExecutorEventSnapshot[],
  keys: string[],
): number | null {
  for (const event of events) {
    for (const key of keys) {
      const value = readNumberFromRecord(event.payload, key);
      if (value !== null) return value;
    }
  }
  return null;
}

function readStageFromEvents(events: WorkpackExecutorEventSnapshot[]): string | null {
  return readFirstStringFromEvents(events, ["stage"]);
}

function readFirstStringFromPayloads(
  payloads: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null {
  for (const payload of payloads) {
    for (const key of keys) {
      const value = readStringFromRecord(payload, key);
      if (value) return value;
    }
  }
  return null;
}

function parseBrowserPayload(value: unknown): Record<string, unknown> | null {
  const result = openClawBrowserJobPayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}

function parseWorkflowPayload(value: unknown): Record<string, unknown> | null {
  const result = openClawWorkflowJobPayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}

function readFirstBrowserSessionId(payloads: Array<Record<string, unknown> | null>): string | null {
  for (const payload of payloads) {
    const directSessionId = readStringFromRecord(payload, "sessionId");
    if (directSessionId) return directSessionId;
    const nestedSessionId = readStringFromRecord(isRecord(payload) ? payload.browserSession : null, "sessionId");
    if (nestedSessionId) return nestedSessionId;
  }
  return null;
}

function readFirstBrowserState(payloads: Array<Record<string, unknown> | null>): string | null {
  for (const payload of payloads) {
    const directState = readStringFromRecord(payload, "browserState");
    if (directState) return directState;
    const nestedState = readStringFromRecord(isRecord(payload) ? payload.browserSession : null, "state");
    if (nestedState) return nestedState;
  }
  return null;
}

function readPublishedArtifactLabelsFromTypedPayload(payload: Record<string, unknown> | null): string[] {
  const publishedArtifacts = Array.isArray(payload?.publishedArtifacts) ? payload.publishedArtifacts : [];
  return publishedArtifacts
    .map((artifact) => readStringFromRecord(artifact, "label") ?? readStringFromRecord(artifact, "artifactId"))
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);
}

function readArtifactMetadataValue(
  artifacts: WorkpackExecutorArtifactSnapshot[],
  key: string,
): string | number | null {
  for (const artifact of artifacts) {
    if (!artifact.metadata || typeof artifact.metadata !== "object") continue;
    const value = artifact.metadata[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function readRootLabels(inputJson: Record<string, unknown> | null): string[] {
  const roots = Array.isArray(inputJson?.roots) ? inputJson.roots : [];
  return roots
    .map((root) => readStringFromRecord(root, "name") ?? readStringFromRecord(root, "rootId"))
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);
}

function readPublishedArtifactLabels(outputJson: Record<string, unknown> | null): string[] {
  const publishedArtifacts = Array.isArray(outputJson?.publishedArtifacts) ? outputJson.publishedArtifacts : [];
  return publishedArtifacts
    .map((artifact) => readStringFromRecord(artifact, "label") ?? readStringFromRecord(artifact, "artifactId"))
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);
}

function compactLaneDetails(details: Record<string, unknown>): Record<string, unknown> | null {
  const filtered = Object.fromEntries(
    Object.entries(details).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (typeof value === "number" || typeof value === "boolean") return true;
      if (Array.isArray(value)) return value.length > 0;
      if (isRecord(value)) return Object.keys(value).length > 0;
      return false;
    }),
  );
  return Object.keys(filtered).length > 0 ? filtered : null;
}

function validateLaneDetails(
  detail: Record<string, unknown> | null,
  lane:
    | "browser"
    | "workflow"
    | "desktop_local"
    | "worker_fabric"
    | "hybrid"
    | "agency"
    | "generic",
): WorkpackExecutorLaneDetail | null {
  if (!detail) return null;

  const payload = { lane, ...detail };
  const result = (
    lane === "browser"
      ? workpackBrowserLaneDetailSchema
      : lane === "workflow"
        ? workpackWorkflowLaneDetailSchema
        : lane === "desktop_local"
          ? workpackDesktopLocalLaneDetailSchema
          : lane === "worker_fabric" || lane === "hybrid" || lane === "agency"
            ? workpackClusterLaneDetailSchema
            : workpackGenericLaneDetailSchema
  ).safeParse(payload);

  return result.success ? result.data : null;
}

function deriveLaneDetails(input: {
  runtimePathHint: WorkpackRuntimePath | null;
  runtimeType: string | null;
  jobType: string | null;
  teamId: string | null;
  workflowRunId: string | null;
  capabilityRequirementsJson: Record<string, unknown> | null;
  inputJson: Record<string, unknown> | null;
  instructionsJson: Record<string, unknown> | null;
  outputJson: Record<string, unknown> | null;
  recentEvents: WorkpackExecutorEventSnapshot[];
  artifacts: WorkpackExecutorArtifactSnapshot[];
}): WorkpackExecutorLaneDetail | null {
  const connectorFamilies = readStringArrayFromRecord(input.inputJson, "connectorFamilies");
  const fallbackPaths = readStringArrayFromRecord(input.instructionsJson, "fallbackPaths");
  const sourceCount = readNumberFromRecord(input.instructionsJson, "sourceCount");
  const stage = readStageFromEvents(input.recentEvents);
  const publishedArtifactLabels = readPublishedArtifactLabels(input.outputJson);
  const capabilityFamilies = readStringArrayFromRecord(input.capabilityRequirementsJson, "capabilityFamilies");
  const browserOutput = parseBrowserPayload(input.outputJson);
  const workflowOutput = parseWorkflowPayload(input.outputJson);
  const browserEventPayloads = input.recentEvents.map((event) => parseBrowserPayload(event.payload));
  const workflowEventPayloads = input.recentEvents.map((event) => parseWorkflowPayload(event.payload));
  const browserPublishedArtifactLabels = readPublishedArtifactLabelsFromTypedPayload(browserOutput);
  const workflowPublishedArtifactLabels = readPublishedArtifactLabelsFromTypedPayload(workflowOutput);

  if (input.runtimePathHint === "browser" || input.jobType === "browser_automation_task") {
    return validateLaneDetails(compactLaneDetails({
      stage:
        readStringFromRecord(browserOutput, "stage")
        ?? readFirstStringFromPayloads(browserEventPayloads, ["stage"])
        ?? stage,
      sessionId:
        readFirstBrowserSessionId([browserOutput, ...browserEventPayloads]),
      browserState:
        readFirstBrowserState([browserOutput, ...browserEventPayloads]),
      sourceCount:
        readNumberFromRecord(browserOutput, "sourceCount")
        ?? sourceCount,
      connectorFamilies:
        readStringArrayFromRecord(browserOutput, "connectorFamilies").length > 0
          ? readStringArrayFromRecord(browserOutput, "connectorFamilies")
          : connectorFamilies,
      fallbackPaths:
        readStringArrayFromRecord(browserOutput, "fallbackPaths").length > 0
          ? readStringArrayFromRecord(browserOutput, "fallbackPaths")
          : fallbackPaths,
      currentUrl:
        readFirstStringFromPayloads([browserOutput, ...browserEventPayloads], ["currentUrl", "url", "pageUrl", "targetUrl"])
        ?? readStringFromRecord(browserOutput?.browserSession, "url")
        ?? readFirstStringFromEvents(input.recentEvents, ["currentUrl", "url", "pageUrl", "targetUrl"]),
      pageTitle:
        readFirstStringFromPayloads([browserOutput, ...browserEventPayloads], ["pageTitle", "title"])
        ?? readStringFromRecord(browserOutput?.browserSession, "pageTitle")
        ?? readFirstStringFromEvents(input.recentEvents, ["pageTitle", "title"]),
      publishedArtifacts:
        browserPublishedArtifactLabels.length > 0
          ? browserPublishedArtifactLabels
          : publishedArtifactLabels,
    }), "browser");
  }

  if (
    input.runtimePathHint === "workflow"
    || input.runtimePathHint === "skill"
    || input.jobType === "plugin_workflow_task"
  ) {
    return validateLaneDetails(compactLaneDetails({
      stage:
        readStringFromRecord(workflowOutput, "stage")
        ?? readFirstStringFromPayloads(workflowEventPayloads, ["stage"])
        ?? stage,
      workflowRunId:
        readStringFromRecord(workflowOutput, "workflowRunId")
        ?? readFirstStringFromPayloads(workflowEventPayloads, ["workflowRunId"])
        ?? input.workflowRunId,
      connectorFamilies:
        readStringArrayFromRecord(workflowOutput, "connectorFamilies").length > 0
          ? readStringArrayFromRecord(workflowOutput, "connectorFamilies")
          : connectorFamilies,
      sourceCount:
        readNumberFromRecord(workflowOutput, "sourceCount")
        ?? sourceCount,
      fallbackPaths:
        readStringArrayFromRecord(workflowOutput, "fallbackPaths").length > 0
          ? readStringArrayFromRecord(workflowOutput, "fallbackPaths")
          : fallbackPaths,
      publishedArtifacts:
        workflowPublishedArtifactLabels.length > 0
          ? workflowPublishedArtifactLabels
          : publishedArtifactLabels,
      intent:
        readStringFromRecord(workflowOutput, "intent")
        ?? readFirstStringFromPayloads(workflowEventPayloads, ["intent"])
        ?? readStringFromRecord(input.instructionsJson, "intent"),
      resultSummary:
        readStringFromRecord(workflowOutput, "resultSummary")
        ?? readStringFromRecord(workflowOutput, "summary")
        ?? readFirstStringFromPayloads(workflowEventPayloads, ["resultSummary", "summary"]),
    }), "workflow");
  }

  if (input.runtimePathHint === "desktop_local" || input.jobType === "local_folder_ingest") {
    return validateLaneDetails(compactLaneDetails({
      stage,
      rootCount:
        readFirstNumberFromEvents(input.recentEvents, ["rootCount"])
        ?? readNumberFromRecord(input.outputJson, "rootCount")
        ?? (Array.isArray(input.inputJson?.roots) ? input.inputJson.roots.length : null)
        ?? (typeof readArtifactMetadataValue(input.artifacts, "rootCount") === "number"
          ? readArtifactMetadataValue(input.artifacts, "rootCount")
          : null),
      rootLabels: readRootLabels(input.inputJson),
      indexedFileCount:
        readFirstNumberFromEvents(input.recentEvents, ["indexedFileCount", "artifactCount"])
        ?? (typeof readArtifactMetadataValue(input.artifacts, "indexedFileCount") === "number"
          ? readArtifactMetadataValue(input.artifacts, "indexedFileCount")
          : null),
      snippetQuery: readStringFromRecord(input.inputJson?.ingestPolicy, "snippetQuery"),
      includePreviewText: readBooleanFromRecord(input.inputJson?.ingestPolicy, "includePreviewText"),
      publishedArtifacts: input.artifacts.map((artifact) => artifact.artifactType ?? artifact.artifactId).slice(0, 4),
    }), "desktop_local");
  }

  if (
    input.runtimePathHint === "worker_fabric"
    || input.runtimePathHint === "hybrid"
    || input.runtimePathHint === "agency"
    || input.jobType === "workpack_worker_fabric_step"
    || input.jobType === "workpack_hybrid_step"
    || input.jobType === "workpack_agency_step"
  ) {
    const clusterLane = input.runtimePathHint === "hybrid"
      ? "hybrid"
      : input.runtimePathHint === "agency"
        ? "agency"
        : "worker_fabric";
    return validateLaneDetails(compactLaneDetails({
      stage,
      teamId: input.teamId,
      capabilityFamilies,
      intent: readStringFromRecord(input.instructionsJson, "intent"),
      sourceCount,
      fallbackPaths,
      connectorFamilies,
      publishedArtifacts: publishedArtifactLabels,
    }), clusterLane);
  }

  return validateLaneDetails(compactLaneDetails({
    stage,
    sourceCount,
    connectorFamilies,
    capabilityFamilies,
    publishedArtifacts: publishedArtifactLabels,
  }), "generic");
}

async function defaultLoadExecutorSnapshotsById(
  jobIds: string[],
): Promise<Record<string, WorkpackExecutorMonitorSnapshot>> {
  if (jobIds.length === 0) {
    return {};
  }

  const db = await getDb();
  if (!db) {
    return {};
  }

  const [jobs, artifacts, events] = await Promise.all([
    db
      .select({
        id: workerJobs.id,
        teamId: workerJobs.teamId,
        workerId: workerJobs.workerId,
        runtimeType: workerJobs.runtimeType,
        workflowRunId: workerJobs.workflowRunId,
        jobType: workerJobs.jobType,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        resourceProfile: workerJobs.resourceProfile,
        failureReason: workerJobs.failureReason,
        capabilityRequirementsJson: workerJobs.capabilityRequirementsJson,
        inputJson: workerJobs.inputJson,
        instructionsJson: workerJobs.instructionsJson,
        outputJson: workerJobs.outputJson,
        startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt,
      })
      .from(workerJobs)
      .where(inArray(workerJobs.id, jobIds)),
    db
      .select({
        workerJobId: workerArtifacts.workerJobId,
        artifactId: workerArtifacts.id,
        artifactType: workerArtifacts.artifactType,
        storageRef: workerArtifacts.storageRef,
        publishedItemId: workerArtifacts.publishedItemId,
        createdAt: workerArtifacts.createdAt,
        metadataJson: workerArtifacts.metadataJson,
      })
      .from(workerArtifacts)
      .where(inArray(workerArtifacts.workerJobId, jobIds)),
    db
      .select({
        workerJobId: workerJobEvents.workerJobId,
        eventId: workerJobEvents.id,
        eventType: workerJobEvents.eventType,
        createdAt: workerJobEvents.createdAt,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(inArray(workerJobEvents.workerJobId, jobIds))
      .orderBy(desc(workerJobEvents.createdAt)),
  ]);

  const artifactsByJobId = new Map<string, WorkpackExecutorArtifactSnapshot[]>();
  for (const artifact of artifacts) {
    const entries = artifactsByJobId.get(artifact.workerJobId) ?? [];
    entries.push({
      artifactId: String(artifact.artifactId),
      artifactType: artifact.artifactType ?? null,
      storageRef: artifact.storageRef ?? null,
      publishedItemId:
        typeof artifact.publishedItemId === "number" && Number.isInteger(artifact.publishedItemId)
          ? artifact.publishedItemId
          : null,
      createdAt: serializeDate(artifact.createdAt),
      metadata: sanitizeWorkerPayload(artifact.metadataJson ?? {}) as Record<string, unknown>,
    });
    artifactsByJobId.set(artifact.workerJobId, entries);
  }

  const eventsByJobId = new Map<string, WorkpackExecutorEventSnapshot[]>();
  for (const event of events) {
    const entries = eventsByJobId.get(event.workerJobId) ?? [];
    if (entries.length >= 5) continue;
    entries.push({
      eventId: String(event.eventId),
      eventType: event.eventType ?? null,
      createdAt: serializeDate(event.createdAt),
      payload: sanitizeWorkerPayload(event.payloadJson ?? {}) as Record<string, unknown>,
    });
    eventsByJobId.set(event.workerJobId, entries);
  }

  return Object.fromEntries(jobs.map((job) => {
    const runtimePathHint = normalizeRuntimePathHint(job.instructionsJson?.workpackRuntimePath);
    const jobArtifacts = artifactsByJobId.get(job.id) ?? [];
    const jobEvents = eventsByJobId.get(job.id) ?? [];
    const laneDetails = deriveLaneDetails({
      runtimePathHint,
      runtimeType: job.runtimeType ?? null,
      jobType: job.jobType ?? null,
      teamId: job.teamId ?? null,
      workflowRunId: job.workflowRunId ?? null,
      capabilityRequirementsJson: isRecord(job.capabilityRequirementsJson) ? job.capabilityRequirementsJson : null,
      inputJson: isRecord(job.inputJson) ? job.inputJson : null,
      instructionsJson: isRecord(job.instructionsJson) ? job.instructionsJson : null,
      outputJson: isRecord(job.outputJson) ? job.outputJson : null,
      recentEvents: jobEvents,
      artifacts: jobArtifacts,
    });
    return [job.id, {
      executionId: String(job.id),
      provider: "worker_job" as const,
      runtimeType: job.runtimeType ?? null,
      jobType: job.jobType ?? null,
      runtimePathHint,
      laneLabel: deriveExecutorLaneLabel(runtimePathHint, job.runtimeType ?? null, job.jobType ?? null),
      status: job.status ?? null,
      statusReason: job.statusReason ?? null,
      failureReason: job.failureReason ?? null,
      workerId: job.workerId ?? null,
      resourceProfile: job.resourceProfile ?? null,
      terminal: WORKER_TERMINAL_STATUSES.has(job.status),
      artifactCount: jobArtifacts.length,
      publishedArtifactCount: jobArtifacts.filter((artifact) => artifact.publishedItemId !== null).length,
      latestEventType: jobEvents[0]?.eventType ?? null,
      startedAt: serializeDate(job.startedAt),
      finishedAt: serializeDate(job.finishedAt),
      laneDetails,
      recentEvents: jobEvents,
      artifacts: jobArtifacts,
    } satisfies WorkpackExecutorMonitorSnapshot];
  }));
}

export async function launchWorkpack(
  input: {
    workpackId: string;
    requestedBy?: number | null;
    autonomyMode?: AutonomyMode;
    trigger?: WorkpackRun["trigger"];
    triggerSource?: string;
    scheduleId?: string | null;
  },
  deps: WorkpackLaunchDeps = {},
): Promise<LaunchWorkpackResult> {
  const detailBeforeCompile = await getWorkpackDetail(input.workpackId);
  if (!detailBeforeCompile) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }
  if (!detailBeforeCompile.version.executionPlan) {
    await compileWorkpackExecutionPlan({
      workpackId: input.workpackId,
      requestedBy: input.requestedBy ?? null,
    });
  }
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail || !detail.version.executionPlan) {
    throw new Error(`Execution plan unavailable for workpack: ${input.workpackId}`);
  }

  const autonomyMode = input.autonomyMode ?? "supervised";
  const queueFn = deps.queueWorkerJobByRuntime ?? queueWorkerJobByRuntime;
  const exceptionIds: string[] = [];
  const pendingClarifications = detail.playbook.clarificationQueue.filter((question) => question.status === "pending");
  const readiness = await evaluateWorkpackRolloutGate({
    workpackId: detail.workpack.id,
    targetMode: autonomyMode === "autonomous" ? "autonomous" : "supervised",
  });

  const ledgerRun = await createReplayGradeLedger({
    workpackId: detail.workpack.id,
    autonomyMode,
    trigger: input.trigger ?? (input.scheduleId ? "scheduled" : "manual"),
    triggerSource: input.triggerSource ?? (input.scheduleId ? "schedule_engine" : "control_plane"),
    scheduleId: input.scheduleId ?? null,
    notes: `Launched in ${autonomyMode} mode`,
  });

  if (pendingClarifications.length > 0) {
    const exception = await normalizeWorkpackException({
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      runId: ledgerRun.id,
      reasonCategory: "ambiguity",
      reasonCode: "clarification_queue_open",
      title: "Clarification required before launch",
      summary: `${pendingClarifications.length} targeted clarification items remain unresolved.`,
      remediationPointer: `/workpacks/${detail.workpack.id}`,
      nextAction: "Answer the clarification queue before launching autonomous execution.",
      riskClass: "medium",
    });
    exceptionIds.push(exception.id);
    const run = await finalizeLedgerRun({
      runId: ledgerRun.id,
      status: "blocked",
      actualSteps: detail.version.executionPlan.steps.map((step) => buildBlockedStep(step, "Launch blocked until clarification queue is resolved.")),
      notes: "Launch blocked by open clarification queue",
    });
    await markScheduleError(input.scheduleId, "clarification_required");
    return {
      run,
      exceptionIds,
      readinessReason: "clarification_required",
    };
  }

  if (autonomyMode === "autonomous" && readiness.gateResult !== "ready") {
    const exception = await normalizeWorkpackException({
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      runId: ledgerRun.id,
      reasonCategory: "policy_boundary",
      reasonCode: readiness.reasonCode,
      title: "Autonomous launch blocked by readiness gate",
      summary: readiness.nextAction,
      remediationPointer: `/workpacks/${detail.workpack.id}`,
      nextAction: "Clear rollout blockers before relaunching in autonomous mode.",
      riskClass: "high",
    });
    exceptionIds.push(exception.id);
    const run = await finalizeLedgerRun({
      runId: ledgerRun.id,
      status: "blocked",
      actualSteps: detail.version.executionPlan.steps.map((step) => buildBlockedStep(step, `Launch blocked: ${readiness.reasonCode}`)),
      notes: `Autonomous launch blocked: ${readiness.reasonCode}`,
    });
    await markScheduleError(input.scheduleId, readiness.reasonCode);
    return {
      run,
      exceptionIds,
      readinessReason: readiness.reasonCode,
    };
  }

  const connectorValidation = await validateConnectorMaps({
    workpackId: detail.workpack.id,
    runId: ledgerRun.id,
    emitExceptions: true,
  });
  if (connectorValidation.blocked || connectorValidation.stale) {
    const run = await finalizeLedgerRun({
      runId: ledgerRun.id,
      status: "blocked",
      actualSteps: detail.version.executionPlan.steps.map((step) => buildBlockedStep(step, "Launch blocked by connector validation state.")),
      connectorSummaries: connectorValidation.connectorMaps.map((connectorMap) => ({
        connectorFamily: connectorMap.connectorFamily,
        status: connectorMap.validationStatus,
        summary: `Scopes ${connectorMap.scopePosture}; fields missing ${connectorMap.missingFields.length}; introspection ${connectorMap.introspectionId ?? "none"}`,
      })),
      notes: "Launch blocked by connector validation",
    });
    await markScheduleError(input.scheduleId, connectorValidation.blocked ? "connector_blocked" : "connector_stale");
    return {
      run,
      exceptionIds,
      readinessReason: connectorValidation.blocked ? "connector_blocked" : "connector_stale",
    };
  }

  const actualSteps: WorkpackRunStep[] = [];
  const approvalCheckpoints: WorkpackApprovalCheckpoint[] = [];
  const artifacts: WorkpackArtifactReference[] = [];
  let stopDispatch = false;

  for (const step of detail.version.executionPlan.steps) {
    if (stopDispatch) {
      actualSteps.push(buildSkippedStep(step, "Skipped because an earlier approval boundary or executor failure halted the run."));
      continue;
    }

    if (step.requiresApproval) {
      approvalCheckpoints.push({
        stepId: step.id,
        reason: `Consequence boundary preserved for ${step.title}`,
        approved: false,
      });
      const exception = await normalizeWorkpackException({
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        runId: ledgerRun.id,
        reasonCategory: "policy_boundary",
        reasonCode: "approval_boundary_pending",
        title: "Approval boundary reached",
        summary: `${step.title} requires human approval before the automation can continue.`,
        remediationPointer: `/workpacks/${detail.workpack.id}/exceptions`,
        nextAction: "Approve, reject, or downgrade this boundary in the exception inbox.",
        riskClass: step.sideEffectClass === "financial" || step.sideEffectClass === "irreversible" ? "critical" : "high",
      });
      exceptionIds.push(exception.id);
      actualSteps.push(buildBlockedStep(step, "Paused at a consequence boundary awaiting approval."));
      stopDispatch = true;
      continue;
    }

    const dispatchResult = await attemptDispatchStep({
      detail,
      runId: ledgerRun.id,
      step,
      autonomyMode,
      requestedBy: input.requestedBy ?? null,
      queueWorkerJobByRuntime: queueFn,
    });

    if (!dispatchResult.ok) {
      const exception = await normalizeWorkpackException({
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        runId: ledgerRun.id,
        reasonCategory: "operational",
        reasonCode: "executor_dispatch_failed",
        title: "Executor dispatch failed",
        summary: dispatchResult.reason,
        remediationPointer: `/workpacks/${detail.workpack.id}/connectors`,
        nextAction: "Inspect runtime availability, worker flags, and connector posture before relaunching.",
        riskClass: "high",
      });
      exceptionIds.push(exception.id);
      actualSteps.push(buildBlockedStep(step, `Dispatch failed: ${dispatchResult.reason}`));
      stopDispatch = true;
      continue;
    }

    actualSteps.push(dispatchResult.step);
    artifacts.push(...dispatchResult.artifacts);

    if (dispatchResult.step.status === "failed") {
      const exception = await normalizeWorkpackException({
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        runId: ledgerRun.id,
        reasonCategory: "operational",
        reasonCode: "executor_job_failed",
        title: "Executor returned a failed job",
        summary: dispatchResult.step.outputSummary,
        remediationPointer: `/workpacks/${detail.workpack.id}/exceptions`,
        nextAction: "Inspect the worker job output, fix the failing runtime path, and relaunch safely.",
        riskClass: "high",
      });
      exceptionIds.push(exception.id);
      stopDispatch = true;
    }
  }

  const runStatus = deriveRunStatus(actualSteps, approvalCheckpoints);
  const notes = runStatus === "awaiting_approval"
    ? "Execution paused at approval boundaries"
    : runStatus === "queued" || runStatus === "running"
      ? `Execution dispatched through worker fabric in ${autonomyMode} mode`
      : runStatus === "succeeded"
        ? `Execution completed in ${autonomyMode} mode`
        : "Execution blocked by worker dispatch safety checks";

  const run = await persistLaunchRun({
    ledgerRunId: ledgerRun.id,
    runStatus,
    actualSteps,
    approvalCheckpoints,
    artifacts,
    connectorSummaries: connectorValidation.connectorMaps.map((connectorMap) => ({
      connectorFamily: connectorMap.connectorFamily,
      status: connectorMap.validationStatus,
      summary: `Validated with ${connectorMap.grantedScopes.length} granted scopes`,
    })),
    notes,
  });

  await updateWorkpackAfterLaunch({
    detail,
    autonomyMode,
    runStatus,
  });
  await updateScheduleAfterRun({
    scheduleId: input.scheduleId,
    run,
    runStatus,
  });

  await saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: runStatus === "succeeded" ? "run_succeeded" : runStatus === "failed" || runStatus === "blocked" ? "run_blocked" : "run_started",
    detail: notes,
    createdAt: nowIso(),
  });

  await captureWorkpackMetricSnapshot(detail.workpack.id);
  return {
    run,
    exceptionIds,
    readinessReason: runStatus,
  };
}

function buildWorkerArtifactReferences(
  runId: string,
  steps: WorkpackRunStep[],
  existingArtifacts: WorkpackArtifactReference[],
  workerJobsById: Record<string, WorkpackExecutorJobSnapshot>,
): WorkpackArtifactReference[] {
  const artifacts = [...existingArtifacts];
  const knownArtifactKeys = new Set(artifacts.map((artifact) => artifact.label));

  for (const step of steps) {
    const executionRef = step.executionRef;
    if (!executionRef || executionRef.provider !== "worker_job") continue;
    const snapshot = workerJobsById[executionRef.executionId];
    const publishedArtifacts = Array.isArray(snapshot?.outputJson?.publishedArtifacts)
      ? snapshot?.outputJson?.publishedArtifacts
      : [];
    if (publishedArtifacts.length === 0) continue;
    const label = `${step.title} published artifacts`;
    if (knownArtifactKeys.has(label)) continue;
    artifacts.push(buildArtifactReference({
      label,
      summary: {
        runId,
        stepId: step.stepId,
        workerJobId: executionRef.executionId,
        publishedArtifacts,
      },
    }));
    knownArtifactKeys.add(label);
  }

  return artifacts;
}

function summarizeReconciledStep(step: WorkpackRunStep, snapshot: WorkpackExecutorJobSnapshot): string {
  if (snapshot.status === "completed") {
    return `${step.title} completed through ${snapshot.runtimeType ?? "worker"} job ${snapshot.id}.`;
  }
  if (WORKER_FAILED_STATUSES.has(snapshot.status)) {
    return snapshot.failureReason?.trim()
      || `${step.title} failed through ${snapshot.runtimeType ?? "worker"} job ${snapshot.id}.`;
  }
  return `${step.title} is ${summarizeWorkerStatus(snapshot.status)} in ${snapshot.runtimeType ?? "worker"} job ${snapshot.id}.`;
}

async function updateWorkpackAfterReconcile(input: {
  run: WorkpackRun;
  runStatus: WorkpackRunStatus;
}): Promise<void> {
  const detail = await getWorkpackDetail(input.run.workpackId);
  if (!detail) return;

  if (input.runStatus === "succeeded") {
    await updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      lifecycleState: input.run.autonomyMode === "autonomous" ? "autonomous" : "supervised",
      autonomyMode: input.run.autonomyMode,
      policyProfile: {
        ...workpack.policyProfile,
        safeResumeRequired: false,
        safeResumeReason: null,
      },
      updatedAt: nowIso(),
    }));
  } else if (input.runStatus === "failed" || input.runStatus === "blocked") {
    await updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      lifecycleState: "needs_review",
      autonomyMode: "draft",
      policyProfile: {
        ...workpack.policyProfile,
        safeResumeRequired: true,
        safeResumeReason: input.runStatus === "failed" ? "executor_job_failed" : "executor_dispatch_blocked",
      },
      updatedAt: nowIso(),
    }));
  }

  if (input.run.scheduleId) {
    await updateWorkpackSchedule(input.run.scheduleId, (schedule) => ({
      ...schedule,
      lastRunAt: input.run.startedAt,
      nextRunAt: input.runStatus === "succeeded"
        ? computeNextRunAt(schedule, new Date(input.run.endedAt ?? input.run.startedAt))
        : schedule.nextRunAt,
      status: input.runStatus === "failed" ? "error" : schedule.status,
      lastError: input.runStatus === "failed" ? "executor_job_failed" : null,
      updatedAt: nowIso(),
    }));
  }
}

export async function reconcileDispatchedWorkpackRuns(
  input: {
    tenantId?: string;
    workpackId?: string;
  } = {},
  deps: WorkpackLaunchDeps = {},
): Promise<string[]> {
  const loadWorkerJobsById = deps.loadWorkerJobsById ?? defaultLoadWorkerJobsById;
  const candidateRuns = (input.tenantId ? await listRunsByTenant(input.tenantId) : await listAllRuns())
    .filter((run) => (!input.workpackId || run.workpackId === input.workpackId))
    .filter((run) => run.status === "queued" || run.status === "running");

  const jobIds = Array.from(new Set(candidateRuns.flatMap((run) => run.actualSteps
    .map((step) => step.executionRef?.provider === "worker_job" ? step.executionRef.executionId : null)
    .filter((value): value is string => Boolean(value)))));

  if (jobIds.length === 0) {
    return [];
  }

  const workerJobsById = await loadWorkerJobsById(jobIds);
  const reconciledRunIds: string[] = [];

  for (const run of candidateRuns) {
    let changed = false;
    const nextSteps = run.actualSteps.map((step) => {
      const executionRef = step.executionRef;
      if (!executionRef || executionRef.provider !== "worker_job") {
        return step;
      }
      const snapshot = workerJobsById[executionRef.executionId];
      if (!snapshot) {
        return step;
      }
      const nextStatus = mapWorkerJobStatusToStepStatus(snapshot.status);
      const nextSummary = summarizeReconciledStep(step, snapshot);
      if (
        nextStatus === step.status
        && executionRef.status === snapshot.status
        && step.outputSummary === nextSummary
      ) {
        return step;
      }
      changed = true;
      return {
        ...step,
        status: nextStatus,
        outputSummary: nextSummary,
        executionRef: {
          ...executionRef,
          runtimeType: snapshot.runtimeType,
          jobType: snapshot.jobType,
          status: snapshot.status,
        },
      };
    });

    if (!changed) {
      continue;
    }

    const nextArtifacts = buildWorkerArtifactReferences(run.id, nextSteps, run.artifactReferences, workerJobsById);
    const nextRunStatus = deriveRunStatus(nextSteps, run.approvalCheckpoints);
    const reconciledRun = await persistLaunchRun({
      ledgerRunId: run.id,
      runStatus: nextRunStatus,
      actualSteps: nextSteps,
      approvalCheckpoints: run.approvalCheckpoints,
      artifacts: nextArtifacts,
      connectorSummaries: run.connectorSummaries,
      notes: nextRunStatus === "succeeded"
        ? `${run.notes}\nWorker reconciliation completed successfully.`.trim()
        : nextRunStatus === "failed"
          ? `${run.notes}\nWorker reconciliation detected a failed executor job.`.trim()
          : run.notes,
    });

    await updateWorkpackAfterReconcile({
      run: reconciledRun,
      runStatus: nextRunStatus,
    });
    await captureWorkpackMetricSnapshot(run.workpackId);
    reconciledRunIds.push(run.id);
  }

  return reconciledRunIds;
}

export async function listWorkpackExecutorSnapshots(
  input: {
    tenantId: string;
    workpackId: string;
    runLimit?: number;
  },
  deps: Pick<WorkpackLaunchDeps, "loadExecutorSnapshotsById"> = {},
): Promise<WorkpackExecutorMonitorSnapshot[]> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail || detail.workpack.tenantId !== input.tenantId) {
    return [];
  }

  const runLimit = Math.max(1, input.runLimit ?? 3);
  const executionIds = Array.from(new Set(
    detail.runs
      .slice(0, runLimit)
      .flatMap((run) => run.actualSteps)
      .map((step) => step.executionRef?.provider === "worker_job" ? step.executionRef.executionId : null)
      .filter((value): value is string => Boolean(value)),
  ));

  if (executionIds.length === 0) {
    return [];
  }

  const loadSnapshots = deps.loadExecutorSnapshotsById ?? defaultLoadExecutorSnapshotsById;
  const snapshotsById = await loadSnapshots(executionIds);

  return executionIds
    .map((executionId) => snapshotsById[executionId])
    .filter((snapshot): snapshot is WorkpackExecutorMonitorSnapshot => Boolean(snapshot))
    .sort((left, right) => {
      if (left.terminal !== right.terminal) {
        return left.terminal ? 1 : -1;
      }
      const leftTime = left.finishedAt ?? left.startedAt ?? "";
      const rightTime = right.finishedAt ?? right.startedAt ?? "";
      return rightTime.localeCompare(leftTime);
    });
}

export async function createWorkpackSchedule(input: {
  tenantId: string;
  workpackId: string;
  versionId: string;
  title: string;
  triggerType: WorkpackSchedule["triggerType"];
  cronExpression?: string | null;
  intervalMinutes?: number | null;
  eventKey?: string | null;
  targetAutonomyMode?: AutonomyMode;
  createdBy?: number | null;
}): Promise<WorkpackSchedule> {
  const createdAt = nowIso();
  const schedule = workpackScheduleSchema.parse({
    id: createWorkpackId("wps"),
    tenantId: input.tenantId,
    workpackId: input.workpackId,
    versionId: input.versionId,
    title: input.title,
    triggerType: input.triggerType,
    cronExpression: input.cronExpression ?? null,
    intervalMinutes: input.intervalMinutes ?? null,
    eventKey: input.eventKey ?? null,
    targetAutonomyMode: input.targetAutonomyMode ?? "supervised",
    status: "active",
    nextRunAt: input.triggerType === "event"
      ? null
      : computeNextRunAt(workpackScheduleSchema.parse({
          id: "draft",
          tenantId: input.tenantId,
          workpackId: input.workpackId,
          versionId: input.versionId,
          title: input.title,
          triggerType: input.triggerType,
          cronExpression: input.cronExpression ?? null,
          intervalMinutes: input.intervalMinutes ?? null,
          eventKey: input.eventKey ?? null,
          targetAutonomyMode: input.targetAutonomyMode ?? "supervised",
          status: "active",
          nextRunAt: null,
          lastRunAt: null,
          lastError: null,
          createdBy: input.createdBy ?? null,
          createdAt,
          updatedAt: createdAt,
        })),
    lastRunAt: null,
    lastError: null,
    createdBy: input.createdBy ?? null,
    createdAt,
    updatedAt: createdAt,
  });
  return saveWorkpackSchedule(schedule);
}

export async function triggerWorkpackSchedule(scheduleId: string): Promise<LaunchWorkpackResult> {
  const schedule = await getWorkpackSchedule(scheduleId);
  if (!schedule) {
    throw new Error(`Unknown workpack schedule: ${scheduleId}`);
  }
  return launchWorkpack({
    workpackId: schedule.workpackId,
    autonomyMode: schedule.targetAutonomyMode,
    trigger: schedule.triggerType === "event" ? "event" : "scheduled",
    triggerSource: schedule.triggerType === "event" ? schedule.eventKey ?? "event" : "schedule_engine",
    scheduleId,
  });
}

export async function runDueWorkpackSchedules(at = new Date(), tenantId?: string): Promise<string[]> {
  const launched: string[] = [];
  const schedules = tenantId
    ? await listSchedulesByTenant(tenantId)
    : await (await import("./workpackPersistence")).listAllSchedules();
  for (const schedule of schedules) {
    if (schedule.status !== "active" || !schedule.nextRunAt) continue;
    if (Date.parse(schedule.nextRunAt) > at.getTime()) continue;
    const launchedRun = await triggerWorkpackSchedule(schedule.id);
    launched.push(launchedRun.run.id);
  }
  return launched;
}
