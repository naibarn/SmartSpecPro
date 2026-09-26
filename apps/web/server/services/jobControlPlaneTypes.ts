export const CANONICAL_JOB_STATUSES = [
  "pending",
  "queued",
  "leased",
  "running",
  "waiting_external",
  "retry_scheduled",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const;

export const CANONICAL_JOB_COMMANDS = [
  "create",
  "claim",
  "start",
  "heartbeat",
  "progress",
  "wait_for_external",
  "resume_external",
  "complete",
  "fail",
  "request_cancel",
  "cancel",
  "retry_due",
  "recover_checkpoint",
  "force_fail",
  "reconcile",
] as const;

export type CanonicalJobStatus = (typeof CANONICAL_JOB_STATUSES)[number];
export type CanonicalJobCommand = (typeof CANONICAL_JOB_COMMANDS)[number];

/**
 * The only lifecycle transition table shared by adapters and projections.
 * Commands may be retried, but a terminal Job can never be reopened.
 */
export const CANONICAL_JOB_TRANSITIONS: Readonly<
  Record<CanonicalJobStatus, readonly CanonicalJobStatus[]>
> = {
  pending: ["queued", "cancelled", "expired"],
  queued: [
    "leased",
    "waiting_external",
    "retry_scheduled",
    "failed",
    "cancelled",
    "expired",
  ],
  leased: [
    "running",
    "queued",
    "waiting_external",
    "failed",
    "cancelled",
    "expired",
  ],
  running: [
    "waiting_external",
    "retry_scheduled",
    "succeeded",
    "failed",
    "cancelled",
    "expired",
  ],
  waiting_external: [
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "expired",
  ],
  retry_scheduled: [
    "queued",
    "waiting_external",
    "failed",
    "cancelled",
    "expired",
  ],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function canTransitionJobStatus(
  from: string,
  to: string
): to is CanonicalJobStatus {
  if (!CANONICAL_JOB_STATUSES.includes(from as CanonicalJobStatus))
    return false;
  return CANONICAL_JOB_TRANSITIONS[from as CanonicalJobStatus].includes(
    to as CanonicalJobStatus
  );
}

export function assertCanonicalJobTransition(from: string, to: string): void {
  if (!canTransitionJobStatus(from, to)) {
    throw new JobControlPlaneError(
      "JOB_TRANSITION_INVALID",
      `Job cannot transition from ${from} to ${to}`,
      {
        from,
        to,
        terminal:
          CANONICAL_JOB_STATUSES.includes(from as CanonicalJobStatus) &&
          CANONICAL_JOB_TRANSITIONS[from as CanonicalJobStatus].length === 0,
      }
    );
  }
}

export function assertCanonicalLeaseFence(input: {
  expectedAttemptId: string;
  actualAttemptId: string | null | undefined;
  expectedFencingVersion: number;
  actualFencingVersion: number | null | undefined;
}): void {
  if (
    input.expectedAttemptId !== input.actualAttemptId ||
    input.expectedFencingVersion !== input.actualFencingVersion
  ) {
    throw new JobControlPlaneError(
      "JOB_LEASE_STALE",
      "Job attempt lease is no longer active",
      {
        expectedAttemptId: input.expectedAttemptId,
        actualAttemptId: input.actualAttemptId ?? null,
        expectedFencingVersion: input.expectedFencingVersion,
        actualFencingVersion: input.actualFencingVersion ?? null,
      }
    );
  }
}

export type ExecutionClass =
  "short" | "long" | "external" | "cpu" | "gpu" | "scheduled";
export type JitterPolicy = "none" | "bounded" | "recorded";

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: JitterPolicy;
  deadlineMs: number;
  allowedErrorClasses: string[];
};

export type TimeoutPolicy = {
  softTimeoutMs: number;
  hardTimeoutMs: number;
};

export type ScheduleDefinition = {
  scheduleId: string;
  occurrenceKey: string;
  scheduleVersion?: string;
  timezone?: string;
  missedOccurrencePolicy?: "skip" | "coalesce" | "catch_up";
};

export type JobDefinition = {
  contractVersion: string;
  tenantId: string;
  requestedByUserId?: number;
  jobType: string;
  executionClass: ExecutionClass;
  priority?: number;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  schedule?: ScheduleDefinition;
  retryPolicy: RetryPolicy;
  timeoutPolicy: TimeoutPolicy;
  requiredCapabilities?: Record<string, unknown>;
};

export type JobDefinitionHash = string;

export type JobRef = { jobId: string; created: boolean };

export type LeaseContext = {
  jobId: string;
  attemptId: string;
  leaseToken: string;
  fencingVersion: number;
  expiresAt: string;
};

export type ProgressUpdate = {
  progress: number;
  stage: string;
  message?: string;
  measured?: Record<string, number | string | boolean>;
};

export interface JobReporter {
  heartbeat(lease: LeaseContext): Promise<void>;
  progress(lease: LeaseContext, input: ProgressUpdate): Promise<void>;
  waitForExternal(lease: LeaseContext, input: ExternalWait): Promise<void>;
  complete(lease: LeaseContext, result: JobResult): Promise<void>;
  fail(lease: LeaseContext, error: ClassifiedJobError): Promise<void>;
  assertActive(lease: LeaseContext): Promise<void>;
}

export type JobStart = {
  startedAt?: string;
};

export type ExternalWait = {
  operationKey: string;
  providerReference?: string;
  resumeAfter: string;
  metadata?: Record<string, unknown>;
};

export type JobResult = {
  resultRef?: string;
  output?: Record<string, unknown>;
  /** The executor deliberately released its lease and must be resumed later. */
  deferred?: boolean;
};

export type ClassifiedJobError = {
  code: string;
  message: string;
  class: "retryable" | "permanent" | "unknown";
  operatorReviewRequired?: boolean;
  metadata?: Record<string, unknown>;
};

export type DispatchRequest = {
  jobId: string;
  businessAttempt: number;
  attemptId?: string;
  outboxId: string;
  dedupeKey: string;
  contractVersion: string;
  routingMetadata: Record<string, unknown>;
};

export type DispatchRef = {
  jobId: string;
  attemptId?: string;
  adapter: string;
  referenceNamespace: string;
  dispatchId: string;
  dedupeKey: string;
  providerJobId?: string;
  queueJobId?: string;
  celeryTaskId?: string;
  workflowInstanceId?: string;
  containerInstanceId?: string;
};

export type JobEventType =
  | "CREATED"
  | "QUEUED"
  | "DISPATCH_REQUESTED"
  | "DISPATCH_ATTEMPTED"
  | "DISPATCHED"
  | "DISPATCH_FAILED"
  | "LEASE_ACQUIRED"
  | "STARTED"
  | "HEARTBEAT"
  | "PROGRESS"
  | "WAITING_EXTERNAL"
  | "WAITING_VERIFICATION"
  | "VERIFICATION_STARTED"
  | "VERIFICATION_COMPLETED"
  | "TIMEOUT"
  | "OPERATOR_ACTION"
  | "RETRY_SCHEDULED"
  | "LEASE_EXPIRED"
  | "RECOVERED"
  | "FAILED"
  | "COMPLETED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "EXPIRED"
  | "CALLBACK_ACCEPTED"
  | "CALLBACK_REJECTED"
  | "SETTLEMENT_RECORDED"
  | "RECONCILED"
  | "PROJECTION_REPAIRED";

export type OperatorJobAction = {
  actionId: string;
  jobId: string;
  command: "cancel" | "requeue" | "recover_checkpoint" | "force_fail";
  actorId?: number;
  reason: string;
  expectedStatus: string;
  expectedAttempt: number;
  expectedFencingVersion: number;
  authorizationScope?: string;
};

export type AuthenticatedJobCallback = {
  adapterNamespace: string;
  providerEventId?: string;
  replayKey?: string;
  occurredAt: string;
  tenantId?: string;
  jobId?: string;
  signatureVerified: boolean;
  payload: Record<string, unknown>;
};

export class JobControlPlaneError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "JobControlPlaneError";
  }
}
