#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

const SPEC_KEYS = new Set([
  "targetId",
  "environment",
  "serverAddress",
  "port",
  "database",
  "role",
  "rolePurpose",
  "migrationRole",
  "runtimeRole",
  "manifestSha256",
  "baselinePolicy",
  "allowedExtensions",
]);

// This query is intentionally read-only and contains no target-provided SQL identifiers.
export const TARGET_FACTS_QUERY = `
SELECT json_build_object(
  'database', current_database(),
  'server_address', inet_server_addr()::text,
  'server_port', inet_server_port(),
  'server_version_num', current_setting('server_version_num')::integer,
  'database_comment', shobj_description(d.oid, 'pg_database'),
  'role', r.rolname,
  'role_can_login', r.rolcanlogin,
  'role_is_superuser', r.rolsuper,
  'role_can_create_database', r.rolcreatedb,
  'role_can_create_role', r.rolcreaterole,
  'role_can_replicate', r.rolreplication,
  'role_can_bypass_rls', r.rolbypassrls,
  'current_session_role_matches', session_user = current_user,
  'database_owned_by_current_role', d.datdba = r.oid,
  'database_owner_role', database_owner.rolname,
  'database_connect', has_database_privilege(current_user, current_database(), 'CONNECT'),
  'database_create', has_database_privilege(current_user, current_database(), 'CREATE'),
  'database_create_grantees', COALESCE((
    SELECT json_agg(p.rolname ORDER BY p.rolname)
    FROM pg_roles p
    WHERE NOT p.rolsuper AND p.oid <> d.datdba AND p.rolname <> 'pg_database_owner'
      AND has_database_privilege(p.rolname, current_database(), 'CREATE')
  ), '[]'::json),
  'public_schema_create', has_schema_privilege(current_user, 'public', 'CREATE'),
  'public_schema_usage', has_schema_privilege(current_user, 'public', 'USAGE'),
  'public_schema_owned_by_current_role', (
    SELECT nspowner = r.oid FROM pg_namespace WHERE nspname = 'public'
  ),
  'public_schema_owner_role', (
    SELECT owner.rolname FROM pg_namespace n
    JOIN pg_roles owner ON owner.oid = n.nspowner WHERE n.nspname = 'public'
  ),
  'public_schema_create_grantees', COALESCE((
    SELECT json_agg(p.rolname ORDER BY p.rolname)
    FROM pg_namespace n CROSS JOIN pg_roles p
    WHERE n.nspname = 'public' AND NOT p.rolsuper
      AND p.oid <> n.nspowner AND p.oid <> d.datdba AND p.rolname <> 'pg_database_owner'
      AND has_schema_privilege(p.rolname, n.nspname, 'CREATE')
  ), '[]'::json),
  'role_memberships', COALESCE((
    WITH RECURSIVE memberships(roleid) AS (
      SELECT am.roleid FROM pg_auth_members am WHERE am.member = r.oid
      UNION
      SELECT am.roleid FROM pg_auth_members am JOIN memberships m ON am.member = m.roleid
    )
    SELECT json_agg(member_role.rolname ORDER BY member_role.rolname)
    FROM memberships m JOIN pg_roles member_role ON member_role.oid = m.roleid
  ), '[]'::json),
  'non_public_schema_names', COALESCE((
    SELECT json_agg(n.nspname ORDER BY n.nspname)
    FROM pg_namespace n
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public')
      AND n.nspname !~ '^pg_toast'
      AND n.nspname !~ '^pg_temp'
  ), '[]'::json),
  'user_relation_count', (
    SELECT count(*)::integer
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname !~ '^pg_toast'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ),
  'user_procedure_count', (
    SELECT count(*)::integer FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname !~ '^pg_toast' AND n.nspname !~ '^pg_temp'
  ),
  'user_type_count', (
    SELECT count(*)::integer FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname !~ '^pg_toast' AND n.nspname !~ '^pg_temp'
  ),
  'default_acl_count', (SELECT count(*)::integer FROM pg_default_acl),
  'extension_names', COALESCE((
    SELECT json_agg(e.extname ORDER BY e.extname) FROM pg_extension e
  ), '[]'::json),
  'user_event_trigger_count', (SELECT count(*)::integer FROM pg_event_trigger),
  'user_large_object_count', (SELECT count(*)::integer FROM pg_largeobject_metadata),
  'foreign_data_wrapper_count', (SELECT count(*)::integer FROM pg_foreign_data_wrapper),
  'foreign_server_count', (SELECT count(*)::integer FROM pg_foreign_server),
  'role_owned_object_count', (
    (SELECT count(*) FROM pg_class WHERE relowner = r.oid)
    + (SELECT count(*) FROM pg_proc WHERE proowner = r.oid)
    + (SELECT count(*) FROM pg_type WHERE typowner = r.oid)
  ),
  'drizzle_migrations_exists', EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = '__drizzle_migrations'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  )
) AS facts
FROM pg_database d
JOIN pg_roles r ON r.rolname = current_user
JOIN pg_roles database_owner ON database_owner.oid = d.datdba
WHERE d.datname = current_database()
`;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateTargetSpec(spec) {
  if (!isRecord(spec)) return ["target_spec_not_object"];
  const errors = [];
  for (const key of Object.keys(spec)) {
    if (!SPEC_KEYS.has(key)) errors.push("target_spec_has_unapproved_field");
  }
  for (const key of SPEC_KEYS) {
    if (!(key in spec)) errors.push(`target_spec_missing_${key}`);
  }
  if (spec.environment !== "non-production") errors.push("target_spec_not_nonproduction");
  if (typeof spec.targetId !== "string" || !/^[A-Za-z0-9._:-]{1,100}$/.test(spec.targetId)) {
    errors.push("target_spec_invalid_target_id");
  }
  if (typeof spec.serverAddress !== "string" || isIP(spec.serverAddress) === 0) {
    errors.push("target_spec_server_address_must_be_ip");
  }
  if (!Number.isInteger(spec.port) || spec.port < 1 || spec.port > 65535) {
    errors.push("target_spec_invalid_port");
  }
  for (const key of ["database", "role"]) {
    if (typeof spec[key] !== "string" || !/^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/.test(spec[key])) {
      errors.push(`target_spec_invalid_${key}`);
    }
  }
  for (const key of ["migrationRole", "runtimeRole"]) {
    if (typeof spec[key] !== "string" || !/^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/.test(spec[key])) {
      errors.push(`target_spec_invalid_${key}`);
    }
  }
  if (spec.migrationRole === spec.runtimeRole) errors.push("target_spec_roles_must_be_distinct");
  if (!["migration", "runtime"].includes(spec.rolePurpose)) {
    errors.push("target_spec_invalid_role_purpose");
  }
  if (typeof spec.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(spec.manifestSha256)) {
    errors.push("target_spec_invalid_manifest_fingerprint");
  }
  if (spec.baselinePolicy !== "preflight-catalog-checks-v1") errors.push("target_spec_invalid_baseline_policy");
  if (!Array.isArray(spec.allowedExtensions)
    || spec.allowedExtensions.some((name) => typeof name !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(name))
    || new Set(spec.allowedExtensions).size !== spec.allowedExtensions.length) {
    errors.push("target_spec_invalid_extension_allowlist");
  }
  if (spec.rolePurpose === "migration" && spec.role !== spec.migrationRole) {
    errors.push("target_spec_role_purpose_binding_mismatch");
  }
  if (spec.rolePurpose === "runtime" && spec.role !== spec.runtimeRole) {
    errors.push("target_spec_role_purpose_binding_mismatch");
  }
  return [...new Set(errors)];
}

function expectedDatabaseComment(spec) {
  return `smartaihub-spec224-certification|environment=non-production|target=${spec.targetId}|manifest=${spec.manifestSha256}`;
}

export function evaluateTargetFacts(spec, facts) {
  const errors = validateTargetSpec(spec);
  if (errors.length > 0) return { status: "BLOCKED", failedChecks: errors };
  if (!isRecord(facts)) return { status: "BLOCKED", failedChecks: ["database_facts_invalid"] };

  const fail = (condition, code) => { if (!condition) errors.push(code); };
  fail(facts.database === spec.database, "database_identity_mismatch");
  fail(facts.server_address === spec.serverAddress, "server_address_mismatch");
  fail(facts.server_port === spec.port, "server_port_mismatch");
  fail(Number.isInteger(facts.server_version_num) && Math.floor(facts.server_version_num / 10000) === 15,
    "postgresql_15_required");
  fail(facts.database_comment === expectedDatabaseComment(spec), "nonproduction_target_marker_mismatch");
  fail(facts.role === spec.role, "database_role_mismatch");
  fail(facts.role_can_login === true, "role_login_required");
  fail(facts.role_is_superuser === false, "superuser_role_forbidden");
  fail(facts.role_can_create_database === false, "createdb_privilege_forbidden");
  fail(facts.role_can_create_role === false, "createrole_privilege_forbidden");
  fail(facts.role_can_replicate === false, "replication_privilege_forbidden");
  fail(facts.role_can_bypass_rls === false, "bypass_rls_privilege_forbidden");
  fail(facts.current_session_role_matches === true, "session_role_switch_forbidden");
  fail(facts.database_owned_by_current_role === false, "database_owner_role_forbidden");
  fail(![spec.migrationRole, spec.runtimeRole].includes(facts.database_owner_role),
    "application_role_owns_database");
  fail(facts.public_schema_owned_by_current_role === false, "public_schema_owner_role_forbidden");
  fail(![spec.migrationRole, spec.runtimeRole].includes(facts.public_schema_owner_role),
    "application_role_owns_public_schema");
  fail(Array.isArray(facts.role_memberships) && facts.role_memberships.length === 0,
    "inherited_or_set_role_membership_forbidden");
  fail(facts.database_connect === true, "database_connect_required");
  fail(Array.isArray(facts.database_create_grantees)
    && facts.database_create_grantees.length === 1
    && facts.database_create_grantees[0] === spec.migrationRole,
  "database_create_grantee_allowlist_mismatch");
  fail(Array.isArray(facts.public_schema_create_grantees)
    && facts.public_schema_create_grantees.length === 1
    && facts.public_schema_create_grantees[0] === spec.migrationRole,
  "public_schema_create_grantee_allowlist_mismatch");
  fail(facts.public_schema_usage === true, "public_schema_usage_required");
  if (spec.rolePurpose === "migration") {
    fail(facts.database_create === true, "migration_database_create_required");
    fail(facts.public_schema_create === true, "migration_schema_create_required");
  } else {
    fail(facts.database_create === false, "runtime_database_create_forbidden");
    fail(facts.public_schema_create === false, "runtime_schema_create_forbidden");
  }
  fail(Array.isArray(facts.non_public_schema_names) && facts.non_public_schema_names.length === 0,
    "unexpected_user_schema");
  fail(facts.user_relation_count === 0, "database_not_empty");
  fail(facts.user_procedure_count === 0, "user_procedures_present");
  fail(facts.user_type_count === 0, "user_types_present");
  fail(facts.default_acl_count === 0, "default_acl_present");
  fail(Array.isArray(facts.extension_names)
    && [...facts.extension_names].sort().join("\0") === [...spec.allowedExtensions].sort().join("\0"),
  "extension_allowlist_mismatch");
  fail(facts.user_event_trigger_count === 0, "user_event_trigger_present");
  fail(facts.user_large_object_count === 0, "user_large_object_present");
  fail(facts.foreign_data_wrapper_count === 0, "foreign_data_wrapper_present");
  fail(facts.foreign_server_count === 0, "foreign_server_present");
  fail(facts.role_owned_object_count === 0, "role_owns_catalog_objects");
  fail(facts.drizzle_migrations_exists === false, "migration_history_already_exists");

  if (errors.length > 0) return { status: "BLOCKED", failedChecks: errors };
  return {
    status: "PREFLIGHT_PASS_NOT_APPROVAL",
    failedChecks: [],
    evidence: {
      targetId: spec.targetId,
      environment: spec.environment,
      database: facts.database,
      serverAddress: facts.server_address,
      port: facts.server_port,
      postgresMajor: 15,
      role: facts.role,
      rolePurpose: spec.rolePurpose,
      migrationRole: spec.migrationRole,
      runtimeRole: spec.runtimeRole,
      superuser: false,
      elevatedRoleFlags: false,
      inheritedRoleMemberships: 0,
      ownedObjects: 0,
      checkedCatalogBaseline: true,
      baselinePolicy: spec.baselinePolicy,
      checkedCatalogs: [
        "schemas", "relations", "procedures", "types", "default-acls", "extensions",
        "event-triggers", "large-objects", "foreign-data-wrappers", "foreign-servers",
        "migration-history", "role-owned-objects",
      ],
      ownerBaselineAttestationRequired: true,
      databaseCatalogFingerprint: null,
      allowlistedExtensions: [...spec.allowedExtensions].sort(),
      manifestSha256: spec.manifestSha256,
      databaseMutation: false,
      ownerApprovalVerified: false,
      migrationAppliedStatus: "not_checked",
      runtimeObjectPrivileges: "not_checked_before_schema_replay",
    },
  };
}

async function readTargetSpec(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  const errors = validateTargetSpec(value);
  if (errors.length > 0) throw new Error("target_spec_invalid");
  return value;
}

async function runPreflight(targetSpec, connectionString) {
  if (!connectionString) return { status: "BLOCKED", failedChecks: ["DATABASE_URL_missing"] };
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query(TARGET_FACTS_QUERY);
    const facts = result.rows[0]?.facts;
    await client.query("COMMIT");
    return evaluateTargetFacts(targetSpec, facts);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* connection may already be closed */ }
    const code = typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
      ? error.code
      : "unavailable";
    return { status: "BLOCKED", failedChecks: ["database_preflight_query_failed"], databaseErrorCode: code };
  } finally {
    try { await client.end(); } catch { /* do not expose connection details */ }
  }
}

async function main(argv) {
  const targetSpecPath = argv[0];
  if (!targetSpecPath || argv.length !== 1) {
    process.stdout.write("Usage: node apps/web/scripts/spec224-postgres-preflight.mjs <non-secret-target-spec.json>\n");
    process.exitCode = targetSpecPath ? 2 : 0;
    return;
  }
  try {
    const targetSpec = await readTargetSpec(targetSpecPath);
    const result = await runPreflight(targetSpec, process.env.DATABASE_URL);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "PREFLIGHT_PASS_NOT_APPROVAL") process.exitCode = 2;
  } catch {
    process.stdout.write('{"status":"BLOCKED","failedChecks":["target_spec_unreadable_or_invalid"]}\n');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
