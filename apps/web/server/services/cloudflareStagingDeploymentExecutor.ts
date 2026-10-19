import type { JobExecutor } from "./jobExecutor";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import type { DrizzleDB } from "../db";
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

export type CloudflareStagingGrant = Readonly<{
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

export type CloudflareStagingTarget = Readonly<{
  targetId: string;
  environment: string;
  accountRef: string;
  workerRef: string;
  credentialRef: string;
  enabled: boolean;
  tenantId: string;
  projectId: string;
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
  }) => Promise<{ registered: boolean; executorId: string }>;
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
    assertMutationAuthorized?: () => Promise<void>;
  }) => Promise<{
    deploymentId: string;
    url: string;
    sourceSha: string;
    buildDigest: string;
  }>;
  verifyRuntime: (input: {
    token: string;
    target: CloudflareStagingTarget;
    deploymentId: string;
    url: string;
    sourceSha: string;
    buildDigest: string;
  }) => Promise<{
    reachable: boolean;
    deploymentId: string;
    sourceSha: string;
    buildDigest: string;
  }>;
  rollback: (input: {
    token: string;
    target: CloudflareStagingTarget;
    deploymentId: string;
    idempotencyKey: string;
    sourceSha?: string;
    buildDigest?: string;
    assertMutationAuthorized?: () => Promise<void>;
  }) => Promise<{
    deploymentId: string;
    url?: string;
    sourceSha: string;
    buildDigest: string;
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

type JobInput = {
  contractVersion: typeof CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT;
  action: "deploy" | "rollback" | "bootstrap";
  targetId: typeof CLOUDFLARE_STAGING_TARGET_ID;
  environment: "staging";
  grantRef: string;
  artifactRef: string;
  sourceSha: string;
  buildDigest: string;
};

function parseJobInput(value: unknown): JobInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_JOB_INVALID"
    );
  const input = value as Record<string, unknown>;
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
  return input as JobInput;
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
    !grant.actions.includes(job.action) ||
    !grant.grantRef ||
    grant.targetId !== CLOUDFLARE_STAGING_TARGET_ID ||
    grant.environment !== "staging"
  ) {
    throw new CloudflareStagingDeploymentError(
      "CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED"
    );
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
    grant.actions.includes("bootstrap") ||
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
      context.contractVersion !== CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT
    ) {
      throw new CloudflareStagingDeploymentError(
        "CLOUDFLARE_STAGING_JOB_INVALID"
      );
    }
    const job = parseJobInput(context.input);
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
    const identity = await activeRuntime.executorIdentity({
      jobId: context.jobId,
      tenantId: context.tenantId,
      target: CLOUDFLARE_STAGING_TARGET_ID,
      artifactSha256: artifact.buildDigest,
      action: job.action,
      idempotencyKey,
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
          target: CLOUDFLARE_STAGING_TARGET_ID, artifactSha256: artifact.buildDigest, action: job.action, idempotencyKey }),
      ]);
      if (!currentIdentity.registered || currentIdentity.executorId !== identity.executorId ||
          !currentTarget || JSON.stringify(currentTarget) !== JSON.stringify(target)) {
        throw new CloudflareStagingDeploymentError("CLOUDFLARE_STAGING_AUTHORITY_CHANGED");
      }
      assertValidGrant({ grant: currentGrant, artifact, job, tenantId: context.tenantId,
        requesterUserId: context.requestedByUserId, executorId: currentIdentity.executorId,
        jobId: context.jobId, accountRef: target.accountRef, now: activeRuntime.now?.() ?? new Date() });
      await reporter.assertActive(lease);
    };

    const credential = await activeRuntime.withCredential({
      target,
      operation: async token => {
        try {
          const request =
            job.action !== "rollback"
              ? await activeRuntime.cloudflare.deploy({
                  token,
                  target,
                  artifact: artifact!,
                  idempotencyKey,
                  bootstrap: job.action === "bootstrap",
                  assertMutationAuthorized,
                })
              : await activeRuntime.cloudflare.rollback({
                  token,
                  target,
                  deploymentId: grant.rollbackDeploymentId!,
                  assertMutationAuthorized,
                  sourceSha: grant.rollbackSourceSha!,
                  buildDigest: grant.rollbackBuildDigest!,
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
          await reporter.assertActive(lease);
          const verification = await activeRuntime.cloudflare.verifyRuntime({
            token,
            target,
            deploymentId: request.deploymentId,
            url,
            sourceSha: request.sourceSha,
            buildDigest: request.buildDigest,
          });
          if (
            !verification.reachable ||
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
                  idempotencyKey: `${idempotencyKey}:auto-rollback`,
                });
                if (
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
                  }
                );
                if (
                  !rollbackVerified.reachable ||
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
