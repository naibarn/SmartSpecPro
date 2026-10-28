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
  id?: string;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export type QueueBatch = {
  messages: readonly QueueMessage[];
  /** Set by the Cloudflare Queue runtime, not supplied in the message body. */
  queue?: string;
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

export type CloudflareWorkflowInstance = {
  id: string;
  status(): Promise<{ status: string }>;
  terminate(): Promise<void>;
};

export type CloudflareWorkflowBinding = {
  get(instanceId: string): Promise<CloudflareWorkflowInstance>;
  create(input: { id: string; params: CanonicalJobEnvelope }): Promise<CloudflareWorkflowInstance>;
};

export type CloudflareContainerBinding = {
  start(input: { instanceId: string; envelope: CanonicalJobEnvelope; assignment?: import("./runnerContainer").RunnerContainerAssignment }): Promise<{ id?: string; status?: string }>;
  find?(instanceId: string): Promise<{ id?: string; status?: string } | null>;
  stop?(instanceId: string): Promise<void>;
  probeMedia?(assignment: import("./runnerContainer").RunnerContainerAssignment, input: import("./containerMediaProbeContract").ContainerProbeInput): Promise<import("./containerMediaProbeContract").ContainerProbeResult>;
};

export type CloudflareWorkerAppBinding = {
  dispatch(input: { envelope: CanonicalJobEnvelope }): Promise<{ referenceId: string }>;
  findByDedupeKey?(dedupeKey: string): Promise<{ referenceId: string } | null>;
  cancel?(referenceId: string): Promise<void>;
};

export type R2ObjectBinding = {
  get?(key: string): Promise<{ size: number; body: ReadableStream<Uint8Array>; customMetadata?: Record<string, string> } | null>;
  put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch: string }; sha256?: string }): Promise<unknown>;
  head(key: string): Promise<{ size?: number; etag?: string; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> } | null>;
  delete(key: string): Promise<void>;
};

export type VectorIndexBinding = {
  upsert(records: readonly VectorRecord[]): Promise<unknown>;
  query(input: { vector: readonly number[]; topK: number; filter: { tenantId: string } }): Promise<unknown>;
  getByIds(ids: readonly string[]): Promise<unknown>;
  deleteByIds(ids: readonly string[]): Promise<unknown>;
};

export type CloudflareKvBinding = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
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

export type CloudflareEnvironment = import("./applicationHttpBridge").ApplicationHttpBindings & {
  CLOUDFLARE_ACTIVATION?: string;
  CLOUDFLARE_ENVIRONMENT?: string;
  /** Immutable opt-in for public catalog reads; no auth/download activation. */
  CLOUDFLARE_RUNNER_RELEASE_CATALOG?: string;
  CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT?: string;
  CLOUDFLARE_RUNNER_RELEASE_NAMESPACE?: string;
  /** Workflow-only activation never enables Queue delivery or Cron. */
  CLOUDFLARE_JOB_TRANSPORT?: string;
  CLOUDFLARE_WORKFLOW_TENANT_ID?: string;
  CLOUDFLARE_WORKFLOW_EXPIRES_AT?: string;
  /** Explicit immutable capability; absent keeps the existing Node executor. */
  CLOUDFLARE_WORKFLOW_DATABASE?: string;
  /** Production-only least-privilege lease fence implemented by the installed DB function. */
  CLOUDFLARE_PRODUCTION_FENCE_MODE?: string;
  /** Independently bounded system schedule; job transport never enables Cron. */
  CLOUDFLARE_RETENTION_SCHEDULE?: string;
  CLOUDFLARE_RETENTION_TENANT_ID?: string;
  CLOUDFLARE_RETENTION_EXPIRES_AT?: string;
  /** Exact registry digest approved for the private Runner DO deployment. */
  CLOUDFLARE_RUNNER_IMAGE_REF?: string;
  /** Independently admitted fixed operation; never enables arbitrary commands. */
  CLOUDFLARE_MEDIA_PROBE?: string;
  /** Required cost policy: absent never admits Container compute. */
  CLOUDFLARE_CONTAINER_POLICY?: string;
  CLOUDFLARE_RUNTIME_TOKEN?: string;
  /** Cloudflare-owned immutable version identity, populated by the runtime. */
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
  /** Ephemeral runtime metadata added by queue() for one real delivery. */
  __m3QueueDelivery?: { queueName: string; messageId: string; workerVersionId: string };
  CLOUDFLARE_CONTROL_PLANE_TOKEN?: string;
  CLOUDFLARE_SEARCH_CACHE_TOKEN?: string;
  CLOUDFLARE_SEARCH_CACHE_FAULT_TEST_ENABLED?: string;
  /** Pinned private origin for the existing Linux API/auth authority. */
  AUTH_ORIGIN?: string;
  /** Explicit HTTP-only production ingress; independent from native job readiness. */
  CLOUDFLARE_INGRESS_MODE?: string;
  /** Exact private hostname paired with AUTH_ORIGIN to prevent host injection. */
  AUTH_ORIGIN_PRIVATE_HOST?: string;
  /** Shared Worker-to-origin attestation secret; never exposed to clients. */
  AUTH_ORIGIN_TOKEN?: string;
  /** Dedicated Access service credentials; never reuse application Authorization. */
  AUTH_ORIGIN_ACCESS_CLIENT_ID?: string;
  AUTH_ORIGIN_ACCESS_CLIENT_SECRET?: string;
  /** JSON array of canonical HTTPS public origins allowed through this ingress. */
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS?: string;
  /** Public verification-key set for the stateless content-protection API. */
  CONTENT_PROTECTION_PUBLIC_KEYS_JSON?: string;
  /** Private, non-recursive platform origin that owns canonical authz and emergency transactions. */
  PLATFORM_EDGE_ORIGIN?: string;
  /** Exact hostname vetted by the deployment pipeline as the private platform origin. */
  PLATFORM_EDGE_PRIVATE_HOST?: string;
  /** Worker-to-platform credential; caller-supplied copies are always replaced. */
  PLATFORM_EDGE_TOKEN?: string;
  SEARCH_RESULT_CACHE?: CloudflareKvBinding;
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
  jobType: string;
  executionClass: string;
  input: Record<string, unknown>;
  requiredCapabilities?: Record<string, unknown>;
};

export type CanonicalClaim = {
  attemptId: string;
  leaseToken: string;
  fencingVersion: number;
  expiresAt?: string;
};

export type CanonicalJobResult = { resultRef?: string; output?: Record<string, unknown> };

/**
 * Injected boundary for the existing PostgreSQL control plane. The Worker
 * package owns no job tables; production wiring supplies these operations
 * through Hyperdrive and local tests supply a deterministic repository fake.
 */
export type CanonicalControlPlaneRepository = {
  loadJob(input: { jobId: string; cache: "no-store" }, envelope: CanonicalJobEnvelope): Promise<CanonicalControlPlaneJob | null>;
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
    result: CanonicalJobResult;
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
) => Promise<CanonicalJobResult | "retry">;

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
