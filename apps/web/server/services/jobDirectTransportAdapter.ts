import type { JobControlPlane } from "./jobControlPlane";
import type { DispatchRef, DispatchRequest } from "./jobControlPlaneTypes";
import type { JobTransportAdapter, TransportObservation } from "./jobTransportAdapters";
import type { JobExecutorRegistry } from "./jobExecutorRegistry";
import { executeCanonicalJobEnvelope } from "../jobs/unifiedJobConsumer";

/**
 * PostgreSQL-backed execution boundary for short, migrated jobs.
 * The outbox remains the durable queue; this adapter executes only after the
 * outbox row exists and never introduces a second job identity.
 */
export class DirectJobTransportAdapter implements JobTransportAdapter {
  readonly name = "postgres-direct";
  readonly referenceNamespace = "postgres-direct";
  private readonly observations = new Map<string, TransportObservation>();

  constructor(
    private readonly dependencies: {
      controlPlane: JobControlPlane;
      executorRegistry: JobExecutorRegistry;
      runnerId: string;
    },
    private readonly supportedJobTypes: ReadonlySet<string>,
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return this.supportedJobTypes.has(input.jobType) && input.contractVersion === "feature-186-v1";
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const existing = this.observations.get(request.dedupeKey);
    if (existing === "consumed") return this.reference(request);

    this.observations.set(request.dedupeKey, "published");
    try {
      await executeCanonicalJobEnvelope({
        jobId: request.jobId,
        contractVersion: request.contractVersion,
        businessAttempt: request.businessAttempt,
        attemptId: request.attemptId,
      }, {
        controlPlane: this.dependencies.controlPlane,
        executorRegistry: this.dependencies.executorRegistry,
        runnerId: this.dependencies.runnerId,
        adapter: this.name,
      });
      this.observations.set(request.dedupeKey, "consumed");
    } catch (error) {
      // The control-plane executor already records the guarded failure and
      // retry decision. Re-throw so an unavailable DB or uncommitted claim
      // leaves the outbox unpublished and recoverable.
      this.observations.set(request.dedupeKey, "failed");
      throw error;
    }
    return this.reference(request);
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    return this.observations.get(reference.dedupeKey) ?? "unknown";
  }

  async cancel(reference: DispatchRef): Promise<void> {
    this.observations.set(reference.dedupeKey, "failed");
  }

  private reference(request: DispatchRequest): DispatchRef {
    return {
      jobId: request.jobId,
      attemptId: request.attemptId,
      adapter: this.name,
      referenceNamespace: this.referenceNamespace,
      dispatchId: request.outboxId,
      dedupeKey: request.dedupeKey,
      queueJobId: `direct:${request.dedupeKey}`,
    };
  }
}
