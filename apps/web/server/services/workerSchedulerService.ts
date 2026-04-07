import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { workerJobs, workers } from "../../drizzle/schema";
import type {
  WorkerResourceProfile,
  WorkerRuntimeType,
} from "../../shared/workerRuntime";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  reserveWorkerJobCredits,
  type WorkerJobBillingEnvelope,
} from "./workerBillingService";
import { refundReservation } from "./creditService";

const OPENCLAW_RUNTIME_TYPE: WorkerRuntimeType = "openclaw_gateway";

export const OPENCLAW_SUPPORTED_JOB_TYPES = [
  "external_agent_task",
  "browser_automation_task",
  "plugin_workflow_task",
] as const;

export const OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES = [
  "persistent-agent-session",
  "plugin-automation",
  "browser-automation",
  "tool-using-research",
  "channel-assistant-handoff",
  "artifact-producing-session",
] as const;

type SupportedOpenClawJobType = (typeof OPENCLAW_SUPPORTED_JOB_TYPES)[number];
type SupportedOpenClawCapabilityFamily =
  (typeof OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES)[number];

type WorkerJobRecord = Record<string, any>;
type WorkerRecord = Record<string, any>;

export interface QueueOpenClawWorkerJobInput {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  jobType: SupportedOpenClawJobType;
  title?: string | null;
  description?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  resourceProfile?: WorkerResourceProfile;
  capabilityFamilies: SupportedOpenClawCapabilityFamily[];
  inputJson?: Record<string, unknown>;
  instructionsJson?: Record<string, unknown>;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface WorkerSchedulerFeatureFlags {
  openClawExternalRuntime: boolean;
}

export interface WorkerSchedulerRepository {
  findJobByIdempotencyKey: (tenantId: string, idempotencyKey: string) => Promise<WorkerJobRecord | null>;
  findWorkerById: (tenantId: string, workerId: string) => Promise<WorkerRecord | null>;
  insertJob: (values: Record<string, unknown>) => Promise<WorkerJobRecord>;
}

export class WorkerSchedulerError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "WorkerSchedulerError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isOpenClawDispatchEnabled(): boolean {
  const raw = process.env.OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED;
  return raw !== "false";
}

const defaultRepo: WorkerSchedulerRepository = {
  async findJobByIdempotencyKey(tenantId, idempotencyKey) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.idempotencyKey, idempotencyKey)))
      .limit(1);
    return job ?? null;
  },
  async findWorkerById(tenantId, workerId) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return worker ?? null;
  },
  async insertJob(values) {
    const db = await getDb();
    const [job] = await db.insert(workerJobs).values(values as any).returning();
    return job;
  },
};

function assertOpenClawEligible(input: QueueOpenClawWorkerJobInput): void {
  if (!OPENCLAW_SUPPORTED_JOB_TYPES.includes(input.jobType)) {
    throw new WorkerSchedulerError(
      "unsupported_job_type",
      400,
      `Job type ${input.jobType} is not supported by OpenClaw routing`,
    );
  }

  if (
    input.resourceProfile === "gpu_required"
    || input.resourceProfile === "sandbox_required"
  ) {
    throw new WorkerSchedulerError(
      "unsupported_resource_profile",
      400,
      `Resource profile ${input.resourceProfile} is not supported by OpenClaw routing`,
    );
  }

  const requiresLocalWindowsAccess = Boolean(input.inputJson?.localWindowsPath);
  if (requiresLocalWindowsAccess) {
    throw new WorkerSchedulerError(
      "unsupported_job_scope",
      400,
      "Jobs that depend on local Windows file paths must not route to OpenClaw",
    );
  }

  const unsupportedFamily = input.capabilityFamilies.find(
    (family) => !OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES.includes(family),
  );
  if (unsupportedFamily) {
    throw new WorkerSchedulerError(
      "unsupported_capability_family",
      400,
      `Capability family ${unsupportedFamily} is not supported by OpenClaw routing`,
    );
  }
}

function buildWorkerBillingMetadata(
  billing: WorkerJobBillingEnvelope | null,
): Record<string, unknown> | null {
  if (!billing) {
    return null;
  }

  return {
    reservationId: billing.reservationId,
    reservedCredits: billing.reservedCredits,
    sourceType: billing.sourceType,
  };
}

export function workerJobMatchesSelection(
  job: WorkerJobRecord,
  workerId: string,
  capabilityHints: string[],
): boolean {
  const requirements = (job?.capabilityRequirementsJson ?? {}) as Record<string, unknown>;
  const preferredWorkerId = typeof requirements.preferredWorkerId === "string"
    ? requirements.preferredWorkerId
    : "";
  if (preferredWorkerId && preferredWorkerId !== workerId) {
    return false;
  }

  const requiredFamilies = Array.isArray(requirements.capabilityFamilies)
    ? requirements.capabilityFamilies.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )
    : [];
  if (requiredFamilies.length === 0 || capabilityHints.length === 0) {
    return true;
  }

  return requiredFamilies.some((family) => capabilityHints.includes(family));
}

export async function queueOpenClawWorkerJob(
  input: QueueOpenClawWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  assertOpenClawEligible(input);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isOpenClawDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "OpenClaw external runtime dispatch is disabled by operator kill switch",
    );
  }

  const tenantFlags = await getFeatureFlags(input.tenantId);
  if (!tenantFlags.openClawExternalRuntime) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      "OpenClaw external runtime dispatch is disabled for this tenant",
    );
  }

  if (input.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(input.tenantId, input.idempotencyKey);
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (input.preferredWorkerId) {
    const worker = await repo.findWorkerById(input.tenantId, input.preferredWorkerId);
    if (!worker) {
      throw new WorkerSchedulerError(
        "worker_not_found",
        404,
        `Preferred worker ${input.preferredWorkerId} was not found`,
      );
    }
    if (worker.runtimeType !== OPENCLAW_RUNTIME_TYPE) {
      throw new WorkerSchedulerError(
        "worker_scope_mismatch",
        409,
        "Preferred worker is not registered as an OpenClaw gateway worker",
      );
    }
    if (worker.status === "disabled") {
      throw new WorkerSchedulerError(
        "worker_state_invalid",
        409,
        `Preferred worker ${worker.id} is disabled`,
      );
    }
  }

  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const billing = input.requestedByUserId
    ? await reserveCredits({
        userId: input.requestedByUserId,
        tenantId: input.tenantId,
        requestedCredits: input.reservedCredits,
        metadata: {
          teamId: input.teamId ?? null,
          workflowRunId: input.workflowRunId ?? null,
          jobType: input.jobType,
          capabilityFamilies: input.capabilityFamilies,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: input.tenantId,
      teamId: input.teamId ?? null,
      workerId: null,
      runtimeType: OPENCLAW_RUNTIME_TYPE,
      workflowRunId: input.workflowRunId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      requestedByPersonaId: input.requestedByPersonaId ?? null,
      requestedBySystemComponent: input.requestedBySystemComponent ?? "worker_scheduler",
      jobType: input.jobType,
      status: "queued",
      statusReason: input.description ?? null,
      priority: input.priority ?? 0,
      resourceProfile: input.resourceProfile ?? "cpu_light",
      capabilityRequirementsJson: {
        capabilityFamilies: input.capabilityFamilies,
        preferredWorkerId: input.preferredWorkerId ?? null,
      },
      inputJson: {
        ...(input.inputJson ?? {}),
        title: input.title ?? null,
        description: input.description ?? null,
      },
      instructionsJson: {
        intent: input.instructionsJson?.intent ?? input.capabilityFamilies[0] ?? "artifact-producing-session",
        ...(input.instructionsJson ?? {}),
        workerBilling: buildWorkerBillingMetadata(billing),
      },
      timeoutSeconds: input.timeoutSeconds ?? 3600,
      retryPolicyJson: {
        maxAttempts: 3,
        backoffSeconds: 30,
      },
      idempotencyKey: input.idempotencyKey ?? null,
    });

    return {
      created: true,
      job,
    };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}
