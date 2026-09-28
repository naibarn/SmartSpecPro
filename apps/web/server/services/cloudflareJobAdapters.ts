import type { DispatchRef, DispatchRequest, JobDefinition, JobRef, ScheduleDefinition } from "./jobControlPlaneTypes";
import { JobControlPlaneError } from "./jobControlPlaneTypes";
import { validateScheduleOccurrence, type ScheduleOccurrenceInput } from "./jobScheduler";
import type { JobTransportAdapter, TransportObservation } from "./jobTransportAdapters";

const DEFAULT_CONTRACT_VERSIONS = new Set(["feature-186-v1"]);
const MAX_ROUTING_METADATA_BYTES = 4_096;
const MAX_STRING_BYTES = 512;
const MAX_JSON_DEPTH = 4;
const ALLOWED_ROUTING_KEYS = new Set([
  "queue",
  "region",
  "workflowName",
  "containerClass",
  "workerApp",
  "requiredCapabilities",
]);
const FORBIDDEN_KEY = /(secret|token|password|credential|authorization|signed.?url|private.?key)/i;
const FORBIDDEN_VALUE = /^(?:https?:|data:|file:|postgres(?:ql)?:)/i;

export type CloudflareJobEnvelope = {
  job_id: string;
  business_attempt: number;
  attempt_id: string | null;
  contract_version: string;
  dispatch_id: string;
  dedupe_key: string;
  routing_metadata: Record<string, unknown>;
};

export type CloudflareProviderHandle = {
  id?: string;
  status?: string;
};

export type CloudflareQueueBinding = {
  /** Cloudflare Queues accepts the message but does not expose a queryable message id. */
  send(message: CloudflareJobEnvelope): Promise<void>;
};

export type CloudflareQueueInspector = (reference: DispatchRef) => Promise<TransportObservation>;

export type CloudflareWorkflowBinding = {
  get(instanceId: string): Promise<CloudflareProviderHandle | null>;
  create(input: { id: string; params: CloudflareJobEnvelope }): Promise<CloudflareProviderHandle>;
  terminate?(instanceId: string): Promise<void>;
};

export type CloudflareContainerBinding = {
  /** The binding must make start idempotent for the supplied instanceId. */
  start(input: { instanceId: string; envelope: CloudflareJobEnvelope }): Promise<CloudflareProviderHandle>;
  find?(instanceId: string): Promise<CloudflareProviderHandle | null>;
  inspect?(instanceId: string): Promise<TransportObservation>;
  stop?(instanceId: string): Promise<void>;
};

export type CloudflareWorkerAppBinding = {
  dispatch(input: { envelope: CloudflareJobEnvelope }): Promise<{ referenceId: string }>;
  findByDedupeKey?(dedupeKey: string): Promise<{ referenceId: string } | null>;
  inspect?(referenceId: string): Promise<TransportObservation>;
  cancel?(referenceId: string): Promise<void>;
};

export type CloudflareAdapterBindings = {
  queues?: CloudflareQueueBinding;
  queueInspector?: CloudflareQueueInspector;
  workflows?: CloudflareWorkflowBinding;
  containers?: CloudflareContainerBinding;
  workerApp?: CloudflareWorkerAppBinding;
};

export type CloudflareCronJobCreator = (definition: JobDefinition) => Promise<JobRef>;

export type CloudflareCronOccurrenceRequest = Omit<ScheduleOccurrenceInput, "occurrenceKey" | "expectedTenantId"> & {
  occurrenceKey?: string;
  contractVersion?: string;
  jobType: string;
  executionClass: JobDefinition["executionClass"];
  input: Record<string, unknown>;
  priority?: number;
  requiredCapabilities?: Record<string, unknown>;
  retryPolicy?: JobDefinition["retryPolicy"];
  timeoutPolicy?: JobDefinition["timeoutPolicy"];
};

export type CloudflareLocalContractReadiness = {
  localContractReady: boolean;
  productionProof: false;
  targetAccountProof: false;
  components: {
    queues: boolean;
    workflows: boolean;
    containers: boolean;
    cron: boolean;
    workerApp: boolean;
  };
};

function assertString(value: unknown, field: string, maxBytes = MAX_STRING_BYTES): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} is invalid`);
  }
}

function assertSafeJson(value: unknown, field: string, depth = 0): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} is too deeply nested`);
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} contains an invalid number`);
    return;
  }
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE.test(value)) {
      throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} contains a forbidden value`);
    }
    if (new TextEncoder().encode(value).byteLength > MAX_STRING_BYTES) {
      throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} contains an oversized string`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 32) throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} contains too many values`);
    value.forEach((item, index) => assertSafeJson(item, `${field}[${index}]`, depth + 1));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key) || key.length > 80) {
        throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} contains a forbidden key`);
      }
      assertSafeJson(item, `${field}.${key}`, depth + 1);
    }
    return;
  }
  throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", `${field} is not JSON-compatible`);
}

function safeRoutingMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", "routing metadata is invalid");
  }
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_ROUTING_KEYS.has(key) || FORBIDDEN_KEY.test(key)) {
      throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", "routing metadata contains an unsupported key");
    }
    assertSafeJson(value, `routing_metadata.${key}`);
    safe[key] = value;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(safe);
  } catch {
    throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", "routing metadata is not serializable");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_ROUTING_METADATA_BYTES) {
    throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", "routing metadata is too large");
  }
  // Detach nested values from the persisted envelope so a caller cannot
  // mutate routing metadata while an async binding is serializing it.
  return JSON.parse(serialized) as Record<string, unknown>;
}

function buildEnvelope(request: DispatchRequest, supportedContractVersions: ReadonlySet<string>): CloudflareJobEnvelope {
  assertString(request.jobId, "jobId");
  assertString(request.outboxId, "outboxId");
  assertString(request.dedupeKey, "dedupeKey");
  assertString(request.contractVersion, "contractVersion");
  if (!supportedContractVersions.has(request.contractVersion)) {
    throw new JobControlPlaneError("JOB_ADAPTER_UNSUPPORTED", `Unsupported Cloudflare contract version: ${request.contractVersion}`);
  }
  if (!Number.isInteger(request.businessAttempt) || request.businessAttempt < 1) {
    throw new JobControlPlaneError("CLOUDFLARE_ADAPTER_INVALID_REQUEST", "businessAttempt is invalid");
  }
  if (request.attemptId !== undefined) assertString(request.attemptId, "attemptId");
  return {
    job_id: request.jobId,
    business_attempt: request.businessAttempt,
    attempt_id: request.attemptId ?? null,
    contract_version: request.contractVersion,
    dispatch_id: request.outboxId,
    dedupe_key: request.dedupeKey,
    routing_metadata: safeRoutingMetadata(request.routingMetadata),
  };
}

function supportsContract(
  input: { jobType: string; executionClass: string; contractVersion: string },
  supportedContractVersions: ReadonlySet<string>,
  supportedExecutionClasses?: ReadonlySet<string>,
): boolean {
  return Boolean(
    input.jobType
    && input.executionClass
    && supportedContractVersions.has(input.contractVersion)
    && (!supportedExecutionClasses || supportedExecutionClasses.has(input.executionClass)),
  );
}

function baseReference(request: DispatchRequest, adapter: string, referenceNamespace: string): DispatchRef {
  return {
    jobId: request.jobId,
    attemptId: request.attemptId,
    adapter,
    referenceNamespace,
    dispatchId: request.outboxId,
    dedupeKey: request.dedupeKey,
  };
}

async function deterministicProviderId(prefix: string, dedupeKey: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(dedupeKey));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

function providerObservation(status?: string): TransportObservation {
  switch (status?.toLowerCase()) {
    case "failed":
    case "error":
    case "terminated":
      return "failed";
    case "completed":
    case "complete":
    case "succeeded":
    case "success":
      return "consumed";
    case "queued":
    case "running":
    case "paused":
    case "waiting":
      return "published";
    default:
      return "unknown";
  }
}

export class CloudflareQueuesJobTransportAdapter implements JobTransportAdapter {
  readonly name = "cloudflare-queues";
  readonly referenceNamespace = "cloudflare-queues";

  constructor(
    private readonly queue: CloudflareQueueBinding,
    private readonly inspectPublication?: CloudflareQueueInspector,
    private readonly supportedContractVersions: ReadonlySet<string> = DEFAULT_CONTRACT_VERSIONS,
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return supportsContract(input, this.supportedContractVersions);
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const envelope = buildEnvelope(request, this.supportedContractVersions);
    await this.queue.send(envelope);
    // Queues does not return a queryable provider message id. dispatchId and
    // dedupeKey remain the durable local publication identity.
    return baseReference(request, this.name, this.referenceNamespace);
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    return this.inspectPublication ? this.inspectPublication(reference) : "unknown";
  }
}

export class CloudflareWorkflowsJobTransportAdapter implements JobTransportAdapter {
  readonly name = "cloudflare-workflows";
  readonly referenceNamespace = "cloudflare-workflows";

  constructor(
    private readonly workflows: CloudflareWorkflowBinding,
    private readonly supportedContractVersions: ReadonlySet<string> = DEFAULT_CONTRACT_VERSIONS,
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return supportsContract(input, this.supportedContractVersions);
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const envelope = buildEnvelope(request, this.supportedContractVersions);
    const workflowInstanceId = await deterministicProviderId("cfw", request.dedupeKey);
    const existing = await this.workflows.get(workflowInstanceId);
    if (existing) return { ...baseReference(request, this.name, this.referenceNamespace), workflowInstanceId };

    try {
      const created = await this.workflows.create({ id: workflowInstanceId, params: envelope });
      if (created.id && created.id !== workflowInstanceId) {
        throw new JobControlPlaneError("CLOUDFLARE_WORKFLOW_ID_MISMATCH", "Workflow returned a different instance identity");
      }
    } catch (error) {
      if (error instanceof JobControlPlaneError && error.code === "CLOUDFLARE_WORKFLOW_ID_MISMATCH") throw error;
      // Resolve a lost response before allowing the outbox to retry. The
      // deterministic id makes this lookup safe and provider-neutral.
      const recovered = await this.workflows.get(workflowInstanceId);
      if (!recovered) throw error;
    }
    return { ...baseReference(request, this.name, this.referenceNamespace), workflowInstanceId };
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    if (!reference.workflowInstanceId) return "unknown";
    const handle = await this.workflows.get(reference.workflowInstanceId);
    return handle ? (handle.status ? providerObservation(handle.status) : "published") : "unknown";
  }

  async cancel(reference: DispatchRef): Promise<void> {
    if (reference.workflowInstanceId && this.workflows.terminate) {
      await this.workflows.terminate(reference.workflowInstanceId);
    }
  }
}

export class CloudflareContainersJobTransportAdapter implements JobTransportAdapter {
  readonly name = "cloudflare-containers";
  readonly referenceNamespace = "cloudflare-containers";

  constructor(
    private readonly containers: CloudflareContainerBinding,
    private readonly supportedExecutionClasses: ReadonlySet<string> = new Set(["long", "cpu", "gpu"]),
    private readonly supportedContractVersions: ReadonlySet<string> = DEFAULT_CONTRACT_VERSIONS,
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return supportsContract(input, this.supportedContractVersions, this.supportedExecutionClasses);
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const envelope = buildEnvelope(request, this.supportedContractVersions);
    const containerInstanceId = await deterministicProviderId("cfc", request.dedupeKey);
    const existing = this.containers.find ? await this.containers.find(containerInstanceId) : null;
    if (!existing) {
      try {
        await this.containers.start({ instanceId: containerInstanceId, envelope });
      } catch (error) {
        const recovered = this.containers.find ? await this.containers.find(containerInstanceId) : null;
        if (!recovered) throw error;
      }
    }
    return { ...baseReference(request, this.name, this.referenceNamespace), containerInstanceId };
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    if (!reference.containerInstanceId) return "unknown";
    if (this.containers.inspect) return this.containers.inspect(reference.containerInstanceId);
    if (this.containers.find) return (await this.containers.find(reference.containerInstanceId)) ? "published" : "unknown";
    return "unknown";
  }

  async cancel(reference: DispatchRef): Promise<void> {
    if (reference.containerInstanceId && this.containers.stop) {
      await this.containers.stop(reference.containerInstanceId);
    }
  }
}

export class CloudflareWorkerAppJobTransportAdapter implements JobTransportAdapter {
  readonly name = "cloudflare-worker-app";
  readonly referenceNamespace = "cloudflare-worker-app";

  constructor(
    private readonly workerApp: CloudflareWorkerAppBinding,
    private readonly supportedContractVersions: ReadonlySet<string> = DEFAULT_CONTRACT_VERSIONS,
  ) {}

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return supportsContract(input, this.supportedContractVersions);
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const envelope = buildEnvelope(request, this.supportedContractVersions);
    const existing = this.workerApp.findByDedupeKey ? await this.workerApp.findByDedupeKey(request.dedupeKey) : null;
    if (existing) {
      assertString(existing.referenceId, "worker app referenceId");
      return this.reference(request, existing.referenceId);
    }
    try {
      const result = await this.workerApp.dispatch({ envelope });
      assertString(result.referenceId, "worker app referenceId");
      return this.reference(request, result.referenceId);
    } catch (error) {
      const recovered = this.workerApp.findByDedupeKey ? await this.workerApp.findByDedupeKey(request.dedupeKey) : null;
      if (recovered) {
        assertString(recovered.referenceId, "worker app referenceId");
        return this.reference(request, recovered.referenceId);
      }
      throw error;
    }
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    return reference.providerJobId && this.workerApp.inspect
      ? this.workerApp.inspect(reference.providerJobId)
      : "unknown";
  }

  async cancel(reference: DispatchRef): Promise<void> {
    if (reference.providerJobId && this.workerApp.cancel) await this.workerApp.cancel(reference.providerJobId);
  }

  private reference(request: DispatchRequest, referenceId: string): DispatchRef {
    return { ...baseReference(request, this.name, this.referenceNamespace), providerJobId: referenceId };
  }
}

export class CloudflareCronSchedulerAdapter {
  readonly name = "cloudflare-cron";

  constructor(
    private readonly createJob: CloudflareCronJobCreator,
    private readonly expectedTenantId: string,
  ) {}

  async createOccurrence(input: CloudflareCronOccurrenceRequest): Promise<JobRef> {
    const schedule: ScheduleDefinition = validateScheduleOccurrence({ ...input, expectedTenantId: this.expectedTenantId });
    return this.createJob({
      contractVersion: input.contractVersion ?? "feature-186-v1",
      tenantId: input.tenantId,
      jobType: input.jobType,
      executionClass: input.executionClass,
      priority: input.priority,
      input: input.input,
      requiredCapabilities: input.requiredCapabilities,
      retryPolicy: input.retryPolicy ?? {
        maxAttempts: 3,
        baseDelayMs: 5_000,
        maxDelayMs: 15 * 60_000,
        jitter: "bounded",
        deadlineMs: 6 * 60 * 60 * 1000,
        allowedErrorClasses: ["retryable", "timeout", "unavailable"],
      },
      timeoutPolicy: input.timeoutPolicy ?? {
        softTimeoutMs: 10 * 60_000,
        hardTimeoutMs: 30 * 60 * 1000,
      },
      schedule,
    });
  }
}

/**
 * Build only the adapters for bindings that are actually injected. This keeps
 * local tests and the future Worker entrypoint free of credentials and avoids
 * enabling a partially configured provider registry by accident.
 */
export function createCloudflareTransportAdapters(bindings: CloudflareAdapterBindings): ReadonlyMap<string, JobTransportAdapter> {
  const adapters = new Map<string, JobTransportAdapter>();
  if (bindings.queues) {
    const adapter = new CloudflareQueuesJobTransportAdapter(bindings.queues, bindings.queueInspector);
    adapters.set(adapter.name, adapter);
  }
  if (bindings.workflows) {
    const adapter = new CloudflareWorkflowsJobTransportAdapter(bindings.workflows);
    adapters.set(adapter.name, adapter);
  }
  if (bindings.containers) {
    const adapter = new CloudflareContainersJobTransportAdapter(bindings.containers);
    adapters.set(adapter.name, adapter);
  }
  if (bindings.workerApp) {
    const adapter = new CloudflareWorkerAppJobTransportAdapter(bindings.workerApp);
    adapters.set(adapter.name, adapter);
  }
  return adapters;
}

export function getCloudflareLocalContractReadiness(): CloudflareLocalContractReadiness {
  return {
    localContractReady: true,
    productionProof: false,
    targetAccountProof: false,
    components: {
      queues: true,
      workflows: true,
      containers: true,
      cron: true,
      workerApp: true,
    },
  };
}
