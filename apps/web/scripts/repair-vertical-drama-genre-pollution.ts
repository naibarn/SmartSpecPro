/**
 * Report-first repair for `vertical_drama_series.genre` pollution (Stage 1.5,
 * `planning/vd-series-memory-and-lineage/plan.md`), extended by task #7 of
 * that plan to add an "AI proposes, product owner approves" pass
 * ("AI เสนอแนวเรื่อง + ผมอนุมัติ" — the product owner's explicit choice).
 *
 * Real dev-DB data proved `genre` has been holding a logline, an
 * alternate/working title, or a byte-for-byte copy of `title` for some
 * series (see `@shared/verticalDramaSeries/genrePollutionGuard`'s header doc
 * comment for the investigation and the 3 confirmed examples). A follow-up
 * full scan (task #7) found this is actually true of ALL 10 existing rows —
 * `detectGenrePollution`'s structural rule only catches 7 of them because it
 * is deliberately conservative (see that guard's header doc comment); rows
 * that read as a logline to a human but fall under its length threshold are
 * NOT structurally flagged. That guard's rules are intentionally unchanged
 * by this file — they remain the write-time guard against NEW pollution.
 * This script's genre-PROPOSAL pass therefore does not gate on
 * `isGenrePolluted`: it asks the LLM to judge every row, including ones the
 * structural guard doesn't flag, and lets it answer "keep" when a value is
 * already genre-shaped.
 *
 * Three modes:
 *
 *   --check    Structural-scan only (`scanGenrePollution`, unchanged from
 *              before this task). Exits 1 if any row is flagged. Makes NO
 *              LLM calls and costs nothing — safe to run in CI/casually.
 *
 *   (default)  Structural scan (reported for context) PLUS a genre-PROPOSAL
 *              pass: for every row, asks the `vertical-drama-genre-normalizer`
 *              skill (via `runVerticalDramaGenreProposal`) to judge the
 *              current `genre` and propose a real one grounded in the
 *              series' own bible/episodes. This costs a few real LLM
 *              credits per series (charged to that series' own owning
 *              user/tenant) — a deliberate, approved cost, not a bug. Writes
 *              a reviewable JSON file with every row defaulting to
 *              `approved: false` and prints a summary table. NEVER writes to
 *              `vertical_drama_series` itself.
 *
 *   --apply --review-file=<path> --backup=<path>
 *              Applies ONLY the rows in the given review file that a human
 *              has edited to `approved: true` (and/or edited `proposedGenre`
 *              on) — this is what makes approval real: this mode never
 *              calls the LLM, it only ever reads what a human already
 *              reviewed. Refuses to run at all unless `--backup` points to
 *              an existing, non-empty file (per the root CLAUDE.md Database
 *              Safety Protocol — take that backup FIRST):
 *
 *   pg_dump "$DATABASE_URL" --data-only --table=vertical_drama_series \
 *     --file=".db-backups/vertical_drama_series_$(date +%Y%m%d_%H%M%S).sql"
 *
 * Every applied row is also re-validated against a FRESH read of the
 * database (not the stale propose-pass snapshot) and re-run through
 * `detectGenrePollution` as a self-check — this script must never write a
 * value that is itself still pollution-shaped, and must never overwrite a
 * `genre` someone else changed in between the propose and apply passes.
 *
 * Usage:
 *   npx tsx scripts/repair-vertical-drama-genre-pollution.ts
 *   npx tsx scripts/repair-vertical-drama-genre-pollution.ts --check
 *   npx tsx scripts/repair-vertical-drama-genre-pollution.ts --out=scripts/output/my-review.json
 *   npx tsx scripts/repair-vertical-drama-genre-pollution.ts --apply \
 *     --review-file=scripts/output/vertical-drama-genre-proposals-....json \
 *     --backup=.db-backups/vertical_drama_series_....sql
 */
import "dotenv/config";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { getDb } from "../server/db";
import {
  detectGenrePollution,
  type GenrePollutionReason,
} from "../shared/verticalDramaSeries/genrePollutionGuard";
import {
  buildGenreProposalFacts,
  runVerticalDramaGenreProposal,
} from "../server/services/verticalDramaGenreProposal";
import type { VerticalDramaSeriesLocale } from "@shared/verticalDramaSeries";

export interface VerticalDramaSeriesGenreRow {
  id: number;
  tenantId: string;
  title: string;
  genre: string | null;
}

export interface GenrePollutionReport {
  id: number;
  tenantId: string;
  title: string;
  genre: string;
  reason: GenrePollutionReason;
}

/** Pure — scans rows and reports pollution findings. Never mutates, never guesses a replacement value (see this file's header doc comment). */
export function scanGenrePollution(
  rows: ReadonlyArray<VerticalDramaSeriesGenreRow>
): GenrePollutionReport[] {
  const reports: GenrePollutionReport[] = [];
  for (const row of rows) {
    if (!row.genre) continue;
    const reason = detectGenrePollution(row.genre, row.title);
    if (!reason) continue;
    reports.push({
      id: row.id,
      tenantId: row.tenantId,
      title: row.title,
      genre: row.genre,
      reason,
    });
  }
  return reports;
}

/* -------------------------------------------------------------------------- */
/* Genre PROPOSAL pass (task #7) — AI proposes, product owner approves       */
/* -------------------------------------------------------------------------- */

export type GenrePollutionReasonOrNone = GenrePollutionReason | "not_flagged";

export interface VerticalDramaSeriesGenreProposalRow extends VerticalDramaSeriesGenreRow {
  userId: number;
  locale: string;
  bible: Record<string, unknown> | null;
}

export interface GenreProposalReviewRow {
  id: number;
  tenantId: string;
  title: string;
  currentGenre: string | null;
  pollutionReason: GenrePollutionReasonOrNone;
  proposedGenre: string;
  decision: "keep" | "change";
  rationale: string;
  /**
   * Defaults to `false`. A human must edit this review file and flip this
   * to `true` (and may edit `proposedGenre` itself) before `--apply` will
   * touch this row — this field IS the approval gate, not decoration.
   */
  approved: boolean;
}

export interface GenreProposalReviewFile {
  generatedAt: string;
  rows: GenreProposalReviewRow[];
}

/** Pure — combines the structural pollution reason with an LLM proposal into one reviewable row. */
export function buildGenreProposalReviewRow(
  row: Pick<VerticalDramaSeriesGenreProposalRow, "id" | "tenantId" | "title" | "genre">,
  proposal: { proposed_genre: string; decision: "keep" | "change"; rationale: string }
): GenreProposalReviewRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    currentGenre: row.genre,
    pollutionReason: detectGenrePollution(row.genre, row.title) ?? "not_flagged",
    proposedGenre: proposal.proposed_genre,
    decision: proposal.decision,
    rationale: proposal.rationale,
    approved: false,
  };
}

/**
 * Terminal-readable summary table. Pipe-delimited rather than column-aligned
 * — Thai glyph widths vary per character/font so a fixed-width table can't
 * reliably align, and this needs to stay readable/parseable over "pretty".
 */
export function formatGenreProposalTable(
  rows: ReadonlyArray<GenreProposalReviewRow>
): string {
  const header =
    "id | title | current genre | pollution kind | PROPOSED genre | keep/change | rationale";
  const separator = "-".repeat(header.length);
  const lines = rows.map(row =>
    [
      row.id,
      row.title,
      row.currentGenre ?? "(empty)",
      row.pollutionReason,
      row.proposedGenre,
      row.decision,
      row.rationale,
    ].join(" | ")
  );
  return [header, separator, ...lines].join("\n");
}

/* -------------------------------------------------------------------------- */
/* --apply preconditions + plan (pure — no I/O)                              */
/* -------------------------------------------------------------------------- */

/**
 * Refuses `--apply` unless BOTH a review file and a verified, non-empty
 * backup file were supplied. Pure so it's unit-testable without touching
 * the filesystem or the database — the caller resolves `backupExists`/
 * `backupSizeBytes` and passes them in.
 */
export function validateGenreApplyPreconditions(opts: {
  reviewFilePath?: string;
  backupPath?: string;
  backupExists: boolean;
  backupSizeBytes: number;
}): string | null {
  if (!opts.reviewFilePath) {
    return "Missing --review-file=<path> — --apply must read from a reviewed/approved proposal file produced by a prior propose pass; it never calls the LLM itself.";
  }
  if (!opts.backupPath) {
    return "Missing --backup=<path> — refusing to run --apply without a verified pg_dump backup file (Database Safety Protocol, root CLAUDE.md).";
  }
  if (!opts.backupExists) {
    return (
      `Backup file not found at "${opts.backupPath}" — refusing to run --apply. Take a backup first:\n` +
      `  pg_dump "$DATABASE_URL" --data-only --table=vertical_drama_series --file="${opts.backupPath}"`
    );
  }
  if (opts.backupSizeBytes <= 0) {
    return `Backup file at "${opts.backupPath}" is empty — refusing to run --apply.`;
  }
  return null;
}

export interface GenreApplyRepair {
  id: number;
  before: string | null;
  after: string;
}

export interface GenreApplySkip {
  id: number;
  reason:
    | "not_approved"
    | "series_no_longer_exists"
    | "genre_changed_since_proposal"
    | "empty_proposed_genre"
    | "proposed_genre_still_polluted"
    | "no_change";
}

/**
 * Pure — diffs the reviewer-approved rows against a FRESH read of the
 * database (never the stale snapshot from the propose pass) and produces
 * the minimal, safe UPDATE plan. Never applies a row that:
 *  - the reviewer did not flip `approved: true` on (the approval gate),
 *  - has since had its `genre` changed by someone else (stale-apply guard —
 *    prevents clobbering a concurrent edit),
 *  - would write an empty value,
 *  - would be a no-op (proposed value already equals the current genre —
 *    checked before the pollution self-check below, since writing nothing
 *    is always safe),
 *  - or is itself still pollution-shaped per `detectGenrePollution` — a
 *    self-check so this script can never re-introduce the exact bug it
 *    exists to fix.
 */
export function planGenreApply(
  reviewRows: ReadonlyArray<GenreProposalReviewRow>,
  currentRows: ReadonlyArray<VerticalDramaSeriesGenreRow>
): { repairs: GenreApplyRepair[]; skipped: GenreApplySkip[] } {
  const byId = new Map(currentRows.map(row => [row.id, row]));
  const repairs: GenreApplyRepair[] = [];
  const skipped: GenreApplySkip[] = [];

  for (const row of reviewRows) {
    if (!row.approved) {
      skipped.push({ id: row.id, reason: "not_approved" });
      continue;
    }
    const current = byId.get(row.id);
    if (!current) {
      skipped.push({ id: row.id, reason: "series_no_longer_exists" });
      continue;
    }
    if ((current.genre ?? null) !== (row.currentGenre ?? null)) {
      skipped.push({ id: row.id, reason: "genre_changed_since_proposal" });
      continue;
    }
    const nextGenre = row.proposedGenre.trim();
    if (!nextGenre) {
      skipped.push({ id: row.id, reason: "empty_proposed_genre" });
      continue;
    }
    if (nextGenre === (current.genre ?? "")) {
      // Checked before the pollution self-check below: writing nothing is
      // always safe, even if the (unchanged) value happens to be
      // pollution-shaped — there's no new risk introduced by a no-op.
      skipped.push({ id: row.id, reason: "no_change" });
      continue;
    }
    if (detectGenrePollution(nextGenre, current.title)) {
      skipped.push({ id: row.id, reason: "proposed_genre_still_polluted" });
      continue;
    }
    repairs.push({ id: row.id, before: current.genre, after: nextGenre });
  }

  return { repairs, skipped };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                       */
/* -------------------------------------------------------------------------- */

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

async function runApply(databaseUrl: string): Promise<void> {
  const reviewFilePath = argValue("--review-file");
  const backupPath = argValue("--backup");
  const backupExists = Boolean(backupPath && fs.existsSync(backupPath));
  const backupSizeBytes = backupExists ? fs.statSync(backupPath!).size : 0;

  const validationError = validateGenreApplyPreconditions({
    reviewFilePath,
    backupPath,
    backupExists,
    backupSizeBytes,
  });
  if (validationError) {
    console.error(
      `[repair-vertical-drama-genre-pollution] --apply refused: ${validationError}`
    );
    process.exitCode = 1;
    return;
  }

  const reviewFile: GenreProposalReviewFile = JSON.parse(
    await readFile(reviewFilePath!, "utf8")
  );

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [{ count: beforeCountRaw }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM vertical_drama_series
    `;
    const rowCountBefore = Number(beforeCountRaw);

    const currentRows = await sql<VerticalDramaSeriesGenreRow[]>`
      SELECT id, "tenantId", title, genre FROM vertical_drama_series ORDER BY id
    `;
    const { repairs, skipped } = planGenreApply(reviewFile.rows, currentRows);

    console.log(
      JSON.stringify(
        { mode: "apply", rowCountBefore, toApply: repairs.length, skipped: skipped.length, skippedDetail: skipped },
        null,
        2
      )
    );

    if (repairs.length === 0) {
      console.log(
        "[repair-vertical-drama-genre-pollution] nothing approved to apply — exiting without touching the database."
      );
      return;
    }

    await sql.begin(async tx => {
      for (const repair of repairs) {
        await tx`
          UPDATE vertical_drama_series
          SET genre = ${repair.after}, "updatedAt" = now()
          WHERE id = ${repair.id} AND genre IS NOT DISTINCT FROM ${repair.before}
        `;
      }
    });

    const [{ count: afterCountRaw }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM vertical_drama_series
    `;
    const rowCountAfter = Number(afterCountRaw);

    console.log(
      JSON.stringify(
        { mode: "apply", applied: repairs.length, rowCountBefore, rowCountAfter },
        null,
        2
      )
    );

    if (rowCountAfter !== rowCountBefore) {
      console.error(
        "[repair-vertical-drama-genre-pollution] ROW COUNT MISMATCH after apply — restore from backup immediately and investigate before doing anything else. See root CLAUDE.md Database Safety Protocol."
      );
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function runGenrePollutionScan(): Promise<void> {
  const check = process.argv.includes("--check");
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  if (apply) {
    await runApply(databaseUrl);
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<VerticalDramaSeriesGenreProposalRow[]>`
      SELECT id, "tenantId", "userId", title, genre, locale, bible
      FROM vertical_drama_series
      ORDER BY id
    `;
    const reports = scanGenrePollution(rows);

    if (check) {
      console.log(
        JSON.stringify(
          {
            mode: "check (structural scan only — no LLM calls)",
            scanned: rows.length,
            flagged: reports.length,
            rows: reports,
          },
          null,
          2
        )
      );
      if (reports.length > 0) process.exitCode = 1;
      return;
    }

    // The propose pass calls the credit service (`hasEnoughCredits`/
    // `deductCredits`), which reads through the drizzle `db` singleton in
    // `server/db.ts` — that singleton is lazily created by `getDb()` and is
    // normally primed by the full server bootstrap; this standalone script
    // process must prime it itself before the first proposal call.
    getDb();

    console.log(
      JSON.stringify(
        {
          mode: "propose",
          scanned: rows.length,
          structurallyFlagged: reports.length,
          note: "Proposing a genre for EVERY row (not just structurally-flagged ones) per task #7 — see this file's header doc comment.",
        },
        null,
        2
      )
    );

    const reviewRows: GenreProposalReviewRow[] = [];
    for (const row of rows) {
      const facts = buildGenreProposalFacts(row);
      const { proposed, creditsUsed, model } = await runVerticalDramaGenreProposal({
        userId: row.userId,
        tenantId: row.tenantId,
        seriesId: row.id,
        locale: (row.locale as VerticalDramaSeriesLocale) || "th",
        facts,
      });
      reviewRows.push(buildGenreProposalReviewRow(row, proposed));
      console.log(
        `[propose] series #${row.id} "${row.title}" -> ${proposed.decision} (${proposed.proposed_genre}) [model=${model}, credits=${creditsUsed}]`
      );
    }

    const reviewFile: GenreProposalReviewFile = {
      generatedAt: new Date().toISOString(),
      rows: reviewRows,
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = path.resolve(
      argValue("--out") ??
        `scripts/output/vertical-drama-genre-proposals-${timestamp}.json`
    );
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(reviewFile, null, 2), "utf8");

    console.log("\n" + formatGenreProposalTable(reviewRows) + "\n");
    console.log(
      JSON.stringify(
        {
          mode: "propose",
          reviewFile: outPath,
          note:
            "Every row is written with approved:false. Edit this file (flip approved:true and/or edit proposedGenre per row you agree with), then run:\n" +
            `  npx tsx scripts/repair-vertical-drama-genre-pollution.ts --apply --review-file=${outPath} --backup=<pg_dump path>`,
        },
        null,
        2
      )
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGenrePollutionScan().catch(error => {
    console.error("[repair-vertical-drama-genre-pollution] failed:", error);
    process.exitCode = 1;
  });
}
