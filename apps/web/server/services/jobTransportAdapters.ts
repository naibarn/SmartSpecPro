import type { Job as BullJob, Queue } from "bullmq";

import type { DispatchRef, DispatchRequest } from "./jobControlPlaneTypes";

export type TransportObservation = "unknown" | "published" | "consumed" | "failed";

export interface JobTransportAdapter {
  readonly name: string;
  readonly referenceNamespace: string;
  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean;
  publish(request: DispatchRequest): Promise<DispatchRef>;
  inspect(reference: DispatchRef): Promise<TransportObservation>;
  cancel?(reference: DispatchRef): Promise<void>;
}

export type BullMqQueueLike = Pick<Queue, "add" | "getJob">;

export class BullMqJobTransportAdapter implements JobTransportAdapter {
  readonly name = "bullmq";
  readonly referenceNamespace = "bullmq";

  constructor(
    private readonly queue: BullMqQueueLike,
    private readonly supportedContractVersions: ReadonlySet<string> = new Set(["feature-186-v1"]),
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return Boolean(input.jobType && input.executionClass && this.supportedContractVersions.has(input.contractVersion));
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const existing = await this.queue.getJob(request.dedupeKey);
    if (existing) {
      return {
        jobId: request.jobId,
        attemptId: request.attemptId,
        adapter: this.name,
        referenceNamespace: this.referenceNamespace,
        dispatchId: request.outboxId,
        dedupeKey: request.dedupeKey,
        queueJobId: String(existing.id),
      };
    }
    const job = await this.queue.add("unified-job", {
      jobId: request.jobId,
      businessAttempt: request.businessAttempt,
      attemptId: request.attemptId ?? null,
      contractVersion: request.contractVersion,
    }, {
      jobId: request.dedupeKey,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return {
      jobId: request.jobId,
      attemptId: request.attemptId,
      adapter: this.name,
      referenceNamespace: this.referenceNamespace,
      dispatchId: request.outboxId,
      dedupeKey: request.dedupeKey,
      queueJobId: String(job.id),
    };
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    if (!reference.queueJobId) return "unknown";
    const job = await this.queue.getJob(reference.queueJobId);
    if (!job) return "unknown";
    return bullJobObservation(job);
  }

  async cancel(reference: DispatchRef): Promise<void> {
    if (!reference.queueJobId) return;
    const job = await this.queue.getJob(reference.queueJobId);
    if (!job) return;
    await job.remove();
  }
}

function bullJobObservation(job: BullJob): TransportObservation {
  if (job.failedReason) return "failed";
  if (job.finishedOn) return "consumed";
  return "published";
}

export type CeleryPublisher = (input: {
  taskName: string;
  payload: Record<string, unknown>;
  taskId: string;
}) => Promise<{ taskId: string }>;

export type CeleryInspector = (taskId: string) => Promise<TransportObservation>;

export class CeleryJobTransportAdapter implements JobTransportAdapter {
  readonly name = "celery";
  readonly referenceNamespace = "celery";

  constructor(
    private readonly taskName: string,
    private readonly publishTask: CeleryPublisher,
    private readonly inspectTask: CeleryInspector = async () => "unknown",
    private readonly supportedContractVersions: ReadonlySet<string> = new Set(["feature-186-v1"]),
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return Boolean(input.jobType && input.executionClass && this.supportedContractVersions.has(input.contractVersion));
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const result = await this.publishTask({
      taskName: this.taskName,
      taskId: request.dedupeKey,
      payload: {
        job_id: request.jobId,
        business_attempt: request.businessAttempt,
        attempt_id: request.attemptId ?? null,
        contract_version: request.contractVersion,
      },
    });
    return {
      jobId: request.jobId,
      attemptId: request.attemptId,
      adapter: this.name,
      referenceNamespace: this.referenceNamespace,
      dispatchId: request.outboxId,
      dedupeKey: request.dedupeKey,
      celeryTaskId: result.taskId,
    };
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    return reference.celeryTaskId ? this.inspectTask(reference.celeryTaskId) : "unknown";
  }
}

/** Deterministic contract adapter used for failure-injection and future-provider tests. */
export class InMemoryJobTransportAdapter implements JobTransportAdapter {
  private readonly publications = new Map<string, DispatchRef>();
  private readonly consumed = new Set<string>();

  constructor(
    public readonly name: string,
    public readonly referenceNamespace = name,
    private readonly referenceKind: "queue" | "workflow" | "container" = "queue",
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return Boolean(input.jobType && input.executionClass && input.contractVersion === "feature-186-v1");
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const existing = this.publications.get(request.dedupeKey);
    if (existing) return existing;
    const id = `${this.referenceNamespace}:${request.dedupeKey}`;
    const reference: DispatchRef = {
      jobId: request.jobId,
      attemptId: request.attemptId,
      adapter: this.name,
      referenceNamespace: this.referenceNamespace,
      dispatchId: request.outboxId,
      dedupeKey: request.dedupeKey,
      ...(this.referenceKind === "workflow" ? { workflowInstanceId: id } : {}),
      ...(this.referenceKind === "container" ? { containerInstanceId: id } : { queueJobId: id }),
    };
    this.publications.set(request.dedupeKey, reference);
    return reference;
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    if (!this.publications.has(reference.dedupeKey)) return "unknown";
    return this.consumed.has(reference.dedupeKey) ? "consumed" : "published";
  }

  async cancel(reference: DispatchRef): Promise<void> {
    this.consumed.add(reference.dedupeKey);
  }

  markConsumed(dedupeKey: string): void {
    this.consumed.add(dedupeKey);
  }
}

export function assertAdapterSupports(adapter: JobTransportAdapter, input: Parameters<JobTransportAdapter["supports"]>[0]): void {
  if (!adapter.supports(input)) {
    throw new Error(`JOB_ADAPTER_UNSUPPORTED:${adapter.name}:${input.contractVersion}`);
  }
}
