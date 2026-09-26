import { and, eq } from "drizzle-orm";

import type { DispatchRef, DispatchRequest } from "./jobControlPlaneTypes";
import { db, getDb } from "../db";
import { workerJobDispatches } from "../../drizzle/schema";
import {
  CONTENT_PROTECTION_CONTRACT_VERSION,
  CONTENT_PROTECTION_VERIFY_CONTRACT_VERSION,
} from "../../shared/contentProtectionWorker";

/**
 * Canonical transports carry the envelope unchanged. Keep every contract
 * executed by the canonical Node worker explicitly admitted here so the
 * outbox cannot quarantine a valid job before a worker can claim it.
 */
export const CANONICAL_JOB_CONTRACT_VERSIONS: ReadonlySet<string> = new Set([
  "feature-186-v1",
  CONTENT_PROTECTION_CONTRACT_VERSION,
  CONTENT_PROTECTION_VERIFY_CONTRACT_VERSION,
]);

export type TransportObservation = "unknown" | "published" | "consumed" | "failed";

export interface JobTransportAdapter {
  readonly name: string;
  readonly referenceNamespace: string;
  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean;
  publish(request: DispatchRequest): Promise<DispatchRef>;
  inspect(reference: DispatchRef): Promise<TransportObservation>;
  cancel?(reference: DispatchRef): Promise<void>;
}

/**
 * PostgreSQL-pull publication boundary. Publication is recorded in the
 * outbox/dispatch ledger; a dedicated Python worker polls the ready endpoint
 * and claims the canonical row. No Redis, Celery broker, or result backend is
 * involved in this adapter.
 */
export class PostgresPullJobTransportAdapter implements JobTransportAdapter {
  readonly name = "postgres-pull";
  readonly referenceNamespace = "postgres-pull";

  constructor(private readonly supportedContractVersions: ReadonlySet<string> = CANONICAL_JOB_CONTRACT_VERSIONS) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return Boolean(input.jobType && input.executionClass && this.supportedContractVersions.has(input.contractVersion));
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    return {
      jobId: request.jobId,
      attemptId: request.attemptId,
      adapter: this.name,
      referenceNamespace: this.referenceNamespace,
      dispatchId: request.outboxId,
      dedupeKey: request.dedupeKey,
      queueJobId: `postgres-pull:${request.dedupeKey}`,
    };
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    // A missing control-plane connection is an unknown observation, not
    // evidence that publication succeeded. The outbox/reconciler treats this
    // as fail-closed and retries once PostgreSQL is available.
    if (!process.env.DATABASE_URL) return "unknown";
    getDb();
    const [dispatch] = await db
      .select({ publicationStatus: workerJobDispatches.publicationStatus, consumedAt: workerJobDispatches.consumedAt })
      .from(workerJobDispatches)
      .where(and(
        eq(workerJobDispatches.adapter, this.name),
        eq(workerJobDispatches.dedupeKey, reference.dedupeKey),
      ))
      .limit(1);
    if (!dispatch) return "unknown";
    if (dispatch.publicationStatus === "failed") return "failed";
    if (dispatch.consumedAt || dispatch.publicationStatus === "consumed") return "consumed";
    return dispatch.publicationStatus === "published" ? "published" : "unknown";
  }
}

/**
 * Cloudflare Queues publication boundary used by the production hard cutover.
 *
 * The web origin never receives Cloudflare bindings directly. It posts the
 * already-committed canonical envelope to the deployment-owned Worker, which
 * performs the native Queue send. A response-loss is deliberately reported as
 * unknown; the Worker must provide a queryable dedupe boundary before this
 * adapter can be promoted beyond the target-account gate.
 */
export class CloudflareQueueHttpJobTransportAdapter implements JobTransportAdapter {
  readonly name = "cloudflare-queues";
  readonly referenceNamespace = "cloudflare-queues";

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly supportedContractVersions: ReadonlySet<string> = CANONICAL_JOB_CONTRACT_VERSIONS,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!baseUrl.trim() || !token.trim()) throw new Error("CLOUDFLARE_RUNTIME_CONFIG_INCOMPLETE");
  }

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return Boolean(input.jobType && input.executionClass && this.supportedContractVersions.has(input.contractVersion));
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/internal/jobs/publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          job_id: request.jobId,
          business_attempt: request.businessAttempt,
          attempt_id: request.attemptId ?? null,
          contract_version: request.contractVersion,
          dispatch_id: request.outboxId,
          dedupe_key: request.dedupeKey,
          routing_metadata: request.routingMetadata,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`CLOUDFLARE_QUEUE_PUBLISH_HTTP_${response.status}`);
      const body = await response.json() as { dispatchId?: unknown };
      const dispatchId = typeof body.dispatchId === "string" && body.dispatchId.trim()
        ? body.dispatchId
        : request.dedupeKey;
      return {
        jobId: request.jobId,
        attemptId: request.attemptId,
        adapter: this.name,
        referenceNamespace: this.referenceNamespace,
        dispatchId,
        dedupeKey: request.dedupeKey,
        queueJobId: dispatchId,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async inspect(_reference: DispatchRef): Promise<TransportObservation> {
    return "unknown";
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
