import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { workerJobs } from "../../drizzle/schema";
import { PUBLIC_RUNNER_RELEASE_SELECT, PUBLIC_RUNNER_RELEASE_PREDICATE, publicRunnerReleaseView } from "../../../../packages/shared/src/cloudflarePublicReleases.ts";
import { PRIVATE_DATABASE_CONTRACT, PRIVATE_DATABASE_JOB, privateDatabaseJobSchema, privateDatabaseResourceDigest,
  type PrivateDatabaseGrant } from "./cloudflarePrivateDatabaseContract";
import { PrivateDatabaseError, type PrivateDatabaseCheckpoint } from "./cloudflarePrivateDatabaseTransport";

type Store = Parameters<Parameters<import("../db").DrizzleDB["transaction"]>[0]>[0];
const deny = () => { throw new PrivateDatabaseError("PRIVATE_DATABASE_PUBLIC_CATALOG_SOURCE_DENIED"); };

/** Called in the existing executor's DB transaction, after grant/lease checks.
 * Reuse is historical receipt validation, never same-name resource adoption.
 * The exact original connection plan/expiry and password remain unchanged. */
export async function reusePublicCatalogCheckpoint(tx: Store, g: PrivateDatabaseGrant,
  load: (store: Store, grant: PrivateDatabaseGrant) => Promise<PrivateDatabaseCheckpoint>): Promise<PrivateDatabaseCheckpoint> {
  const sourceId = g.plan.publicRunnerCatalogSourceJobId;
  if (!sourceId || sourceId === g.jobId) return deny();
  const [source] = await tx.select().from(workerJobs).where(eq(workerJobs.id, sourceId)).for("share");
  const parsed = privateDatabaseJobSchema.safeParse(source?.inputJson), digest = privateDatabaseResourceDigest(g.plan);
  const output = source?.outputJson as Record<string, unknown> | null;
  if (!source || source.status !== "succeeded" || source.operatorReviewRequired || source.jobType !== PRIVATE_DATABASE_JOB ||
      source.contractVersion !== PRIVATE_DATABASE_CONTRACT || source.tenantId !== g.tenantId || source.requestedByUserId !== g.requesterUserId ||
      !parsed.success || parsed.data.projectId !== g.projectId || parsed.data.planDigest !== digest ||
      !output || output.planDigest !== digest || output.accountRef !== g.accountRef || output.namespace !== g.plan.namespace ||
      output.hostname !== g.plan.hostname || output.tunnelId !== g.plan.tunnelId || output.sslmode !== "verify-full" ||
      output.cachingDisabled !== true || output.providerConfigurationVerified !== true || output.activation !== "disabled" ||
      output.databaseAccess !== "read_only_connection_probe") return deny();
  const state = await load(tx, { ...g, jobId: sourceId, planDigest: digest });
  if (state.pending || state.continuedByJobId || state.publicCatalog || !state.databaseRolePrepared || !state.databasePassword ||
      !state.hyperdriveId || !state.caId || !state.appId || !state.policyId || !state.dnsRecordId || !state.serviceToken ||
      state.hyperdriveId !== output.hyperdriveId || state.caId !== output.caId || state.appId !== output.accessApplicationId ||
      state.policyId !== output.accessPolicyId || state.dnsRecordId !== output.dnsRecordId ||
      (output.serviceTokenId !== state.serviceToken.id && output.serviceTokenId !== "[REDACTED]") ||
      Date.parse(state.serviceToken.expiresAt) < Date.parse(g.plan.configurationExpiresAt)) return deny();
  const { resumedFromJobId: _history, ...copied } = state;
  return { ...copied, planDigest: g.planDigest };
}

/** A role gets only public-view SELECT. No base-table read/write or global
 * grants, no ALTER TABLE, no password reset, no extension of credential TTL. */
export async function preparePublicCatalogView(tx: Store, g: PrivateDatabaseGrant, state: PrivateDatabaseCheckpoint,
  role: string): Promise<PrivateDatabaseCheckpoint> {
  const sourceProvisionJobId = g.plan.publicRunnerCatalogSourceJobId;
  if (!sourceProvisionJobId) return state;
  const viewName = publicRunnerReleaseView(g.plan.namespace);
  const [scope] = await tx.execute(sql`SELECT has_any_column_privilege(${role},'public.runner_release_assets','SELECT') AS base_read,
    has_table_privilege(${role},'public.runner_release_assets','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS base_write`);
  if (scope?.base_read || scope?.base_write) throw new PrivateDatabaseError("PRIVATE_DATABASE_PUBLIC_CATALOG_ROLE_SCOPE_DENIED");
  const readView = async () => {
    const rows = await tx.execute(sql`SELECT c.relkind,c.reloptions,pg_get_viewdef(c.oid,true) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=${viewName}`);
    return rows[0];
  };
  let existing = await readView();
  if (state.publicCatalog) {
    if (state.publicCatalog.viewName !== viewName || state.publicCatalog.sourceProvisionJobId !== sourceProvisionJobId ||
        !existing || existing.relkind !== "v" || !Array.isArray(existing.reloptions) || !existing.reloptions.includes("security_barrier=true") ||
        createHash("sha256").update(String(existing.definition)).digest("hex") !== state.publicCatalog.definitionSha256)
      throw new PrivateDatabaseError("PRIVATE_DATABASE_PUBLIC_CATALOG_VIEW_DRIFT");
    const rows = await tx.execute(sql`SELECT has_table_privilege(${role},${`public.${viewName}`},'SELECT') AS allowed`);
    if (rows[0]?.allowed !== true) throw new PrivateDatabaseError("PRIVATE_DATABASE_PUBLIC_CATALOG_VIEW_DRIFT");
    return state;
  }
  if (existing) throw new PrivateDatabaseError("PRIVATE_DATABASE_PUBLIC_CATALOG_VIEW_COLLISION");
  // Identifiers are derived here from the strictly parsed namespace, never SQL
  // supplied by a caller. View creation, grants and encrypted receipt commit together.
  await tx.execute(sql.raw(`CREATE VIEW public."${viewName}" WITH (security_barrier=true) AS SELECT ${PUBLIC_RUNNER_RELEASE_SELECT}
    FROM public.runner_release_assets WHERE ${PUBLIC_RUNNER_RELEASE_PREDICATE}`));
  await tx.execute(sql.raw(`REVOKE ALL ON public."${viewName}" FROM PUBLIC`));
  await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO "${role}"`));
  await tx.execute(sql.raw(`GRANT SELECT ON public."${viewName}" TO "${role}"`));
  existing = await readView();
  return { ...state, publicCatalog: { viewName, sourceProvisionJobId,
    definitionSha256: createHash("sha256").update(String(existing!.definition)).digest("hex") } };
}
