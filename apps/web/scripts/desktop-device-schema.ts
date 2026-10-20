import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { applyTargetedAdditiveSchema, inspectTargetedAdditiveSchema, runTargetedSchemaCli, schemaDigest,
  type AdditiveSchemaApplyOptions, type AdditiveSchemaCatalog } from "./targeted-additive-schema";

export const DESKTOP_DEVICE_SCHEMA_SOURCE = {
  tag: "0409_desktop_device_registry",
  hash: "b1a5a67c887c64728d25f092979680c2a793f49062ad1666b7909b59278d4175",
  statements: 4,
} as const;
const healthLabels = ["online", "offline", "unhealthy", "disabled"];

// Existing ORM contract, verified against schema.ts in the disposable-PG tests.
export const desktopColumnContracts = [
  ["id", "character varying(36)", true, null],
  ["tenantId", "character varying(36)", true, null],
  ["userId", "integer", false, null],
  ["displayName", "character varying(255)", true, null],
  ["machineName", "character varying(255)", false, null],
  ["healthStatus", "desktop_device_health_status", true, "'offline'::desktop_device_health_status"],
  ["workerProjectionEnabled", "boolean", true, "false"],
  ["projectedWorkerRuntimeType", "character varying(64)", false, null],
  ["platform", "jsonb", true, "'{}'::jsonb"],
  ["capabilitiesJson", "jsonb", true, "'{}'::jsonb"],
  ["healthSummaryJson", "jsonb", true, "'{}'::jsonb"],
  ["localRootsJson", "jsonb", true, "'[]'::jsonb"],
  ["packageCachePathsJson", "jsonb", true, "'[]'::jsonb"],
  ["packageSyncStateJson", "jsonb", true, "'{}'::jsonb"],
  ["pendingActionsJson", "jsonb", true, "'[]'::jsonb"],
  ["currentWorkspaceProfileJson", "jsonb", true, "'{}'::jsonb"],
  ["lastRunSummaryJson", "jsonb", true, "'{}'::jsonb"],
  ["accessState", "character varying(32)", true, "'active'::character varying"],
  ["policyOverridesJson", "jsonb", true, "'{}'::jsonb"],
  ["policyCursor", "character varying(128)", false, null],
  ["policyVersion", "character varying(128)", false, null],
  ["policyExpiresAt", "timestamp with time zone", false, null],
  ["warningFlagsJson", "jsonb", true, "'[]'::jsonb"],
  ["enrolledAt", "timestamp with time zone", true, "now()"],
  ["lastSeenAt", "timestamp with time zone", false, null],
  ["disabledAt", "timestamp with time zone", false, null],
  ["createdAt", "timestamp with time zone", true, "now()"],
  ["updatedAt", "timestamp with time zone", true, "now()"],
] as const;

export function selectDesktopDeviceSchemaSql(contents: string[]): string[] {
  if (contents.length !== 1) throw new Error("SCHEMA_SOURCE_COUNT_INVALID");
  if (schemaDigest(contents[0]) !== DESKTOP_DEVICE_SCHEMA_SOURCE.hash) throw new Error("SCHEMA_SOURCE_HASH_MISMATCH");
  const statements = contents[0].split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean);
  if (statements.length !== 4 || !statements[0].startsWith("DO $$") ||
      !statements[1].startsWith('CREATE TABLE IF NOT EXISTS "public"."desktop_devices"') ||
      statements.slice(2).some(statement => !/^CREATE INDEX IF NOT EXISTS "desktop_devices_[a-z_]+" ON "public"\."desktop_devices"/.test(statement))) {
    throw new Error("SCHEMA_STATEMENT_SCOPE_INVALID");
  }
  return statements;
}

function validateHealthType(catalog: AdditiveSchemaCatalog) {
  const type = catalog.desktop_device_health_status;
  if (type !== null && (type.kind !== "e" || JSON.stringify(type.labels) !== JSON.stringify(healthLabels))) {
    throw new Error("DESKTOP_HEALTH_ENUM_INCOMPATIBLE");
  }
}

export function validateDesktopDeviceCatalog(catalog: AdditiveSchemaCatalog) {
  validateHealthType(catalog);
  const table = catalog.desktop_devices;
  if (!table || !catalog.desktop_device_health_status || table.relkind !== "r" || table.relrowsecurity || table.relforcerowsecurity ||
      JSON.stringify(table.columns.map((column: any) => [column.name, column.type, column.not_null, column.default_value])) !== JSON.stringify(desktopColumnContracts)) {
    throw new Error("DESKTOP_SCHEMA_POSTCONDITION_INVALID");
  }
  const normalize = (value: string) => value.replaceAll('"', "").replaceAll("public.", "");
  const constraints = table.constraints.map((item: any) => normalize(item.definition)).sort();
  const expected = ["PRIMARY KEY (id)", "FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE",
    "FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL"].sort();
  const indexes = table.indexes.map((item: any) => normalize(item.definition)).sort();
  if (JSON.stringify(constraints) !== JSON.stringify(expected) || table.indexes.some((item: any) => !item.valid) ||
      indexes.length !== 3 || !indexes.includes("CREATE INDEX desktop_devices_tenant_id_idx ON desktop_devices USING btree (tenantId)") ||
      !indexes.includes("CREATE INDEX desktop_devices_tenant_user_idx ON desktop_devices USING btree (tenantId, userId)")) {
    throw new Error("DESKTOP_SCHEMA_CONSTRAINTS_OR_INDEXES_INVALID");
  }
}

const plan = {
  endpoint: "desktop-device-schema", sources: [DESKTOP_DEVICE_SCHEMA_SOURCE], tables: ["desktop_devices"],
  enums: ["desktop_device_health_status"], selectSql: selectDesktopDeviceSchemaSql,
  validateBefore: validateHealthType, validateAfter: validateDesktopDeviceCatalog, driftError: "DESKTOP_SCHEMA_DRIFT",
};
export const inspectDesktopDeviceSchema = (client: Client) => inspectTargetedAdditiveSchema(client, plan);
export const applyDesktopDeviceSchema = (client: Client, options: AdditiveSchemaApplyOptions) =>
  applyTargetedAdditiveSchema(client, plan, options);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTargetedSchemaCli(plan, { fingerprintVariable: "DESKTOP_SCHEMA_EXPECTED_FINGERPRINT", sourceFile: "scripts/desktop-device-schema.ts" })
    .catch(error => {
      console.error(JSON.stringify({ status: "FAILED", code: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : "SCHEMA_EXECUTION_FAILED" }));
      process.exitCode = 1;
    });
}
