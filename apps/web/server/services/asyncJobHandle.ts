export type AsyncJobKind = "worker" | "media" | "skill" | "browser";

export type AsyncJobStatus =
  | "queued"
  | "running"
  | "waiting_for_poll"
  | "completed"
  | "failed"
  | "canceled"
  | "expired"
  | "unknown";

export interface AsyncJobHandle {
  kind: AsyncJobKind;
  provider: string;
  jobId: string;
  status: AsyncJobStatus;
  terminal: boolean;
  lastCheckedAt: string | null;
  nextPollAt: string | null;
  workflowRunId: string | null;
  teamId: string | null;
  roomId: string | null;
  resultSummary: string | null;
  failureReason: string | null;
  evidenceRefs: string[];
  retryCount: number | null;
  source: Record<string, unknown> | null;
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
}

function toStatus(value: unknown): AsyncJobStatus {
  if (value === "queued" || value === "running" || value === "waiting_for_poll" || value === "completed" || value === "failed" || value === "canceled" || value === "expired") {
    return value;
  }
  if (value === "done") return "completed";
  if (value === "error") return "failed";
  return "unknown";
}

function isTerminalStatus(status: AsyncJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "canceled" || status === "expired";
}

export function shouldPollAsyncJobHandle(handle: AsyncJobHandle | null | undefined): boolean {
  if (!handle) return false;
  if (handle.terminal) return false;
  return handle.status === "queued" || handle.status === "running" || handle.status === "waiting_for_poll" || handle.status === "unknown";
}

export function buildWorkerJobHandle(job: Record<string, unknown>): AsyncJobHandle {
  const status = toStatus(job.status);
  return {
    kind: "worker",
    provider: typeof job.runtimeType === "string" && job.runtimeType.trim() ? job.runtimeType : "worker-runtime",
    jobId: typeof job.id === "string" ? job.id : String(job.id ?? ""),
    status,
    terminal: isTerminalStatus(status),
    lastCheckedAt: toIsoDate(job.finishedAt ?? job.startedAt ?? job.updatedAt ?? job.createdAt),
    nextPollAt: toIsoDate(job.nextPollAt ?? null),
    workflowRunId: typeof job.workflowRunId === "string" ? job.workflowRunId : null,
    teamId: typeof job.teamId === "string" ? job.teamId : null,
    roomId: typeof job.roomId === "string" ? job.roomId : null,
    resultSummary: typeof job.statusReason === "string" ? job.statusReason : null,
    failureReason: typeof job.failureReason === "string" ? job.failureReason : null,
    evidenceRefs: [`worker-job:${String(job.id ?? "")}`],
    retryCount: typeof job.retryCount === "number" ? job.retryCount : null,
    source: {
      runtimeType: job.runtimeType ?? null,
      jobType: job.jobType ?? null,
      leaseOwnerToken: job.leaseOwnerToken ?? null,
    },
  };
}

export function buildMediaJobHandle(input: {
  jobId: string;
  status: unknown;
  provider?: string | null;
  workflowRunId?: string | null;
  teamId?: string | null;
  roomId?: string | null;
  resultSummary?: string | null;
  failureReason?: string | null;
  nextPollAt?: number | string | Date | null;
  submittedAt?: number | string | Date | null;
  retryCount?: number | null;
  source?: Record<string, unknown> | null;
}): AsyncJobHandle {
  const status = toStatus(input.status);
  return {
    kind: "media",
    provider: input.provider?.trim() || "media-jobs",
    jobId: input.jobId,
    status,
    terminal: isTerminalStatus(status),
    lastCheckedAt: toIsoDate(input.submittedAt ?? null),
    nextPollAt: toIsoDate(input.nextPollAt ?? null),
    workflowRunId: input.workflowRunId ?? null,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    resultSummary: input.resultSummary ?? null,
    failureReason: input.failureReason ?? null,
    evidenceRefs: [`media-job:${input.jobId}`],
    retryCount: input.retryCount ?? null,
    source: input.source ?? null,
  };
}

export function buildSkillTaskHandle(input: {
  taskId: string;
  status: unknown;
  skillId?: string | null;
  workflowRunId?: string | null;
  evidenceRefs?: string[];
  resultSummary?: string | null;
  failureReason?: string | null;
  nextPollAt?: number | string | Date | null;
  submittedAt?: number | string | Date | null;
}): AsyncJobHandle {
  const status = toStatus(input.status);
  return {
    kind: "skill",
    provider: input.skillId?.trim() || "skill-executor",
    jobId: input.taskId,
    status,
    terminal: isTerminalStatus(status),
    lastCheckedAt: toIsoDate(input.submittedAt ?? null),
    nextPollAt: toIsoDate(input.nextPollAt ?? null),
    workflowRunId: input.workflowRunId ?? null,
    teamId: null,
    roomId: null,
    resultSummary: input.resultSummary ?? null,
    failureReason: input.failureReason ?? null,
    evidenceRefs: input.evidenceRefs && input.evidenceRefs.length > 0 ? input.evidenceRefs : [`skill-task:${input.taskId}`],
    retryCount: null,
    source: {
      skillId: input.skillId ?? null,
    },
  };
}

export function buildBrowserTaskHandle(input: {
  taskId: string;
  executionId?: string | null;
  claimId?: string | null;
  status: unknown;
  workflowRunId?: string | null;
  nextPollAt?: number | string | Date | null;
  submittedAt?: number | string | Date | null;
  failureReason?: string | null;
}): AsyncJobHandle {
  const status = toStatus(input.status);
  return {
    kind: "browser",
    provider: "browser-automation",
    jobId: input.taskId,
    status,
    terminal: isTerminalStatus(status),
    lastCheckedAt: toIsoDate(input.submittedAt ?? null),
    nextPollAt: toIsoDate(input.nextPollAt ?? null),
    workflowRunId: input.workflowRunId ?? null,
    teamId: null,
    roomId: null,
    resultSummary: input.executionId ?? null,
    failureReason: input.failureReason ?? null,
    evidenceRefs: [`browser-task:${input.taskId}`, ...(input.claimId ? [`browser-claim:${input.claimId}`] : [])],
    retryCount: null,
    source: {
      executionId: input.executionId ?? null,
      claimId: input.claimId ?? null,
    },
  };
}

