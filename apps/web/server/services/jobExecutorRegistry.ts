import { createHash } from "node:crypto";
import type { JobExecutor } from "./jobExecutor";
import type { ExecutionClass, LeaseContext } from "./jobControlPlaneTypes";
import type {
  GeoSourceRefreshJobEnvelope,
  GeoSourceRefreshPipelineDependencies,
  GeoSourceRefreshPipelineResult,
} from "./geoSources/refreshPipeline";
import type { ChatIngressEvent } from "@shared/channelTypes";
import { executeExternalAgentTask } from "./externalAgentTaskExecutor";
import { executeWorkflowNodeTask } from "./workflowNodeTaskExecutor";
import { executeComputerUseBrowserJob } from "./computerUseRunnerJobExecutor";
import { createResearchNotesSummaryExecutor } from "./researchNotesSummaryExecutor";
import { isFeature186HardCutoverEnabled } from "./cloudflareRuntimeTarget";
import { omitUndefinedJobPayloadProperties } from "./feature186VerticalDramaJobAdapter";
import {
  executeInferenceSettlementRecoveryJob,
  executeInferenceSettlementSweepJob,
} from "./inference/settlementRecoveryJob";
import {
  executeSpec224FullVerification,
} from "./spec224VerificationExecutor";
import {
  SPEC224_FULL_VERIFICATION_CONTRACT,
  SPEC224_FULL_VERIFICATION_JOB_TYPE,
} from "./spec224VerificationJob";

export type JobExecutorRegistration = {
  jobType: string;
  executionClass: ExecutionClass;
  contractVersions: ReadonlySet<string>;
  executor: JobExecutor;
};

const GEO_SOURCE_REFRESH_JOB_TYPE = "geo.source.refresh";
const GEO_SOURCE_REFRESH_CONTRACT_VERSION = "feature-186-v1";
const GEO_SOURCE_REFRESH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const GEO_SOURCE_REFRESH_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const INTELLIGENCE_RESEARCH_JOB_TYPE = "intelligence.research.execute";
const INTELLIGENCE_RESEARCH_CONTRACT_VERSION = "spec266-research-v1";
const INTELLIGENCE_RESEARCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export interface IntelligenceResearchJobEnvelope {
  readonly contractVersion: "spec266-research-v1";
  readonly researchRequestId: string;
}

export interface IntelligenceResearchExecutionReceipt {
  readonly researchRunId: string;
  readonly status: "completed" | "partial";
  readonly candidateCount: number;
}

export interface IntelligenceResearchExecutorRuntime {
  /** Loads the admitted request and all provider/policy bindings from server-owned storage. */
  readonly execute: (input: {
    readonly tenantId: string;
    readonly researchRequestId: string;
    readonly canonicalJobId: string;
    readonly lease: LeaseContext;
    readonly reporter: Parameters<JobExecutor>[0]["reporter"];
    /** Runtime must stop provider work and avoid new writes when this signal aborts. */
    readonly signal: AbortSignal;
  }) => Promise<IntelligenceResearchExecutionReceipt>;
}

class IntelligenceResearchExecutorError extends Error {
  readonly class: "retryable" | "permanent" | "unknown";
  readonly diagnosticCode: string;

  constructor(code: string, errorClass: "retryable" | "permanent" | "unknown" = "permanent") {
    super(code);
    this.name = "IntelligenceResearchExecutorError";
    this.diagnosticCode = code;
    this.class = errorClass;
  }
}

function isIntelligenceResearchJobEnvelope(value: unknown): value is IntelligenceResearchJobEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 2 &&
    Object.keys(input).every(key => key === "contractVersion" || key === "researchRequestId") &&
    input.contractVersion === INTELLIGENCE_RESEARCH_CONTRACT_VERSION &&
    typeof input.researchRequestId === "string" && INTELLIGENCE_RESEARCH_ID.test(input.researchRequestId);
}

function isIntelligenceResearchReceipt(value: unknown): value is IntelligenceResearchExecutionReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return Object.keys(receipt).length === 3 &&
    Object.keys(receipt).every(key => ["researchRunId", "status", "candidateCount"].includes(key)) &&
    typeof receipt.researchRunId === "string" && INTELLIGENCE_RESEARCH_ID.test(receipt.researchRunId) &&
    (receipt.status === "completed" || receipt.status === "partial") &&
    Number.isSafeInteger(receipt.candidateCount) && Number(receipt.candidateCount) >= 0;
}

async function executeResearchWithLeaseHeartbeat(
  input: Parameters<IntelligenceResearchExecutorRuntime["execute"]>[0],
  execute: IntelligenceResearchExecutorRuntime["execute"],
): Promise<IntelligenceResearchExecutionReceipt> {
  const controller = new AbortController();
  let heartbeatError: unknown;
  let heartbeatInFlight: Promise<void> | undefined;
  let rejectOnAbort: (() => void) | undefined;
  let active = true;
  const timer = setInterval(() => {
    if (!active || heartbeatInFlight) return;
    heartbeatInFlight = input.reporter.heartbeat(input.lease).catch(error => {
      heartbeatError = error;
      active = false;
      controller.abort(error);
    }).finally(() => {
      heartbeatInFlight = undefined;
    });
  }, 15_000);
  timer.unref?.();

  try {
    const work = execute({ ...input, signal: controller.signal });
    const aborted = new Promise<never>((_resolve, reject) => {
      const rejectOnAbortWork = () => reject(new Error("INTELLIGENCE_RESEARCH_LEASE_ABORTED"));
      rejectOnAbort = rejectOnAbortWork;
      if (controller.signal.aborted) rejectOnAbortWork();
      else controller.signal.addEventListener("abort", rejectOnAbortWork, { once: true });
    });
    const receipt = await Promise.race([work, aborted]);
    if (heartbeatInFlight) await heartbeatInFlight;
    if (heartbeatError !== undefined) {
      throw new IntelligenceResearchExecutorError("INTELLIGENCE_RESEARCH_LEASE_HEARTBEAT_FAILED", "unknown");
    }
    return receipt;
  } catch (error) {
    if (heartbeatError !== undefined) {
      throw new IntelligenceResearchExecutorError("INTELLIGENCE_RESEARCH_LEASE_HEARTBEAT_FAILED", "unknown");
    }
    throw error;
  } finally {
    active = false;
    clearInterval(timer);
    if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
  }
}

/**
 * Canonical long-running research seam. The job carries only an admitted
 * request reference; policy, provider selection, credentials, storage, and
 * artifact admission are resolved by the server runtime.
 */
export function createIntelligenceResearchJobExecutor(
  runtime?: IntelligenceResearchExecutorRuntime,
): JobExecutor {
  return async ({ context, lease, reporter }) => {
    if (!runtime) throw new IntelligenceResearchExecutorError("INTELLIGENCE_RESEARCH_RUNTIME_NOT_CONFIGURED", "retryable");
    if (!runtime || typeof runtime.execute !== "function") {
      throw new IntelligenceResearchExecutorError("INTELLIGENCE_RESEARCH_RUNTIME_INVALID");
    }
    if (!INTELLIGENCE_RESEARCH_ID.test(context.tenantId) || !isIntelligenceResearchJobEnvelope(context.input)) {
      throw new IntelligenceResearchExecutorError("INTELLIGENCE_RESEARCH_JOB_INVALID");
    }

    await reporter.assertActive(lease);
    const receipt = await executeResearchWithLeaseHeartbeat({
      tenantId: context.tenantId,
      researchRequestId: context.input.researchRequestId,
      canonicalJobId: lease.jobId,
      lease,
      reporter,
    }, runtime.execute);
    if (!isIntelligenceResearchReceipt(receipt)) {
      throw new IntelligenceResearchExecutorError("INTELLIGENCE_RESEARCH_RUNTIME_RESULT_INVALID");
    }
    await reporter.assertActive(lease);
    return { output: { ...receipt } };
  };
}

export type GeoSourceRefreshPipelineRunner = (
  input: Parameters<typeof import("./geoSources/refreshPipeline")["runGeoSourceRefreshPipeline"]>[0],
  dependencies: GeoSourceRefreshPipelineDependencies,
) => Promise<GeoSourceRefreshPipelineResult>;

/**
 * The source policy, adapter registry, transport and record bindings are
 * server-owned runtime configuration. They cannot come from worker input.
 */
export interface GeoSourceRefreshExecutorRuntime {
  readonly purpose: string;
  readonly geography: string;
  readonly dependencies: Omit<GeoSourceRefreshPipelineDependencies, "reporter">;
  /** Injectable only for the canonical runtime composition and focused tests. */
  readonly runPipeline?: GeoSourceRefreshPipelineRunner;
}

class GeoSourceRefreshExecutorError extends Error {
  readonly class = "permanent" as const;
  readonly diagnosticCode: string;

  constructor(code: string) {
    super(code);
    this.name = "GeoSourceRefreshExecutorError";
    this.diagnosticCode = code;
  }
}

function isGeoSourceRefreshJobEnvelope(value: unknown): value is GeoSourceRefreshJobEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const hasId = (field: string) => typeof input[field] === "string" && GEO_SOURCE_REFRESH_ID.test(input[field]);
  const windowStart = input.windowStart;
  return hasId("sourceId") && hasId("sourceRef") && hasId("adapterId") && hasId("adapterVersion") &&
    Number.isSafeInteger(input.configurationRevision) && Number(input.configurationRevision) >= 1 &&
    typeof windowStart === "string" && GEO_SOURCE_REFRESH_INSTANT.test(windowStart) &&
    !Number.isNaN(Date.parse(windowStart)) && new Date(windowStart).toISOString() === windowStart;
}

function isGeoSourceRefreshRuntime(value: GeoSourceRefreshExecutorRuntime): boolean {
  return GEO_SOURCE_REFRESH_ID.test(value.purpose) && GEO_SOURCE_REFRESH_ID.test(value.geography) &&
    Boolean(value.dependencies) && typeof value.dependencies === "object";
}

/**
 * Creates the canonical executor for one explicitly approved server runtime.
 * This is deliberately dependency-injected: queued input never selects a
 * provider URL, adapter, source policy, or persistence implementation.
 */
export function createGeoSourceRefreshJobExecutor(
  runtime?: GeoSourceRefreshExecutorRuntime,
): JobExecutor {
  return async ({ context, lease, reporter }) => {
    if (!runtime) throw new GeoSourceRefreshExecutorError("GEO_SOURCE_REFRESH_RUNTIME_NOT_CONFIGURED");
    if (!isGeoSourceRefreshRuntime(runtime)) {
      throw new GeoSourceRefreshExecutorError("GEO_SOURCE_REFRESH_RUNTIME_INVALID");
    }
    if (!GEO_SOURCE_REFRESH_ID.test(context.tenantId) || !isGeoSourceRefreshJobEnvelope(context.input)) {
      throw new GeoSourceRefreshExecutorError("GEO_SOURCE_REFRESH_JOB_INVALID");
    }

    const runPipeline = runtime.runPipeline ?? (await import("./geoSources/refreshPipeline")).runGeoSourceRefreshPipeline;
    const result = await runPipeline({
      tenantId: context.tenantId,
      purpose: runtime.purpose,
      geography: runtime.geography,
      lease,
      job: context.input,
    }, {
      ...runtime.dependencies,
      reporter,
    });
    if (!result.ok) throw new GeoSourceRefreshExecutorError(result.code);
    return {
      output: {
        captureId: result.captureId,
        captureCreated: result.captureCreated,
        observationsInserted: result.observationsInserted,
        observationsReplayed: result.observationsReplayed,
      },
    };
  };
}

class Feature186DomainExecutionError extends Error {
  readonly code = "DOMAIN_EXECUTION_FAILED";
  readonly class = "unknown" as const;

  constructor(jobType: string, status: string, detail?: string) {
    super(
      `${jobType} domain projection did not complete (status=${status}${detail ? `, detail=${detail}` : ""})`
    );
    this.name = "Feature186DomainExecutionError";
  }
}

function assertDomainExecutionSucceeded(
  jobType: string,
  record: { status?: unknown; error?: unknown } | null,
  acceptedStatuses: readonly string[] = ["succeeded"]
): void {
  const status = typeof record?.status === "string" ? record.status : "missing";
  if (record && acceptedStatuses.includes(status)) return;
  const detail =
    typeof record?.error === "string" ? record.error.slice(0, 500) : undefined;
  throw new Feature186DomainExecutionError(jobType, status, detail);
}

async function withLeaseHeartbeat<T>(
  lease: LeaseContext,
  reporter: { heartbeat(lease: LeaseContext): Promise<void> },
  work: () => Promise<T>,
): Promise<T> {
  let active = true;
  const timer = setInterval(() => {
    if (!active) return;
    void reporter.heartbeat(lease).catch(error => {
      console.warn("[Feature186] long-running executor heartbeat failed", {
        jobId: lease.jobId,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
      });
    });
  }, 15_000);
  timer.unref?.();
  try {
    return await work();
  } finally {
    active = false;
    clearInterval(timer);
  }
}

/**
 * Server-owned mapping from canonical job types to business handlers.
 * Transport code may resolve this registry, but domain producers never do.
 */
export class JobExecutorRegistry {
  private readonly registrations = new Map<string, JobExecutorRegistration>();

  register(registration: JobExecutorRegistration): void {
    if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(registration.jobType)) {
      throw new Error("JOB_EXECUTOR_INVALID_TYPE");
    }
    if (this.registrations.has(registration.jobType)) {
      throw new Error(`JOB_EXECUTOR_DUPLICATE:${registration.jobType}`);
    }
    if (registration.contractVersions.size === 0) {
      throw new Error(`JOB_EXECUTOR_NO_CONTRACT:${registration.jobType}`);
    }
    this.registrations.set(registration.jobType, registration);
  }

  resolve(
    jobType: string,
    contractVersion: string
  ): JobExecutorRegistration | undefined {
    const registration = this.registrations.get(jobType);
    if (!registration || !registration.contractVersions.has(contractVersion))
      return undefined;
    return registration;
  }

  has(jobType: string, contractVersion: string): boolean {
    return Boolean(this.resolve(jobType, contractVersion));
  }

  entries(): JobExecutorRegistration[] {
    return [...this.registrations.values()];
  }
}

export function createJobExecutorRegistry(
  registrations: readonly JobExecutorRegistration[] = []
): JobExecutorRegistry {
  const registry = new JobExecutorRegistry();
  for (const registration of registrations) registry.register(registration);
  return registry;
}

export const defaultJobExecutorRegistry = createJobExecutorRegistry();

defaultJobExecutorRegistry.register({
  jobType: "external_agent_task",
  executionClass: "external",
  contractVersions: new Set(["feature-186-v1"]),
  executor: executeExternalAgentTask,
});

defaultJobExecutorRegistry.register({
  jobType: "workflow.node.execute",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: executeWorkflowNodeTask,
});

defaultJobExecutorRegistry.register({
  jobType: "computer_use.browser",
  executionClass: "external",
  contractVersions: new Set(["feature-186-v1"]),
  executor: executeComputerUseBrowserJob,
});

// Source adapters are not inferred from a payload. Until a deployment binds an
// approved source policy/registry/transport to this executor, it fails closed.
defaultJobExecutorRegistry.register({
  jobType: GEO_SOURCE_REFRESH_JOB_TYPE,
  executionClass: "long",
  contractVersions: new Set([GEO_SOURCE_REFRESH_CONTRACT_VERSION]),
  executor: createGeoSourceRefreshJobExecutor(),
});

// Research execution uses the admitted request identity persisted by the
// canonical admission transaction. No provider/runtime binding is available
// until the owning composition supplies one, so the default remains closed.
defaultJobExecutorRegistry.register({
  jobType: INTELLIGENCE_RESEARCH_JOB_TYPE,
  executionClass: "long",
  contractVersions: new Set([INTELLIGENCE_RESEARCH_CONTRACT_VERSION]),
  executor: createIntelligenceResearchJobExecutor(),
});

defaultJobExecutorRegistry.register({
  jobType: "research_notes.summarize",
  executionClass: "long",
  contractVersions: new Set(["mini-app-research-v1"]),
  executor: createResearchNotesSummaryExecutor(),
});

// Full verification is durably routable through the canonical worker only.
// The default executor records NOT_CONFIGURED until a workspace runtime is bound.
defaultJobExecutorRegistry.register({
  jobType: SPEC224_FULL_VERIFICATION_JOB_TYPE,
  executionClass: "long",
  contractVersions: new Set([SPEC224_FULL_VERIFICATION_CONTRACT]),
  executor: executeSpec224FullVerification,
});

// Python compatibility jobs are executed by the Python runtime. Registration
// is still required so the canonical create gateway rejects unknown job types
// before writing an outbox row. If routing is misconfigured, fail closed in
// Node rather than executing a Python payload locally.
defaultJobExecutorRegistry.register({
  jobType: "python.legacy_task",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async () => {
    throw new Error("PYTHON_RUNTIME_REQUIRED");
  },
});

defaultJobExecutorRegistry.register({
  jobType: "channel.delivery",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const { _processDeliveryJob } = await import("./deliveryQueue");
    const input = context.input as Record<string, unknown>;
    await _processDeliveryJob({
      data: input,
      attemptsMade: Math.max(0, context.attempt - 1),
    } as any);
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "channel.webhook_ingest",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    const event = (context.input as { event?: ChatIngressEvent }).event;
    if (!event || typeof event !== "object" || event.tenantId !== context.tenantId) {
      throw Object.assign(new Error("CHANNEL_WEBHOOK_EVENT_INVALID"), { class: "permanent" });
    }
    await reporter.assertActive(lease);
    let active = true;
    const heartbeat = setInterval(() => {
      if (!active) return;
      void reporter.heartbeat(lease).catch(error => {
        console.warn("[Feature186] channel webhook heartbeat failed", {
          jobId: lease.jobId,
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
        });
      });
    }, 15_000);
    heartbeat.unref?.();
    try {
      const { channelGateway } = await import("./channelGateway");
      const result = await channelGateway.ingest(event);
      if (!result.ok) {
        const permanent = ["no_connection", "revoked", "no_channel"].includes(String(result.errorCode));
        throw Object.assign(new Error(result.error || "CHANNEL_WEBHOOK_INGEST_FAILED"), {
          class: permanent ? "permanent" : "retryable",
        });
      }
      await reporter.assertActive(lease);
      return { responseMessageId: result.responseMessageId ?? null };
    } finally {
      active = false;
      clearInterval(heartbeat);
    }
  },
});

defaultJobExecutorRegistry.register({
  jobType: "llm.inference_settlement_reconcile",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: executeInferenceSettlementRecoveryJob,
});

defaultJobExecutorRegistry.register({
  jobType: "llm.inference_settlement_sweep",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: executeInferenceSettlementSweepJob,
});

defaultJobExecutorRegistry.register({
  jobType: "automation.execute",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const { executeJob } = await import("./jobAutomationService");
    const input = context.input as { jobId?: unknown };
    if (typeof input.jobId !== "string" || !input.jobId)
      throw new Error("AUTOMATION_JOB_ID_MISSING");
    await executeJob(input.jobId);
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "database.backup",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const { runDatabaseBackupJob } = await import("../jobs/databaseBackupJob");
    const input = context.input as { backupJobId?: unknown; mode?: unknown };
    if (
      typeof input.backupJobId !== "string" ||
      (input.mode !== "safe" && input.mode !== "full")
    ) {
      throw new Error("DATABASE_BACKUP_INPUT_INVALID");
    }
    await runDatabaseBackupJob({
      backupJobId: input.backupJobId,
      mode: input.mode,
    });
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "database.backup.maintenance",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { cleanupExpiredDatabaseBackups, reconcileStaleDatabaseBackupJobs } =
      await import("../services/databaseBackupService");
    await reconcileStaleDatabaseBackupJobs();
    await cleanupExpiredDatabaseBackups();
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "worker.heartbeat_retention",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { executeWorkerHeartbeatRetention } =
      await import("../jobs/workerHeartbeatRetentionJob");
    const result = await executeWorkerHeartbeatRetention();
    await reporter.assertActive(lease);
    return result;
  },
});

defaultJobExecutorRegistry.register({
  jobType: "spec224.runner_input_retention",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { executeSpec224RunnerInputRetentionJob } =
      await import("../jobs/spec224RunnerInputRetentionJob");
    const result = await executeSpec224RunnerInputRetentionJob();
    await reporter.assertActive(lease);
    return { output: result };
  },
});

defaultJobExecutorRegistry.register({
  jobType: "gdrive.edit_session_cleanup",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { runGDriveSessionCleanup } =
      await import("../jobs/gdriveSessionCleanup");
    await runGDriveSessionCleanup();
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "library.trash_purge",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { executeTrashPurge } = await import("../jobs/purgeOldTrashItems");
    await executeTrashPurge();
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "capacity.assessment",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const { runCapacityAssessment } =
      await import("../services/capacityAssessmentService");
    await runCapacityAssessment(
      context.input as {
      assessmentId: number;
      requestedByUserId: number | null;
      tenantId: string;
      trigger: "manual" | "scheduled";
      }
    );
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "skill.execute",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async input => {
    const { executeSkillJob } = await import("./skillJobExecutor");
    return executeSkillJob(input);
  },
});

defaultJobExecutorRegistry.register({
  jobType: "scheduled.skill.execute",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const input = context.input as { scheduleId?: unknown };
    const scheduleId = Number(input.scheduleId);
    if (!Number.isSafeInteger(scheduleId) || scheduleId <= 0) {
      throw new Error("SCHEDULED_SKILL_ID_INVALID");
    }
    const { deliverScheduledMessage } = await import("./scheduler");
    await deliverScheduledMessage(scheduleId, { executeSkillInWorker: true });
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "storyboard.skill.run",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter, controlPlane }) => {
    const { runStoryboardSkillBackground } =
      await import("./storyboardSkillFrameworkWorker");
    const input = context.input as { runId?: unknown };
    if (typeof input.runId !== "string" || !input.runId) {
      throw new Error("STORYBOARD_RUN_ID_MISSING");
    }
    return runStoryboardSkillBackground({
      runId: input.runId,
      context,
      lease,
      reporter,
      controlPlane,
    });
  },
});

defaultJobExecutorRegistry.register({
  jobType: "notification.escalation",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { executeEscalationCheck } = await import("../jobs/escalationJob");
    await executeEscalationCheck();
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "notification.digest",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { executeDigestRun } = await import("../jobs/notificationDigestJob");
    await executeDigestRun();
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "notification.retention",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ reporter, lease }) => {
    await reporter.assertActive(lease);
    const { executeRetentionCleanup } =
      await import("../jobs/notificationRetentionJob");
    await executeRetentionCleanup();
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "notification.webhook_delivery",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    await reporter.assertActive(lease);
    const { deliverWebhook } = await import("./notificationWebhookService");
    const input = context.input as { webhookId?: unknown; payload?: unknown };
    if (
      typeof input.webhookId !== "number" ||
      !input.payload ||
      typeof input.payload !== "object"
    ) {
      throw new Error("NOTIFICATION_WEBHOOK_INPUT_INVALID");
    }
    await deliverWebhook(input.webhookId, input.payload as any);
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.character_prompt",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { jobId?: unknown };
    if (typeof input.jobId !== "string" || !input.jobId)
      throw new Error("VD_CHARACTER_PROMPT_JOB_ID_MISSING");
    const { runVerticalDramaCharacterPromptJob } =
      await import("./verticalDramaCharacterPromptJobs");
    const { runVerticalDramaCharacterPromptJobExecutor } =
      await import("../routers/verticalDramaCharacters");
    await reporter.assertActive(lease);
    const result = await runVerticalDramaCharacterPromptJob(
      input.jobId,
      runVerticalDramaCharacterPromptJobExecutor
    );
    await reporter.assertActive(lease);
    return result && typeof result === "object" && !Array.isArray(result)
      ? { output: result as Record<string, unknown> }
      : { output: { result } };
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.draft_composition",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { jobId?: unknown };
    if (typeof input.jobId !== "string" || !input.jobId)
      throw new Error("VD_DRAFT_COMPOSITION_JOB_ID_MISSING");
    const { runVerticalDramaDraftCompositionJob } =
      await import("./verticalDramaDraftCompositionJobs");
    const { getVerticalDramaDraftCompositionStatus } =
      await import("./verticalDramaDraftCompositionJobs");
    await reporter.assertActive(lease);
    await runVerticalDramaDraftCompositionJob(input.jobId);
    const domainInput = context.input as any;
    const record = await getVerticalDramaDraftCompositionStatus(
      input.jobId,
      {
      tenantId: String(domainInput.tenantId ?? ""),
      userId: Number(domainInput.userId),
      },
      Number(domainInput.seriesId)
    );
    assertDomainExecutionSucceeded("vertical_drama.draft_composition", record, [
      "ready_for_qc",
    ]);
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.draft_quality_qc",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { runId?: unknown };
    if (typeof input.runId !== "string" || !input.runId)
      throw new Error("VD_DRAFT_QC_RUN_ID_MISSING");
    const { runVerticalDramaDraftQualityQcJob } =
      await import("./verticalDramaDraftQualityQcJobs");
    const { getVerticalDramaDraftQualityQcStatus } =
      await import("./verticalDramaDraftQualityQcJobs");
    await reporter.assertActive(lease);
    await runVerticalDramaDraftQualityQcJob(input.runId);
    const domainInput = context.input as any;
    const record = await getVerticalDramaDraftQualityQcStatus(
      input.runId,
      {
      tenantId: String(domainInput.tenantId ?? ""),
      userId: Number(domainInput.userId),
      },
      Number(domainInput.seriesId)
    );
    assertDomainExecutionSucceeded("vertical_drama.draft_quality_qc", record);
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.episode_stage",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as {
      runId?: unknown;
      owner?: unknown;
      opts?: unknown;
      stage?: unknown;
      clearDownstreamOnSuccess?: unknown;
    };
    if (!Number.isInteger(input.runId) || !input.owner || !input.opts)
      throw new Error("VD_EPISODE_STAGE_INPUT_INVALID");
    const { VerticalDramaEpisodePipeline } =
      await import("./verticalDramaEpisodePipeline");
    const { createVerticalDramaProviderRoutingPort } =
      await import("./verticalDramaProviderRouting");
    const pipeline = new VerticalDramaEpisodePipeline(
      createVerticalDramaProviderRoutingPort()
    );
    await reporter.assertActive(lease);
    const stage = input.stage ?? "storyboard_shotgrid";
    if (stage === "storyboard_shotgrid") {
      await pipeline.runStoryboardShotgridStageJob(
        input.owner as any,
        input.runId as number,
        input.opts as any,
        input.clearDownstreamOnSuccess === true
      );
    } else {
      await pipeline.runEpisodeStageJob(
        input.owner as any,
        input.runId as number,
        stage as any,
        input.opts as any
      );
    }
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.interactive",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { jobId?: unknown };
    if (typeof input.jobId !== "string" || !input.jobId)
      throw new Error("VD_INTERACTIVE_JOB_ID_MISSING");
    const { runVerticalDramaInteractiveJob } =
      await import("./verticalDramaInteractiveJobs");
    const { runVerticalDramaInteractiveJobExecutor } =
      await import("./verticalDramaInteractiveJobExecutor");
    const { getVerticalDramaInteractiveJobStatus } =
      await import("./verticalDramaInteractiveJobs");
    await reporter.assertActive(lease);
    await runVerticalDramaInteractiveJob(
      input.jobId,
      runVerticalDramaInteractiveJobExecutor
    );
    const domainInput = context.input as any;
    const record = await getVerticalDramaInteractiveJobStatus(input.jobId, {
      tenantId: String(domainInput.tenantId ?? ""),
      userId: Number(domainInput.userId),
      scopeKey: String(domainInput.scopeKey ?? ""),
    });
    assertDomainExecutionSucceeded("vertical_drama.interactive", record);
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.shot_prompt",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { jobId?: unknown };
    if (typeof input.jobId !== "string" || !input.jobId)
      throw new Error("VD_SHOT_PROMPT_JOB_ID_MISSING");
    const { runVerticalDramaShotPromptJobExecutor } =
      await import("../routers/verticalDramaEpisodes");
    const domainInput = context.input as any;
    await reporter.assertActive(lease);
    const { executeVerticalDramaShotPromptJobExecutor } =
      await import("./verticalDramaShotPromptJobs");
    const result = await withLeaseHeartbeat(
      lease,
      reporter,
      () => executeVerticalDramaShotPromptJobExecutor(
        input.jobId,
        domainInput,
        runVerticalDramaShotPromptJobExecutor,
      ),
    );
    await reporter.assertActive(lease);
    return {
      output: omitUndefinedJobPayloadProperties(result) as Record<
        string,
        unknown
      >,
    };
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.shot_video_prompt",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { jobId?: unknown };
    if (typeof input.jobId !== "string" || !input.jobId)
      throw new Error("VD_SHOT_VIDEO_PROMPT_JOB_ID_MISSING");
    const { runVerticalDramaShotVideoPromptJobExecutor } =
      await import("../routers/verticalDramaEpisodes");
    const domainInput = context.input as any;
    await reporter.assertActive(lease);
    const { executeVerticalDramaShotVideoPromptJobExecutor } =
      await import("./verticalDramaShotVideoPromptJobs");
    const result = await withLeaseHeartbeat(
      lease,
      reporter,
      () => executeVerticalDramaShotVideoPromptJobExecutor(
        input.jobId,
        domainInput,
        runVerticalDramaShotVideoPromptJobExecutor,
      ),
    );
    await reporter.assertActive(lease);
    return {
      output: omitUndefinedJobPayloadProperties(result) as Record<
        string,
        unknown
      >,
    };
  },
});

defaultJobExecutorRegistry.register({
  jobType: "vertical_drama.story",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { jobId?: unknown };
    if (typeof input.jobId !== "string" || !input.jobId)
      throw new Error("VD_STORY_JOB_ID_MISSING");
    const { runVerticalDramaStoryJob } =
      await import("./verticalDramaStoryJobs");
    const { runVerticalDramaStoryJobExecutor } =
      await import("../routers/verticalDramaSeries");
    const { getVerticalDramaStoryJobStatus } =
      await import("./verticalDramaStoryJobs");
    await reporter.assertActive(lease);
    await withLeaseHeartbeat(
      lease,
      reporter,
      () => runVerticalDramaStoryJob(
        input.jobId,
        runVerticalDramaStoryJobExecutor,
      ),
    );
    const domainInput = context.input as any;
    const record = await getVerticalDramaStoryJobStatus(input.jobId, {
      tenantId: String(domainInput.tenantId ?? ""),
      seriesId: Number(domainInput.seriesId),
    });
    assertDomainExecutionSucceeded("vertical_drama.story", record);
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "media.deferred_retry",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as { deferredTaskId?: unknown };
    if (typeof input.deferredTaskId !== "string" || !input.deferredTaskId.startsWith("deferred-")) {
      throw new Error("DEFERRED_MEDIA_TASK_ID_INVALID");
    }
    const { executeDeferredVideoRetryJob } =
      await import("./deferredMediaRetryService");
    await reporter.assertActive(lease);
    const output = await withLeaseHeartbeat(lease, reporter, () =>
      executeDeferredVideoRetryJob(input.deferredTaskId as string),
    );
    await reporter.assertActive(lease);
    return { output };
  },
});

defaultJobExecutorRegistry.register({
  jobType: "video.render",
  executionClass: "cpu",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async () => {
    // Video rendering is a Cloudflare Container/Worker App capability. Keep
    // the Node executor fail-closed so a local pull worker cannot accidentally
    // execute a heavy render in the web process.
    throw new Error("CLOUDFLARE_CONTAINER_REQUIRED");
  },
});

defaultJobExecutorRegistry.register({
  jobType: "content_protection.protect",
  executionClass: "cpu",
  contractVersions: new Set(["content-protection.v1"]),
  executor: async () => {
    // Protection is a native Worker App lane. Keeping this registration only
    // satisfies the canonical producer contract; the PostgreSQL Node worker
    // must never execute a provider boundary that cannot produce a verified
    // artifact. Routing is enforced again by POSTGRES_NODE_JOB_TYPES.
    throw new Error("CONTENT_PROTECTION_NATIVE_WORKER_REQUIRED");
  },
});

defaultJobExecutorRegistry.register({
  jobType: "content_protection.verify",
  executionClass: "cpu",
  contractVersions: new Set(["content-protection.verify.v1"]),
  executor: async input => {
    const { executeContentProtectionVerificationJob } =
      await import("./contentProtection/verification");
    return executeContentProtectionVerificationJob(input);
  },
});

defaultJobExecutorRegistry.register({
  jobType: "video.intelligence",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as {
      kind?: unknown;
      projectId?: unknown;
      tenantId?: unknown;
      userId?: unknown;
      input?: unknown;
    };
    if (
      typeof input.kind !== "string" ||
      !Number.isSafeInteger(input.projectId) ||
      typeof input.tenantId !== "string" ||
      !input.tenantId ||
      !Number.isSafeInteger(input.userId) ||
      !input.input ||
      typeof input.input !== "object" ||
      Array.isArray(input.input)
    ) {
      throw new Error("VIDEO_INTELLIGENCE_INPUT_INVALID");
    }
    const { executeVideoIntelligenceJobExecutor } = await import("./videoIntelligenceJobs");
    const { runVideoIntelligenceJobExecutor } =
      await import("../routers/videoProjects");
    await reporter.assertActive(lease);
    const output = await withLeaseHeartbeat(lease, reporter, () =>
      executeVideoIntelligenceJobExecutor(
        {
          kind: input.kind as any,
          projectId: input.projectId as number,
          tenantId: input.tenantId as string,
          userId: input.userId as number,
          input: input.input as Record<string, unknown>,
        },
        runVideoIntelligenceJobExecutor,
        progress =>
          reporter.progress(lease, {
            progress: 50,
            stage: progress.stage,
            ...(progress.message ? { message: progress.message } : {}),
          }),
      ),
    );
    await reporter.assertActive(lease);
    return { output };
  },
});

defaultJobExecutorRegistry.register({
  jobType: "video.composition_scan",
  executionClass: "long",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, reporter, lease }) => {
    const input = context.input as Record<string, unknown>;
    const operationOptions =
      input.operation === "media.composition_scan" &&
      input.options &&
      typeof input.options === "object" &&
      !Array.isArray(input.options)
        ? (input.options as Record<string, unknown>)
      : input;
    if (
      operationOptions.contractVersion !== undefined &&
      operationOptions.contractVersion !== "feature-186-v1"
    ) {
      throw new Error("COMPOSITION_SCAN_TRANSPORT_CONTRACT_VERSION_INVALID");
    }
    if (
      operationOptions.compositionContractVersion !== undefined &&
      operationOptions.compositionContractVersion !== "feature-191.v1"
    ) {
      throw new Error("COMPOSITION_SCAN_CONTRACT_VERSION_INVALID");
    }
    const sourceFingerprint =
      typeof operationOptions.sourceFingerprint === "string"
        ? operationOptions.sourceFingerprint
        : "";
    const projectRevisionId =
      operationOptions.projectRevisionId === undefined
      ? null
        : typeof operationOptions.projectRevisionId === "string" &&
            operationOptions.projectRevisionId.length <= 160
      ? operationOptions.projectRevisionId.trim() || "invalid"
        : "invalid";
    const analysisMode =
      operationOptions.analysisMode === "quick" ||
      operationOptions.analysisMode === "full_scan"
        ? operationOptions.analysisMode
        : null;
    const markRevision = operationOptions.markRevision;
    const trimRange =
      operationOptions.trimRange &&
      typeof operationOptions.trimRange === "object" &&
      !Array.isArray(operationOptions.trimRange)
        ? (operationOptions.trimRange as { startMs?: unknown; endMs?: unknown })
      : null;
    const aspectProfile =
      typeof operationOptions.aspectProfile === "string"
        ? operationOptions.aspectProfile
        : "";
    if (
      !sourceFingerprint ||
      sourceFingerprint.length > 256 ||
      projectRevisionId === "invalid" ||
      !analysisMode ||
      !Number.isSafeInteger(markRevision) ||
      Number(markRevision) < 0 ||
      !trimRange ||
      !Number.isSafeInteger(trimRange.startMs) ||
      !Number.isSafeInteger(trimRange.endMs) ||
      Number(trimRange.startMs) < 0 ||
      Number(trimRange.endMs) <= Number(trimRange.startMs) ||
      !aspectProfile.trim() ||
      aspectProfile.length > 80 ||
      typeof operationOptions.policyFingerprint !== "string" ||
      operationOptions.policyFingerprint.length > 256 ||
      typeof operationOptions.capabilityProfileFingerprint !== "string" ||
      operationOptions.capabilityProfileFingerprint.length > 256
    ) {
      throw new Error("COMPOSITION_SCAN_EVIDENCE_INVALID");
    }
    const evidenceRef =
      typeof operationOptions.evidenceRef === "string" &&
      operationOptions.evidenceRef.trim()
      ? operationOptions.evidenceRef.trim().slice(0, 256)
        : `composition-evidence:${createHash("sha256")
            .update(
              JSON.stringify({
        sourceFingerprint,
        ...(projectRevisionId ? { projectRevisionId } : {}),
        trimRange,
        aspectProfile,
        markRevision,
        analysisMode,
        policyFingerprint: operationOptions.policyFingerprint,
                capabilityProfileFingerprint:
                  operationOptions.capabilityProfileFingerprint,
              }),
              "utf8"
            )
            .digest("hex")
            .slice(0, 32)}`;
    await reporter.progress(lease, {
      progress: 90,
      stage: "composition_scan_validation",
      message:
        "Validated source-bound scan metadata; detector evidence is degraded until capability is available",
    });
    await reporter.assertActive(lease);
    return {
      output: {
        sourceFingerprint,
        ...(projectRevisionId ? { projectRevisionId } : {}),
        evidenceRef,
        analysisMode,
        markRevision,
        trimRange,
        aspectProfile,
        status: "degraded",
        warnings: ["object_interaction_detector_unavailable"],
      },
    };
  },
});

for (const registration of [
  ["memory.archive_cleanup", "short", "executeArchiveCleanup"],
  ["memory.chunk_cleanup", "short", "executeChunkCleanup"],
  ["memory.embedding_reconciliation", "long", "executeEmbeddingReconciliation"],
  ["memory.eviction", "long", "executeMemoryEviction"],
] as const) {
  defaultJobExecutorRegistry.register({
    jobType: registration[0],
    executionClass: registration[1],
    contractVersions: new Set(["feature-186-v1"]),
    executor: async ({ reporter, lease }) => {
      await reporter.assertActive(lease);
      const maintenance = await import("../jobs/memoryMaintenanceJobs");
      await maintenance[registration[2]]();
      await reporter.assertActive(lease);
      return {};
    },
  });
}

defaultJobExecutorRegistry.register({
  jobType: "tenant_data_transfer",
  executionClass: "long",
  contractVersions: new Set(["feature-189-v1"]),
  executor: async ({ lease, reporter, controlPlane }) => {
    const { executeTenantDataTransferJob } =
      await import("./tenantDataTransfer");
    return executeTenantDataTransferJob({
      jobId: lease.jobId,
      lease,
      reporter,
      controlPlane,
    });
  },
});

defaultJobExecutorRegistry.register({
  jobType: "emergency.report.intake",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const input = context.input as { reportId?: unknown; tenantId?: unknown };
    if (typeof input.reportId !== "string" || typeof input.tenantId !== "string") {
      throw new Error("EMERGENCY_REPORT_INTAKE_INPUT_INVALID");
    }
    const { markEmergencyReportReadyForTriage } = await import("../jobs/spec260EmergencyReportJob");
    await markEmergencyReportReadyForTriage({ reportId: input.reportId, tenantId: input.tenantId });
    await reporter.assertActive(lease);
    return {};
  },
});

defaultJobExecutorRegistry.register({
  jobType: "emergency.evidence.retention",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ lease, reporter }) => {
    await reporter.assertActive(lease);
    const { reconcileEmergencyEvidenceUploads } = await import("../jobs/spec260EvidenceRetentionJob");
    const result = await reconcileEmergencyEvidenceUploads(5);
    await reporter.assertActive(lease);
    return result;
  },
});

defaultJobExecutorRegistry.register({
  jobType: "workspace.authority.audit",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const { executeWorkspaceAuthorityAudit } = await import("../jobs/workspaceAuthorityAuditJob");
    const result = await executeWorkspaceAuthorityAudit({ tenantId: context.tenantId });
    await reporter.assertActive(lease);
    return { output: result };
  },
});

defaultJobExecutorRegistry.register({
  jobType: "workspace.authority.safe_action",
  executionClass: "short",
  contractVersions: new Set(["feature-186-v1"]),
  executor: async ({ context, lease, reporter }) => {
    await reporter.assertActive(lease);
    const { executeWorkspaceAuthoritySafeAction } = await import("../jobs/workspaceAuthoritySafeActionJob");
    const result = await executeWorkspaceAuthoritySafeAction({
      ...(context.input as Parameters<typeof executeWorkspaceAuthoritySafeAction>[0]),
      jobId: context.jobId,
    });
    await reporter.assertActive(lease);
    return result;
  },
});
