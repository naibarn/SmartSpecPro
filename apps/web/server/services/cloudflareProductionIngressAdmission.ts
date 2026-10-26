import { productionIngressJobSchema } from "./cloudflareProductionIngressContract";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { providerDeploymentTargets } from "../../drizzle/schema";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import { probeCloudflareProductionProviderInventory } from "./cloudflareProductionProviderInventory";
import {
  resolveLatestPublishedCloudflareStagingArtifact,
  resolveCloudflareStagingModules,
} from "./cloudflareStagingArtifactAuthority";
import {
  getCloudflareOriginConfiguration,
  saveCloudflareOriginConfiguration,
  withCloudflareOriginConfiguration,
} from "./cloudflareOriginConfiguration";
import { resolveProviderDeploymentTarget } from "./providerDeploymentTargetAuthority";
import {
  CLOUDFLARE_PUBLIC_ORIGIN_HEADER,
  parseCloudflarePublicOrigins,
} from "./cloudflareOriginContracts";

const publicOrigins = [
  "https://smartaihub.app",
  "https://runtime.smartaihub.app",
];
export async function getProductionIngressPreflight(
  db: DrizzleDB,
  identity: { tenantId: string; projectId: string }
) {
  identity = { tenantId: identity.tenantId, projectId: identity.projectId };
  const blocked = (reason: string) => ({ ready: false as const, reason });
  const target = await resolveCloudflareProductionDeploymentTarget({
    db,
    ...identity,
  });
  if (!target) return blocked("PRODUCTION_TARGET_NOT_CONFIGURED");
  const executorId = process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim();
  if (!executorId) return blocked("PRODUCTION_EXECUTOR_ID_NOT_CONFIGURED");
  const { getAppRuntimeConfig } = await import("./appRuntimeConfig");
  const authority = await getAppRuntimeConfig();
  if (!authority.webGatewayToken)
    return blocked("PRODUCTION_APPROVAL_GATEWAY_NOT_CONFIGURED");
  try {
    const response = await fetch(
      `${authority.pythonBackendUrl}/api/v1/approvals/internal/cloudflare-production-capabilities`,
      {
        headers: {
          "x-internal-token": authority.webGatewayToken,
          accept: "application/json",
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );
    const capabilities = await response.json();
    if (
      !response.ok ||
      !Array.isArray(capabilities.grantSchemas) ||
      !capabilities.grantSchemas.includes(
        "cloudflare.production-ingress-grant.v1"
      )
    ) {
      return blocked("PRODUCTION_APPROVAL_INGRESS_CONTRACT_NOT_SERVING");
    }
  } catch {
    return blocked("PRODUCTION_APPROVAL_INGRESS_CONTRACT_UNAVAILABLE");
  }
  const allowed = parseCloudflarePublicOrigins(
    process.env.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS
  );
  if (
    !process.env.AUTH_ORIGIN_TOKEN ||
    !allowed ||
    !publicOrigins.every(origin => allowed.includes(origin))
  ) {
    return blocked("LINUX_ORIGIN_PRODUCTION_TRUST_NOT_CONFIGURED");
  }
  const inventory = await probeCloudflareProductionProviderInventory({
    db,
    ...identity,
  });
  if (
    !("accessChecks" in inventory) ||
    !inventory.accessChecks.zone.complete ||
    !inventory.accessChecks.routes.complete ||
    !inventory.accessChecks.workerDeployments.complete ||
    inventory.accessChecks.workerVersions.some(version => !version.complete) ||
    !inventory.domainRoute.zoneId ||
    !inventory.worker.activeDeploymentId ||
    inventory.worker.versions.length !== 1
  ) {
    return blocked("INGRESS_PROVIDER_INVENTORY_INCOMPLETE");
  }
  if (
    inventory.domainRoute.attached ||
    inventory.domainRoute.conflicting ||
    inventory.domainRoute.routeId
  )
    return blocked("INGRESS_ROUTE_ALREADY_EXISTS");
  const artifact = await resolveLatestPublishedCloudflareStagingArtifact();
  if (!artifact) return blocked("PUBLISHED_CANONICAL_ARTIFACT_UNAVAILABLE");
  const bundle = await resolveCloudflareStagingModules(
    artifact.artifactRef,
    artifact.sourceSha
  );
  if (
    !bundle ||
    !Object.values(bundle.moduleFiles).some(file =>
      new TextDecoder()
        .decode(file.bytes)
        .includes("/_ops/application-canary/ingress/")
    )
  ) {
    return blocked("PUBLISHED_INGRESS_PROBE_ARTIFACT_REQUIRED");
  }
  let sourceEnvironment: "production" | "staging" = "production";
  let configurationRef = target.runtimePolicy;
  if (!configurationRef) {
    const staging = await resolveProviderDeploymentTarget(db, {
      ...identity,
      provider: "cloudflare",
      environment: "staging",
    });
    if (
      staging.status !== "CONFIGURED" ||
      staging.target.accountRef !== target.accountRef ||
      !staging.target.runtimePolicy
    ) {
      return blocked("RETAINED_ORIGIN_TRANSPORT_NOT_CONFIGURED");
    }
    sourceEnvironment = "staging";
    configurationRef = staging.target.runtimePolicy;
  }
  const source = await getCloudflareOriginConfiguration(db, {
    identity: {
      ...identity,
      provider: "cloudflare",
      environment: sourceEnvironment,
    },
    configurationRef,
  }).catch(() => null);
  if (
    !source ||
    source.status !== "STORED" ||
    Date.parse(source.descriptor.expiresAt) <= Date.now() + 30 * 60_000 ||
    new URL(source.descriptor.origin).host !==
      process.env.AUTH_ORIGIN_PRIVATE_HOST ||
    (sourceEnvironment === "production" &&
      source.descriptor.ingressMode !== "production-origin-bridge-v1")
  ) {
    return blocked("RETAINED_ORIGIN_TRANSPORT_NOT_READY");
  }
  const originTrustVerified = await withCloudflareOriginConfiguration(
    db,
    {
      identity: {
        ...identity,
        environment: sourceEnvironment,
        provider: "cloudflare",
      },
      configurationRef,
      configurationDigest: source.configurationDigest,
    },
    async value => {
      if (
        value.secrets.token !== process.env.AUTH_ORIGIN_TOKEN ||
        (sourceEnvironment === "production" &&
          (!value.secrets.applicationCanaryToken ||
            value.secrets.applicationCanaryToken.length < 32))
      )
        return false;
      // runtime.smartaihub.app is an administrative Worker endpoint, not a tenant domain.
      // The protected Worker canary maps only fixed anonymous GET probes to this apex context.
      for (const publicOrigin of ["https://smartaihub.app"]) {
        const response = await fetch(
          new URL("/trpc/auth.me", source.descriptor.origin),
          {
            method: "GET",
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
            headers: {
              "CF-Access-Client-Id": value.secrets.clientId,
              "CF-Access-Client-Secret": value.secrets.secret,
              "x-cloudflare-origin-token": value.secrets.token,
              [CLOUDFLARE_PUBLIC_ORIGIN_HEADER]: publicOrigin,
            },
          }
        );
        if (
          response.status !== 200 ||
          !response.headers.get("content-type")?.includes("application/json")
        ) {
          await response.body?.cancel();
          return false;
        }
        const body = (await response.json()) as {
          error?: unknown;
          result?: { data?: { json?: unknown } };
        };
        if (body.error !== undefined || body.result?.data?.json !== null)
          return false;
      }
      return true;
    }
  ).catch(() => false);
  if (!originTrustVerified) return blocked("RETAINED_ORIGIN_AUTH_PROBE_FAILED");
  const plan = {
    tenantId: identity.tenantId,
    projectId: identity.projectId,
    targetId: target.targetId,
    accountRef: target.accountRef,
    executorId,
    zoneId: inventory.domainRoute.zoneId,
    routePattern: "smartaihub.app/*" as const,
    runtimeBaselineDeploymentId: inventory.worker.activeDeploymentId,
    runtimeBaselineVersionId: inventory.worker.versions[0].versionId,
    artifact: {
      artifactRef: artifact.artifactRef,
      sourceSha: artifact.sourceSha,
      buildDigest: artifact.buildDigest,
    },
    sourceEnvironment,
    sourceConfigurationRef: configurationRef,
    sourceConfigurationDigest: source.configurationDigest,
    origin: source.descriptor.origin,
    transportExpiresAt: source.descriptor.expiresAt,
    exposure: "100-percent-http-origin-bridge" as const,
    previousRoute: { state: "absent" as const },
  };
  return {
    ready: true as const,
    reason: null,
    ...plan,
    planDigest: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}

/** Owner action reuses existing origin transport credentials, never an Owner session.
 * Store a separate production descriptor and preserve the staging target/config. */
export async function prepareProductionIngressOrigin(
  db: DrizzleDB,
  plan: Extract<
    Awaited<ReturnType<typeof getProductionIngressPreflight>>,
    { ready: true }
  >,
  actorUserId: number
) {
  if (plan.sourceEnvironment === "production")
    return {
      configurationRef: plan.sourceConfigurationRef,
      configurationDigest: plan.sourceConfigurationDigest,
    };
  const identity = {
    tenantId: plan.tenantId,
    projectId: plan.projectId,
    environment: "production",
    provider: "cloudflare",
  } as const;
  const source = await getCloudflareOriginConfiguration(db, {
    identity: { ...identity, environment: "staging" },
    configurationRef: plan.sourceConfigurationRef,
  });
  const stored = await withCloudflareOriginConfiguration(
    db,
    {
      identity: { ...identity, environment: "staging" },
      configurationRef: plan.sourceConfigurationRef,
      configurationDigest: plan.sourceConfigurationDigest,
    },
    async value => {
      if (value.secrets.token !== process.env.AUTH_ORIGIN_TOKEN)
        throw new Error("PRODUCTION_ORIGIN_TRANSPORT_IDENTITY_CHANGED");
      return saveCloudflareOriginConfiguration(db, {
        identity,
        actorUserId,
        settings: {
          origin: source.descriptor.origin,
          allowedPublicOrigins: publicOrigins,
          accessApplicationId: source.descriptor.accessApplicationId,
          accessTeamName: source.descriptor.accessTeamName,
          accessAudience: source.descriptor.accessAudience,
          expiresAt: source.descriptor.expiresAt,
          ingressMode: "production-origin-bridge-v1",
        },
        secrets: {
          token: value.secrets.token,
          clientId: value.secrets.clientId,
          secret: value.secrets.secret,
          applicationCanaryToken: randomBytes(32).toString("hex"),
        },
      });
    }
  );
  const rebound = await db
    .update(providerDeploymentTargets)
    .set({
      runtimePolicy: stored.configurationRef,
      updatedBy: actorUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(providerDeploymentTargets.tenantId, plan.tenantId),
        eq(providerDeploymentTargets.projectId, plan.projectId),
        eq(providerDeploymentTargets.environment, "production"),
        eq(providerDeploymentTargets.provider, "cloudflare"),
        eq(providerDeploymentTargets.deploymentTargetId, plan.targetId),
        eq(providerDeploymentTargets.enabled, true),
        eq(providerDeploymentTargets.accountRef, plan.accountRef),
        // The preflight selected an unbound production target. A concurrent change
        // must never be overwritten by this configuration preparation.
        isNull(providerDeploymentTargets.runtimePolicy)
      )
    )
    .returning({ id: providerDeploymentTargets.id });
  if (rebound.length !== 1)
    throw new Error("PRODUCTION_INGRESS_TARGET_CHANGED");
  return {
    configurationRef: stored.configurationRef,
    configurationDigest: stored.configurationDigest,
  };
}

/** A new Owner approval may detach only a canonical successful ingress receipt. */
export async function getProductionIngressRollbackPreflight(
  db: DrizzleDB,
  identity: { tenantId: string; projectId: string },
  sourceJobId: string
) {
  identity = { tenantId: identity.tenantId, projectId: identity.projectId };
  const { workerJobs } = await import("../../drizzle/schema");
  const blocked = (reason: string) => ({ ready: false as const, reason });
  const [source] = await db
    .select()
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.id, sourceJobId),
        eq(workerJobs.tenantId, identity.tenantId),
        eq(workerJobs.jobType, "cloudflare.production.deploy"),
        eq(workerJobs.status, "succeeded")
      )
    )
    .limit(1);
  const parsed = productionIngressJobSchema.safeParse(source?.inputJson);
  if (
    !source ||
    !parsed.success ||
    parsed.data.projectId !== identity.projectId ||
    parsed.data.action !== "ingress-canary"
  )
    return blocked("INGRESS_ROLLBACK_RECEIPT_MISSING");
  const target = await resolveCloudflareProductionDeploymentTarget({
    db,
    ...identity,
  });
  const executorId = process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim();
  if (
    !target ||
    !executorId ||
    target.runtimePolicy !== parsed.data.configurationRef
  )
    return blocked("INGRESS_ROLLBACK_TARGET_CHANGED");
  const output = source.outputJson;
  const operation = {
    ...parsed.data,
    action: "ingress-rollback" as const,
    ingressReceipt: {
      grantRef: output?.grantRef,
      deploymentId: output?.deploymentId,
      versionId: output?.versionId,
      routeId: output?.routeId,
      verifiedAt: output?.verifiedAt,
    },
  };
  const rollback = productionIngressJobSchema.safeParse(operation);
  if (!rollback.success || output?.productionTrafficShifted !== true)
    return blocked("INGRESS_ROLLBACK_RECEIPT_INVALID");
  const inventory = await probeCloudflareProductionProviderInventory({
    db,
    ...identity,
  });
  if (
    !("accessChecks" in inventory) ||
    !inventory.domainRoute.inventoryComplete ||
    inventory.domainRoute.routeId !== output.routeId ||
    inventory.domainRoute.script !== target.workerRef ||
    inventory.worker.activeDeploymentId !== output.deploymentId ||
    inventory.worker.versions.length !== 1 ||
    inventory.worker.versions[0].versionId !== output.versionId
  )
    return blocked("INGRESS_ROLLBACK_PROVIDER_CHANGED");
  const plan = {
    ...identity,
    targetId: target.targetId,
    accountRef: target.accountRef,
    executorId,
    operation: rollback.data,
    exposure: "100-percent-http-origin-bridge" as const,
    sourceJobId,
  };
  return {
    ready: true as const,
    reason: null,
    ...plan,
    planDigest: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}

/** Existing production approval + canonical admission, with a durable same-ID
 * submission checkpoint so a lost response never creates an unrelated job. */
export async function queueProductionIngress(
  db: DrizzleDB,
  input: {
    tenantId: string;
    projectId: string;
    actorUserId: number;
    userToken: string;
    submissionId: string;
    planDigest: string;
    correlationId: string;
    rollbackJobId?: string;
  }
) {
  const { systemSettings, workerJobs } = await import("../../drizzle/schema");
  const { sql } = await import("drizzle-orm");
  const { productionIngressGrantSchema, PRODUCTION_INGRESS_CONTRACT } =
    await import("./cloudflareProductionIngressContract");
  const { getAppRuntimeConfig } = await import("./appRuntimeConfig");
  const { createControlPlaneJob } = await import("./jobControlPlaneGateway");
  const category = "cloudflare_production_ingress_submissions";
  const readJob = async () => {
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(eq(workerJobs.id, input.submissionId))
      .limit(1);
    if (!job) return null;
    if (
      job.tenantId !== input.tenantId ||
      job.requestedByUserId !== input.actorUserId ||
      job.jobType !== "cloudflare.production.deploy" ||
      job.contractVersion !== PRODUCTION_INGRESS_CONTRACT ||
      job.inputJson?.projectId !== input.projectId
    )
      throw new Error("PRODUCTION_INGRESS_JOB_SCOPE_MISMATCH");
    return { jobId: job.id, status: job.status };
  };
  const accepted = await readJob();
  if (accepted) return accepted;
  // Engineering, build/release and queue-capacity waits precede the short
  // operation grant. An unavailable worker does not end the durable mission.
  const executionReadiness = await (await import("./cloudflareExecutionReadiness"))
    .checkCloudflareExecutionReadiness(db);
  if (!executionReadiness.ready) throw new Error(executionReadiness.reason);
  const request = await db.transaction(async tx => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`production-ingress-admission:${input.submissionId}`}))`
    );
    const [previous] = await tx
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, category),
          eq(systemSettings.key, input.submissionId)
        )
      )
      .limit(1);
    if (previous) {
      const stored = previous.valueJson as {
        tenantId: string;
        projectId: string;
        actorUserId: number;
        planDigest: string;
        request: Record<string, unknown>;
      };
      if (
        !stored ||
        stored.tenantId !== input.tenantId ||
        stored.projectId !== input.projectId ||
        stored.actorUserId !== input.actorUserId ||
        stored.planDigest !== input.planDigest ||
        previous.updatedBy !== input.actorUserId
      )
        throw new Error("PRODUCTION_INGRESS_SUBMISSION_SCOPE_MISMATCH");
      return stored.request;
    }
    const scopedDb = tx as unknown as DrizzleDB;
    const plan = input.rollbackJobId
      ? await getProductionIngressRollbackPreflight(
          scopedDb,
          input,
          input.rollbackJobId
        )
      : await getProductionIngressPreflight(scopedDb, input);
    if (!plan.ready) throw new Error(plan.reason);
    if (plan.planDigest !== input.planDigest)
      throw new Error("PRODUCTION_INGRESS_PLAN_CHANGED");
    let operation;
    if ("operation" in plan)
      operation = { ...plan.operation, grantRef: input.submissionId };
    else {
      const configuration = await prepareProductionIngressOrigin(
        scopedDb,
        plan,
        input.actorUserId
      );
      operation = {
        contractVersion: PRODUCTION_INGRESS_CONTRACT,
        grantRef: input.submissionId,
        projectId: input.projectId,
        targetId: plan.targetId,
        environment: "production",
        zoneId: plan.zoneId,
        routePattern: plan.routePattern,
        action: "ingress-canary",
        runtimeBaselineDeploymentId: plan.runtimeBaselineDeploymentId,
        runtimeBaselineVersionId: plan.runtimeBaselineVersionId,
        previousRoute: plan.previousRoute,
        ingressReceipt: null,
        ...plan.artifact,
        ...configuration,
      };
    }
    const request = {
      schemaVersion: "cloudflare.production-ingress-grant.v1",
      idempotencyKey: `cf-production-ingress:${input.submissionId}`,
      projectId: input.projectId,
      executorId: plan.executorId,
      targetId: plan.targetId,
      environment: "production",
      accountRef: plan.accountRef,
      jobId: input.submissionId,
      operation,
      exposure: plan.exposure,
      actions: ["deploy", "rollback"],
      maxDurationSeconds: 900,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    };
    await tx
      .insert(systemSettings)
      .values({
        category,
        key: input.submissionId,
        valueJson: {
          tenantId: input.tenantId,
          projectId: input.projectId,
          actorUserId: input.actorUserId,
          planDigest: input.planDigest,
          request,
        },
        isSensitive: false,
        updatedBy: input.actorUserId,
        description:
          "Exact production ingress submission checkpoint; not a grant or job",
      });
    return request;
  });
  const config = await getAppRuntimeConfig();
  const response = await fetch(
    `${config.pythonBackendUrl}/api/v1/approvals/cloudflare-production-grants`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.userToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    }
  );
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(`PRODUCTION_INGRESS_GRANT_HTTP_${response.status}`);
  const parsed = productionIngressGrantSchema.safeParse(result?.payload);
  if (
    result?.status !== "approved" ||
    !parsed.success ||
    parsed.data.jobId !== input.submissionId ||
    parsed.data.tenantId !== input.tenantId ||
    parsed.data.requesterUserId !== input.actorUserId ||
    parsed.data.projectId !== input.projectId
  )
    throw new Error("PRODUCTION_INGRESS_GRANT_INVALID");
  try {
    await createControlPlaneJob({
      context: {
        tenantId: input.tenantId,
        actorType: "user",
        actorId: input.actorUserId,
        authorizationScope: "infrastructure.cloudflare_production_ingress",
        correlationId: input.correlationId,
        idempotencyKey: `cf-production-ingress:${input.submissionId}`,
      },
      definition: {
        contractVersion: PRODUCTION_INGRESS_CONTRACT,
        jobType: "cloudflare.production.deploy",
        executionClass: "long",
        priority: 50,
        input: parsed.data.operation,
        idempotencyKey: `cf-production-ingress:${input.submissionId}`,
        activeDedupeKey: `cf-production-ingress:${input.tenantId}:${input.projectId}`,
        retryPolicy: {
          maxAttempts: 1,
          baseDelayMs: 0,
          maxDelayMs: 0,
          jitter: "none",
          deadlineMs: 900000,
          deadlineMode: "fixed",
          allowedErrorClasses: [],
        },
        timeoutPolicy: { softTimeoutMs: 30000, hardTimeoutMs: 900000 },
      },
      createOptions: {
        canonicalJobId: input.submissionId,
        runtimeType: "node_job_worker",
        // Persist this already approved, deduplicated provider operation before
        // a shared long-job slot is available. Execution retains grant expiry,
        // lease/fencing and provider authorization checks.
        admissionMode: "durable_queue",
      },
    });
  } catch (error) {
    const reconciled = await readJob();
    if (reconciled) return reconciled;
    const code =
      (error as { code?: unknown; cause?: { code?: unknown } })?.code ??
      (error as { cause?: { code?: unknown } })?.cause?.code;
    if (
      typeof code === "string" &&
      /^(?:JOB_[A-Z_]+|IDEMPOTENCY_CONFLICT|(?:22|23|42)[A-Z0-9]{3})$/.test(
        code
      )
    ) {
      throw new Error(`PRODUCTION_INGRESS_ADMISSION_REJECTED:${code}`);
    }
    throw new Error("PRODUCTION_INGRESS_ADMISSION_UNKNOWN");
  }
  const reconciled = await readJob();
  if (!reconciled) throw new Error("PRODUCTION_INGRESS_ADMISSION_UNKNOWN");
  return reconciled;
}
