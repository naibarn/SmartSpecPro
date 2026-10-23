import "dotenv/config";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

type JournalEntry = { idx: number; when: number; tag: string };
type LedgerRow = { id: number; hash: string; created_at: number | string | null };
type SqlFile = { name: string; hash: string };

export function classifyDrizzleLedger(
  journal: JournalEntry[],
  sqlFiles: SqlFile[],
  ledgerRows: LedgerRow[],
) {
  const entriesByTime = new Map<number, JournalEntry[]>();
  const entriesByHash = new Map<string, JournalEntry[]>();
  const filesByHash = new Map<string, string[]>();
  for (const entry of journal) {
    entriesByTime.set(entry.when, [...(entriesByTime.get(entry.when) ?? []), entry]);
    const sql = sqlFiles.find(file => file.name === `${entry.tag}.sql`);
    if (sql) entriesByHash.set(sql.hash, [...(entriesByHash.get(sql.hash) ?? []), entry]);
  }
  for (const file of sqlFiles) filesByHash.set(file.hash, [...(filesByHash.get(file.hash) ?? []), file.name]);

  const journalResults = journal.map(entry => {
    const rowsByTime = ledgerRows.filter(row => Number(row.created_at) === entry.when);
    const expectedFile = sqlFiles.find(file => file.name === `${entry.tag}.sql`);
    const rowsByHash = expectedFile ? ledgerRows.filter(row => row.hash === expectedFile.hash) : [];
    let status: string;
    if (rowsByTime.some(row => expectedFile && row.hash === expectedFile.hash)) status = "matched_timestamp_and_hash";
    else if (rowsByTime.length) status = "matched_timestamp_hash_mismatch";
    else if (rowsByHash.length) status = "hash_matched_different_timestamp";
    else status = "neither_timestamp_nor_hash_matched";
    return {
      idx: entry.idx,
      tag: entry.tag,
      when: entry.when,
      sqlHash: expectedFile?.hash ?? null,
      ledgerRowIdsByTimestamp: rowsByTime.map(row => row.id),
      ledgerRowIdsByHash: rowsByHash.map(row => row.id),
      status,
    };
  });

  const ledgerResults = ledgerRows.map(row => {
    const timestampEntries = entriesByTime.get(Number(row.created_at)) ?? [];
    const hashEntries = entriesByHash.get(row.hash) ?? [];
    const sqlNames = filesByHash.get(row.hash) ?? [];
    const status = timestampEntries.length
      ? "journal_timestamp"
      : hashEntries.length
        ? "journal_hash_other_timestamp"
        : sqlNames.length
          ? "unjournaled_sql_hash"
          : "unknown_history";
    return {
      id: row.id,
      createdAt: row.created_at === null ? null : Number(row.created_at),
      hash: row.hash,
      journalTagsByTimestamp: timestampEntries.map(entry => entry.tag),
      journalTagsByHash: hashEntries.map(entry => entry.tag),
      matchingSqlFiles: sqlNames,
      status,
    };
  });

  const counts = (items: Array<{ status: string }>) => Object.fromEntries(
    [...new Set(items.map(item => item.status))].sort().map(status => [status, items.filter(item => item.status === status).length]),
  );
  return {
    journalCount: journal.length,
    sqlFileCount: sqlFiles.length,
    ledgerCount: ledgerRows.length,
    journalStatusCounts: counts(journalResults),
    ledgerStatusCounts: counts(ledgerResults),
    journal: journalResults,
    ledger: ledgerResults,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const journalBytes = await readFile(path.join(appRoot, "drizzle/meta/_journal.json"));
  const journal = JSON.parse(journalBytes.toString("utf8")) as { entries: JournalEntry[] };
  const sourceSha = process.env.GITHUB_SHA ?? process.env.SOURCE_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" }).trim();
  const journalHash = createHash("sha256").update(journalBytes).digest("hex");
  const fileNames = (await readdir(path.join(appRoot, "drizzle"))).filter(name => name.endsWith(".sql"));
  const sqlFiles = await Promise.all(fileNames.map(async name => ({
    name,
    hash: createHash("sha256").update(await readFile(path.join(appRoot, "drizzle", name))).digest("hex"),
  })));
  const targetUrl = new URL(databaseUrl);
  const databaseTargetId = createHash("sha256").update(`${targetUrl.host}${targetUrl.pathname}`).digest("hex").slice(0, 20);
  const client = new pg.Client({ connectionString: databaseUrl, application_name: "smartaihub-drizzle-ledger-audit" });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query<LedgerRow>(
      "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC",
    );
    const report = classifyDrizzleLedger(journal.entries, sqlFiles, result.rows);
    process.stdout.write(`${JSON.stringify({
      schema: "drizzle-ledger-audit.v1",
      observedAt: new Date().toISOString(),
      sourceSha,
      journalArtifact: { path: "apps/web/drizzle/meta/_journal.json", sha256: journalHash },
      databaseTargetId,
      access: "read_only",
      ...report,
    }, null, 2)}\n`);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main().catch(error => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "AUDIT_FAILED";
    console.error(JSON.stringify({ schema: "drizzle-ledger-audit.v1", error: code }));
    process.exitCode = 1;
  });
}
