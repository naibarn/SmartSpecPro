import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { decrypt, encrypt } from "./crypto";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import { prepareCloudflareProductionRuntimeRole } from "./cloudflareProductionDatabaseRole";
import type { JobExecutor } from "./jobExecutor";
import {
  productionDatabaseResourcePlanDigest,
  productionDatabaseResourcePlanSchema,
  productionDatabaseProvisionCheckpointSchema,
  provisionCloudflareProductionDatabase,
  type ProductionDatabaseProvisionCheckpoint,
  type ProductionDatabaseResourcePlan,
} from "./cloudflareProductionDatabaseProvision";

export const CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT =
  "cloudflare-prod-db-provision-v1" as const;
export const CLOUDFLARE_PRODUCTION_DATABASE_JOB =
  "cloudflare.production.database.provision" as const;
export const CLOUDFLARE_PRODUCTION_DATABASE_GRANT =
  "cloudflare.production-database-provision-grant.v1" as const;
const GRANT_CATEGORY = "cloudflare_production_database_grants";
const CHECKPOINT_CATEGORY = "cloudflare_production_database_runs";

export class CloudflareProductionDatabaseJobError extends Error {
  readonly class: "permanent" | "retryable" | "unknown";
  constructor(
    readonly diagnosticCode: string,
    errorClass: "permanent" | "retryable" | "unknown" = "permanent"
  ) {
    super(diagnosticCode);
    this.name = "CloudflareProductionDatabaseJobError";
    this.class = errorClass;
  }
}

export type CloudflareProductionDatabaseGrant = {
  schemaVersion: typeof CLOUDFLARE_PRODUCTION_DATABASE_GRANT;
  grantRef: string;
  jobId: string;
  tenantId: string;
  projectId: string;
  requesterUserId: number;
  targetId: "smartspec-cloudflare-runtime";
  environment: "production";
  accountRef: string;
  plan: ProductionDatabaseResourcePlan;
  planDigest: string;
  expiresAt: string;
  revokedAt: string | null;
};

type SecretGrant = {
  grant: CloudflareProductionDatabaseGrant;
  databasePassword: string;
};
const grantSchema = z
  .object({
    schemaVersion: z.literal(CLOUDFLARE_PRODUCTION_DATABASE_GRANT),
    grantRef: z.string().uuid(),
    jobId: z.string().uuid(),
    tenantId: z.string().min(1).max(36),
    projectId: z.string().min(1).max(36),
    requesterUserId: z.number().int().positive(),
    targetId: z.literal("smartspec-cloudflare-runtime"),
    environment: z.literal("production"),
    accountRef: z.string().regex(/^[a-f0-9]{32}$/),
    plan: productionDatabaseResourcePlanSchema,
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    value =>
      value.planDigest === productionDatabaseResourcePlanDigest(value.plan)
  );
const secretGrantSchema = z
  .object({
    grant: grantSchema,
    databasePassword: z.string().min(32).max(1024),
  })
  .strict();
export type CloudflareProductionDatabaseRuntime = {
  db: DrizzleDB;
  resolveTarget(
    tenantId: string,
    projectId: string
  ): Promise<
    Awaited<ReturnType<typeof resolveCloudflareProductionDeploymentTarget>>
  >;
  resolveGrant(jobId: string): Promise<SecretGrant | null>;
  withCredential<T>(
    projectId: string,
    tenantId: string,
    credentialRef: string,
    op: (token: string) => Promise<T>
  ): Promise<T>;
  prepareRuntimeRole(plan: ProductionDatabaseResourcePlan, databasePassword: string, planDigest: string): Promise<{
    role: string; databaseName: string; connectionLimit: number; rolePrepared: true;
    leastPrivilegeScope: "cloudflare_emergency_intake_v1"; tableCount: number; ownershipMarker: string;
  }>;
  checkpoint(
    jobId: string,
    actorId: number,
    planDigest: string
  ): Promise<ProductionDatabaseProvisionCheckpoint | undefined>;
  saveCheckpoint(
    jobId: string,
    actorId: number,
    planDigest: string,
    checkpoint: ProductionDatabaseProvisionCheckpoint
  ): Promise<void>;
  fetchImpl?: typeof fetch;
};

function grantKey(jobId: string) {
  return jobId;
}

/** Persist a job-scoped owner authorization and its generated DB password encrypted at rest. */
export async function saveCloudflareProductionDatabaseGrant(
  db: DrizzleDB,
  grant: CloudflareProductionDatabaseGrant,
  databasePassword: string
) {
  const parsedGrant = grantSchema.safeParse(grant);
  const plan = productionDatabaseResourcePlanSchema.parse(grant.plan);
  if (
    !parsedGrant.success ||
    grant.schemaVersion !== CLOUDFLARE_PRODUCTION_DATABASE_GRANT ||
    grant.environment !== "production" ||
    grant.targetId !== "smartspec-cloudflare-runtime" ||
    grant.planDigest !== productionDatabaseResourcePlanDigest(plan) ||
    grant.expiresAt.length === 0 ||
    Date.parse(grant.expiresAt) <= Date.now() ||
    databasePassword.length < 32
  ) {
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_INVALID");
  }
  const value = encrypt(
    JSON.stringify({ grant, databasePassword } satisfies SecretGrant)
  );
  await db.transaction(async tx => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${grant.jobId}))`
    );
    const where = and(
      eq(systemSettings.category, GRANT_CATEGORY),
      eq(systemSettings.key, grantKey(grant.jobId))
    );
    const rows = await tx
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(where)
      .limit(2);
    if (rows.length)
      throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_EXISTS");
    await tx.insert(systemSettings).values({
      category: GRANT_CATEGORY,
      key: grantKey(grant.jobId),
      value,
      isSensitive: true,
      updatedBy: grant.requesterUserId,
      description:
        "Encrypted job-scoped Production database provisioning authority",
    });
  });
}

/** Read an existing job grant without exposing its encrypted password. This is
 * used to reconcile an uncertain admission retry using the same canonical
 * job ID; callers must still verify the grant's exact owner and resource scope.
 */
export async function readCloudflareProductionDatabaseGrant(
  db: DrizzleDB,
  jobId: string,
): Promise<CloudflareProductionDatabaseGrant | null> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, GRANT_CATEGORY),
        eq(systemSettings.key, grantKey(jobId)),
      ),
    )
    .limit(2);
  if (!rows.length) return null;
  if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value || !rows[0].updatedBy) {
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_INVALID");
  }
  try {
    const parsed = secretGrantSchema.safeParse(JSON.parse(decrypt(rows[0].value)));
    if (
      !parsed.success ||
      parsed.data.grant.jobId !== jobId ||
      parsed.data.grant.requesterUserId !== rows[0].updatedBy
    ) {
      throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_INVALID");
    }
    return parsed.data.grant;
  } catch (error) {
    if (error instanceof Error && error.message === "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_INVALID") throw error;
    throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_INVALID");
  }
}

export async function revokeCloudflareProductionDatabaseGrant(
  db: DrizzleDB,
  jobId: string,
  actorUserId: number
) {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${jobId}))`);
    const rows = await tx
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, GRANT_CATEGORY),
          eq(systemSettings.key, jobId)
        )
      )
      .limit(2);
    if (rows.length !== 1 || !rows[0].isSensitive || !rows[0].value)
      throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_NOT_FOUND");
    let secure: SecretGrant;
    try {
      const parsed = secretGrantSchema.safeParse(
        JSON.parse(decrypt(rows[0].value))
      );
      if (!parsed.success) throw Error();
      secure = parsed.data;
    } catch {
      throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_DENIED");
    }
    if (
      secure.grant.requesterUserId !== actorUserId ||
      secure.grant.jobId !== jobId
    )
      throw new Error("CLOUDFLARE_PRODUCTION_DATABASE_GRANT_DENIED");
    if (secure.grant.revokedAt) return;
    const value = encrypt(
      JSON.stringify({
        ...secure,
        grant: { ...secure.grant, revokedAt: new Date().toISOString() },
      } satisfies SecretGrant)
    );
    await tx
      .update(systemSettings)
      .set({ value, valueJson: null, isSensitive: true, updatedAt: new Date() })
      .where(eq(systemSettings.id, rows[0].id));
  });
}

export function createCloudflareProductionDatabaseRuntime(
  options: { db?: DrizzleDB; fetchImpl?: typeof fetch } = {}
): CloudflareProductionDatabaseRuntime {
  const db = options.db ?? getDb();
  return {
    db,
    fetchImpl: options.fetchImpl,
    async resolveTarget(tenantId, projectId) {
      return resolveCloudflareProductionDeploymentTarget({
        db,
        tenantId,
        projectId,
      });
    },
    async resolveGrant(jobId) {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, GRANT_CATEGORY),
            eq(systemSettings.key, grantKey(jobId))
          )
        )
        .limit(2);
      if (
        rows.length !== 1 ||
        !rows[0].isSensitive ||
        !rows[0].value ||
        !rows[0].updatedBy
      )
        return null;
      try {
        const parsed = secretGrantSchema.safeParse(
          JSON.parse(decrypt(rows[0].value))
        );
        if (
          !parsed.success ||
          parsed.data.grant.jobId !== jobId ||
          parsed.data.grant.requesterUserId !== rows[0].updatedBy ||
          parsed.data.grant.revokedAt !== null
        )
          return null;
        return parsed.data;
      } catch {
        return null;
      }
    },
    async withCredential(projectId, tenantId, credentialRef, op) {
      const result = await withCloudflareDeploymentCredential(
        db,
        {
          identity: {
            projectId,
            tenantId,
            provider: "cloudflare",
            environment: "production",
          },
          credentialRef,
        },
        op
      );
      if (result.status !== "CONFIGURED" || result.value === undefined)
        throw new CloudflareProductionDatabaseJobError(
          "CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_UNAVAILABLE"
        );
      return result.value;
    },
    async prepareRuntimeRole(plan, databasePassword, planDigest) {
      return prepareCloudflareProductionRuntimeRole({ db, plan, databasePassword, planDigest });
    },
    async checkpoint(jobId, actorId, planDigest) {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CHECKPOINT_CATEGORY),
            eq(systemSettings.key, jobId)
          )
        )
        .limit(2);
      if (!rows.length) return undefined;
      if (
        rows.length !== 1 ||
        !rows[0].isSensitive ||
        !rows[0].value ||
        rows[0].updatedBy !== actorId
      )
        throw new CloudflareProductionDatabaseJobError(
          "CLOUDFLARE_PRODUCTION_DATABASE_CHECKPOINT_DENIED",
          "unknown"
        );
      const parsed = productionDatabaseProvisionCheckpointSchema.safeParse(
        JSON.parse(decrypt(rows[0].value))
      );
      if (
        !parsed.success ||
        parsed.data.jobId !== jobId ||
        parsed.data.planDigest !== planDigest
      )
        throw new CloudflareProductionDatabaseJobError(
          "CLOUDFLARE_PRODUCTION_DATABASE_CHECKPOINT_DENIED",
          "unknown"
        );
      return parsed.data;
    },
    async saveCheckpoint(jobId, actorId, planDigest, checkpoint) {
      const parsed =
        productionDatabaseProvisionCheckpointSchema.parse(checkpoint);
      if (parsed.jobId !== jobId || parsed.planDigest !== planDigest)
        throw new CloudflareProductionDatabaseJobError(
          "CLOUDFLARE_PRODUCTION_DATABASE_CHECKPOINT_DENIED",
          "unknown"
        );
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${jobId}))`);
        const where = and(
          eq(systemSettings.category, CHECKPOINT_CATEGORY),
          eq(systemSettings.key, jobId)
        );
        const rows = await tx
          .select({
            id: systemSettings.id,
            updatedBy: systemSettings.updatedBy,
          })
          .from(systemSettings)
          .where(where)
          .limit(2);
        if (rows.length > 1 || (rows[0] && rows[0].updatedBy !== actorId))
          throw new CloudflareProductionDatabaseJobError(
            "CLOUDFLARE_PRODUCTION_DATABASE_CHECKPOINT_DENIED",
            "unknown"
          );
        const value = encrypt(JSON.stringify(parsed));
        if (rows[0])
          await tx
            .update(systemSettings)
            .set({
              value,
              valueJson: null,
              isSensitive: true,
              updatedAt: new Date(),
            })
            .where(eq(systemSettings.id, rows[0].id));
        else
          await tx.insert(systemSettings).values({
            category: CHECKPOINT_CATEGORY,
            key: jobId,
            value,
            isSensitive: true,
            updatedBy: actorId,
            description:
              "Encrypted canonical Production database provisioning checkpoint",
          });
      });
    },
  };
}

/** Canonical job executor: exact target + grant + live fenced lease on every provider call. */
export function createCloudflareProductionDatabaseExecutor(
  runtime:
    | CloudflareProductionDatabaseRuntime
    | (() => CloudflareProductionDatabaseRuntime) = createCloudflareProductionDatabaseRuntime
): JobExecutor {
  return async ({ context, lease, reporter, controlPlane }) => {
    if (
      context.jobType !== CLOUDFLARE_PRODUCTION_DATABASE_JOB ||
      context.contractVersion !== CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT
    )
      throw new CloudflareProductionDatabaseJobError(
        "CLOUDFLARE_PRODUCTION_DATABASE_JOB_INVALID"
      );
    const input = context.input as Record<string, unknown>;
    if (
      !input ||
      Object.keys(input).length !== 6 ||
      input.contractVersion !== CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT ||
      typeof input.projectId !== "string" ||
      input.targetId !== "smartspec-cloudflare-runtime" ||
      input.environment !== "production" ||
      typeof input.grantRef !== "string" ||
      typeof input.planDigest !== "string"
    ) {
      throw new CloudflareProductionDatabaseJobError(
        "CLOUDFLARE_PRODUCTION_DATABASE_JOB_INVALID"
      );
    }
    const active = typeof runtime === "function" ? runtime() : runtime;
    const target = await active.resolveTarget(
      context.tenantId,
      input.projectId
    );
    if (!target)
      throw new CloudflareProductionDatabaseJobError(
        "CLOUDFLARE_PRODUCTION_DATABASE_TARGET_DENIED"
      );
    const secured = await active.resolveGrant(context.jobId);
    if (!secured)
      throw new CloudflareProductionDatabaseJobError(
        "CLOUDFLARE_PRODUCTION_DATABASE_GRANT_UNAVAILABLE"
      );
    const { grant, databasePassword } = secured;
    if (
      grant.schemaVersion !== CLOUDFLARE_PRODUCTION_DATABASE_GRANT ||
      grant.grantRef !== input.grantRef ||
      grant.jobId !== context.jobId ||
      grant.tenantId !== context.tenantId ||
      grant.projectId !== input.projectId ||
      grant.requesterUserId !== context.requestedByUserId ||
      grant.targetId !== target.targetId ||
      grant.environment !== "production" ||
      grant.accountRef !== target.accountRef ||
      grant.revokedAt !== null ||
      Date.parse(grant.expiresAt) <= Date.now() ||
      grant.planDigest !== productionDatabaseResourcePlanDigest(grant.plan) ||
      input.planDigest !== grant.planDigest ||
      typeof databasePassword !== "string" ||
      databasePassword.length < 32
    ) {
      throw new CloudflareProductionDatabaseJobError(
        "CLOUDFLARE_PRODUCTION_DATABASE_AUTHORITY_DENIED"
      );
    }
    let fingerprint: string | undefined;
    let heartbeatAt = Date.now();
    const assertAuthorized = async () => {
      await reporter.assertActive(lease);
      if (Date.now() - heartbeatAt >= 20_000) {
        await reporter.heartbeat(lease);
        heartbeatAt = Date.now();
      }
      const status = await controlPlane.getStatus(context.jobId, {
        tenantId: context.tenantId,
      });
      if (
        !status?.lease.active ||
        status.lease.stale ||
        !status.lease.expiresAt ||
        Date.parse(status.lease.expiresAt) <= Date.now() ||
        status.lease.fencingVersion !== lease.fencingVersion ||
        status.attempt !== context.attempt ||
        Date.parse(context.createdAt) +
          getEffectiveWorkerJobDeadlineMs({
            ...context,
            runtimeType: "node_job_worker",
          }) <=
          Date.now()
      ) {
        throw new CloudflareProductionDatabaseJobError(
          "CLOUDFLARE_PRODUCTION_DATABASE_LEASE_EXPIRED"
        );
      }
      const live = await active.resolveGrant(context.jobId);
      if (
        !live ||
        JSON.stringify(live) !== JSON.stringify(secured) ||
        Date.parse(live.grant.expiresAt) <= Date.now()
      )
        throw new CloudflareProductionDatabaseJobError(
          "CLOUDFLARE_PRODUCTION_DATABASE_AUTHORITY_REVOKED"
        );
      const current = await active.resolveTarget(
        context.tenantId,
        input.projectId as string
      );
      if (
        !current ||
        current.accountRef !== target.accountRef ||
        current.credentialRef !== target.credentialRef ||
        current.workerRef !== target.workerRef
      )
        throw new CloudflareProductionDatabaseJobError(
          "CLOUDFLARE_PRODUCTION_DATABASE_TARGET_CHANGED"
        );
      if (fingerprint)
        await active.withCredential(
          input.projectId as string,
          context.tenantId,
          target.credentialRef,
          async token => {
            if (
              createHash("sha256").update(token).digest("hex") !== fingerprint
            )
              throw new CloudflareProductionDatabaseJobError(
                "CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_CHANGED"
              );
          }
        );
    };
    await assertAuthorized();
    const runtimeRole = await active.prepareRuntimeRole(grant.plan, databasePassword, grant.planDigest);
    await assertAuthorized();
    const checkpoint = await active.checkpoint(
      context.jobId,
      grant.requesterUserId,
      grant.planDigest
    );
    const configured = await active.withCredential(
      input.projectId,
      context.tenantId,
      target.credentialRef,
      async token => {
        fingerprint = createHash("sha256").update(token).digest("hex");
        return provisionCloudflareProductionDatabase({
          jobId: context.jobId,
          accountRef: target.accountRef,
          token,
          plan: grant.plan,
          planDigest: grant.planDigest,
          databasePassword,
          checkpoint,
          saveCheckpoint: state =>
            active.saveCheckpoint(
              context.jobId,
              grant.requesterUserId,
              grant.planDigest,
              state
            ),
          assertAuthorized,
          fetchImpl: active.fetchImpl,
        });
      }
    );
    await assertAuthorized();
    return {
      output: {
        ...configured,
        runtimeRolePrepared: runtimeRole.rolePrepared,
        runtimeRole: {
          databaseName: runtimeRole.databaseName,
          role: runtimeRole.role,
          rolePrepared: runtimeRole.rolePrepared,
          connectionLimit: runtimeRole.connectionLimit,
          leastPrivilegeScope: runtimeRole.leastPrivilegeScope,
          tableCount: runtimeRole.tableCount,
        },
        grantRef: grant.grantRef,
        tenantId: grant.tenantId,
        projectId: grant.projectId,
        targetId: grant.targetId,
        environment: grant.environment,
        jobId: grant.jobId,
      },
    };
  };
}

export function createProductionDatabaseGrant(input: {
  jobId: string;
  tenantId: string;
  projectId: string;
  requesterUserId: number;
  accountRef: string;
  plan: ProductionDatabaseResourcePlan;
  expiresAt?: Date;
}): { grant: CloudflareProductionDatabaseGrant; databasePassword: string } {
  const plan = productionDatabaseResourcePlanSchema.parse(input.plan),
    planDigest = productionDatabaseResourcePlanDigest(plan);
  const grant: CloudflareProductionDatabaseGrant = {
    schemaVersion: CLOUDFLARE_PRODUCTION_DATABASE_GRANT,
    grantRef: randomUUID(),
    jobId: input.jobId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    requesterUserId: input.requesterUserId,
    targetId: "smartspec-cloudflare-runtime",
    environment: "production",
    accountRef: input.accountRef,
    plan,
    planDigest,
    expiresAt: (
      input.expiresAt ?? new Date(Date.now() + 15 * 60_000)
    ).toISOString(),
    revokedAt: null,
  };
  return { grant, databasePassword: randomBytes(48).toString("base64url") };
}

export function newProductionDatabaseJobId() {
  return randomUUID();
}
