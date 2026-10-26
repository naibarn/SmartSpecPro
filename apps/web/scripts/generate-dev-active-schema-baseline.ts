import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { activeSchemaContract } from "./schema-audit-policy";
import { buildDevActiveSchemaBaseline, extractDevActiveSecurityStatements } from "./devActiveSchemaBaseline";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(appRoot, "drizzle/dev-active-baseline/migrations");
const migrationTags = [
  "0139_private_personal_finance_security_backstop",
  "0141_private_personal_finance_counterparties",
  "0142_private_personal_finance_payment_instruments",
  "0353_spec231_inference_plans_attempts",
  "0354_spec231_policy_authority",
  "0355_spec231_qualification_profiles",
  "0356_spec231_inference_probe_runs",
  "0357_spec231_policy_revision_rollback_events",
  "0358_spec231_signed_rollout_bundles",
  "0381_spec265_266_durable_foundation",
  "0388_worker_job_event_context",
  "0396_project_wiki_package_candidate",
];

const schemaModule = await import("../drizzle/schema");
const schemaSnapshot = generateDrizzleJson(schemaModule) as Parameters<typeof activeSchemaContract>[0];
const { contract } = activeSchemaContract(schemaSnapshot);
const emptySnapshot = generateDrizzleJson({}) as typeof schemaSnapshot;
const activeSnapshot = { ...schemaSnapshot, ...contract };
const migrationStatements = await generateMigration(emptySnapshot, activeSnapshot);
const securityMigrations = await Promise.all(migrationTags.map(async tag => ({
  tag,
  sql: await readFile(path.join(appRoot, `drizzle/${tag}.sql`), "utf8"),
})));
const securityStatements = extractDevActiveSecurityStatements(
  securityMigrations,
  new Set(Object.values(contract.tables).map(table => table.name)),
);
if (!securityStatements.some(statement => statement.includes("CREATE POLICY")) ||
    !securityStatements.some(statement => statement.includes("CREATE TRIGGER"))) {
  throw new Error("DEV_ACTIVE_SCHEMA_SECURITY_DDL_INCOMPLETE");
}

const migrationSql = buildDevActiveSchemaBaseline({ schema: contract, migrationStatements, securityStatements });
const tag = "0415_dev_active_schema_baseline";
await mkdir(path.join(outputDirectory, "meta"), { recursive: true });
const journalPath = path.join(outputDirectory, "meta/_journal.json");
let followOnEntries: Array<{ version: string; when: number; tag: string; breakpoints: boolean }> = [];
try {
  const existingJournal = JSON.parse(await readFile(journalPath, "utf8")) as { entries?: Array<{ version?: string; when?: number; tag?: string; breakpoints?: boolean }> };
  followOnEntries = (existingJournal.entries ?? [])
    .filter(entry => entry.tag !== tag)
    .map(entry => ({
      version: typeof entry.version === "string" ? entry.version : "7",
      when: Number(entry.when),
      tag: String(entry.tag),
      breakpoints: entry.breakpoints !== false,
    }));
} catch { /* First generation creates the baseline journal. */ }
await writeFile(path.join(outputDirectory, `${tag}.sql`), `${migrationSql}\n`, "utf8");
await writeFile(path.join(outputDirectory, "meta/_journal.json"), `${JSON.stringify({
  version: "7",
  dialect: "postgresql",
  entries: [
    { idx: 0, version: "7", when: 1792909880002, tag, breakpoints: true },
    ...followOnEntries.map((entry, idx) => ({ idx: idx + 1, ...entry })),
  ],
}, null, 2)}\n`, "utf8");

const inputFiles = ["drizzle/schema.ts", ...migrationTags.map(value => `drizzle/${value}.sql`)];
const inputDigests = await Promise.all(inputFiles.map(async relativePath => {
  const bytes = await readFile(path.join(appRoot, relativePath));
  return { path: relativePath, sha256: createHash("sha256").update(bytes).digest("hex") };
}));
const manifest = {
  schema: "dev-active-schema-baseline.v1",
  generatedFrom: "current Drizzle schema and explicitly listed active security migrations",
  scope: { tableCount: Object.keys(contract.tables).length, enumCount: Object.keys(contract.enums).length, securityStatementCount: securityStatements.length },
  inputDigests,
  migrationSha256: createHash("sha256").update(`${migrationSql}\n`).digest("hex"),
};
await writeFile(path.resolve(outputDirectory, "../source-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ...manifest.scope, migrationSha256: manifest.migrationSha256 })}\n`);
