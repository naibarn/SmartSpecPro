import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import AdmZip from "adm-zip";
import postgres from "postgres";
import {
  ensureDatabaseBackupRoot,
  getDatabaseBackupJobDirectory,
} from "./databaseBackupService";
import type { DatabaseBackupMode } from "./databaseBackupContracts";

type TableInfo = { schema: string; name: string };
type ColumnInfo = { name: string; ordinal: number };
type PostgresClient = ReturnType<typeof postgres>;

const SENSITIVE_COLUMN_PATTERN =
  /(password|passwd|secret|token|api[_-]?key|credential|(?:encryption|private|public|signing)[_-]?key|session|cookie|refresh|access[_-]?token|auth)/i;

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function databaseConnectionEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const parsed = new URL(databaseUrl);
  if (!parsed.protocol.startsWith("postgres")) {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.replace(/^\//, ""),
  };
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

const PG_DUMP_TIMEOUT_MS = 10 * 60 * 1000;

export async function runPgDump(outputPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Database backup is not configured");
  const binary = process.env.PG_DUMP_BINARY || "pg_dump";
  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    let timeout: NodeJS.Timeout | undefined;
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve();
    };
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    };
    const child = spawn(
      binary,
      ["--format=custom", "--no-owner", "--no-acl", "--file", outputPath],
      {
        env: databaseConnectionEnv(databaseUrl),
        stdio: ["ignore", "ignore", "pipe"],
      }
    );
    timeout = setTimeout(() => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      finishReject(new Error("pg_dump timed out after 10 minutes"));
    }, PG_DUMP_TIMEOUT_MS);

    child.once("error", error => {
      const errno = error as NodeJS.ErrnoException;
      finishReject(
        new Error(
          errno.code === "ENOENT"
            ? "pg_dump is unavailable on this server"
            : `pg_dump could not start: ${errno.message}`
        )
      );
    });
    child.stderr?.on("data", chunk => {
      if (stderr.length < 4_000) stderr += String(chunk).slice(0, 4_000);
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        finishResolve();
        return;
      }
      finishReject(
        new Error(
          stderr.trim().slice(0, 400) ||
            `pg_dump failed${signal ? ` (${signal})` : ""}`
        )
      );
    });
  });
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function fileBytes(filePath: string): Promise<number> {
  return (await fs.stat(filePath)).size;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listTables(sql: PostgresClient): Promise<TableInfo[]> {
  const rows = await sql<TableInfo[]>`
    SELECT table_schema AS schema, table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows;
}

async function listColumns(
  sql: PostgresClient,
  table: TableInfo
): Promise<ColumnInfo[]> {
  const rows = await sql<ColumnInfo[]>`
    SELECT column_name AS name, ordinal_position AS ordinal
    FROM information_schema.columns
    WHERE table_schema = ${table.schema} AND table_name = ${table.name}
    ORDER BY ordinal_position
  `;
  return rows;
}

export function redactApplicationRow(
  row: Record<string, unknown>,
  mode: DatabaseBackupMode,
  redactedColumns: string[]
): Record<string, unknown> {
  if (mode === "full") return row;
  const copy = { ...row };
  for (const column of Object.keys(copy)) {
    if (SENSITIVE_COLUMN_PATTERN.test(column)) {
      copy[column] = "[REDACTED]";
      redactedColumns.push(column);
    }
  }
  return copy;
}

function sensitiveColumns(columns: ColumnInfo[]): string[] {
  return columns
    .filter(column => SENSITIVE_COLUMN_PATTERN.test(column.name))
    .map(column => column.name);
}

async function exportApplicationData(
  outputDir: string,
  mode: DatabaseBackupMode
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Database backup is not configured");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  const tables = await listTables(sql);
  const manifestTables: Array<Record<string, unknown>> = [];
  const redactedColumns = new Set<string>();
  try {
    await fs.mkdir(path.join(outputDir, "tables"), {
      recursive: true,
      mode: 0o700,
    });
    for (const table of tables) {
      const columns = await listColumns(sql, table);
      const redactedForTable = mode === "safe" ? sensitiveColumns(columns) : [];
      const selectSql = `SELECT * FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
      const fileName = `${table.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}.jsonl`;
      const filePath = path.join(outputDir, "tables", fileName);
      const file = await fs.open(filePath, "w");
      let rowCount = 0;
      try {
        for await (const batch of sql
          .unsafe(selectSql)
          .cursor(250) as AsyncIterable<Array<Record<string, unknown>>>) {
          const lines = batch
            .map(
              row =>
                `${JSON.stringify(redactApplicationRow(row, mode, redactedForTable))}\n`
            )
            .join("");
          await file.write(lines, null, "utf8");
          rowCount += batch.length;
        }
      } finally {
        await file.close();
      }
      redactedForTable.forEach(column =>
        redactedColumns.add(`${table.name}.${column}`)
      );
      manifestTables.push({
        schema: table.schema,
        table: table.name,
        columns: columns.map(column => column.name),
        file: `tables/${fileName}`,
        rowCount,
        redactedColumns: [...new Set(redactedForTable)],
      });
    }
    await writeJsonFile(path.join(outputDir, "manifest.json"), {
      formatVersion: 1,
      exportType: "application-data",
      mode,
      generatedAt: new Date().toISOString(),
      tableCount: manifestTables.length,
      redactedColumns: [...redactedColumns].sort(),
      tables: manifestTables,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function zipDirectory(
  sourceDir: string,
  outputPath: string
): Promise<void> {
  const zip = new AdmZip();
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(sourceDir, entry.name);
    if (entry.isFile()) zip.addLocalFile(entryPath, "");
    if (entry.isDirectory()) zip.addLocalFolder(entryPath, entry.name);
  }
  if (zip.getEntries().length === 0) throw new Error("Backup archive is empty");
  zip.writeZip(outputPath);
  if (
    (await fileBytes(outputPath)) <= 0 ||
    new AdmZip(outputPath).getEntries().length === 0
  ) {
    throw new Error("Backup archive integrity check failed");
  }
}

export async function createDatabaseBackupArtifacts(input: {
  jobId: string;
  mode: DatabaseBackupMode;
}) {
  await ensureDatabaseBackupRoot();
  const jobDir = getDatabaseBackupJobDirectory(input.jobId);
  const databaseWorkDir = path.join(jobDir, "database");
  const applicationWorkDir = path.join(jobDir, "application");
  await fs.rm(jobDir, { recursive: true, force: true });
  await fs.mkdir(databaseWorkDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(applicationWorkDir, { recursive: true, mode: 0o700 });

  const dumpPath = path.join(databaseWorkDir, "database.dump");
  const databaseZipPath = path.join(jobDir, `database-dump-${input.jobId}.zip`);
  const applicationZipPath = path.join(
    jobDir,
    `application-data-${input.mode}-${input.jobId}.zip`
  );
  try {
    await runPgDump(dumpPath);
    if ((await fileBytes(dumpPath)) <= 0)
      throw new Error("pg_dump produced an empty file");
    await writeJsonFile(path.join(databaseWorkDir, "manifest.json"), {
      formatVersion: 1,
      exportType: "postgresql-full-dump",
      mode: "full",
      generatedAt: new Date().toISOString(),
      dumpFile: "database.dump",
    });
    await zipDirectory(databaseWorkDir, databaseZipPath);
    await exportApplicationData(applicationWorkDir, input.mode);
    await zipDirectory(applicationWorkDir, applicationZipPath);
    return {
      databaseZipPath,
      databaseZipBytes: await fileBytes(databaseZipPath),
      databaseZipSha256: await sha256File(databaseZipPath),
      applicationZipPath,
      applicationZipBytes: await fileBytes(applicationZipPath),
      applicationZipSha256: await sha256File(applicationZipPath),
    };
  } catch (error) {
    await fs.rm(jobDir, { recursive: true, force: true });
    throw error;
  }
}
