import {
  JobControlPlaneError,
  type ExecutionClass,
  type JobDefinition,
  type JobRef,
  type RetryPolicy,
  type ScheduleDefinition,
  type TimeoutPolicy,
} from "./jobControlPlaneTypes";
import {
  createJobControlPlane,
  type CreateJobOptions,
} from "./jobControlPlane";
import {
  defaultJobExecutorRegistry,
  type JobExecutorRegistry,
} from "./jobExecutorRegistry";
import {
  assertGoogleRuntimeDisabled,
  isFeature186HardCutoverEnabled,
} from "./cloudflareRuntimeTarget";
import {
  CLOUDFLARE_STAGING_ORIGIN_CONTRACT,
  cloudflareStagingOriginGrantSchema,
  cloudflareStagingOriginJobSchema,
} from "./cloudflareStagingOriginContract";
import type { CloudflareStagingGrant } from "./cloudflareStagingDeploymentExecutor";

const CLOUDFLARE_STAGING_JOB_TYPE = "cloudflare.staging.deploy";
const CLOUDFLARE_STAGING_SYSTEM_AUTHORITY = "cloudflare.staging.grant.execute";
const CLOUDFLARE_STAGING_JOB_DEADLINE_CAP_MS = 30 * 60 * 1000;

export type JobServerContext = {
  tenantId: string;
  actorType: "user" | "admin" | "system";
  actorId?: number;
  authorizationScope: string;
  correlationId: string;
  idempotencyKey?: string;
};

export type GatewayJobDefinition = {
  contractVersion: string;
  jobType: string;
  executionClass: ExecutionClass;
  priority?: number;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  activeDedupeKey?: string;
  retryPolicy: RetryPolicy;
  timeoutPolicy: TimeoutPolicy;
  requiredCapabilities?: Record<string, unknown>;
  schedule?: ScheduleDefinition;
};

export type CreateControlPlaneJobInput = {
  context: JobServerContext;
  definition: GatewayJobDefinition;
  controlPlane?: ReturnType<typeof createJobControlPlane>;
  executorRegistry?: JobExecutorRegistry;
  createOptions?: Omit<CreateJobOptions, "requestedBySystemComponent">;
  /** Test seam for the existing approval authority; never read from a request body. */
  resolveCloudflareStagingGrant?: (grantRef: string) => Promise<CloudflareStagingGrant | null>;
};

async function bindApprovedCloudflareStagingJob(input: CreateControlPlaneJobInput) {
  const { context, definition } = input;
  if (definition.jobType !== CLOUDFLARE_STAGING_JOB_TYPE || definition.contractVersion !== CLOUDFLARE_STAGING_ORIGIN_CONTRACT) {
    return null;
  }
  if (definition.executionClass !== "long") {
    throw new JobControlPlaneError("CLOUDFLARE_STAGING_JOB_INVALID", "Staging deployment must use the long job class");
  }
  if (context.actorType === "system" && context.authorizationScope !== CLOUDFLARE_STAGING_SYSTEM_AUTHORITY) {
    throw new JobControlPlaneError("CLOUDFLARE_STAGING_SYSTEM_SCOPE_DENIED", "System staging submission requires its exact grant scope");
  }

  const parsedJob = cloudflareStagingOriginJobSchema.safeParse(definition.input);
  if (!parsedJob.success) {
    throw new JobControlPlaneError("CLOUDFLARE_STAGING_JOB_INVALID", "Staging job input is invalid");
  }
  const resolver = input.resolveCloudflareStagingGrant ?? (async (grantRef: string) => {
    const runtime = await import("./cloudflareStagingDeploymentRuntime");
    return runtime.resolveCloudflareStagingGrantForJobCreation(grantRef);
  });
  const grantValue = await resolver(parsedJob.data.grantRef);
  const resolvedGrant = grantValue as (CloudflareStagingGrant & { revoked?: boolean }) | null;
  const revokedStateValid = resolvedGrant?.revoked === false;
  const grantDocument: Record<string, unknown> = resolvedGrant ? { ...resolvedGrant } : {};
  delete grantDocument.revoked;
  const parsedGrant = cloudflareStagingOriginGrantSchema.safeParse(grantDocument);
  if (!revokedStateValid || !parsedGrant.success || parsedGrant.data.grantRef !== parsedJob.data.grantRef) {
    throw new JobControlPlaneError("CLOUDFLARE_STAGING_GRANT_UNAVAILABLE", "An active owner-approved staging grant is required");
  }
  const grant = parsedGrant.data;
  const requesterMatches = context.actorType === "system"
    ? true
    : context.actorId === grant.requesterUserId;
  const exactActionMatch = parsedJob.data.action === grant.actions[0];
  const exactArtifactMatch = parsedJob.data.projectId === grant.projectId &&
    parsedJob.data.targetId === grant.targetId && parsedJob.data.environment === grant.environment &&
    parsedJob.data.artifactRef === grant.artifactRef && parsedJob.data.sourceSha === grant.sourceSha &&
    parsedJob.data.buildDigest === grant.buildDigest &&
    parsedJob.data.configurationRef === grant.configurationRef &&
    parsedJob.data.configurationDigest === grant.configurationDigest;
  if (
    !grant.jobId || !requesterMatches || grant.tenantId !== context.tenantId || !exactActionMatch || !exactArtifactMatch ||
    grant.revokedAt !== null || Date.parse(grant.expiresAt) <= Date.now() ||
    (input.createOptions?.canonicalJobId && input.createOptions.canonicalJobId !== grant.jobId)
  ) {
    throw new JobControlPlaneError("CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED", "Staging job does not match its active owner grant");
  }

  const grantRemainingMs = Date.parse(grant.expiresAt) - Date.now();
  const requestedDeadlineMs = Number.isSafeInteger(definition.retryPolicy.deadlineMs) && definition.retryPolicy.deadlineMs > 0
    ? definition.retryPolicy.deadlineMs
    : 0;
  const deadlineMs = Math.min(CLOUDFLARE_STAGING_JOB_DEADLINE_CAP_MS, grantRemainingMs, requestedDeadlineMs);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 30_000) {
    throw new JobControlPlaneError("CLOUDFLARE_STAGING_GRANT_EXPIRING", "Staging grant expires too soon to start a safe deployment");
  }
  const requestedAttempts = Number.isSafeInteger(definition.retryPolicy.maxAttempts)
    ? definition.retryPolicy.maxAttempts
    : 1;
  const requestedBaseDelayMs = Number.isSafeInteger(definition.retryPolicy.baseDelayMs) && definition.retryPolicy.baseDelayMs >= 0
    ? definition.retryPolicy.baseDelayMs
    : 2_000;
  const requestedMaxDelayMs = Number.isSafeInteger(definition.retryPolicy.maxDelayMs) && definition.retryPolicy.maxDelayMs >= 0
    ? definition.retryPolicy.maxDelayMs
    : 5_000;
  const baseDelayMs = Math.min(2_000, requestedBaseDelayMs);
  const maxDelayMs = Math.max(baseDelayMs, Math.min(5_000, requestedMaxDelayMs));
  const boundDefinition: JobDefinition = {
    ...definition,
    input: parsedJob.data,
    // One stable key and canonical ID per owner grant make repeated submits
    // idempotent and keep executor identity, lease, and provider receipt bound.
    idempotencyKey: `cloudflare-staging-grant:${grant.grantRef}`,
    requestedByUserId: grant.requesterUserId,
    retryPolicy: {
      ...definition.retryPolicy,
      maxAttempts: Math.max(1, Math.min(2, requestedAttempts)),
      baseDelayMs,
      maxDelayMs,
      jitter: "bounded",
      deadlineMs,
      allowedErrorClasses: definition.retryPolicy.allowedErrorClasses.includes("retryable") ? ["retryable"] : [],
    },
    timeoutPolicy: {
      ...definition.timeoutPolicy,
      softTimeoutMs: Math.min(definition.timeoutPolicy.softTimeoutMs, deadlineMs),
      hardTimeoutMs: deadlineMs,
    },
  };
  return {
    definition: boundDefinition,
    createOptions: { ...input.createOptions, canonicalJobId: grant.jobId },
  };
}

/**
 * The only producer-facing job creation boundary. Tenant, actor, adapter, and
 * queue identity are derived here and never accepted from a transport payload.
 */
export async function createControlPlaneJob(
  input: CreateControlPlaneJobInput
): Promise<JobRef> {
  const { context, definition } = input;
  const tenantId = context.tenantId?.trim();
  const authorizationScope = context.authorizationScope?.trim();
  const correlationId = context.correlationId?.trim();
  if (
    !["user", "admin", "system"].includes(context.actorType) ||
    !tenantId ||
    tenantId.length > 36 ||
    !authorizationScope ||
    authorizationScope.length > 160 ||
    !correlationId ||
    correlationId.length > 160
  ) {
    throw new JobControlPlaneError(
      "JOB_CONTEXT_INVALID",
      "Authenticated server context is required"
    );
  }
  if (
    (context.actorType === "user" || context.actorType === "admin") &&
    (!Number.isSafeInteger(context.actorId) || context.actorId <= 0)
  ) {
    throw new JobControlPlaneError(
      "JOB_CONTEXT_INVALID",
      "Authenticated user context requires a valid actor ID"
    );
  }
  if (
    context.actorType === "system" &&
    context.actorId !== undefined &&
    (!Number.isSafeInteger(context.actorId) || context.actorId <= 0)
  ) {
    throw new JobControlPlaneError(
      "JOB_CONTEXT_INVALID",
      "System actor ID must be a positive integer when supplied"
    );
  }
  if (context.idempotencyKey !== undefined && !context.idempotencyKey.trim()) {
    throw new JobControlPlaneError(
      "JOB_CONTEXT_INVALID",
      "Idempotency key cannot be empty"
    );
  }
  const registry = input.executorRegistry ?? defaultJobExecutorRegistry;
  if (!registry.has(definition.jobType, definition.contractVersion)) {
    throw new JobControlPlaneError(
      "JOB_EXECUTOR_UNREGISTERED",
      "Job type is not registered for this contract version"
    );
  }
  const stagingBinding = await bindApprovedCloudflareStagingJob(input);
  if (isFeature186HardCutoverEnabled()) {
    // Runtime readiness controls publication, not canonical admission. The
    // job and its outbox must be durable before a temporarily unavailable
    // transport can be repaired and retried. The startup/readiness gates
    // still prevent selecting a retired runtime.
    assertGoogleRuntimeDisabled();
  }
  // A producer context may provide the request key, but definitions that are
  // part of a multi-step plan own a stable per-step key. Never erase the
  // definition key when the caller has no context-level override.
  const effectiveDefinition = stagingBinding?.definition ?? definition;
  const idempotencyKey = stagingBinding
    ? stagingBinding.definition.idempotencyKey
    : context.idempotencyKey ?? effectiveDefinition.idempotencyKey;
  const canonicalDefinition: JobDefinition = {
    ...effectiveDefinition,
    tenantId,
    requestedByUserId:
      stagingBinding?.definition.requestedByUserId ?? (
        context.actorType === "user" || context.actorType === "admin"
          ? context.actorId
          : undefined
      ),
    idempotencyKey,
  };
  const chatThreadId =
    canonicalDefinition.input && typeof canonicalDefinition.input === "object" &&
    !Array.isArray(canonicalDefinition.input) &&
    typeof (canonicalDefinition.input as Record<string, unknown>).chatThreadId === "string"
      ? String((canonicalDefinition.input as Record<string, unknown>).chatThreadId)
      : null;
  if (chatThreadId) {
    const conversationId = (canonicalDefinition.input as Record<string, unknown>).conversationId;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chatThreadId) ||
      typeof conversationId !== "number" || !Number.isSafeInteger(conversationId) || conversationId <= 0 ||
      context.actorType === "system" || !canonicalDefinition.requestedByUserId
    ) {
      throw new JobControlPlaneError("JOB_CHAT_THREAD_BINDING_INVALID", "Chat thread binding is invalid");
    }
    const { assertConversationThreadScope } = await import("./conversationThreadService");
    try {
      await assertConversationThreadScope({
        tenantId,
        userId: canonicalDefinition.requestedByUserId,
        conversationId: Number(conversationId),
        threadId: chatThreadId,
      });
    } catch {
      throw new JobControlPlaneError("JOB_CHAT_THREAD_SCOPE_MISMATCH", "Chat thread is outside the job owner scope");
    }
  }
  return (input.controlPlane ?? createJobControlPlane()).create(
    canonicalDefinition,
    {
      ...input.createOptions,
      ...(stagingBinding ? stagingBinding.createOptions : {}),
      requestedBySystemComponent:
        context.actorType === "system" ? authorizationScope : undefined,
    }
  );
}

export function createControlPlaneJobGateway(
  dependencies: {
    controlPlane?: ReturnType<typeof createJobControlPlane>;
    executorRegistry?: JobExecutorRegistry;
  } = {}
) {
  return {
    create(
      input: Omit<
        CreateControlPlaneJobInput,
        "controlPlane" | "executorRegistry"
      >
    ) {
      return createControlPlaneJob({
        ...input,
        controlPlane: dependencies.controlPlane,
        executorRegistry: dependencies.executorRegistry,
      });
    },
  };
}
