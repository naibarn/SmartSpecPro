import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { applyTargetedAdditiveSchema, inspectTargetedAdditiveSchema, runTargetedSchemaCli,
  type AdditiveSchemaApplyOptions } from "./targeted-additive-schema";

const endpoint = "cloudflare-deployment-schema";
const sources = [
  { tag: "0389_spec288_provider_deployment_target_authority", hash: "1ae20d7e171134c938949fa7eaebcbc04855ae70fbc201c08f506f6133fdf7fc", statements: 3 },
  { tag: "0391_tenant_deployment_credentials", hash: "a86df39c56196b372f33aed6adb2c1077dad103310f7cc29c574d667bf42b885", statements: 2 },
] as const;
const tables = ["provider_deployment_targets", "provider_deployment_credentials"] as const;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Select only the two deployment tables and their indexes; never advance the journal. */
export function selectCloudflareDeploymentSchemaSql(contents: string[]): string[] {
  if (contents.length !== sources.length) throw new Error("SCHEMA_SOURCE_COUNT_INVALID");
  return contents.flatMap((content, index) => {
    const source = sources[index];
    if (digest(content) !== source.hash) throw new Error("SCHEMA_SOURCE_HASH_MISMATCH");
    const statements = content.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean);
    const selected = statements.slice(0, source.statements);
    if (selected.length !== source.statements || selected.some(statement =>
      !new RegExp(`^CREATE (?:TABLE "${tables[index]}"|(?:UNIQUE )?INDEX "${tables[index]}_[^"]+"\\s+ON "${tables[index]}")`).test(statement)
    )) throw new Error("SCHEMA_STATEMENT_SCOPE_INVALID");
    return selected;
  });
}

const plan = { endpoint, sources, tables, selectSql: selectCloudflareDeploymentSchemaSql,
  driftError: "DEPLOYMENT_SCHEMA_DRIFT" };
export const inspectCloudflareDeploymentSchema = (client: Client) => inspectTargetedAdditiveSchema(client, plan);
export const applyCloudflareDeploymentSchema = (client: Client, options: AdditiveSchemaApplyOptions) =>
  applyTargetedAdditiveSchema(client, plan, options);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTargetedSchemaCli(plan, { fingerprintVariable: "CLOUDFLARE_SCHEMA_EXPECTED_FINGERPRINT", sourceFile: "scripts/cloudflare-deployment-schema.ts" })
    .catch(error => {
      console.error(JSON.stringify({ status: "FAILED", code: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : "SCHEMA_EXECUTION_FAILED" }));
      process.exitCode = 1;
    });
}
