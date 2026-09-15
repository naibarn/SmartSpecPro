import { JobControlPlaneError, type ExecutionClass, type JobDefinition, type JobRef, type RetryPolicy, type ScheduleDefinition, type TimeoutPolicy } from "./jobControlPlaneTypes";
import { createJobControlPlane, type CreateJobOptions } from "./jobControlPlane";
import { defaultJobExecutorRegistry, type JobExecutorRegistry } from "./jobExecutorRegistry";
import { assertGoogleRuntimeDisabled, feature186RuntimeReadiness, isCloudflareHardCutoverEnabled } from "./cloudflareRuntimeTarget";

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
};

/**
 * The only producer-facing job creation boundary. Tenant, actor, adapter, and
 * queue identity are derived here and never accepted from a transport payload.
 */
export async function createControlPlaneJob(input: CreateControlPlaneJobInput): Promise<JobRef> {
  const { context, definition } = input;
  const tenantId = context.tenantId?.trim();
  const authorizationScope = context.authorizationScope?.trim();
  const correlationId = context.correlationId?.trim();
  if (!['user', 'admin', 'system'].includes(context.actorType) || !tenantId || tenantId.length > 36 || !authorizationScope || authorizationScope.length > 160 || !correlationId || correlationId.length > 160) {
    throw new JobControlPlaneError("JOB_CONTEXT_INVALID", "Authenticated server context is required");
  }
  if ((context.actorType === "user" || context.actorType === "admin") && (!Number.isSafeInteger(context.actorId) || context.actorId <= 0)) {
    throw new JobControlPlaneError("JOB_CONTEXT_INVALID", "Authenticated user context requires a valid actor ID");
  }
  if (context.actorType === "system" && context.actorId !== undefined && (!Number.isSafeInteger(context.actorId) || context.actorId <= 0)) {
    throw new JobControlPlaneError("JOB_CONTEXT_INVALID", "System actor ID must be a positive integer when supplied");
  }
  if (context.idempotencyKey !== undefined && !context.idempotencyKey.trim()) {
    throw new JobControlPlaneError("JOB_CONTEXT_INVALID", "Idempotency key cannot be empty");
  }
  const registry = input.executorRegistry ?? defaultJobExecutorRegistry;
  if (!registry.has(definition.jobType, definition.contractVersion)) {
    throw new JobControlPlaneError("JOB_EXECUTOR_UNREGISTERED", "Job type is not registered for this contract version");
  }
  if (isCloudflareHardCutoverEnabled()) {
    assertGoogleRuntimeDisabled();
    const readiness = feature186RuntimeReadiness();
    if (!readiness.ready) {
      throw new JobControlPlaneError(
        "JOB_RUNTIME_NOT_READY",
        "The configured job runtime is not ready; no canonical job was created",
      );
    }
  }
  const idempotencyKey = context.idempotencyKey;
  const canonicalDefinition: JobDefinition = {
    ...definition,
    tenantId,
    requestedByUserId: context.actorType === "user" || context.actorType === "admin" ? context.actorId : undefined,
    idempotencyKey,
  };
  return (input.controlPlane ?? createJobControlPlane()).create(canonicalDefinition, {
    ...input.createOptions,
    requestedBySystemComponent: context.actorType === "system" ? authorizationScope : undefined,
  });
}

export function createControlPlaneJobGateway(dependencies: {
  controlPlane?: ReturnType<typeof createJobControlPlane>;
  executorRegistry?: JobExecutorRegistry;
} = {}) {
  return {
    create(input: Omit<CreateControlPlaneJobInput, "controlPlane" | "executorRegistry">) {
      return createControlPlaneJob({
        ...input,
        controlPlane: dependencies.controlPlane,
        executorRegistry: dependencies.executorRegistry,
      });
    },
  };
}
