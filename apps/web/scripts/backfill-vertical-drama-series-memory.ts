/**
 * Retroactive series-memory backfill for EXISTING Vertical Drama series —
 * task #8 of `planning/vd-series-memory-and-lineage/plan.md`.
 *
 * `vertical_drama_memory_events` has 0 rows and every real series row has
 * `memory IS NULL` (the plan's investigation). Stage 1.2 made NEW deep-draft/
 * script-generation runs write `series.memory` going forward, but that only
 * covers FUTURE authoring — it does nothing for the episodes a series
 * already has sitting in `vertical_drama_episodes.script`. This script closes
 * that gap for EXISTING data, with **zero LLM calls and zero credits**: it
 * reuses `resolveScriptEpisodeMemory` (`verticalDramaScriptGeneration.ts`,
 * Producer B's engine) — the exact same deterministic
 * parse-real-script-or-fall-back logic Producer B already runs at
 * authoring time — against every episode's already-stored `script` column,
 * then folds + persists via `upsertEpisodeMemories`
 * (`verticalDramaSeriesMemoryProjection.ts`). No new logic is invented here;
 * this file is CLI glue + a report around code that already exists.
 *
 * A `vertical_drama_episodes.script` row can be in one of three states:
 *   1. `null` — no script at all (episode is plan-only/未生成).
 *   2. A "real" script — the full `plan_episode_script` output shape
 *      (`scriptBuilderOutputSchema`: `contract_version`, `episode_title`,
 *      `hook`, `structure`, `continuity_notes`, `open_loops`, ...). ONLY
 *      these rows can produce a `VdEpisodeMemory` here.
 *   3. A `{ _draftSummary: { logline, keyBeats } }` STUB — written by the
 *      "materialize unused planned breakdown entries" fast path
 *      (`verticalDramaEpisodes.ts`'s Mode A) when an episode slot is created
 *      from the season plan without ever calling `plan_episode_script`. This
 *      is NOT a script (no acts/beats/dialogue/continuity/open-loops) and is
 *      deliberately EXCLUDED here — `scriptBuilderOutputSchema.safeParse`
 *      correctly rejects it (missing `contract_version`/`episode_title`/
 *      `hook`), so it is counted separately as "stub only", not silently
 *      treated as "no script".
 *
 * KNOWN, PERMANENT LIMITATION (do not "fix" — see plan + this file's own
 * `resolveScriptEpisodeMemory` doc comment): the script-derived fallback path
 * can NEVER produce `relationshipChanges` — `character_state_deltas` is a
 * PER-CHARACTER label (e.g. "ศัตรู" -> "พันธมิตร"), not a `[characterKeyA,
 * characterKeyB]` pair, so there is no reliable source to derive
 * `VdRelationshipState.pair` from without fabricating one. Backfilled memory
 * is therefore always partial: recap + canonical facts + open threads, ZERO
 * relationships. This is surfaced explicitly in this script's own output
 * (`relationshipsDerivable: false` + a fixed disclaimer string on every
 * preview row) so nobody downstream mistakes an empty relationship list for
 * "these characters have no relationships" — they may have plenty; this
 * backfill simply cannot see them.
 *
 * Three modes:
 *
 *   (default)        Dry-run. Makes NO LLM calls, NO writes. Prints a
 *                     per-series preview table (episode counts, thread
 *                     counts by class, relationship count — always 0 — and a
 *                     compactSummary length + preview) plus full JSON. Safe
 *                     to run any time.
 *
 *   --series=<id>     Restrict to one series id (repeatable is NOT supported
 *                     — one id per run).
 *
 *   --apply --backup=<path>
 *                     Writes via `upsertEpisodeMemories`. Per root CLAUDE.md
 *                     Database Safety Protocol: `vertical_drama_series.memory`
 *                     is NULL on every existing row today, so this write is
 *                     ADDITIVE, not destructive — but a backup is still
 *                     required unconditionally (mirrors
 *                     `repair-vertical-drama-genre-pollution.ts`'s
 *                     `validateGenreApplyPreconditions` pattern exactly,
 *                     minus the review-file requirement that script has:
 *                     there is no LLM proposal to approve here, only a
 *                     deterministic re-derivation of what's already in
 *                     `vertical_drama_episodes.script`):
 *
 *   pg_dump "$DATABASE_URL" --data-only --table=vertical_drama_series \
 *     --file=".db-backups/vertical_drama_series_$(date +%Y%m%d_%H%M%S).sql"
 *
 *   A series whose stored `memory.userEdited === true` is SKIPPED by
 *   default (never silently clobbers a hand-authored Series Memory tab edit
 *   — see `verticalDramaSeriesMemoryProjection.ts`'s header doc comment on
 *   `userEdited` precedence) unless `--force` is also passed, in which case
 *   `upsertEpisodeMemories`'s own `userEdited` handling still applies (it
 *   APPENDS new episode numbers only, never supersedes/regenerates
 *   `currentState`/`compactSummary` for a user-edited series — `--force`
 *   here only means "don't skip the series outright", not "override the
 *   projection service's own user-edit protection").
 *
 * Usage:
 *   npx tsx scripts/backfill-vertical-drama-series-memory.ts
 *   npx tsx scripts/backfill-vertical-drama-series-memory.ts --series=16
 *   npx tsx scripts/backfill-vertical-drama-series-memory.ts --apply \
 *     --backup=.db-backups/vertical_drama_series_....sql
 *   npx tsx scripts/backfill-vertical-drama-series-memory.ts --apply --force \
 *     --series=16 --backup=.db-backups/vertical_drama_series_....sql
 */
import "dotenv/config";
import fs from "node:fs";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, db } from "../server/db";
import {
  verticalDramaEpisodes,
  verticalDramaSeries,
} from "../drizzle/schema";
import {
  scriptBuilderOutputSchema,
  resolveScriptEpisodeMemory,
} from "../server/services/verticalDramaScriptGeneration";
import {
  buildCompactSummary,
  upsertEpisodeMemories,
} from "../server/services/verticalDramaSeriesMemoryProjection";
import {
  foldSeriesMemory,
  type VdEpisodeMemory,
} from "@shared/verticalDramaSeries/seriesMemoryState";

/**
 * The fixed disclaimer surfaced on every preview/apply result — see this
 * file's header doc comment. Kept as one exported constant so the report and
 * any future caller print byte-identical wording.
 */
export const RELATIONSHIP_LIMITATION_NOTE =
  "relationships are NOT derivable from stored episode scripts (character_state_deltas is a per-character label, not a pair) — relationshipChanges/currentState.relationships are always empty in this backfill by design, not evidence of an empty relationship graph.";

/* -------------------------------------------------------------------------- */
/* Pure logic — one episode's script -> VdEpisodeMemory | null               */
/* -------------------------------------------------------------------------- */

export interface VdSeriesMemoryBackfillEpisodeRow {
  episodeNumber: number;
  script: unknown;
}

/**
 * Resolves ONE episode's stored `script` column into a `VdEpisodeMemory`
 * using the SAME engine Producer B uses at authoring time
 * (`resolveScriptEpisodeMemory`) — returns `null` for a `null` script or a
 * script that fails `scriptBuilderOutputSchema` (covers both the `_draftSummary`
 * stub shape and a genuinely absent/malformed script). Never throws.
 */
export function resolveBackfillEpisodeMemory(
  row: VdSeriesMemoryBackfillEpisodeRow
): VdEpisodeMemory | null {
  if (row.script == null) return null;
  const parsed = scriptBuilderOutputSchema.safeParse(row.script);
  if (!parsed.success) return null;
  return resolveScriptEpisodeMemory(parsed.data, row.episodeNumber);
}

/* -------------------------------------------------------------------------- */
/* Pure logic — per-series preview                                           */
/* -------------------------------------------------------------------------- */

export interface VdSeriesMemoryBackfillPreview {
  seriesId: number;
  title: string;
  tenantId: string;
  userId: number;
  totalEpisodes: number;
  episodesWithRealScript: number;
  episodesWithStubOnly: number;
  episodesWithNoScript: number;
  /** Empty when `skipReason` is set — nothing will be written this run. */
  episodeMemoriesToWrite: VdEpisodeMemory[];
  skipReason: "user_edited" | "no_real_script" | null;
  threadCountsByClass: Record<string, number>;
  /** Always 0 today — see `RELATIONSHIP_LIMITATION_NOTE`. */
  relationshipCount: number;
  canonicalFactCount: number;
  compactSummaryLength: number;
  compactSummaryPreview: string;
  relationshipLimitationNote: string;
}

const COMPACT_SUMMARY_PREVIEW_CHARS = 600;

/** True iff the stored (raw, possibly-`null`) `memory` jsonb has `userEdited === true`. */
export function isStoredMemoryUserEdited(rawMemory: unknown): boolean {
  return (
    !!rawMemory &&
    typeof rawMemory === "object" &&
    (rawMemory as { userEdited?: unknown }).userEdited === true
  );
}

/**
 * Pure — builds one series' dry-run preview (and, when eligible, the exact
 * `VdEpisodeMemory[]` that `--apply` will hand to `upsertEpisodeMemories`).
 * Never touches the DB or the LLM.
 */
export function buildSeriesMemoryBackfillPreview(
  series: {
    id: number;
    title: string | null;
    tenantId: string;
    userId: number;
    memory: unknown;
  },
  episodes: ReadonlyArray<VdSeriesMemoryBackfillEpisodeRow>,
  opts: { force?: boolean } = {}
): VdSeriesMemoryBackfillPreview {
  const userEdited = isStoredMemoryUserEdited(series.memory);
  const resolved = episodes.map(episode => ({
    episode,
    memory: resolveBackfillEpisodeMemory(episode),
  }));
  const episodesWithRealScript = resolved.filter(r => r.memory != null).length;
  const episodesWithNoScript = episodes.filter(e => e.script == null).length;
  const episodesWithStubOnly =
    episodes.length - episodesWithRealScript - episodesWithNoScript;

  const base = {
    seriesId: series.id,
    title: series.title ?? `(untitled series #${series.id})`,
    tenantId: series.tenantId,
    userId: series.userId,
    totalEpisodes: episodes.length,
    episodesWithRealScript,
    episodesWithStubOnly,
    episodesWithNoScript,
    relationshipCount: 0,
    relationshipLimitationNote: RELATIONSHIP_LIMITATION_NOTE,
  };

  if (userEdited && !opts.force) {
    return {
      ...base,
      episodeMemoriesToWrite: [],
      skipReason: "user_edited",
      threadCountsByClass: {},
      canonicalFactCount: 0,
      compactSummaryLength: 0,
      compactSummaryPreview:
        "(skipped — series.memory.userEdited=true; pass --force to include this series, subject to upsertEpisodeMemories' own user-edit protection)",
    };
  }

  const episodeMemories = resolved
    .map(r => r.memory)
    .filter((m): m is VdEpisodeMemory => m != null);

  if (episodeMemories.length === 0) {
    return {
      ...base,
      episodeMemoriesToWrite: [],
      skipReason: "no_real_script",
      threadCountsByClass: {},
      canonicalFactCount: 0,
      compactSummaryLength: 0,
      compactSummaryPreview: "(no episode has a real, schema-valid script yet)",
    };
  }

  const currentState = foldSeriesMemory(episodeMemories);
  const compactSummary = buildCompactSummary(currentState, episodeMemories);
  const threadCountsByClass: Record<string, number> = {};
  for (const thread of currentState.openThreads) {
    threadCountsByClass[thread.threadClass] =
      (threadCountsByClass[thread.threadClass] ?? 0) + 1;
  }

  return {
    ...base,
    episodeMemoriesToWrite: episodeMemories,
    skipReason: null,
    threadCountsByClass,
    canonicalFactCount: currentState.canonicalFacts.length,
    compactSummaryLength: compactSummary.length,
    compactSummaryPreview:
      compactSummary.length > COMPACT_SUMMARY_PREVIEW_CHARS
        ? `${compactSummary.slice(0, COMPACT_SUMMARY_PREVIEW_CHARS)}…`
        : compactSummary,
  };
}

/**
 * Terminal-readable summary table — pipe-delimited (mirrors
 * `formatGenreProposalTable`'s rationale in
 * `repair-vertical-drama-genre-pollution.ts`: Thai glyph widths vary per
 * character/font, so a fixed-width table can't reliably align).
 */
export function formatSeriesMemoryBackfillTable(
  previews: ReadonlyArray<VdSeriesMemoryBackfillPreview>
): string {
  const header =
    "seriesId | title | totalEpisodes | realScript | stubOnly | noScript | toWrite | skipReason | threadsOpen | relationships | canonicalFacts | compactSummaryChars";
  const separator = "-".repeat(header.length);
  const lines = previews.map(p => {
    const threadTotal = Object.values(p.threadCountsByClass).reduce(
      (sum, n) => sum + n,
      0
    );
    return [
      p.seriesId,
      p.title,
      p.totalEpisodes,
      p.episodesWithRealScript,
      p.episodesWithStubOnly,
      p.episodesWithNoScript,
      p.episodeMemoriesToWrite.length,
      p.skipReason ?? "-",
      threadTotal,
      p.relationshipCount,
      p.canonicalFactCount,
      p.compactSummaryLength,
    ].join(" | ");
  });
  return [header, separator, ...lines].join("\n");
}

/* -------------------------------------------------------------------------- */
/* --apply preconditions (pure — no I/O, mirrors                             */
/* `validateGenreApplyPreconditions` in repair-vertical-drama-genre-pollution)*/
/* -------------------------------------------------------------------------- */

export function validateSeriesMemoryApplyPreconditions(opts: {
  backupPath?: string;
  backupExists: boolean;
  backupSizeBytes: number;
}): string | null {
  if (!opts.backupPath) {
    return (
      "Missing --backup=<path> — refusing to run --apply without a verified " +
      "pg_dump backup file (Database Safety Protocol, root CLAUDE.md), even " +
      "though this write is additive (memory is NULL on every existing row)."
    );
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

/* -------------------------------------------------------------------------- */
/* CLI                                                                       */
/* -------------------------------------------------------------------------- */

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

async function loadPreviews(
  seriesFilter: number | undefined,
  force: boolean
): Promise<VdSeriesMemoryBackfillPreview[]> {
  const seriesRows = await db
    .select({
      id: verticalDramaSeries.id,
      title: verticalDramaSeries.title,
      tenantId: verticalDramaSeries.tenantId,
      userId: verticalDramaSeries.userId,
      memory: verticalDramaSeries.memory,
    })
    .from(verticalDramaSeries)
    .where(
      seriesFilter != null ? eq(verticalDramaSeries.id, seriesFilter) : undefined
    )
    .orderBy(asc(verticalDramaSeries.id));

  const previews: VdSeriesMemoryBackfillPreview[] = [];
  for (const series of seriesRows) {
    const episodeRows = await db
      .select({
        episodeNumber: verticalDramaEpisodes.episodeNumber,
        script: verticalDramaEpisodes.script,
      })
      .from(verticalDramaEpisodes)
      .where(eq(verticalDramaEpisodes.seriesId, series.id))
      .orderBy(asc(verticalDramaEpisodes.episodeNumber));

    previews.push(
      buildSeriesMemoryBackfillPreview(series, episodeRows, { force })
    );
  }
  return previews;
}

async function runApply(previews: ReadonlyArray<VdSeriesMemoryBackfillPreview>) {
  const backupPath = argValue("--backup");
  const backupExists = Boolean(backupPath && fs.existsSync(backupPath));
  const backupSizeBytes = backupExists ? fs.statSync(backupPath!).size : 0;

  const validationError = validateSeriesMemoryApplyPreconditions({
    backupPath,
    backupExists,
    backupSizeBytes,
  });
  if (validationError) {
    console.error(
      `[backfill-vertical-drama-series-memory] --apply refused: ${validationError}`
    );
    process.exitCode = 1;
    return;
  }

  const [{ count: rowCountBefore }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(verticalDramaSeries);

  const results: Array<{
    seriesId: number;
    status: "written" | "skipped" | "error";
    detail: string;
  }> = [];

  for (const preview of previews) {
    if (preview.skipReason) {
      results.push({
        seriesId: preview.seriesId,
        status: "skipped",
        detail: preview.skipReason,
      });
      continue;
    }
    try {
      const summary = await upsertEpisodeMemories(
        preview.seriesId,
        preview.tenantId,
        preview.userId,
        preview.episodeMemoriesToWrite
      );
      results.push({
        seriesId: preview.seriesId,
        status: "written",
        detail: JSON.stringify(summary),
      });
    } catch (error) {
      results.push({
        seriesId: preview.seriesId,
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const [{ count: rowCountAfter }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(verticalDramaSeries);

  console.log(
    JSON.stringify(
      { mode: "apply", rowCountBefore, rowCountAfter, results },
      null,
      2
    )
  );

  if (rowCountAfter !== rowCountBefore) {
    console.error(
      "[backfill-vertical-drama-series-memory] ROW COUNT MISMATCH after apply — " +
        "restore from backup immediately and investigate before doing anything else. " +
        "See root CLAUDE.md Database Safety Protocol."
    );
    process.exitCode = 1;
  }
}

export async function runVerticalDramaSeriesMemoryBackfill(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const seriesArg = argValue("--series");
  const seriesFilter = seriesArg != null ? Number(seriesArg) : undefined;
  if (seriesArg != null && !Number.isFinite(seriesFilter)) {
    throw new Error(`--series=${seriesArg} is not a valid number`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  // Standalone script — prime the lazily-created drizzle `db` singleton
  // ourselves (normally done by the full server bootstrap). Mirrors
  // `repair-vertical-drama-genre-pollution.ts`'s identical comment/call.
  getDb();

  const previews = await loadPreviews(seriesFilter, force);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        force,
        seriesFilter: seriesFilter ?? "all",
        relationshipLimitationNote: RELATIONSHIP_LIMITATION_NOTE,
        previews,
      },
      null,
      2
    )
  );
  console.log("\n" + formatSeriesMemoryBackfillTable(previews) + "\n");

  if (!apply) {
    console.log(
      "[backfill-vertical-drama-series-memory] dry-run only — no writes made. " +
        "Re-run with --apply --backup=<path> to persist (after taking a pg_dump backup)."
    );
    return;
  }

  await runApply(previews);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVerticalDramaSeriesMemoryBackfill()
    .catch(error => {
      console.error("[backfill-vertical-drama-series-memory] failed:", error);
      process.exitCode = 1;
    })
    .finally(() => {
      // Standalone script — the drizzle `db` singleton holds an open
      // postgres-js connection pool that otherwise keeps the event loop
      // alive forever after the CLI work is done (mirrors the explicit
      // `process.exit(...)` convention other `getDb()`-based scripts in this
      // folder use, e.g. `backfill-vd-character-refs.ts`).
      process.exit(process.exitCode ?? 0);
    });
}
