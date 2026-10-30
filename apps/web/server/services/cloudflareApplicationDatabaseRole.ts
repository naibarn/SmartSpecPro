import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";

// Existing serial sequences include quoted camelCase column names. Every
// identifier stays exact-case and double-quoted; punctuation remains denied.
const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/);
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

/** Only a disabled role whose existing grants are contained in the current
 * allowlist can be reused. Missing grants are safe to reconcile because the
 * caller subsequently grants only this exact plan inside the same transaction.
 * Extra grants, ownership, memberships and default privileges remain denied.
 * This function never mutates. */
export async function assertReusableApplicationDatabaseRole(db: DrizzleDB, value: ApplicationDatabaseRolePlan) {
  const plan = applicationDatabaseRolePlanSchema.parse(value), role = applicationDatabaseRoleName(plan);
  const [identity] = await db.execute(sql`SELECT current_database() AS name`);
  const [observed] = await db.execute(sql`SELECT oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit
    FROM pg_roles WHERE rolname=${role}`);
  if (identity?.name !== plan.databaseName || !observed || observed.rolcanlogin || observed.rolsuper || observed.rolcreatedb || observed.rolcreaterole ||
      observed.rolinherit || observed.rolreplication || observed.rolbypassrls || observed.rolconnlimit !== 10) deny();
  const unexpected = await db.execute(sql`SELECT 1 FROM pg_auth_members WHERE roleid=${observed.oid} OR member=${observed.oid}
    UNION ALL SELECT 1 FROM pg_default_acl d,aclexplode(d.defaclacl) a WHERE d.defaclrole=${observed.oid} OR a.grantee=${observed.oid}
    UNION ALL SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=${observed.oid} AND deptype='o'
    UNION ALL SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=${observed.oid}
      AND (classid NOT IN ('pg_class'::regclass,'pg_namespace'::regclass,'pg_database'::regclass) OR
        dbid NOT IN (0,(SELECT oid FROM pg_database WHERE datname=current_database())))
    UNION ALL SELECT 1 FROM pg_stat_activity WHERE usename=${role}`);
  if (unexpected.length) deny();
  const grants = await db.execute(sql`SELECT n.nspname,c.relname,c.relkind,a.privilege_type,a.is_grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE a.grantee=${observed.oid} ORDER BY n.nspname,c.relname,a.privilege_type`);
  const expected = new Set([...plan.tables.flatMap(name => ["SELECT", "INSERT", "UPDATE", "DELETE"].map(privilege => `${name}:${privilege}`)),
    ...plan.sequences.flatMap(name => ["USAGE", "SELECT"].map(privilege => `${name}:${privilege}`)), "token_blacklist:SELECT"]);
  const actual = grants.map(g => `${g.relname}:${g.privilege_type}`);
  if (grants.some(g => g.nspname !== "public" || g.is_grantable || !["r", "p", "S"].includes(String(g.relkind))) ||
      actual.some(grant => !expected.has(grant))) deny();
  const schemas = await db.execute(sql`SELECT n.nspname,a.privilege_type,a.is_grantable FROM pg_namespace n,
    LATERAL aclexplode(n.nspacl) a WHERE a.grantee=${observed.oid}`);
  const databases = await db.execute(sql`SELECT d.datname,a.privilege_type,a.is_grantable FROM pg_database d,
    LATERAL aclexplode(d.datacl) a WHERE a.grantee=${observed.oid}`);
  const functions = await db.execute(sql`SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE a.grantee=${observed.oid}`);
  if (schemas.length !== 1 || schemas[0].nspname !== "public" || schemas[0].privilege_type !== "USAGE" || schemas[0].is_grantable ||
      databases.length !== 1 || databases[0].datname !== plan.databaseName || databases[0].privilege_type !== "CONNECT" || databases[0].is_grantable || functions.length) deny();
}

/** A trusted canonical runtime executor supplies BOTH checks and checkpoint
 * persistence. A successful Candidate METADATA job is not this authority.
 * All role DDL and the encrypted checkpoint commit atomically; failures never
 * leave an unowned login, and no password appears in a job receipt or error. */
export async function prepareApplicationDatabaseRole(db: DrizzleDB, input: {
  plan: ApplicationDatabaseRolePlan;
  /** Persistent application activation is allowed only from an existing
   * authenticated Full HTTP preparation path. The default remains the short
   * bounded probe used by synthetic runtime acceptance. */
  purpose?: "bounded-test" | "staging-application";
  /** Reviewed, exact read-only dependency of Python session authentication. */
  pythonAuthReadOnly?: boolean;
  /** Trusted canonical compensation evidence; never supplied by an API caller. */
  reuse?: ApplicationDatabaseRolePlan;
  assertAuthorized(): Promise<void>;
  saveSecret(tx: DrizzleDB, secret: { role: string; password: string; planDigest: string }): Promise<void>;
}) {
  const plan = applicationDatabaseRolePlanSchema.parse(input.plan), role = applicationDatabaseRoleName({ tenantId: plan.tenantId, projectId: plan.projectId });
  const expires = Date.parse(plan.expiresAt), now = Date.now();
  const purpose = input.purpose ?? "bounded-test";
  const maxLifetime = purpose === "staging-application" ? 30 * 86_400_000 : 3_600_000;
  const minimumLifetime = purpose === "staging-application" ? 7 * 86_400_000 : 60_000;
  if (expires <= now + minimumLifetime || expires > now + maxLifetime) deny();
  const planDigest = applicationDatabaseRolePlanDigest(plan), password = randomBytes(32).toString("hex");
  await input.assertAuthorized();
  try {
    return await db.transaction(async raw => {
      const tx = raw as unknown as DrizzleDB;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloudflare-app-role:${role}`}))`);
      await input.assertAuthorized();
      const identity = await tx.execute(sql`SELECT current_database() AS name`);
      if (identity.length !== 1 || identity[0].name !== plan.databaseName) deny();
      if (input.reuse) {
        const prior = applicationDatabaseRolePlanSchema.parse(input.reuse);
        if (applicationDatabaseRoleName(prior) !== role || prior.databaseName !== plan.databaseName ||
            JSON.stringify([...prior.tables].sort()) !== JSON.stringify([...plan.tables].sort()) ||
            JSON.stringify([...prior.sequences].sort()) !== JSON.stringify([...plan.sequences].sort())) deny();
        await assertReusableApplicationDatabaseRole(tx, prior);
      } else if ((await tx.execute(sql`SELECT 1 FROM pg_roles WHERE rolname=${role}`)).length) deny();
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
      await tx.execute(sql.raw(`${input.reuse ? "ALTER" : "CREATE"} ROLE ${quote(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10 PASSWORD '${password}' VALID UNTIL '${new Date(expires).toISOString()}'`));
      await tx.execute(sql.raw(`GRANT CONNECT ON DATABASE ${quote(plan.databaseName)} TO ${quote(role)}`));
      await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${quote(role)}`));
      await tx.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${plan.tables.map(quote).join(",")} TO ${quote(role)}`));
      if (input.pythonAuthReadOnly && !plan.tables.includes("token_blacklist")) {
        const dependency = await tx.execute(sql`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='token_blacklist' AND c.relkind IN ('r','p')`);
        if (dependency.length !== 1) deny();
        await tx.execute(sql.raw(`GRANT SELECT ON TABLE public."token_blacklist" TO ${quote(role)}`));
      }
      if (plan.sequences.length) await tx.execute(sql.raw(`GRANT USAGE, SELECT ON SEQUENCE ${plan.sequences.map(quote).join(",")} TO ${quote(role)}`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET statement_timeout='15s'`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET lock_timeout='3s'`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET idle_in_transaction_session_timeout='15s'`));
      await tx.execute(sql.raw(`ALTER ROLE ${quote(role)} SET search_path TO pg_catalog, public`));
      const [observed] = await tx.execute(sql`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit
        FROM pg_roles WHERE rolname=${role}`);
      if (!observed?.rolcanlogin || observed.rolsuper || observed.rolcreatedb || observed.rolcreaterole || observed.rolinherit ||
          observed.rolreplication || observed.rolbypassrls || observed.rolconnlimit !== 10) deny();
      const unsafeSchemas = await tx.execute(sql`SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
        AND nspname<>'information_schema' AND has_schema_privilege(${role},oid,'CREATE')`);
      const definers = await tx.execute(sql`SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema') AND has_function_privilege(${role},p.oid,'EXECUTE')`);
      if (unsafeSchemas.length || definers.length) deny();
      await input.saveSecret(tx, { role, password, planDigest });
      await input.assertAuthorized();
      return { schemaVersion: "cloudflare-application-database-role-v1", role, planDigest,
        tables: plan.tables, sequences: plan.sequences, expiresAt: plan.expiresAt,
        superuser: false, bypassRls: false, ddlGranted: false, policiesChanged: false, linuxRoleChanged: false };
    });
  } catch { return deny(); }
}
