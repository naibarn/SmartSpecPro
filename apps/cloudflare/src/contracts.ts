export const CLOUDFLARE_CONTRACT_VERSION = "feature-186-v1" as const;

export const REQUIRED_BINDING_NAMES = [
  "HYPERDRIVE",
  "JOB_QUEUE",
  "JOB_WORKFLOW",
  "JOB_CONTAINERS",
  "WORKER_APP",
  "MEDIA_BUCKET",
  "VECTOR_INDEX",
] as const;

export type RequiredBindingName = (typeof REQUIRED_BINDING_NAMES)[number];

export type CanonicalJobEnvelope = {
  job_id: string;
  business_attempt: number;
  attempt_id: string | null;
  contract_version: string;
  dispatch_id: string;
  dedupe_key: string;
  routing_metadata: Record<string, unknown>;
};

export type HyperdriveBinding = {
  connectionString?: string;
};

export type QueueMessage = {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export type QueueBatch = {
  messages: readonly QueueMessage[];
};

export type ScheduledController = {
  scheduledTime: number;
};

export type CloudflareQueueBinding = {
  send(message: CanonicalJobEnvelope): Promise<void>;
};

export type CanonicalPublicationRegistry = {
  has(dedupeKey: string): Promise<boolean>;
  record(dedupeKey: string): Promise<void>;
};

export type CloudflareWorkflowBinding = {
  get(instanceId: string): Promise<{ id?: string; status?: string } | null>;
  create(input: { id: string; params: CanonicalJobEnvelope }): Promise<{ id?: string; status?: string }>;
  terminate?(instanceId: string): Promise<void>;
};

export type CloudflareContainerBinding = {
  start(input: { instanceId: string; envelope: CanonicalJobEnvelope }): Promise<{ id?: string; status?: string }>;
  find?(instanceId: string): Promise<{ id?: string; status?: string } | null>;
  stop?(instanceId: string): Promise<void>;
};

export type CloudflareWorkerAppBinding = {
  dispatch(input: { envelope: CanonicalJobEnvelope }): Promise<{ referenceId: string }>;
  findByDedupeKey?(dedupeKey: string): Promise<{ referenceId: string } | null>;
  cancel?(referenceId: string): Promise<void>;
};

export type R2ObjectBinding = {
  put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  head(key: string): Promise<{ size?: number; etag?: string; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> } | null>;
  delete(key: string): Promise<void>;
};

export type VectorIndexBinding = {
  upsert(records: readonly VectorRecord[]): Promise<unknown>;
  query(input: { vector: readonly number[]; topK: number; filter: { tenantId: string } }): Promise<unknown>;
  getByIds(ids: readonly string[]): Promise<unknown>;
  deleteByIds(ids: readonly string[]): Promise<unknown>;
};

export type VectorRecord = {
  id: string;
  values: readonly number[];
  metadata: {
    tenantId: string;
    sourceJobId: string;
    sourceRevision: string;
  };
};

export type CloudflareEnvironment = {
  CLOUDFLARE_ACTIVATION?: string;
  CLOUDFLARE_ENVIRONMENT?: string;
  CLOUDFLARE_RUNTIME_TOKEN?: string;
  HYPERDRIVE?: HyperdriveBinding;
  JOB_QUEUE?: CloudflareQueueBinding;
  JOB_WORKFLOW?: CloudflareWorkflowBinding;
  JOB_CONTAINERS?: CloudflareContainerBinding;
  WORKER_APP?: CloudflareWorkerAppBinding;
  MEDIA_BUCKET?: R2ObjectBinding;
  VECTOR_INDEX?: VectorIndexBinding;
};

export type CanonicalJobHandler = (
  envelope: CanonicalJobEnvelope,
  env: CloudflareEnvironment,
) => Promise<"completed" | "retry" | "quarantined">;

export type CanonicalControlPlaneJob = {
  jobId: string;
  tenantId: string;
  contractVersion: string;
  businessAttempt: number;
  status: string;
  operatorReviewRequired: boolean;
};

export type CanonicalClaim = {
  attemptId: string;
  leaseToken: string;
  fencingVersion: number;
};

/**
 * Injected boundary for the existing PostgreSQL control plane. The Worker
 * package owns no job tables; production wiring supplies these operations
 * through Hyperdrive and local tests supply a deterministic repository fake.
 */
export type CanonicalControlPlaneRepository = {
  loadJob(input: { jobId: string; cache: "no-store" }): Promise<CanonicalControlPlaneJob | null>;
  recordDispatch(input: {
    jobId: string;
    businessAttempt: number;
    dispatchId: string;
    dedupeKey: string;
  }): Promise<"recorded" | "duplicate">;
  claim(input: {
    job: CanonicalControlPlaneJob;
    envelope: CanonicalJobEnvelope;
  }): Promise<CanonicalClaim | "already_terminal" | "retry" | "quarantine">;
  complete(input: {
    job: CanonicalControlPlaneJob;
    envelope: CanonicalJobEnvelope;
    claim: CanonicalClaim;
  }): Promise<"completed" | "duplicate" | "retry" | "quarantine">;
  retry(input: {
    job: CanonicalControlPlaneJob;
    envelope: CanonicalJobEnvelope;
    claim: CanonicalClaim;
    reason: string;
  }): Promise<"retry" | "quarantined">;
};

export type CanonicalWorkerExecution = (
  input: {
    job: CanonicalControlPlaneJob;
    envelope: CanonicalJobEnvelope;
    claim: CanonicalClaim;
    env: CloudflareEnvironment;
  },
) => Promise<"completed" | "retry">;

export type QuarantineHandler = (
  input: { envelope: CanonicalJobEnvelope | null; reason: string },
  env: CloudflareEnvironment,
) => Promise<boolean>;

/**
 * A scheduled sweep is an acceleration signal for durable PostgreSQL poll
 * records. It must claim bounded rows and persist every outcome; it must not
 * keep a Worker request alive while a provider runs.
 */
export type ProviderPollSweepHandler = (
  input: { scheduledTime: number; maxRows: number },
  env: CloudflareEnvironment,
) => Promise<"completed" | "retry">;

/**
 * Cron only creates/advances durable job intents. It must not perform the
 * scheduled business side effect inline in the Worker request.
 */
export type ScheduledJobSweepHandler = (
  input: { scheduledTime: number; maxRows: number },
  env: CloudflareEnvironment,
) => Promise<"completed" | "retry">;
