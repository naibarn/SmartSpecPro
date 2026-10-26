import { timingSafeEqual } from "node:crypto";
import { withHyperdrivePostgres } from "./postgresClient";
import type { HyperdriveBinding } from "./contracts";

/** Isolated remote-preview entrypoint only. Never imported by the production
 * router. No arbitrary SQL, business rows, local connection string or writes. */
export type ProductionDatabaseDiagnosticEnv = {
  HYPERDRIVE: HyperdriveBinding;
  PROBE_TOKEN: string;
  PROBE_EXPIRES_AT: string;
  EXPECTED_DATABASE: string;
  EXPECTED_ROLE: string;
  PLAN_DIGEST: string;
};

export async function productionDatabaseDiagnostic(request: Request, env: ProductionDatabaseDiagnosticEnv) {
  const headers = { "cache-control": "no-store", "content-type": "application/json" };
  const expires = Date.parse(env.PROBE_EXPIRES_AT);
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.PROBE_TOKEN}`;
  if (request.method !== "GET" || new URL(request.url).pathname !== "/__m1_sql_probe" ||
      !/^[a-f0-9]{64}$/.test(env.PROBE_TOKEN ?? "") || !Number.isFinite(expires) || expires <= Date.now() ||
      expires > Date.now() + 15 * 60_000 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return new Response("Not found", { status: 404, headers });
  }
  if (!/^[a-zA-Z0-9_]{1,63}$/.test(env.EXPECTED_DATABASE) || !/^sah_cf_prod_[a-f0-9]{12}$/.test(env.EXPECTED_ROLE) ||
      !/^[a-f0-9]{64}$/.test(env.PLAN_DIGEST)) return new Response("Invalid scope", { status: 403, headers });
  // A local workerd result can never be accepted as Cloudflare-side evidence.
  const cf = (request as Request & { cf?: { colo?: string; country?: string } }).cf;
  if (!cf?.colo) return new Response("Remote runtime required", { status: 412, headers });
  let stage = "connectivity";
  try {
    const result = await withHyperdrivePostgres(env.HYPERDRIVE, async client => {
      const identity = await client.begin(async tx => {
        await tx.unsafe("SET TRANSACTION READ ONLY");
        await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
        const [identity] = await tx.unsafe<any[]>("SELECT 1 AS connected, current_database() AS database, current_user AS role, current_setting('transaction_read_only') AS read_only, current_setting('application_name') AS application_name, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS backend_ssl");
        if (identity?.connected !== 1 || identity.database !== env.EXPECTED_DATABASE || identity.role !== env.EXPECTED_ROLE || identity.read_only !== "on") throw Error("SQL_IDENTITY_MISMATCH");
        stage = "restricted_role";
        const [role] = await tx.unsafe<any[]>("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolcanlogin, rolconnlimit, shobj_description(oid,'pg_authid') AS marker, (SELECT count(*)::int FROM pg_auth_members WHERE member=pg_roles.oid OR roleid=pg_roles.oid) AS memberships FROM pg_roles WHERE rolname=current_user");
        const roleVerified = role?.rolcanlogin === true && role.rolconnlimit === 5 && role.memberships === 0 &&
          [role.rolsuper, role.rolcreatedb, role.rolcreaterole, role.rolreplication, role.rolbypassrls, role.rolinherit].every(v => v === false) &&
          role.marker === `smartspec:cloudflare-production-runtime:v1:${env.PLAN_DIGEST}`;
        stage = "schema_permissions";
        await tx.unsafe('SELECT "id", "tenantId" FROM public.emergency_reports LIMIT 0');
        const [privileges] = await tx.unsafe<any[]>("SELECT has_schema_privilege(current_user,'public','USAGE') AS public_usage, has_table_privilege(current_user,'public.users','SELECT') AS users_select, has_table_privilege(current_user,'public.worker_jobs','SELECT') AS jobs_select, has_column_privilege(current_user,'public.emergency_reports','id','SELECT') AS report_id_select");
        stage = "tenant_isolation";
        const tables = await tx.unsafe<any[]>("SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('emergency_reports','emergency_cases','emergency_case_events') ORDER BY c.relname");
        // No production fixture is invented and no existing tenant row is read.
        // RLS metadata alone cannot prove authorized cross-tenant fixtures.
        return { ...identity, roleVerified, privileges, tables, tenantIsolation: "NOT_VERIFIED_NO_AUTHORIZED_FIXTURES" };
      });
      stage = "denied_schema_access";
      let denied = false;
      try {
        await client.begin(async tx => {
          await tx.unsafe("SET TRANSACTION READ ONLY");
          await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
          await tx.unsafe("SELECT * FROM public.users LIMIT 0");
        });
      } catch (error) { if ((error as { code?: string }).code === "42501") denied = true; else throw error; }
      return { ...identity, deniedSchemaAccessVerified: denied };
    });
    // pg_stat_ssl observes the PostgreSQL backend socket. With the existing
    // TLS-only origin proxy, that socket is loopback plaintext after TLS
    // termination. Verify transport separately; do not infer its TLS state
    // from the backend field or silently claim full M1 acceptance.
    const passed = result.roleVerified && result.deniedSchemaAccessVerified &&
      result.privileges.public_usage === true && result.privileges.report_id_select === true &&
      result.privileges.users_select === false && result.privileges.jobs_select === false;
    return new Response(JSON.stringify({ schemaVersion: "cloudflare-production-sql-observation-v1", observedAt: new Date().toISOString(),
      runtime: "cloudflare-remote-preview", colo: cf.colo, planDigest: env.PLAN_DIGEST, sql: passed ? "PASS" : "FAIL", ...result,
      tlsEvidence: "VERIFY_VPC_AND_ORIGIN_TLS_TERMINATOR", businessRowsRead: 0, businessWrites: 0,
      acceptance: "NOT_ACCEPTED" }), { status: passed ? 200 : 422, headers });
  } catch (error) {
    const value = error as { code?: string; message?: string };
    const code = /^[A-Z0-9_]{2,80}$/.test(value.code ?? "") ? value.code : "SQL_DIAGNOSTIC_FAILED";
    let message = String(value.message ?? "Unknown database failure");
    for (const secret of [env.PROBE_TOKEN, env.HYPERDRIVE?.connectionString]) if (secret) message = message.split(secret).join("[REDACTED]");
    message = message.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, "[REDACTED_URI]").replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 300);
    return new Response(JSON.stringify({ schemaVersion: "cloudflare-production-sql-observation-v1", observedAt: new Date().toISOString(),
      runtime: "cloudflare-remote-preview", colo: cf.colo, planDigest: env.PLAN_DIGEST, sql: "FAIL", stage, code, message,
      businessRowsRead: 0, businessWrites: 0, acceptance: "NOT_ACCEPTED" }), { status: 502, headers });
  }
}

export default { fetch: productionDatabaseDiagnostic };
