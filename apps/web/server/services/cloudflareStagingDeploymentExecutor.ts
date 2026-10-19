import type { JobExecutor } from "./jobExecutor";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import type { DrizzleDB } from "../db";
import {
  CLOUDFLARE_STAGING_ORIGIN_CONTRACT, CLOUDFLARE_STAGING_ORIGIN_GRANT,
  cloudflareStagingOriginGrantSchema, cloudflareStagingOriginJobSchema, cloudflareStagingOriginAuthority,
  type CloudflareStagingOriginAuthority, type CloudflareStagingOriginGrant, type CloudflareStagingOriginJob,
} from "./cloudflareStagingOriginContract";
import { withCloudflareOriginConfigurationForTransition } from "./cloudflareOriginConfiguration";
import type { CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import {
  authorizeDeploymentTarget,
  deploymentCredentialRef,
  resolveProviderDeploymentTarget,
} from "./providerDeploymentTargetAuthority";

export const CLOUDFLARE_STAGING_DEPLOYMENT_JOB = "cloudflare.staging.deploy";
export const CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT =
  "cloudflare-staging-deploy-v1";
export const CLOUDFLARE_STAGING_TARGET_ID = "smartspec-cloudflare-staging";

const SHA = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export type CloudflareStagingArtifact = Readonly<{
  artifactRef: string;
  sourceSha: string;
  buildDigest: string;
  immutable: true;
}>;

type LegacyCloudflareStagingGrant = Readonly<{
  schemaVersion?: "cloudflare.staging-deployment-grant.v1";
  grantRef: string;
  tenantId: string;
  requesterUserId: number;
  projectId: string;
  executorId: string;
  targetId: typeof CLOUDFLARE_STAGING_TARGET_ID;
  environment: "staging";
  artifactRef: string;
  sourceSha: string;
  buildDigest: string;
  actions: readonly ("deploy" | "rollback" | "bootstrap")[];
  rollbackDeploymentId: string | null;
  rollbackArtifactRef: string | null;
  rollbackSourceSha: string | null;
  rollbackBuildDigest: string | null;
  expiresAt: string;
  revoked: false;
  /** Policy grants bind one canonical job and the provider account. */
  jobId?: string;
  accountRef?: string;
}>;

export type CloudflareStagingGrant = LegacyCloudflareStagingGrant | CloudflareStagingOriginGrant;

export type CloudflareStagingTarget = Readonly<{
  targetId: string;
  environment: string;
  accountRef: string;
  workerRef: string;
  credentialRef: string;
  enabled: boolean;
  tenantId: string;
  projectId: string;
  runtimePolicy?: string;
}>;

export type CloudflareStagingExecutorBinding = Parameters<
  CloudflareStagingDeploymentRuntime["executorIdentity"]
>[0];

/**
 * Runtime dependencies must be composed from existing server authorities. This
 * module deliberately defines no grant/approval/credential registry of its own.
 */
export type CloudflareStagingDeploymentRuntime = Readonly<{
  executorIdentity: (binding: {
    jobId: string;
    tenantId: string;
    target: typeof CLOUDFLARE_STAGING_TARGET_ID;
    artifactSha256: string;
    action: "deploy" | "rollback" | "bootstrap";
    idempotencyKey: string;
    originAuthority?: CloudflareStagingOriginAuthority;
  }) => Promise<{ registered: boolean; executorId: string }>;
  withOriginConfiguration?: <T>(input: {
    target: CloudflareStagingTarget; configurationRef: string; configurationDigest: string; activeConfigurationRef: string;
    operation: (configuration: CloudflareOriginVersionBindings) => Promise<T>;
  }) => Promise<T>;
  resolveTarget: (input: {
    tenantId: string;
    projectId: string;
    environment: "staging";
  }) => Promise<CloudflareStagingTarget | null>;
  resolveGrant: (grantRef: string) => Promise<CloudflareStagingGrant | null>;
  resolveArtifact: (
    artifactRef: string
  ) => Promise<CloudflareStagingArtifact | null>;
  withCredential: <T>(input: {
    target: CloudflareStagingTarget;
    operation: (token: string) => Promise<T>;
  }) => Promise<{
    status:
      | "CONFIGURED"
      | "NOT_CONFIGURED"
      | "PERMISSION_DENIED"
      | "REVOKED"
      | "UNAVAILABLE";
    value?: T;
  }>;
  cloudflare: CloudflareStagingApi;
  now?: () => Date;
}>;

/**
 * Binds the executor to the existing SPEC-288 target and encrypted credential
 * authority. Grant, artifact, executor identity and Cloudflare transport are
 * supplied by their owners; this adapter adds no persistence or authority.
 */
export function bindCloudflareStagingDeploymentAuthorities(input: {
  db: DrizzleDB;
  executorIdentity: CloudflareStagingDeploymentRuntime["executorIdentity"];
  resolveGrant: CloudflareStagingDeploymentRuntime["resolveGrant"];
  resolveArtifact: CloudflareStagingDeploymentRuntime["resolveArtifact"];
  cloudflare: CloudflareStagingApi;
  now?: () => Date;
}): CloudflareStagingDeploymentRuntime {
  return {
    executorIdentity: input.executorIdentity,
    resolveGrant: input.resolveGrant,
    resolveArtifact: input.resolveArtifact,
    cloudflare: input.cloudflare,
    now: input.now,
    withOriginConfiguration: async ({ target, configurationRef, configurationDigest, activeConfigurationRef, operation }) =>
      withCloudflareOriginConfigurationForTransition(input.db, {
        identity: { tenantId: target.tenantId, projectId: target.projectId, environment: "staging", provider: "cloudflare" },
        configurationRef, configurationDigest, activeConfigurationRef,
      }, value => operation({ ...value, configurationRef, configurationDigest })),
    resolveTarget: async identity => {
      const resolution = await resolveProviderDeploymentTarget(input.db, {
        ...identity,
        provider: "cloudflare",
      });
      if (resolution.status !== "CONFIGURED") return null;
      const row = resolution.target;
      if (
        !row.enabled ||
        row.deploymentTargetId !== CLOUDFLARE_STAGING_TARGET_ID ||
        row.environment !== "staging" ||
        row.provider !== "cloudflare" ||
        row.workerRef !== CLOUDFLARE_STAGING_TARGET_ID ||
        !row.accountRef ||
        row.credentialRef !==
          deploymentCredentialRef({ ...identity, provider: "cloudflare" }) ||
        authorizeDeploymentTarget({
          target: row,
          callerTenantId: identity.tenantId,
          projectId: identity.projectId,
          environment: "staging",
          provider: "cloudflare",
        }) !== "AUTHORIZED"
      )
        return null;
      return {
        targetId: row.deploymentTargetId,
        environment: row.environment,
        accountRef: row.accountRef,
        workerRef: row.workerRef,
        credentialRef: row.credentialRef,
        enabled: row.enabled,
        tenantId: row.tenantId,
        projectId: row.projectId,
        ...(row.runtimePolicy ? { runtimePolicy: row.runtimePolicy } : {}),
      };
    },
    withCredential: async ({ target, operation }) => {
      const identity = {
        tenantId: target.tenantId,
        projectId: target.projectId,
        environment: "staging",
        provider: "cloudflare",
      };
      const result = await withCloudflareDeploymentCredential(
        input.db,
        { identity, credentialRef: target.credentialRef },
        operation
      );
      return result.status === "CONFIGURED"
        ? { status: result.status, value: result.value }
        : { status: result.status };
    },
  };
}

/** Cloudflare adapter seam; implementations keep credentials inside the call. */
export type CloudflareStagingApi = Readonly<{
  deploy: (input: {
    token: string;
    target: CloudflareStagingTarget;
    artifact: CloudflareStagingArtifact;
    idempotencyKey: string;
    bootstrap?: boolean;
    /** Only a future origin-capable executor may supply these resolved secrets. */
    originConfiguration?: CloudflareOriginVersionBindings;
    assertMutationAuthorized?: () => Promise<void>;
  }) => Promise<{
    deploymentId: string;
    url: string;
    sourceSha: string;
    buildDigest: string;
    configurationDigest?: string;
  }>;
  verifyRuntime: (input: {
    token: string;
    target: CloudflareStagingTarget;
    deploymentId: string;
    url: string;
    sourceSha: string;
    buildDigest: string;
    configurationDigest?: string;
  }) => Promise<{
    reachable: boolean;
    deploymentId: string;
    sourceSha: string;
    buildDigest: string;
    configurationDigest?: string;
  }>;
  rollback: (input: {
    token: string;
    target: CloudflareStagingTarget;
    deploymentId: string;
    idempotencyKey: string;
    sourceSha?: string;
    buildDigest?: string;
    configurationDigest?: string;
    assertMutationAuthorized?: () => Promise<void>;
  }) => Promise<{
    deploymentId: string;
    url?: string;
    sourceSha: string;
    buildDigest: string;
    configurationDigest?: string;
  }>;
}>;

export class CloudflareStagingDeploymentError extends Error {
  readonly diagnosticCode: string;
  readonly class = "permanent" as const;

  constructor(code: string) {
    super(code);
    this.name = "CloudflareStagingDeploymentError";
    this.diagnosticCode = code;
  }
}

type LegacyJobInput = {
  contractVersion: typeof CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT;
  action: "deploy" | "rollback" | "bootstrap";
  targetId: typeof CLOUDFLARE_STAGING_TARGET_ID;
  environment: "staging";
  grantRef: string;
  artifactRef: string;
  sourceSha: string;
  buildDigest: string;
};

type JobInput = LegacyJobInput | CloudflareStagingOriginJob;

function parseJobInput(value: unknown): JobInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_JOB_INVALID"
    );
  const input = value as Record<string, unknown>;
  if (input.contractVersion === CLOUDFLARE_STAGING_ORIGIN_CONTRACT) {
    const parsed = cloudflareStagingOriginJobSchema.safeParse(input);
    if (!parsed.success) throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_JOB_INVALID");
    return parsed.data;
  }
  const allowed = [
    "contractVersion",
    "action",
    "targetId",
    "environment",
    "grantRef",
    "artifactRef",
    "sourceSha",
    "buildDigest",
  ];
  if (
    Object.keys(input).length !== allowed.length ||
    Object.keys(input).some(key => !allowed.includes(key)) ||
    input.contractVersion !== CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT ||
    (input.action !== "deploy" && input.action !== "rollback" && input.action !== "bootstrap") ||
    input.targetId !== CLOUDFLARE_STAGING_TARGET_ID ||
    input.environment !== "staging" ||
    typeof input.grantRef !== "string" ||
    !SAFE_REF.test(input.grantRef) ||
    typeof input.artifactRef !== "string" ||
    !SAFE_REF.test(input.artifactRef) ||
    typeof input.sourceSha !== "string" ||
    !SHA.test(input.sourceSha) ||
    typeof input.buildDigest !== "string" ||
    !SHA256.test(input.buildDigest)
  ) {
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_JOB_INVALID"
    );
  }
  return input as LegacyJobInput;
}

function assertValidGrant(input: {
  grant: CloudflareStagingGrant | null;
  artifact: CloudflareStagingArtifact | null;
  job: JobInput;
  tenantId: string;
  requesterUserId: number | undefined;
  executorId: string;
  jobId: string;
  accountRef: string;
  now: Date;
}) {
  const { grant, artifact, job } = input;
  if (!grant || !artifact)
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_GRANT_OR_ARTIFACT_MISSING"
    );
  if (
    grant.revoked !== false ||
    !Number.isFinite(Date.parse(grant.expiresAt)) ||
    Date.parse(grant.expiresAt) <= input.now.getTime()
  ) {
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_GRANT_EXPIRED_OR_REVOKED"
    );
  }
  if (
    (grant.jobId !== undefined && grant.jobId !== input.jobId) ||
    (grant.accountRef !== undefined && grant.accountRef !== input.accountRef) ||
    grant.requesterUserId !== input.requesterUserId ||
    grant.executorId !== input.executorId ||
    !grant.projectId ||
    grant.tenantId !== input.tenantId ||
    grant.grantRef !== job.grantRef ||
    !grant.actions.some(action => action === job.action) ||
    !grant.grantRef ||
    grant.targetId !== CLOUDFLARE_STAGING_TARGET_ID ||
    grant.environment !== "staging"
  ) {
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED"
    );
  }
  if (job.contractVersion === CLOUDFLARE_STAGING_ORIGIN_CONTRACT) {
    const { revoked: _revoked, ...document } = grant;
    const parsed = cloudflareStagingOriginGrantSchema.safeParse(document);
    if (!parsed.success || grant.schemaVersion !== CLOUDFLARE_STAGING_ORIGIN_GRANT ||
        grant.jobId !== input.jobId || grant.accountRef !== input.accountRef ||
        job.configurationRef !== (job.action === "deploy" ? grant.configurationRef : grant.rollbackConfigurationRef) ||
        job.configurationDigest !== (job.action === "deploy" ? grant.configurationDigest : grant.rollbackConfigurationDigest)) {
      throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_ORIGIN_GRANT_REQUIRED");
    }
  } else if (grant.schemaVersion === CLOUDFLARE_STAGING_ORIGIN_GRANT) {
    throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_ORIGIN_GRANT_REQUIRED");
  }
  const approvedArtifact =
    job.action !== "rollback"
      ? {
          artifactRef: grant.artifactRef,
          sourceSha: grant.sourceSha,
          buildDigest: grant.buildDigest,
        }
      : {
          artifactRef: grant.rollbackArtifactRef,
          sourceSha: grant.rollbackSourceSha!,
          buildDigest: grant.rollbackBuildDigest!,
        };
  if (
    approvedArtifact.artifactRef !== job.artifactRef ||
    approvedArtifact.sourceSha?.toLowerCase() !== job.sourceSha.toLowerCase() ||
    approvedArtifact.buildDigest?.toLowerCase() !==
      job.buildDigest.toLowerCase() ||
    artifact.artifactRef !== job.artifactRef ||
    artifact.immutable !== true ||
    artifact.sourceSha.toLowerCase() !== job.sourceSha.toLowerCase() ||
    artifact.buildDigest.toLowerCase() !== job.buildDigest.toLowerCase()
  ) {
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_ARTIFACT_MISMATCH"
    );
  }
  if (job.action === "bootstrap") {
    if (grant.actions.length !== 1 || [grant.rollbackDeploymentId, grant.rollbackArtifactRef, grant.rollbackSourceSha, grant.rollbackBuildDigest].some(value => value !== null)) {
      throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_BOOTSTRAP_GRANT_INVALID");
    }
  } else if (
    grant.actions.some(action => action === "bootstrap") ||
    !grant.rollbackDeploymentId ||
    !grant.rollbackArtifactRef ||
    !grant.rollbackSourceSha ||
    !grant.rollbackBuildDigest ||
    !SAFE_REF.test(grant.rollbackDeploymentId) ||
    !SAFE_REF.test(grant.rollbackArtifactRef) ||
    !SHA.test(grant.rollbackSourceSha) ||
    !SHA256.test(grant.rollbackBuildDigest)
  ) {
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_ROLLBACK_TARGET_INVALID"
    );
  }
  if (!input.tenantId || input.tenantId.length > 36)
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_TENANT_INVALID"
    );
}

/** Canonical worker_jobs executor. The default runtime is intentionally absent and fails closed. */
export function createCloudflareStagingDeploymentExecutor(
  runtime?:
    | CloudflareStagingDeploymentRuntime
    | (() => CloudflareStagingDeploymentRuntime | undefined)
): JobExecutor {
  return async ({ context, lease, reporter }) => {
    if (
      context.jobType !== CLOUDFLARE_STAGING_DEPLOYMENT_JOB ||
      (context.contractVersion !== CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT && context.contractVersion !== CLOUDFLARE_STAGING_ORIGIN_CONTRACT)
    ) {
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_JOB_INVALID"
      );
    }
    const job = parseJobInput(context.input);
    if (job.contractVersion !== context.contractVersion) throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_JOB_INVALID");
    const idempotencyKey = `cloudflare-staging:${context.jobId}`;
    if (!context.jobId || context.jobId.length > 200)
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_IDEMPOTENCY_REQUIRED"
      );
    const activeRuntime = typeof runtime === "function" ? runtime() : runtime;
    if (!activeRuntime)
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_RUNTIME_NOT_CONFIGURED"
      );

    const [grant, artifact] = await Promise.all([
      activeRuntime.resolveGrant(job.grantRef),
      activeRuntime.resolveArtifact(job.artifactRef),
    ]);
    if (!grant)
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_GRANT_OR_ARTIFACT_MISSING"
      );
    if (
      !artifact ||
      artifact.artifactRef !== job.artifactRef ||
      artifact.sourceSha.toLowerCase() !== job.sourceSha.toLowerCase() ||
      artifact.buildDigest.toLowerCase() !== job.buildDigest.toLowerCase()
    ) {
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_ARTIFACT_MISMATCH"
      );
    }
    const originGrant = grant.schemaVersion === CLOUDFLARE_STAGING_ORIGIN_GRANT ? grant : null;
    const originAuthority = originGrant ? cloudflareStagingOriginAuthority(originGrant) : undefined;
    const identity = await activeRuntime.executorIdentity({
      jobId: context.jobId,
      tenantId: context.tenantId,
      target: CLOUDFLARE_STAGING_TARGET_ID,
      artifactSha256: artifact.buildDigest,
      action: job.action,
      idempotencyKey,
      ...(originAuthority ? { originAuthority } : {}),
    });
    if (!identity.registered || !identity.executorId)
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_EXECUTOR_UNREGISTERED"
      );
    const target = await activeRuntime.resolveTarget({
      tenantId: context.tenantId,
      projectId: grant.projectId,
      environment: "staging",
    });
    if (
      !target ||
      !target.enabled ||
      target.targetId !== CLOUDFLARE_STAGING_TARGET_ID ||
      target.environment !== "staging" ||
      target.tenantId !== context.tenantId ||
      target.projectId !== grant.projectId ||
      !target.accountRef ||
      !target.workerRef ||
      !target.credentialRef
    ) {
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_TARGET_DENIED"
      );
    }
    // Artifact-only v1 grants cannot silently authorize origin/secret bindings.
    if (job.contractVersion === CLOUDFLARE_STAGING_ORIGIN_CONTRACT && job.projectId !== grant.projectId) {
      throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED");
    }
    if ((job.contractVersion === CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT && target.runtimePolicy) ||
        (job.contractVersion === CLOUDFLARE_STAGING_ORIGIN_CONTRACT && (!originGrant || target.runtimePolicy !== originGrant.configurationRef))) {
      throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_ORIGIN_GRANT_REQUIRED");
    }
    assertValidGrant({
      grant,
      artifact,
      job,
      tenantId: context.tenantId,
      requesterUserId: context.requestedByUserId,
      executorId: identity.executorId,
      jobId: context.jobId,
      accountRef: target.accountRef,
      now: activeRuntime.now?.() ?? new Date(),
    });
    await reporter.assertActive(lease);
    const validateOriginTransition = async () => {
      if (!originGrant) return;
      if (!activeRuntime.withOriginConfiguration) throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_ORIGIN_RUNTIME_REQUIRED");
      const baseline = await activeRuntime.resolveArtifact(originGrant.rollbackArtifactRef);
      if (!baseline?.immutable || baseline.artifactRef !== originGrant.rollbackArtifactRef ||
          baseline.sourceSha !== originGrant.rollbackSourceSha || baseline.buildDigest !== originGrant.rollbackBuildDigest) {
        throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_ROLLBACK_ARTIFACT_INVALID");
      }
      for (const [configurationRef, configurationDigest] of [
        [originGrant.configurationRef, originGrant.configurationDigest],
        [originGrant.rollbackConfigurationRef, originGrant.rollbackConfigurationDigest],
      ]) {
        if (configurationRef && configurationDigest) await activeRuntime.withOriginConfiguration({
          target, configurationRef, configurationDigest, activeConfigurationRef: originGrant.configurationRef,
          operation: async () => undefined,
        });
      }
    };
    await validateOriginTransition();

    const assertMutationAuthorized = async () => {
      const now = activeRuntime.now?.() ?? new Date();
      const deadlineMs = getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" });
      if (!Number.isFinite(Date.parse(context.createdAt)) ||
          Date.parse(context.createdAt) + deadlineMs <= now.getTime() ||
          (lease.expiresAt && Date.parse(lease.expiresAt) <= now.getTime())) {
        throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_JOB_DEADLINE_EXPIRED");
      }
      await reporter.assertActive(lease);
      const [currentGrant, currentTarget, currentIdentity] = await Promise.all([
        activeRuntime.resolveGrant(job.grantRef),
        activeRuntime.resolveTarget({ tenantId: context.tenantId, projectId: grant.projectId, environment: "staging" }),
        activeRuntime.executorIdentity({ jobId: context.jobId, tenantId: context.tenantId,
          target: CLOUDFLARE_STAGING_TARGET_ID, artifactSha256: artifact.buildDigest, action: job.action, idempotencyKey, ...(originAuthority ? { originAuthority } : {}) }),
      ]);
      if (!currentIdentity.registered || currentIdentity.executorId !== identity.executorId ||
          !currentTarget || (["targetId", "environment", "accountRef", "workerRef", "credentialRef", "enabled", "tenantId", "projectId", "runtimePolicy"] as const)
            .some(key => currentTarget[key] !== target[key])) {
        throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_AUTHORITY_CHANGED");
      }
      assertValidGrant({ grant: currentGrant, artifact, job, tenantId: context.tenantId,
        requesterUserId: context.requestedByUserId, executorId: currentIdentity.executorId,
        jobId: context.jobId, accountRef: target.accountRef, now: activeRuntime.now?.() ?? new Date() });
      if (originGrant) {
        const currentAuthority = currentGrant?.schemaVersion === CLOUDFLARE_STAGING_ORIGIN_GRANT ? cloudflareStagingOriginAuthority(currentGrant) : null;
        if (!currentAuthority || !originAuthority ||
            Object.entries(originAuthority).some(([key, value]) => currentAuthority[key as keyof CloudflareStagingOriginAuthority] !== value)) {
          throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_AUTHORITY_CHANGED");
        }
        await validateOriginTransition();
      }
      await reporter.assertActive(lease);
    };

    const credential = await activeRuntime.withCredential({
      target,
      operation: async token => {
        const execute = async (originConfiguration?: CloudflareOriginVersionBindings) => {
          try {
            const request =
              job.action !== "rollback"
                ? await activeRuntime.cloudflare.deploy({
                    token,
                    target,
                    artifact: artifact!,
                    idempotencyKey,
                    bootstrap: job.action === "bootstrap",
                    ...(originConfiguration ? { originConfiguration } : {}),
                    assertMutationAuthorized,
                  })
                : await activeRuntime.cloudflare.rollback({
                    token,
                    target,
                    deploymentId: grant.rollbackDeploymentId!,
                    assertMutationAuthorized,
                    sourceSha: grant.rollbackSourceSha!,
                    buildDigest: grant.rollbackBuildDigest!,
                    ...(originGrant?.rollbackConfigurationDigest ? { configurationDigest: originGrant.rollbackConfigurationDigest } : {}),
                    idempotencyKey,
                  });
            const url =
              job.action !== "rollback"
                ? (request.url ?? "")
                : (request.url ?? `https://${target.workerRef}.workers.dev`);
            let safeWorkersDevUrl = false;
            try {
              const parsed = new URL(url);
              safeWorkersDevUrl =
                parsed.protocol === "https:" &&
                !parsed.username &&
                !parsed.password &&
                parsed.hostname
                  .toLowerCase()
                  .startsWith(`${target.workerRef.toLowerCase()}.`) &&
                parsed.hostname.toLowerCase().endsWith(".workers.dev") &&
                parsed.pathname === "/" &&
                !parsed.search &&
                !parsed.hash;
            } catch {
              safeWorkersDevUrl = false;
            }
            if (!request.deploymentId || !safeWorkersDevUrl) {
              throw new CloudflareStagingDeploymentError(
                "CLOUDFLARE_STAGING_DEPLOYMENT_RECEIPT_INVALID"
              );
            }
            if (
              request.sourceSha.toLowerCase() !== job.sourceSha.toLowerCase() ||
              request.buildDigest.toLowerCase() !== job.buildDigest.toLowerCase()
            ) {
              throw new CloudflareStagingDeploymentError(
                job.action === "rollback"
                  ? "CLOUDFLARE_STAGING_ROLLBACK_RECEIPT_MISMATCH"
                  : "CLOUDFLARE_STAGING_DEPLOYMENT_RECEIPT_MISMATCH"
              );
            }
            const selectedConfigurationDigest = originGrant ? (job.action === "deploy" ? originGrant.configurationDigest : originGrant.rollbackConfigurationDigest) : undefined;
            if ((request.configurationDigest ?? null) !== (selectedConfigurationDigest ?? null)) {
              throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_ORIGIN_RECEIPT_MISMATCH");
            }
            await reporter.assertActive(lease);
            const verification = await activeRuntime.cloudflare.verifyRuntime({
              token,
              target,
              deploymentId: request.deploymentId,
              url,
              sourceSha: request.sourceSha,
              buildDigest: request.buildDigest,
              ...(selectedConfigurationDigest ? { configurationDigest: selectedConfigurationDigest } : {}),
            }).catch(error => {
              if (!originGrant || job.action !== "deploy") throw error;
              return { reachable: false, deploymentId: request.deploymentId, sourceSha: request.sourceSha,
                buildDigest: request.buildDigest, ...(selectedConfigurationDigest ? { configurationDigest: selectedConfigurationDigest } : {}) };
            });
            if (
              !verification.reachable ||
              (verification.configurationDigest ?? null) !== (selectedConfigurationDigest ?? null) ||
              verification.deploymentId !== request.deploymentId ||
              verification.sourceSha.toLowerCase() !==
                request.sourceSha.toLowerCase() ||
              verification.buildDigest.toLowerCase() !==
                request.buildDigest.toLowerCase()
            ) {
              if (job.action === "deploy") {
                try {
                  const rollback = await activeRuntime.cloudflare.rollback({
                    token,
                    target,
                    deploymentId: grant.rollbackDeploymentId!,
                    assertMutationAuthorized,
                    sourceSha: grant.rollbackSourceSha!,
                    buildDigest: grant.rollbackBuildDigest!,
                    ...(originGrant?.rollbackConfigurationDigest ? { configurationDigest: originGrant.rollbackConfigurationDigest } : {}),
                    idempotencyKey: `${idempotencyKey}:auto-rollback`,
                  });
                  if (
                    (rollback.configurationDigest ?? null) !== (originGrant?.rollbackConfigurationDigest ?? null) ||
                    rollback.sourceSha.toLowerCase() !==
                      grant.rollbackSourceSha!.toLowerCase() ||
                    rollback.buildDigest.toLowerCase() !==
                      grant.rollbackBuildDigest!.toLowerCase()
                  ) {
                    throw new CloudflareStagingDeploymentError(
                      "CLOUDFLARE_STAGING_ROLLBACK_RECEIPT_MISMATCH"
                    );
                  }
                  const rollbackVerified = await activeRuntime.cloudflare.verifyRuntime(
                    {
                      token,
                      target,
                      deploymentId: rollback.deploymentId,
                      url,
                      sourceSha: grant.rollbackSourceSha!,
                      buildDigest: grant.rollbackBuildDigest!,
                      ...(originGrant?.rollbackConfigurationDigest ? { configurationDigest: originGrant.rollbackConfigurationDigest } : {}),
                    }
                  );
                  if (
                    !rollbackVerified.reachable ||
                    (rollbackVerified.configurationDigest ?? null) !== (originGrant?.rollbackConfigurationDigest ?? null) ||
                    rollbackVerified.deploymentId !== rollback.deploymentId ||
                    rollbackVerified.sourceSha.toLowerCase() !==
                      grant.rollbackSourceSha!.toLowerCase() ||
                    rollbackVerified.buildDigest.toLowerCase() !==
                      grant.rollbackBuildDigest!.toLowerCase()
                  ) {
                    throw new CloudflareStagingDeploymentError(
                      "CLOUDFLARE_STAGING_ROLLBACK_VERIFICATION_FAILED"
                    );
                  }
                } catch {
                  throw new CloudflareStagingDeploymentError(
                    "CLOUDFLARE_STAGING_ROLLBACK_FAILED"
                  );
                }
              }
              throw new CloudflareStagingDeploymentError(
                "CLOUDFLARE_STAGING_RUNTIME_VERIFICATION_FAILED"
              );
            }
            return {
              ok: true as const,
              receipt: {
                deploymentId: request.deploymentId,
                url,
                sourceSha: request.sourceSha,
                buildDigest: request.buildDigest,
                action: job.action,
                runtimeVerified: true as const,
                rollbackDeploymentId: grant.rollbackDeploymentId,
                ...(originGrant ? {
                  grantRef: originGrant.grantRef, accountRef: originGrant.accountRef,
                  configurationRef: job.action === "deploy" ? originGrant.configurationRef : originGrant.rollbackConfigurationRef,
                  configurationDigest: selectedConfigurationDigest ?? null,
                  verificationScope: selectedConfigurationDigest ? "origin-auth" : "assets-only",
                  rollbackConfigurationRef: originGrant.rollbackConfigurationRef,
                  rollbackConfigurationDigest: originGrant.rollbackConfigurationDigest,
                } : {}),
              },
            };
          } catch (error) {
            return {
              ok: false as const,
              diagnosticCode:
                error instanceof Error && "diagnosticCode" in error && typeof error.diagnosticCode === "string" && /^CLOUDFLARE_[A-Z0-9_]+$/.test(error.diagnosticCode)
                  ? error.diagnosticCode
                  : "CLOUDFLARE_STAGING_API_ERROR",
            };
          }
        };
        if (originGrant && job.action === "deploy") {
          if (!activeRuntime.withOriginConfiguration) throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_ORIGIN_RUNTIME_REQUIRED");
          return activeRuntime.withOriginConfiguration({ target, configurationRef: originGrant.configurationRef,
            configurationDigest: originGrant.configurationDigest, activeConfigurationRef: originGrant.configurationRef, operation: execute });
        }
        return execute();
      },
    });
    if (credential.status !== "CONFIGURED" || !credential.value) {
      throw new CloudflareStagingDeploymentError(
        `CLOUDFLARE_STAGING_CREDENTIAL_${credential.status}`
      );
    }
    if (!credential.value.ok)
      throw new CloudflareStagingDeploymentError(
        credential.value.diagnosticCode
      );
    await reporter.assertActive(lease);
    return { output: credential.value.receipt };
  };
}
