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

export type CanonicalJobStatus = (typeof CANONICAL_JOB_STATUSES)[number];
export type ExecutionClass = "short" | "long" | "external" | "cpu" | "gpu" | "scheduled";
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

export type JobStart = {
  startedAt?: string;
};

export type ExternalWait = {
  operationKey: string;
  providerReference?: string;
  resumeAfter: string;
};

export type JobResult = {
  resultRef?: string;
  output?: Record<string, unknown>;
};

export type ClassifiedJobError = {
  code: string;
  message: string;
  class: "retryable" | "permanent" | "unknown";
  operatorReviewRequired?: boolean;
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
  | "TIMEOUT"
  | "OPERATOR_ACTION"
  | "RETRY_SCHEDULED"
  | "LEASE_EXPIRED"
  | "RECOVERED"
  | "FAILED"
  | "COMPLETED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "EXPIRED";

export class JobControlPlaneError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "JobControlPlaneError";
  }
}
