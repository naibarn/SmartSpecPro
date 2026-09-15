import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type JournalEntry = { idx?: number; tag?: string };

export type MigrationReconciliation = {
  ok: boolean;
  authority: "drizzle-journal";
  journalPath: string;
  journalEntries: string[];
  journalFilesPresent: string[];
  missingJournalFiles: string[];
  unjournaledSqlFiles: string[];
  classifiedHistoricalOrManual: string[];
  secondGenericStatusColumns: string[];
  mutatesDatabase: false;
  callsExternalProvider: false;
  blockers: string[];
};

const root = join(import.meta.dirname, "..", "..", "..");
const drizzleDir = join(root, "apps/web/drizzle");
const journalPath = join(drizzleDir, "meta/_journal.json");

function migrationTagToFile(tag: string): string {
  return `${tag}.sql`;
}

function findGenericStatusColumns(): string[] {
  const schemaPath = join(drizzleDir, "schema.ts");
  if (!existsSync(schemaPath)) return ["schema.ts"];
  const source = readFileSync(schemaPath, "utf8");
  const workerJobsBlock = source.match(/export const workerJobs[\s\S]*?\n\};/m)?.[0] ?? "";
  const statusFields = [...workerJobsBlock.matchAll(/\bstatus\s*:/g)].map(() => "worker_jobs.status");
  return statusFields.length > 1 ? [...new Set(statusFields)] : [];
}

export function reconcileFeature192Migrations(): MigrationReconciliation {
  const blockers: string[] = [];
  if (!existsSync(journalPath)) blockers.push("drizzle_journal_missing");
  let entries: JournalEntry[] = [];
  if (existsSync(journalPath)) {
    try {
      const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: JournalEntry[] };
      entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      blockers.push("drizzle_journal_invalid");
    }
  }
  const journalEntries = entries.map(entry => entry.tag).filter((tag): tag is string => Boolean(tag));
  const sqlFiles = existsSync(drizzleDir)
    ? readdirSync(drizzleDir).filter(file => file.endsWith(".sql"))
    : [];
  const journalFilesPresent = journalEntries.filter(tag => sqlFiles.includes(migrationTagToFile(tag)));
  const missingJournalFiles = journalEntries
    .filter(tag => !sqlFiles.includes(migrationTagToFile(tag)))
    .map(migrationTagToFile);
  const journalSet = new Set(journalEntries.map(migrationTagToFile));
  const unjournaledSqlFiles = sqlFiles.filter(file => !journalSet.has(file));
  const classifiedHistoricalOrManual = unjournaledSqlFiles.filter(file => /^(?:manual_|backup_|legacy_|historical_)/i.test(file));
  const secondGenericStatusColumns = findGenericStatusColumns();
  if (missingJournalFiles.length > 0) blockers.push("journal_entry_file_missing");
  if (secondGenericStatusColumns.length > 0) blockers.push("second_generic_status_column");
  return {
    ok: blockers.length === 0,
    authority: "drizzle-journal",
    journalPath,
    journalEntries,
    journalFilesPresent,
    missingJournalFiles,
    unjournaledSqlFiles,
    classifiedHistoricalOrManual,
    secondGenericStatusColumns,
    mutatesDatabase: false,
    callsExternalProvider: false,
    blockers,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(reconcileFeature192Migrations(), null, 2)}\n`);
}
