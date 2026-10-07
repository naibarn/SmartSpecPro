import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiAuditEvents } from "../drizzle/schema";
import { closeDb, getDb } from "../server/db";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phaseKey = randomUUID();
const startedAt = new Date();
const sourceSha = process.env.GITHUB_SHA ?? process.env.SOURCE_SHA ?? "unknown";
const environment = process.env.DEPLOY_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown";
const databaseTargetId = process.env.DATABASE_TARGET_ID ?? (() => {
  const url = process.env.DATABASE_URL ?? "";
  const safeIdentity = url ? createHash("sha256").update(new URL(url).host + new URL(url).pathname).digest("hex").slice(0, 20) : "unconfigured";
  return `database:${safeIdentity}`;
})();

async function migrationSet() {
  const journal = JSON.parse(await readFile(path.join(appRoot, "drizzle/meta/_journal.json"), "utf8")) as { entries?: Array<{ tag?: string }> };
  return (journal.entries ?? []).flatMap(entry => typeof entry.tag === "string" ? [entry.tag] : []);
}

function runDrizzle(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> { return runCommand("migrate"); }

function runCommand(command: "generate" | "migrate"): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise(resolve => {
    const child = spawn("pnpm", ["exec", "drizzle-kit", command], { cwd: appRoot, env: process.env, stdio: "inherit" });
    child.once("error", () => resolve({ code: 127, signal: null }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  const isPush = process.argv.includes("push");
  if (isPush) {
    const generated = await runCommand("generate");
    if (generated.code !== 0 || generated.signal) {
      process.exitCode = generated.code ?? 1;
      return;
    }
  }
  const db = getDb();
  const tags = await migrationSet();
  const base = {
    schemaVersion: "migration-execution-receipt.v1",
    phase: "STARTED",
    idempotencyKey: phaseKey,
    tenantId: null,
    projectId: "SmartSpecPro",
    authorityScope: "PLATFORM_WIDE",
    environment,
    databaseTargetId,
    migrationProvider: "drizzle",
    expectedMigrationHead: tags.at(-1) ?? null,
    requestedMigrationSet: tags,
    sourceSha,
    deploymentId: process.env.GITHUB_RUN_ID ?? null,
    executionId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT ?? "1"}` : phaseKey,
    startedAt: startedAt.toISOString(),
    actor: process.env.GITHUB_ACTOR ?? "deployment-runner",
  };
  await db.insert(apiAuditEvents).values({
    traceId: phaseKey.slice(0, 32), eventType: "migration_execution_receipt", provider: "drizzle", endpoint: "db:migrate",
    metadata: { ...base, phase: "STARTED" },
  });
  let outcome: { code: number | null; signal: NodeJS.Signals | null } = { code: 1, signal: null };
  try {
    outcome = await runDrizzle();
    const succeeded = outcome.code === 0 && outcome.signal === null;
    await db.insert(apiAuditEvents).values({
      traceId: phaseKey.slice(0, 32), eventType: "migration_execution_receipt", provider: "drizzle", endpoint: "db:migrate",
      statusCode: succeeded ? 200 : 500,
      errorMessage: succeeded ? null : outcome.signal ? "MIGRATION_INTERRUPTED" : "MIGRATION_FAILED",
      metadata: { ...base, phase: "SETTLED", result: succeeded ? "APPLIED" : outcome.signal ? "INTERRUPTED" : "FAILED",
        completedAt: new Date().toISOString(), appliedHead: succeeded ? base.expectedMigrationHead : null,
        failureCategory: succeeded ? null : outcome.signal ? "INTERRUPTED" : "EXECUTION_FAILED",
        failureCode: succeeded ? null : `EXIT_${outcome.code ?? outcome.signal ?? "UNKNOWN"}` },
    });
    if (!succeeded) process.exitCode = outcome.code ?? 1;
  } catch (error) {
    await db.insert(apiAuditEvents).values({
      traceId: phaseKey.slice(0, 32), eventType: "migration_execution_receipt", provider: "drizzle", endpoint: "db:migrate",
      statusCode: 500, errorMessage: "MIGRATION_RECEIPT_OR_EXECUTION_FAILED",
      metadata: { ...base, phase: "SETTLED", result: "FAILED", completedAt: new Date().toISOString(),
        failureCategory: "EXECUTION_FAILED", failureCode: error && typeof error === "object" && "code" in error ? String(error.code).slice(0, 64) : "UNKNOWN" },
    });
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

await main();
