import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const retired = /(?:agency|agencies|sandbox|workpack|workflow|work_request)/i;
const scopeSchema = z.object({ tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36) }).strict();
export const applicationDatabaseRolePlanSchema = z.object({
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36), databaseName: identifier,
  tables: z.array(identifier).min(1).max(1024), sequences: z.array(identifier).max(1024),
  expiresAt: z.string().datetime({ offset: true }), connectionLimit: z.literal(10),
}).strict().refine(p => [...p.tables, ...p.sequences].every(name => !retired.test(name)) &&
  new Set(p.tables).size === p.tables.length && new Set(p.sequences).size === p.sequences.length);
export type ApplicationDatabaseRolePlan = z.infer<typeof applicationDatabaseRolePlanSchema>;
export const applicationDatabaseRoleName = (scope: { tenantId: string; projectId: string }) => {
  scopeSchema.parse({ tenantId: scope.tenantId, projectId: scope.projectId });
  return `sah_cf_app_${createHash("sha256").update(`${scope.tenantId}|${scope.projectId}`).digest("hex").slice(0, 12)}`;
};
export function applicationDatabaseRolePlanDigest(value: ApplicationDatabaseRolePlan) {
  const p = applicationDatabaseRolePlanSchema.parse(value);
  return createHash("sha256").update(JSON.stringify({ ...p, tables: [...p.tables].sort(), sequences: [...p.sequences].sort() })).digest("hex");
}
const quote = (name: string) => `"${identifier.parse(name)}"`;
const deny = (): never => { throw Error("APPLICATION_DATABASE_ROLE_PREPARATION_DENIED"); };

/** A trusted canonical runtime executor supplies BOTH checks and checkpoint
 * persistence. A successful Candidate METADATA job is not this authority.
 * All role DDL and the encrypted checkpoint commit atomically; failures never
 * leave an unowned login, and no password appears in a job receipt or error. */
export async function prepareApplicationDatabaseRole(db: DrizzleDB, input: {
  plan: ApplicationDatabaseRolePlan;
  assertAuthorized(): Promise<void>;
  saveSecret(tx: DrizzleDB, secret: { role: string; password: string; planDigest: string }): Promise<void>;
}) {
  const plan = applicationDatabaseRolePlanSchema.parse(input.plan), role = applicationDatabaseRoleName({ tenantId: plan.tenantId, projectId: plan.projectId });
  const expires = Date.parse(plan.expiresAt), now = Date.now();
  // First live runtime test only. Long-lived activation has separate authority.
  if (expires <= now + 60_000 || expires > now + 3_600_000) deny();
  const planDigest = applicationDatabaseRolePlanDigest(plan), password = randomBytes(32).toString("hex");
  await input.assertAuthorized();
  try {
    return await db.transaction(async raw => {
      const tx = raw as unknown as DrizzleDB;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloudflare-app-role:${role}`}))`);
      await input.assertAuthorized();
      const identity = await tx.execute(sql`SELECT current_database() AS name`);
      if (identity.length !== 1 || identity[0].name !== plan.databaseName) deny();
      if ((await tx.execute(sql`SELECT 1 FROM pg_roles WHERE rolname=${role}`)).length) deny();
      // Pin every selected existing relation; never ALL TABLES, default future
      // grants, ownership, role membership, RLS bypass or policy changes.
      for (const name of plan.tables) {
        const rows = await tx.execute(sql`SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=${name} AND c.relkind IN ('r','p')`);
        if (rows.length !== 1) deny();
      }
      for (const name of plan.sequences) {
        const rows = await tx.execute(sql`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=${name} AND c.relkind='S'`);
        if (rows.length !== 1) deny();
      }
      // Interpolated values below have strict identifier/hex/ISO validation.
      // Catch raw driver failures here: their query text may contain a password.
      await tx.execute(sql.raw(`CREATE ROLE ${quote(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10 PASSWORD '${password}' VALID UNTIL '${new Date(expires).toISOString()}'`));
      await tx.execute(sql.raw(`GRANT CONNECT ON DATABASE ${quote(plan.databaseName)} TO ${quote(role)}`));
      await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${quote(role)}`));
      await tx.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${plan.tables.map(quote).join(",")} TO ${quote(role)}`));
      if (plan.sequences.length) await tx.execute(sql.raw(`GRANT USAGE, SELECT ON SEQUENCE ${plan.sequences.map(quote).join(",")} TO ${quote(role)}`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET statement_timeout='15s'`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET lock_timeout='3s'`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET idle_in_transaction_session_timeout='15s'`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET search_path TO pg_catalog, public`));
      const [observed] = await tx.execute(sql`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit
        FROM pg_roles WHERE rolname=${role}`);
      if (!observed?.rolcanlogin || observed.rolsuper || observed.rolcreatedb || observed.rolcreaterole || observed.rolinherit ||
          observed.rolreplication || observed.rolbypassrls || observed.rolconnlimit !== 10) deny();
      await input.saveSecret(tx, { role, password, planDigest });
      await input.assertAuthorized();
      return { schemaVersion: "cloudflare-application-database-role-v1", role, planDigest,
        tables: plan.tables, sequences: plan.sequences, expiresAt: plan.expiresAt,
        superuser: false, bypassRls: false, ddlGranted: false, policiesChanged: false, linuxRoleChanged: false };
    });
  } catch { return deny(); }
}
