import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateWorkspaceBindings0415Preflight,
  WORKSPACE_BINDINGS_0415_TARGET,
} from "../workspace-bindings-0415-migration";

const predecessor = {
  tag: "0414_spec224_mini_app_deployment_idempotency",
  when: 1792909880001,
  hash: "0414-hash",
};
const target = {
  tag: WORKSPACE_BINDINGS_0415_TARGET.tag,
  when: WORKSPACE_BINDINGS_0415_TARGET.when,
  hash: WORKSPACE_BINDINGS_0415_TARGET.hash,
};
const journal = [predecessor, target];
const schema = {
  prerequisites: { runnerNodes: true, runnerIdentityColumns: true, canonicalProjects: true, canonicalProjectCompositeKey: true, auditEvents: true },
  duplicateRunnerIdentityGroups: 0,
  bindingTableExists: false,
  bindingColumns: [],
  bindingConstraints: [],
  bindingIndexes: [],
};
const applied = [{ hash: predecessor.hash, created_at: predecessor.when }];
const fingerprint = WORKSPACE_BINDINGS_0415_TARGET.productionFingerprint;

function input(overrides: Partial<Parameters<typeof evaluateWorkspaceBindings0415Preflight>[0]> = {}) {
  return {
    environment: "production",
    expectedFingerprint: fingerprint,
    actualFingerprint: fingerprint,
    databaseTargetId: `smartaihub:production:${fingerprint}`,
    databaseUrlHost: "ep-test.neon.tech",
    targetFacts: { database: "smartspec", schema: "public", role: "smartspec", sessionRoleMatches: true, writableSession: true },
    workflowRef: "refs/heads/main",
    workflowPath: "naibarn/SmartSpecPro/.github/workflows/apply-core-0412-targeted-migration.yml@refs/heads/main",
    githubActions: true,
    sourceSha: "a".repeat(40),
    journal,
    applied,
    schema,
    successfulReceiptExists: false,
    activeMigrationCandidates: 0,
    ...overrides,
  };
}

const tableColumns = [
  ["created_at", "timestamptz", null, false], ["created_by_principal_id", "varchar", 160, false],
  ["id", "varchar", 36, false], ["lifecycle", "varchar", 16, false], ["project_id", "varchar", 36, false],
  ["repository_id", "varchar", 160, false], ["revoked_at", "timestamptz", null, true], ["runner_id", "varchar", 160, false],
  ["scope", "varchar", 32, false], ["tenant_id", "varchar", 36, false], ["updated_at", "timestamptz", null, false], ["workspace_id", "varchar", 200, false],
].map(([name, type, maxLength, nullable]) => ({
  name: String(name), type: String(type), maxLength: maxLength as number | null, nullable: Boolean(nullable),
  defaultValue: ({ id: "gen_random_uuid()", lifecycle: "'ACTIVE'::character varying", created_at: "now()", updated_at: "now()" } as Record<string, string>)[String(name)] ?? null,
}));
const constraints = [
  ["canonical_project_workspace_bindings_pkey", "PRIMARY KEY (id)"],
  ["canonical_project_workspace_bindings_project_fk", "FOREIGN KEY (tenant_id, project_id) REFERENCES canonical_projects(tenant_id, project_id) ON DELETE CASCADE"],
  ["canonical_project_workspace_bindings_runner_fk", "FOREIGN KEY (tenant_id, runner_id) REFERENCES runner_nodes(\"tenantId\", \"runnerId\") ON DELETE RESTRICT"],
  ["canonical_project_workspace_bindings_identity_unique", "UNIQUE (tenant_id, project_id, repository_id, scope, runner_id, workspace_id)"],
  ["canonical_project_workspace_bindings_scope_check", "CHECK (((scope)::text = ANY ((ARRAY['PLATFORM_ENGINEERING'::character varying, 'PLATFORM_MANAGED'::character varying, 'ADMIN_CREATOR'::character varying, 'TENANT'::character varying, 'USER'::character varying, 'CUSTOMER_EXTERNAL_ORG'::character varying])::text[])))"],
  ["canonical_project_workspace_bindings_lifecycle_check", "CHECK (((((lifecycle)::text = 'ACTIVE'::text) AND (revoked_at IS NULL)) OR (((lifecycle)::text = 'REVOKED'::text) AND (revoked_at IS NOT NULL))))"],
  ["canonical_project_workspace_bindings_creator_check", "CHECK ((length(btrim((created_by_principal_id)::text)) > 0))"],
].map(([name, definition]) => ({ name: String(name), valid: true, definition: String(definition) }));
const indexes = [
  ["canonical_project_workspace_bindings_pkey", true, "CREATE UNIQUE INDEX canonical_project_workspace_bindings_pkey ON public.canonical_project_workspace_bindings USING btree (id)"],
  ["canonical_project_workspace_bindings_identity_unique", true, "CREATE UNIQUE INDEX canonical_project_workspace_bindings_identity_unique ON public.canonical_project_workspace_bindings USING btree (tenant_id, project_id, repository_id, scope, runner_id, workspace_id)"],
  ["canonical_project_workspace_bindings_scope_idx", false, "CREATE INDEX canonical_project_workspace_bindings_scope_idx ON public.canonical_project_workspace_bindings USING btree (tenant_id, scope, lifecycle)"],
  ["runner_nodes_tenant_runner_unique", true, "CREATE UNIQUE INDEX runner_nodes_tenant_runner_unique ON public.runner_nodes USING btree (tenantId, runnerId)"],
].map(([name, unique, definition]) => ({ name: String(name), valid: true, unique: Boolean(unique), definition: String(definition) }));
const completeSchema = {
  ...schema,
  bindingTableExists: true,
  bindingColumns: tableColumns,
  bindingConstraints: constraints,
  bindingIndexes: indexes,
};

describe("SPEC-293 migration 0415 scope and safety preflight", () => {
  it("pins the reviewed 0415 SQL bytes and additive DDL statement set", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../drizzle/0415_spec293_canonical_project_workspace_bindings.sql"), "utf8");
    expect(createHash("sha256").update(sql).digest("hex")).toBe(WORKSPACE_BINDINGS_0415_TARGET.hash);
    const statements = sql.replace(/^--.*$/gm, "").match(/[^;]+;/g)?.map(statement => statement.trim()) ?? [];
    expect(statements.map(statement => statement.match(/^([A-Z]+)/i)?.[1]?.toUpperCase())).toEqual(["BEGIN", "CREATE", "CREATE", "CREATE", "COMMIT"]);
    expect(statements.some(statement => /^(DROP|TRUNCATE|INSERT|UPDATE|DELETE|MERGE)\b/i.test(statement))).toBe(false);
  });

  it("selects only the pinned final migration when production identity and predecessor match", () => {
    expect(evaluateWorkspaceBindings0415Preflight(input())).toMatchObject({ status: "READY", fingerprint });
  });

  it.each([
    ["fingerprint mismatch", { actualFingerprint: "sha256:wrong" }, "database_fingerprint_mismatch"],
    ["wrong production target", { databaseTargetId: "smartaihub:development:wrong" }, "production_target_id_mismatch"],
    ["non-main production source", { workflowRef: "refs/heads/feature" }, "production_source_not_main"],
    ["non-authority execution path", { githubActions: false, workflowPath: "local" }, "production_authority_workflow_invalid"],
    ["non-Neon production URL", { databaseUrlHost: "localhost" }, "production_database_host_not_allowlisted"],
    ["different database role", { targetFacts: { database: "smartspec", schema: "public", role: "readonly", sessionRoleMatches: true, writableSession: true } }, "database_identity_mismatch"],
    ["read-only role", { targetFacts: { database: "smartspec", schema: "public", role: "smartspec", sessionRoleMatches: true, writableSession: false } }, "database_session_read_only"],
    ["source SHA invalid", { sourceSha: "unknown" }, "source_sha_invalid"],
    ["predecessor checksum drift", { applied: [{ hash: "wrong", created_at: predecessor.when }] }, "predecessor_migration_checksum_mismatch"],
    ["later migration added", { journal: [...journal, { tag: "0416_later", when: target.when + 1, hash: "later" }] }, "later_migration_exists"],
    ["duplicate runner identities", { schema: { ...schema, duplicateRunnerIdentityGroups: 1 } }, "duplicate_runner_identities_block_unique_index"],
    ["prerequisite absent", { schema: { ...schema, prerequisites: { ...schema.prerequisites, canonicalProjects: false } } }, "canonical_projects_prerequisite_missing"],
    ["table already exists without ledger", { schema: completeSchema }, "binding_table_exists_without_applied_migration"],
  ])("blocks %s", (_name, overrides, reason) => {
    const result = evaluateWorkspaceBindings0415Preflight(input(overrides as Partial<Parameters<typeof evaluateWorkspaceBindings0415Preflight>[0]>));
    expect(result.status).toBe("BLOCKED");
    expect(result.status === "BLOCKED" ? result.reasons : []).toContain(reason);
  });

  it("accepts a loopback development target while preserving its independent fingerprint", () => {
    const devFingerprint = "sha256:" + "b".repeat(64);
    expect(evaluateWorkspaceBindings0415Preflight(input({
      environment: "development",
      expectedFingerprint: devFingerprint,
      actualFingerprint: devFingerprint,
      databaseTargetId: `smartaihub:development:${devFingerprint}`,
      databaseUrlHost: "127.0.0.1",
      workflowRef: "local",
    }))).toMatchObject({ status: "READY", fingerprint: devFingerprint });
  });

  it("blocks development credentials pointed at a non-loopback database", () => {
    const result = evaluateWorkspaceBindings0415Preflight(input({
      environment: "development",
      databaseTargetId: `smartaihub:development:${fingerprint}`,
    }));
    expect(result.status).toBe("BLOCKED");
    expect(result.status === "BLOCKED" ? result.reasons : []).toContain("development_database_not_loopback");
  });

  it("recognizes an applied migration only with the exact schema, checksum, and successful receipt", () => {
    const receiptApplied = evaluateWorkspaceBindings0415Preflight(input({
      applied: [...applied, { hash: target.hash, created_at: target.when }],
      schema: completeSchema,
      successfulReceiptExists: true,
    }));
    expect(receiptApplied.status).toBe("ALREADY_APPLIED");
    const missingReceipt = evaluateWorkspaceBindings0415Preflight(input({
      applied: [...applied, { hash: target.hash, created_at: target.when }],
      schema: completeSchema,
    }));
    expect(missingReceipt.status).toBe("BLOCKED");
    expect(missingReceipt.status === "BLOCKED" ? missingReceipt.reasons : []).toContain("successful_migration_receipt_missing");
  });

  it("keeps the existing Production Migration Authority scoped to only 0412 or 0415 and never invokes production deploy", () => {
    const workflow = readFileSync(path.resolve(__dirname, "../../../../.github/workflows/apply-core-0412-targeted-migration.yml"), "utf8");
    expect(workflow).toContain('type: choice');
    expect(workflow).toContain('"0412_active_shared_schema_contract_repair"');
    expect(workflow).toContain(`"${WORKSPACE_BINDINGS_0415_TARGET.tag}"`);
    expect(workflow).toContain("apply-core-0415-to-confirmed-production-database");
    expect(workflow).toContain("actions: read\n  contents: read");
    expect(workflow).toContain("verify-spec224-migration-environment.ts");
    expect(workflow).toContain("steps.preflight_0415.outputs.status == 'READY'");
    expect(workflow).toContain("run: pnpm exec tsx scripts/workspace-bindings-0415-migration.ts");
    expect(workflow).toContain("DATABASE_URL: ${{ secrets.NEON_PROD_DB_URL }}");
    expect(workflow).not.toContain("release:web:linux");
    expect(workflow).not.toContain("npm run deploy");
  });
});
