/**
 * Vertical Drama Series — episode pipeline + memory router (spec feature 131, §04).
 *
 * Protected, feature-flag-gated (`verticalDramaSeries`, fail-closed), and scoped
 * to the caller's tenant + user on every read and mutation. Every mutation
 * accepts an idempotency key so a retried request does not duplicate state.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaApprovalCheckpoints,
  verticalDramaRunArtifacts,
  verticalDramaEpisodeRuns,
  verticalDramaCharacters,
  mediaAssets,
  mediaModels,
} from "../../drizzle/schema";
import { mediaGenerationService, DEFAULT_MODELS } from "../services/mediaGenerationService";
import { calculateCreditCost } from "../services/pricingCalculator";
import { hasEnoughCredits, deductCredits, refundCredits } from "../services/creditService";
import { signBearerToken } from "../_core/tokens";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { verticalDramaCharacterStockService } from "../services/verticalDramaCharacterStock";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { VERTICAL_DRAMA_MEMORY_KINDS } from "@shared/verticalDramaSeries";
import type {
  VerticalDramaMemoryKind,
  VerticalDramaPipelineStage,
  VerticalDramaSubShotPolicy,
  VerticalDramaStartFramePlan,
  VerticalDramaMotionPromptPack,
} from "@shared/verticalDramaSeries";
import { VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT } from "@shared/verticalDramaSeries";
import {
  verticalDramaEpisodePipeline,
  VerticalDramaEpisodePipeline,
  VERTICAL_DRAMA_PIPELINE_STAGES,
  VERTICAL_DRAMA_RUNNER_MODES,
  type EpisodeRunOwner,
} from "../services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../services/verticalDramaProviderRouting";
import {
  verticalDramaSeriesMemoryService,
  memoryRowToEvent,
} from "../services/verticalDramaSeriesMemory";
import {
  generateNextEpisodesViaLlm,
  InsufficientCreditsError as EpisodeContinuationInsufficientCreditsError,
  VdSchemaValidationError as EpisodeContinuationSchemaValidationError,
  type ExistingEpisodeContext,
  type EpisodeBreakdownItem,
} from "../services/verticalDramaEpisodeContinuation";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                         */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries")
);

function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

function parseId(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

/** Mirrors `verticalDramaCharacters.ts`'s `createCharacterPortraitMediaToken`/
 *  `getCharacterPortraitUserToken` — mints a short-lived media-generation
 *  scoped token when the request context has none. */
function getStartFrameMediaUserToken(ctx: {
  userToken: string | null;
  user: { id: number };
}): string {
  if (ctx.userToken) return ctx.userToken;
  return signBearerToken(
    {
      sub: String(ctx.user.id),
      type: "access",
      scopes: ["media:generate"],
      jti: `vd_start_frame_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m"
  );
}

/**
 * Runner modes that never route paid provider work — they use the bundled,
 * dry-run-safe stub pipeline singleton (renders nothing, spends nothing).
 */
const VERTICAL_DRAMA_DRY_RUN_MODES: ReadonlySet<string> = new Set([
  "dry_run",
  "plan_only",
]);

/**
 * Pick the pipeline for a run mode. Dry-run / plan-only stay on the stub
 * singleton (section-04 default). Modes that can route real provider work wire
 * in the section-08 provider routing port (`createVerticalDramaProviderRoutingPort`),
 * which routes + gates paid stages (and stays dry-run-safe by default — it never
 * calls a paid API, so this is behavior-preserving for tests/dry runs).
 */
function pipelineForMode(mode: string): VerticalDramaEpisodePipeline {
  if (VERTICAL_DRAMA_DRY_RUN_MODES.has(mode))
    return verticalDramaEpisodePipeline;
  return new VerticalDramaEpisodePipeline(
    createVerticalDramaProviderRoutingPort()
  );
}

/** Confirm the caller owns the series (tenant + user), else NOT_FOUND. */
async function assertSeriesOwned(
  tenantId: string,
  userId: number,
  seriesId: number
) {
  const [row] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
}

/** Load an episode the caller owns (tenant + user + series), else NOT_FOUND. */
async function loadOwnedEpisode(owner: EpisodeRunOwner) {
  const [row] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
  return row;
}

/**
 * Batch-resolve `media_assets` ids referenced from `startFramePlan`/
 * `motionPromptPack` JSONB (start/end frame asset ids) into display URLs,
 * scoped to the caller's tenant+user so one series never leaks another
 * user's asset URLs. Returns a plain id->url map for the client to join by
 * shot/clip number against the raw plan data it already receives.
 */
async function resolveEpisodePlanAssetUrls(
  tenantId: string,
  userId: number,
  startFramePlan: unknown,
  motionPromptPack: unknown,
): Promise<Record<string, { url: string; thumbnailUrl: string | null }>> {
  const ids = new Set<string>();
  const frames = (startFramePlan as VerticalDramaStartFramePlan | null)?.frames ?? [];
  for (const frame of frames) {
    if (frame?.approvedMediaAssetId) ids.add(String(frame.approvedMediaAssetId));
  }
  const clips = (motionPromptPack as VerticalDramaMotionPromptPack | null)?.clips ?? [];
  for (const clip of clips) {
    if (clip?.startFrameAssetId) ids.add(String(clip.startFrameAssetId));
    if (clip?.endFrameAssetId) ids.add(String(clip.endFrameAssetId));
  }
  if (ids.size === 0) return {};
  const numericIds = Array.from(ids)
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0);
  if (numericIds.length === 0) return {};

  const rows = await db
    .select({
      id: mediaAssets.id,
      originalUrl: mediaAssets.originalUrl,
      thumbnailUrl: mediaAssets.thumbnailUrl,
    })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, numericIds),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, userId),
      ),
    );

  const result: Record<string, { url: string; thumbnailUrl: string | null }> = {};
  for (const row of rows) {
    if (!row.originalUrl) continue;
    result[String(row.id)] = {
      url: row.originalUrl,
      thumbnailUrl: row.thumbnailUrl ?? null,
    };
  }
  return result;
}

/**
 * Resolve every character in the series to its current approved primary
 * portrait (if any), keyed by `characterKey` — the same key storyboard shots
 * reference in `characters`/`required_character_refs`. Lets the client show
 * "which character(s) does this shot need" directly on the shot card, so
 * identity-lock is visible/correctable per shot instead of only happening
 * invisibly inside generation calls.
 */
async function resolveSeriesCharacterPortraits(
  tenantId: string,
  userId: number,
  seriesId: number,
): Promise<
  Record<string, { characterId: string; name: string; portraitUrl: string | null }>
> {
  const characterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
      ),
    );

  const portraitUrls = await Promise.all(
    characterRows.map((c: { id: number }) =>
      verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        c.id,
      ),
    ),
  );

  const result: Record<string, { characterId: string; name: string; portraitUrl: string | null }> = {};
  characterRows.forEach(
    (c: { id: number; characterKey: string; name: string }, i: number) => {
      result[c.characterKey] = {
        characterId: String(c.id),
        name: c.name,
        portraitUrl: portraitUrls[i],
      };
    },
  );
  return result;
}

/**
 * Resolve a shot's `requiredCharacterRefs` (character keys) to their approved
 * primary-portrait URLs — the identity-lock reference set for one image
 * generation call. Shared by `generateStartFrameImage` and
 * `generateStartFrameAngleVariations` (previously duplicated inline).
 */
async function resolveShotCharacterReferenceUrls(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterKeys: string[] | undefined,
): Promise<string[]> {
  if (!characterKeys?.length) return [];
  const characterRows = await db
    .select({ id: verticalDramaCharacters.id })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
        inArray(verticalDramaCharacters.characterKey, characterKeys),
      ),
    );
  const urls = await Promise.all(
    characterRows.map((c: { id: number }) =>
      verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        c.id,
      ),
    ),
  );
  return urls.filter((u): u is string => Boolean(u));
}

/**
 * Insert one new episode row, safely assigning the next episode number.
 * Extracted from `createEpisode` (spec Tests) so every episode-creating
 * procedure — the plain shell `createEpisode` AND the plan-materializing /
 * LLM-continuation `generateNextEpisodes` — shares the exact same
 * race-safe max+1-with-retry-on-unique-violation numbering behavior. The
 * unique index on (tenant, series, episodeNumber) prevents concurrent
 * duplicates; on a collision (someone else raced us for the same number) the
 * max+1 assignment is simply retried up to 5 times.
 */
async function insertEpisodeWithSafeNumber(
  tenantId: string,
  userId: number,
  seriesId: number,
  input: {
    title?: string | null;
    script?: unknown;
    status?: string;
    targetDurationSeconds?: number;
  }
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [agg] = await db
      .select({
        maxEpisodeNumber: sql<number>`COALESCE(MAX(${verticalDramaEpisodes.episodeNumber}), 0)`,
      })
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.tenantId, tenantId),
          eq(verticalDramaEpisodes.seriesId, seriesId)
        )
      );
    const nextNumber = Number(agg?.maxEpisodeNumber ?? 0) + 1;
    try {
      const [row] = await db
        .insert(verticalDramaEpisodes)
        .values({
          tenantId,
          userId,
          seriesId,
          episodeNumber: nextNumber,
          title: input.title ?? null,
          status: input.status ?? "draft",
          targetDurationSeconds: input.targetDurationSeconds ?? 60,
          script: input.script ?? null,
        })
        .returning();
      return row;
    } catch (err) {
      // Unique-violation on the episode number → someone raced us; retry.
      if (attempt === 4) throw err;
    }
  }
  throw new TRPCError({
    code: "CONFLICT",
    message: "Could not assign episode number",
  });
}

/** Resolve the effective sub-shot policy for a tenant (flag-gated, fail-closed). */
async function resolveSubShotPolicy(
  tenantId: string,
  override?: Partial<VerticalDramaSubShotPolicy>
): Promise<{ flagOn: boolean; policy: VerticalDramaSubShotPolicy }> {
  const flags = await getTenantFeatureFlags(tenantId);
  const flagOn = flags.verticalDramaSeriesSubShots === true;
  const policy: VerticalDramaSubShotPolicy = {
    ...VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
    ...(override ?? {}),
    enabled: flagOn && (override?.enabled ?? true),
  };
  return { flagOn, policy };
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const idempotencyKey = z.string().trim().min(1).max(128).optional();
const stageEnum = z.enum(
  VERTICAL_DRAMA_PIPELINE_STAGES as unknown as [
    VerticalDramaPipelineStage,
    ...VerticalDramaPipelineStage[],
  ]
);
const runModeEnum = z.enum(
  VERTICAL_DRAMA_RUNNER_MODES as unknown as [string, ...string[]]
);

const subShotPolicyInput = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(["auto", "fixed"]).optional(),
    targetPerShot: z.number().int().min(1).max(5).optional(),
    maxPerShot: z.number().int().min(1).max(5).optional(),
    minSubShotSeconds: z.number().positive().max(30).optional(),
  })
  .optional();

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export const verticalDramaEpisodesRouter = router({
  /**
   * Create an episode, assigning the next episode number safely. The unique
   * index (tenant, series, episodeNumber) prevents concurrent duplicates; the
   * idempotency key returns the same episode on retry.
   */
  createEpisode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        title: z.string().trim().max(255).optional(),
        targetDurationSeconds: z.number().int().positive().max(3600).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      // Idempotent retry: a persistent receipt in the (otherwise-null-at-create)
      // `script` jsonb survives replays, so a repeated request returns the same
      // episode instead of assigning a new number.
      if (input.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
              sql`${verticalDramaEpisodes.script}->>'_idempotencyReceipt' = ${input.idempotencyKey}`
            )
          )
          .limit(1);
        if (existing)
          return { episode: { ...existing, id: String(existing.id) } };
      }

      const scriptReceipt = input.idempotencyKey
        ? { _idempotencyReceipt: input.idempotencyKey }
        : null;

      // Safe max+1 assignment with retry-on-unique-violation so concurrent
      // creators never duplicate the same episode number (spec Tests) —
      // shared with `generateNextEpisodes` via `insertEpisodeWithSafeNumber`.
      const row = await insertEpisodeWithSafeNumber(
        tenantId,
        userId,
        seriesId,
        {
          title: input.title ?? null,
          script: scriptReceipt,
          targetDurationSeconds: input.targetDurationSeconds,
        }
      );
      return { episode: { ...row, id: String(row.id) } };
    }),

  /**
   * Generate `count` MORE episodes that genuinely continue the same
   * storyline — repeatable indefinitely. Two modes, chosen automatically
   * (never by the caller):
   *
   *  - Mode A "materialize from plan" (free, no LLM call): takes unused
   *    `bible.episodeBreakdown` entries already written by the series'
   *    "Generate story" step (`generateStoryBible`) and inserts them as real
   *    episode rows.
   *  - Mode B "LLM continuation" (credit-gated): once there are no unused
   *    breakdown entries left, calls an LLM with every existing episode so
   *    far for continuity, appends the new entries to the series'
   *    `bible.episodeBreakdown` (never overwriting other bible keys), and
   *    inserts them as real episode rows too.
   *
   * Both modes insert via `insertEpisodeWithSafeNumber` — the exact same
   * race-safe numbering `createEpisode` uses — so calling this back-to-back
   * indefinitely never produces a duplicate/racy episode number.
   */
  generateNextEpisodes: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        count: z.number().int().min(1).max(5).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      const [seriesRow] = await db
        .select()
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, userId)
          )
        )
        .limit(1);
      if (!seriesRow)
        throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });

      const bible = (seriesRow.bible as Record<string, unknown> | null) ?? {};
      const episodeBreakdown: EpisodeBreakdownItem[] = Array.isArray(
        bible.episodeBreakdown
      )
        ? (bible.episodeBreakdown as EpisodeBreakdownItem[])
        : [];

      const existingRows: Array<{
        episodeNumber: number;
        title: string | null;
        script: unknown;
      }> = await db
        .select({
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          title: verticalDramaEpisodes.title,
          script: verticalDramaEpisodes.script,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .orderBy(asc(verticalDramaEpisodes.episodeNumber));

      let maxEpisodeNumber = existingRows.reduce(
        (max: number, r) => Math.max(max, r.episodeNumber),
        0
      );

      // Continuity context so far, oldest first: prefer the row's own
      // materialized draft summary, falling back to a matching plan entry.
      const existingEpisodes: ExistingEpisodeContext[] = existingRows.map(r => {
        const draftSummary = (r.script as Record<string, unknown> | null)
          ?._draftSummary as
          | { logline?: string; keyBeats?: string[] }
          | undefined;
        const planned = episodeBreakdown.find(
          b => b.episodeNumber === r.episodeNumber
        );
        return {
          episodeNumber: r.episodeNumber,
          title: r.title,
          logline: draftSummary?.logline ?? planned?.logline,
          keyBeats: draftSummary?.keyBeats ?? planned?.keyBeats,
        };
      });

      const insertedEpisodes: Array<{
        id: string;
        episodeNumber: number;
        title: string | null;
        status: string;
      }> = [];
      let remaining = input.count;
      let creditsUsed = 0;
      let usedModeA = false;
      let usedModeB = false;

      // Mode A — materialize unused planned breakdown entries (free, no LLM call).
      const unusedPlanned = episodeBreakdown
        .filter(b => b.episodeNumber > maxEpisodeNumber)
        .sort((a, b) => a.episodeNumber - b.episodeNumber);

      for (const planned of unusedPlanned) {
        if (remaining <= 0) break;
        const row = await insertEpisodeWithSafeNumber(
          tenantId,
          userId,
          seriesId,
          {
            title: planned.workingTitle,
            script: {
              _draftSummary: {
                logline: planned.logline,
                keyBeats: planned.keyBeats,
              },
            },
            status: "draft",
          }
        );
        const episodeNumber = Number(row.episodeNumber);
        const title = row.title as string | null;
        insertedEpisodes.push({
          id: String(row.id),
          episodeNumber,
          title,
          status: String(row.status),
        });
        existingEpisodes.push({
          episodeNumber,
          title,
          logline: planned.logline,
          keyBeats: planned.keyBeats,
        });
        maxEpisodeNumber = Math.max(maxEpisodeNumber, episodeNumber);
        remaining -= 1;
        usedModeA = true;
      }

      // Mode B — LLM continuation for whatever `count` Mode A couldn't cover.
      // All-or-nothing: `generateNextEpisodesViaLlm` throws rather than
      // returning a short batch, so we never insert a partial Mode-B batch.
      const appendedBreakdown: EpisodeBreakdownItem[] = [];
      if (remaining > 0) {
        let llmResult;
        try {
          llmResult = await generateNextEpisodesViaLlm({
            userId,
            tenantId,
            seriesId,
            title: seriesRow.title,
            locale: (seriesRow.locale as "th" | "en") ?? "th",
            genre: seriesRow.genre,
            tone: seriesRow.tone,
            bible,
            existingEpisodes,
            nextEpisodeNumber: maxEpisodeNumber + 1,
            count: remaining,
          });
        } catch (error) {
          if (error instanceof EpisodeContinuationInsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: error.message });
          }
          if (error instanceof EpisodeContinuationSchemaValidationError) {
            throw new TRPCError({
              code: "UNPROCESSABLE_CONTENT",
              message: error.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Episode continuation failed",
          });
        }

        creditsUsed = llmResult.creditsUsed;
        usedModeB = true;

        // Insert the whole Mode-B batch (the service already guaranteed a
        // full-count response). The episode number actually persisted comes
        // from the same safe max+1 helper, not the model's claimed number, so
        // the bible's `episodeBreakdown` is updated with the REAL numbers to
        // stay consistent with what a future call's Mode A will see.
        for (const planned of llmResult.generated) {
          const row = await insertEpisodeWithSafeNumber(
            tenantId,
            userId,
            seriesId,
            {
              title: planned.workingTitle,
              script: {
                _draftSummary: {
                  logline: planned.logline,
                  keyBeats: planned.keyBeats,
                },
              },
              status: "draft",
            }
          );
          const episodeNumber = Number(row.episodeNumber);
          insertedEpisodes.push({
            id: String(row.id),
            episodeNumber,
            title: row.title as string | null,
            status: String(row.status),
          });
          appendedBreakdown.push({
            episodeNumber,
            workingTitle: planned.workingTitle,
            logline: planned.logline,
            keyBeats: planned.keyBeats,
          });
        }
      }

      // Append (never overwrite) the newly-generated entries into the
      // series' bible.episodeBreakdown so future calls see them as
      // "existing episodes" too.
      if (appendedBreakdown.length > 0) {
        const updatedBible = {
          ...bible,
          episodeBreakdown: [...episodeBreakdown, ...appendedBreakdown],
        };
        await db
          .update(verticalDramaSeries)
          .set({ bible: updatedBible, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId),
              eq(verticalDramaSeries.userId, userId)
            )
          );
      }

      const source: "breakdown" | "generated" | "mixed" =
        usedModeA && usedModeB
          ? "mixed"
          : usedModeB
            ? "generated"
            : "breakdown";

      return { episodes: insertedEpisodes, creditsUsed, source };
    }),

  /**
   * Patch an owned episode's draft plan JSONB fields (script, storyboard, etc.)
   * and/or its title. Ownership-scoped (NOT_FOUND on a cross-tenant/user id).
   * Only supplied fields are written; this never triggers paid generation.
   */
  updateEpisodeDraft: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        title: z.string().trim().max(255).nullable().optional(),
        script: z.record(z.string(), z.unknown()).nullable().optional(),
        storyboard: z.record(z.string(), z.unknown()).nullable().optional(),
        startFramePlan: z.record(z.string(), z.unknown()).nullable().optional(),
        dialogueAudioPlan: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional(),
        motionPromptPack: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional(),
        assemblyManifest: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      // Confirm ownership (throws NOT_FOUND otherwise).
      await loadOwnedEpisode(owner);

      const updates: Partial<typeof verticalDramaEpisodes.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.script !== undefined) updates.script = input.script;
      if (input.storyboard !== undefined) updates.storyboard = input.storyboard;
      if (input.startFramePlan !== undefined)
        updates.startFramePlan = input.startFramePlan;
      if (input.dialogueAudioPlan !== undefined)
        updates.dialogueAudioPlan = input.dialogueAudioPlan;
      if (input.motionPromptPack !== undefined)
        updates.motionPromptPack = input.motionPromptPack;
      if (input.assemblyManifest !== undefined)
        updates.assemblyManifest = input.assemblyManifest;

      const [row] = await db
        .update(verticalDramaEpisodes)
        .set(updates)
        .where(
          and(
            eq(verticalDramaEpisodes.id, owner.episodeId),
            eq(verticalDramaEpisodes.tenantId, owner.tenantId),
            eq(verticalDramaEpisodes.userId, owner.userId),
            eq(verticalDramaEpisodes.seriesId, owner.seriesId)
          )
        )
        .returning();

      return { episode: { ...row, id: String(row.id) } };
    }),

  /**
   * List an episode's approval checkpoints (read-only), newest first, optionally
   * filtered by state. The workspace approval bar resolves the pending
   * checkpoint id for a stage from this. Ownership-scoped.
   */
  listCheckpoints: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        state: z
          .enum(["pending", "approved", "rejected", "repaired"])
          .optional(),
        limit: z.number().int().positive().max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);

      const conditions = [
        eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
        eq(verticalDramaApprovalCheckpoints.userId, owner.userId),
        eq(verticalDramaApprovalCheckpoints.seriesId, owner.seriesId),
        eq(verticalDramaApprovalCheckpoints.episodeId, owner.episodeId),
      ];
      if (input.state) {
        conditions.push(
          eq(verticalDramaApprovalCheckpoints.state, input.state)
        );
      }

      const rows = await db
        .select()
        .from(verticalDramaApprovalCheckpoints)
        .where(and(...conditions))
        .orderBy(
          desc(verticalDramaApprovalCheckpoints.updatedAt),
          desc(verticalDramaApprovalCheckpoints.id)
        )
        .limit(input.limit ?? 200);

      return {
        checkpoints: rows.map((r: (typeof rows)[number]) => ({
          checkpointId: String(r.id),
          runId: String(r.runId),
          stage: r.stage,
          state: r.state,
          sourceArtifactIds: (r.sourceArtifactIds as string[] | null) ?? [],
          notes: r.notes,
          updatedAt: r.updatedAt,
        })),
      };
    }),

  /** Run a single pipeline stage (dry-run capable). */
  runStage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        mode: runModeEnum.default("dry_run"),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      const outcome = await pipelineForMode(input.mode).runStage(
        owner,
        input.stage,
        {
          mode: input.mode as never,
          subShotFlagOn: flagOn,
          subShotPolicy: policy,
          idempotencyKey: input.idempotencyKey,
        }
      );
      return outcome;
    }),

  /**
   * Regenerate a stage from scratch: delete its prior run(s) (cascades to
   * that run's approval checkpoints and artifacts via FK `onDelete:
   * "cascade"`), then immediately run it again in "full" mode. Distinct from
   * `repairStageOutput`, which deliberately never deletes — this is the
   * explicit "throw away what's there and start over" action the user asked
   * for, for stages whose current output isn't worth repairing incrementally.
   * Destructive — the client gates this behind an explicit confirm step, the
   * same convention as the paid "generate real script" action.
   *
   * Also deletes every DOWNSTREAM stage's run(s) (bug found 2026-07-05: an
   * earlier version only deleted the clicked stage, so regenerating e.g.
   * the script left the storyboard/start-frame/etc. — all built FROM that
   * script — completely untouched; the user correctly saw "regenerated" but
   * the shots/images they were looking at never changed, because those
   * belong to a different, later stage this action never touched). This
   * mirrors `repairStageOutput`'s existing `staleStages` concept
   * (`VerticalDramaEpisodePipeline.downstreamStages`), except here the stale
   * downstream content is actually deleted, not just flagged, since
   * "regenerate" is the explicit from-scratch action.
   */
  regenerateStage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);

      const stagesToClear = [
        input.stage,
        ...VerticalDramaEpisodePipeline.downstreamStages(input.stage),
      ];
      await db
        .delete(verticalDramaEpisodeRuns)
        .where(
          and(
            eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
            eq(verticalDramaEpisodeRuns.userId, owner.userId),
            eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
            eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
            inArray(verticalDramaEpisodeRuns.stage, stagesToClear)
          )
        );

      // Also null out the downstream stages' own persisted jsonb columns on
      // the episode row — these are separate from the run/checkpoint/
      // artifact tables just deleted above, and were the actual cause of the
      // "says regenerated but still shows the same old data" bug: the UI's
      // storyboard panel (and equivalents) key off THIS column's content
      // directly, regardless of whether a run/checkpoint still backs it.
      // The clicked stage's own column is deliberately left alone — `runStage`
      // below overwrites it immediately with fresh content.
      const downstreamColumnByStage: Partial<
        Record<VerticalDramaPipelineStage, keyof typeof verticalDramaEpisodes.$inferInsert>
      > = {
        plan_episode_script: "script",
        storyboard_shotgrid: "storyboard",
        start_frame_render_plan: "startFramePlan",
        dialogue_audio_plan: "dialogueAudioPlan",
        video_motion_prompt_pack: "motionPromptPack",
        assemble_episode_manifest: "assemblyManifest",
      };
      const downstream = VerticalDramaEpisodePipeline.downstreamStages(input.stage);
      const columnUpdates: Record<string, null> = {};
      for (const s of downstream) {
        const col = downstreamColumnByStage[s];
        if (col) columnUpdates[col] = null;
      }
      if (downstream.includes("create_storyboard_review_project")) {
        columnUpdates.storyboardReviewId = null;
      }
      if (Object.keys(columnUpdates).length > 0) {
        await db
          .update(verticalDramaEpisodes)
          .set({ ...columnUpdates, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          );
      }

      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      const outcome = await pipelineForMode("full").runStage(
        owner,
        input.stage,
        {
          mode: "full",
          subShotFlagOn: flagOn,
          subShotPolicy: policy,
          idempotencyKey: input.idempotencyKey,
        }
      );
      return outcome;
    }),

  /** Run stages sequentially until a gate (approval / failure / end). */
  runEpisode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        mode: runModeEnum.default("dry_run"),
        fromStage: stageEnum.optional(),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      return pipelineForMode(input.mode).runEpisode(owner, {
        mode: input.mode as never,
        fromStage: input.fromStage,
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
        idempotencyKey: input.idempotencyKey,
      });
    }),

  /**
   * Approve a stage's checkpoint. Approving never mutates the source artifact —
   * it only records the approval and unblocks the paid/next stage.
   */
  approveCheckpoint: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        checkpointId: z.string().min(1),
        decision: z.enum(["approve", "reject"]).default("approve"),
        notes: z.string().max(2000).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const checkpointId = parseId(input.checkpointId, "checkpoint id");

      const [checkpoint] = await db
        .select()
        .from(verticalDramaApprovalCheckpoints)
        .where(
          and(
            eq(verticalDramaApprovalCheckpoints.id, checkpointId),
            eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
            eq(verticalDramaApprovalCheckpoints.userId, userId),
            eq(verticalDramaApprovalCheckpoints.seriesId, seriesId),
            eq(verticalDramaApprovalCheckpoints.episodeId, episodeId)
          )
        )
        .limit(1);
      if (!checkpoint)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checkpoint not found",
        });

      // Idempotent: a terminal checkpoint returns as-is.
      if (checkpoint.state === "approved" || checkpoint.state === "rejected") {
        return { checkpoint: { ...checkpoint, id: String(checkpoint.id) } };
      }

      const approving = input.decision === "approve";
      const [row] = await db
        .update(verticalDramaApprovalCheckpoints)
        .set({
          state: approving ? "approved" : "rejected",
          approvedByUserId: approving ? userId : null,
          rejectedByUserId: approving ? null : userId,
          notes: input.notes ?? checkpoint.notes,
          updatedAt: new Date(),
        })
        .where(eq(verticalDramaApprovalCheckpoints.id, checkpoint.id))
        .returning();

      // Bug fix (2026-07-05): the run row that produced this checkpoint was
      // written BEFORE approval, with `status: "approval_required"` /
      // `nextAction: "approve"` frozen in at that time — nothing ever
      // updated it afterward. The client derives "what stage needs
      // attention" from the latest run row per stage
      // (`VerticalDramaEpisodePage.tsx`'s `stageStates`), so that stale row
      // kept showing the approval bar forever, with `checkpointId` now
      // `undefined` (the checkpoint is no longer `pending`) — every
      // subsequent Approve/Reject click silently no-op'd. Patch the run row
      // directly here (NOT by re-invoking `runStage`, which would re-run
      // paid/credit-charging generation for stages like `plan_episode_script`
      // that call their real LLM generation unconditionally before the
      // approval gate — re-invoking would double-charge and overwrite the
      // just-approved output).
      if (approving) {
        const nextAction =
          checkpoint.stage === "create_storyboard_review_project"
            ? "open_storyboard_review"
            : checkpoint.stage === "summarize_episode_to_series_memory"
              ? "none"
              : "resume_next_stage";
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ status: "succeeded", nextAction, updatedAt: new Date() })
          .where(eq(verticalDramaEpisodeRuns.id, checkpoint.runId));
      } else {
        // Rejecting has the identical stale-run-row problem — surface it as
        // the same "failed" / "repair" state every other rejected/invalid
        // stage output uses, instead of leaving the same broken approval bar
        // showing with a now-undefined checkpoint id.
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ status: "failed", nextAction: "repair", updatedAt: new Date() })
          .where(eq(verticalDramaEpisodeRuns.id, checkpoint.runId));
      }

      // Memory-update checkpoint (stage `summarize_episode_to_series_memory`,
      // the 12th/last approval checkpoint): the episode summary is held PENDING
      // and never auto-applied by the pipeline. It is written into durable series
      // memory only on THIS explicit approval — append a `episode_summary` memory
      // event via the append-only memory service. This runs only on the first
      // approval transition (a terminal checkpoint short-circuits above).
      if (
        approving &&
        checkpoint.stage === "summarize_episode_to_series_memory"
      ) {
        // Resolve the episode number + the pending summary from the source
        // artifact under review so the memory event carries the real summary.
        const [episode] = await db
          .select({ episodeNumber: verticalDramaEpisodes.episodeNumber })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          )
          .limit(1);
        const episodeNumber = episode?.episodeNumber;

        const sourceArtifactIds =
          (checkpoint.sourceArtifactIds as string[] | null) ?? [];
        let summaryText =
          episodeNumber != null
            ? `Episode ${episodeNumber} summarized to series memory`
            : "Episode summarized to series memory";
        if (sourceArtifactIds.length > 0) {
          const artifactId = Number(sourceArtifactIds[0]);
          if (Number.isFinite(artifactId)) {
            const [artifact] = await db
              .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
              .from(verticalDramaRunArtifacts)
              .where(
                and(
                  eq(verticalDramaRunArtifacts.id, artifactId),
                  eq(verticalDramaRunArtifacts.tenantId, tenantId),
                  eq(verticalDramaRunArtifacts.seriesId, seriesId),
                  eq(verticalDramaRunArtifacts.episodeId, episodeId)
                )
              )
              .limit(1);
            const payload = artifact?.jsonPayload as
              | Record<string, unknown>
              | undefined;
            if (payload?.summary) summaryText = String(payload.summary);
          }
        }

        await verticalDramaSeriesMemoryService.appendEvent({
          tenantId,
          userId,
          seriesId,
          episodeId,
          runId: checkpoint.runId,
          memoryKind: "episode_summary",
          payload: {
            episodeNumber,
            summary: summaryText,
            approvedFromCheckpointId: String(checkpoint.id),
          },
          summaryText,
          approved: true,
          approvedByUserId: userId,
          // Idempotent: a replayed approval never double-writes the summary.
          idempotencyKey: `vd-episode-summary-checkpoint-${checkpoint.id}`,
        });
      }

      return { checkpoint: { ...row, id: String(row.id) } };
    }),

  /**
   * Repair a stage output: creates a new artifact/version that supersedes the
   * prior candidate (never overwrites it) and marks downstream stages stale.
   */
  repairStageOutput: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        artifactId: z.string().optional(),
        target: z
          .object({
            parentShotNumber: z.number().int().positive().optional(),
            subShotNumber: z.number().int().positive().optional(),
            clipNumber: z.number().int().positive().optional(),
          })
          .optional(),
        instruction: z.string().trim().min(1).max(4000),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      const outcome = await verticalDramaEpisodePipeline.repairStage(
        owner,
        input.stage,
        {
          sourceArtifactId: input.artifactId,
          target: input.target,
          instruction: input.instruction,
          subShotFlagOn: flagOn,
          subShotPolicy: policy,
        }
      );
      return outcome;
    }),

  /** Per-episode run history, most recent first (read-only). */
  listEpisodeRuns: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        limit: z.number().int().positive().max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const rows = await verticalDramaEpisodePipeline.listEpisodeRuns(
        owner,
        input.limit ?? 200
      );
      return {
        runs: rows.map((r: (typeof rows)[number]) => ({
          runId: String(r.id),
          stage: r.stage,
          status: r.status,
          mode: r.runMode,
          nextAction: r.nextAction,
          artifactIds: (r.artifactIds as string[] | null) ?? [],
          startedAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt:
            r.status === "succeeded" || r.status === "failed"
              ? r.updatedAt
              : null,
          // Link target to the read-only artifact-ledger detail (section 09).
          artifactLedgerHref: `/drama-series/${owner.seriesId}/episodes/${owner.episodeId}/runs/${r.id}`,
        })),
      };
    }),

  /**
   * Append-only memory events for a series, chronological, filterable by kind
   * (including `retcon_proposal`) and/or episode number (read-only timeline).
   */
  listMemoryEvents: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        kind: z
          .enum(
            VERTICAL_DRAMA_MEMORY_KINDS as unknown as [
              VerticalDramaMemoryKind,
              ...VerticalDramaMemoryKind[],
            ]
          )
          .optional(),
        episodeNumber: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      // Resolve episodeNumber → episodeId (scoped to the owned series).
      let episodeId: number | undefined;
      if (input.episodeNumber != null) {
        const [ep] = await db
          .select({ id: verticalDramaEpisodes.id })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
              eq(verticalDramaEpisodes.episodeNumber, input.episodeNumber)
            )
          )
          .limit(1);
        episodeId = ep?.id;
        if (episodeId == null) return { events: [] };
      }

      const events = await verticalDramaSeriesMemoryService.listEvents({
        tenantId,
        userId,
        seriesId,
        kind: input.kind,
        episodeId,
        limit: input.limit ?? 500,
      });
      return { events };
    }),

  /**
   * Approve a `retcon_proposal`: appends a NEW superseding memory event, never
   * mutating prior events (append-only chain preserved).
   */
  approveRetconProposal: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);
      const event =
        await verticalDramaSeriesMemoryService.approveRetconProposal({
          tenantId,
          userId,
          seriesId,
          proposalEventId: parseId(input.proposalEventId, "proposal event id"),
          actingUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
      return { event };
    }),

  /**
   * Reject a `retcon_proposal`: appends a rejection event, never mutating prior
   * events.
   */
  rejectRetconProposal: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);
      const event = await verticalDramaSeriesMemoryService.rejectRetconProposal(
        {
          tenantId,
          userId,
          seriesId,
          proposalEventId: parseId(input.proposalEventId, "proposal event id"),
          actingUserId: userId,
          idempotencyKey: input.idempotencyKey,
        }
      );
      return { event };
    }),

  /**
   * Read-only per-episode detail projection for stage-detail views that need
   * a persisted jsonb field directly (e.g. the dialogue/audio plan review
   * panel) rather than only the mutation response that produced it.
   */
  getEpisodeDetail: verticalDramaProcedure
    .input(
      z.object({ seriesId: z.string().min(1), episodeId: z.string().min(1) })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });
      const [assetUrls, characterPortraits] = await Promise.all([
        resolveEpisodePlanAssetUrls(
          tenantId,
          userId,
          row.startFramePlan,
          row.motionPromptPack,
        ),
        resolveSeriesCharacterPortraits(tenantId, userId, seriesId),
      ]);
      return {
        script: row.script as Record<string, unknown> | null,
        dialogueAudioPlan: row.dialogueAudioPlan as Record<
          string,
          unknown
        > | null,
        storyboard: row.storyboard as Record<string, unknown> | null,
        storyboardReviewId: row.storyboardReviewId as string | null,
        startFramePlan: row.startFramePlan as VerticalDramaStartFramePlan | null,
        motionPromptPack: row.motionPromptPack as VerticalDramaMotionPromptPack | null,
        assetUrls,
        characterPortraits,
      };
    }),

  /**
   * Directly set the approved start-frame asset for one shot — a no-cost,
   * deterministic swap (picking an existing Media History/Library image),
   * distinct from `repairStageOutput`'s LLM-driven regeneration. Patches
   * only the matching entry in `startFramePlan.frames[]`.
   */
  setApprovedStartFrameAsset: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        mediaAssetId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const numericAssetId = Number(input.mediaAssetId);
      if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid media asset id" });
      }
      const [asset] = await db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, numericAssetId),
            eq(mediaAssets.tenantId, tenantId),
            eq(mediaAssets.userId, userId),
          ),
        )
        .limit(1);
      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media asset not found" });
      }

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      if (!plan || !Array.isArray(plan.frames)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No start-frame plan exists yet for this episode",
        });
      }
      const frameIndex = plan.frames.findIndex(f => f.shotNumber === input.shotNumber);
      if (frameIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No start-frame plan entry for shot ${input.shotNumber}`,
        });
      }
      const updatedFrames = plan.frames.slice();
      updatedFrames[frameIndex] = {
        ...updatedFrames[frameIndex],
        approvedMediaAssetId: input.mediaAssetId,
      };
      const updatedPlan: VerticalDramaStartFramePlan = { ...plan, frames: updatedFrames };

      await db
        .update(verticalDramaEpisodes)
        .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
        .where(eq(verticalDramaEpisodes.id, episodeId));

      const assetUrls = await resolveEpisodePlanAssetUrls(
        tenantId,
        userId,
        updatedPlan,
        row.motionPromptPack,
      );
      return { startFramePlan: updatedPlan, assetUrls };
    }),

  /**
   * Submit a real start-frame image generation for one shot via the model's
   * already approved prompt (`startFramePlan.frames[shotNumber].imagePrompt`,
   * from the `start_frame_render_plan` stage) — returns a task id to poll,
   * exactly like every other real image/video generation in the app
   * (`media.generateImageAsync` + `media.getTask`), so this shows up in
   * Media History with credit deduction like everything else. (An earlier
   * version of this endpoint called the synchronous `generateImage` — same
   * primitive `generateCharacterImage` uses for portraits — which does NOT
   * register a Media History task; that was a real gap, not an intentional
   * shortcut, corrected here.)
   *
   * The CALLER (frontend) polls `media.getTask({taskId})` until the task
   * completes, then finalizes by calling
   * `verticalDramaCharacters.resolveMediaAssetForImport({source:"url", url:
   * task.resultUrl, mimeType})` to register the canonical media asset,
   * followed by `setApprovedStartFrameAsset` to link it to this shot — both
   * already-built, already-tested procedures; no new "finalize" endpoint
   * needed.
   */
  generateStartFrameImage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frameIndex = plan?.frames?.findIndex(f => f.shotNumber === input.shotNumber) ?? -1;
      if (!plan || frameIndex === -1) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No start-frame prompt for shot ${input.shotNumber} yet — generate the start-frame plan first`,
        });
      }
      const frame = plan.frames[frameIndex];
      if (!frame.imagePrompt?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Shot ${input.shotNumber} has no image prompt yet`,
        });
      }

      // Identity-lock references — resolve each required character's
      // approved portrait, same lookup `generateRealStoryboard` uses.
      const referenceImageUrls = await resolveShotCharacterReferenceUrls(
        tenantId,
        userId,
        seriesId,
        frame.requiredCharacterRefs,
      );

      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, DEFAULT_MODELS.image))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const imageCreditCost = calculateCreditCost(pricingModel, { numImages: 1 });
      const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits for start-frame image render. Required: ${imageCreditCost}`,
        });
      }

      // Reserve credits BEFORE starting the task — same convention as
      // `media.ts`'s `generateImageAsync` (`media.getTask` reconciles the
      // reservation against actual usage once the task completes/fails).
      await deductCredits({
        userId,
        tenantId,
        amount: imageCreditCost,
        description: `Vertical Drama — start frame render (episode #${episodeId}, shot ${input.shotNumber}, reserved)`,
        sourceType: "media_image",
        metadata: {
          feature: "vertical_drama_series",
          seriesId,
          episodeId,
          shotNumber: input.shotNumber,
          type: "reservation",
          creditCost: imageCreditCost,
        },
      });

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: frame.imagePrompt,
            negativePrompt: frame.negativePrompt,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaEpisodes.generateStartFrameImage",
              stage: "submission",
            },
          },
          userToken
        );
        return { taskId: task.id };
      } catch (err) {
        await refundCredits({
          userId,
          amount: imageCreditCost,
          description: `Refund: start-frame render failed to submit (episode #${episodeId}, shot ${input.shotNumber})`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_series",
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            error: err instanceof Error ? err.message : "Unknown error",
          },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Start-frame image generation failed to submit",
        });
      }
    }),

  /**
   * Submit a single "multi-angle variations" image for one shot — ONE 3x3
   * grid image containing 9 DIFFERENT CAMERA ANGLES of the exact same
   * scene/moment (not 9 different shots — that's what the pre-existing,
   * still-unwired `verticalDramaStartFramesRouter`'s contact-sheet mode
   * does). Lets the user generate once, then pick whichever framing reads
   * best for this shot. Async submit, same convention as
   * `generateStartFrameImage` — the caller polls `media.getTask`, then
   * splits the completed grid image into 9 candidates client-side (reusing
   * `imageGridSplitter.splitImage`, the same tool the character-reference
   * grid-cutter already uses) and lets the user pick one before finalizing
   * via `resolveMediaAssetForImport` + `setApprovedStartFrameAsset`.
   */
  generateStartFrameAngleVariations: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frameIndex = plan?.frames?.findIndex(f => f.shotNumber === input.shotNumber) ?? -1;
      if (!plan || frameIndex === -1) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No start-frame prompt for shot ${input.shotNumber} yet — generate the start-frame plan first`,
        });
      }
      const frame = plan.frames[frameIndex];
      if (!frame.imagePrompt?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Shot ${input.shotNumber} has no image prompt yet`,
        });
      }

      const referenceImageUrls = await resolveShotCharacterReferenceUrls(
        tenantId,
        userId,
        seriesId,
        frame.requiredCharacterRefs,
      );

      // 9 cells at ~2x the per-shot credit cost (one grid render, not nine) —
      // matches how the pre-existing contact-sheet planner prices a sheet.
      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, DEFAULT_MODELS.image))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const gridCreditCost = calculateCreditCost(pricingModel, { numImages: 2 });
      const hasCredits = await hasEnoughCredits(userId, gridCreditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits for multi-angle grid render. Required: ${gridCreditCost}`,
        });
      }

      await deductCredits({
        userId,
        tenantId,
        amount: gridCreditCost,
        description: `Vertical Drama — multi-angle grid render (episode #${episodeId}, shot ${input.shotNumber}, reserved)`,
        sourceType: "media_image",
        metadata: {
          feature: "vertical_drama_series",
          seriesId,
          episodeId,
          shotNumber: input.shotNumber,
          type: "reservation",
          creditCost: gridCreditCost,
        },
      });

      const gridPrompt = [
        frame.imagePrompt,
        "",
        "Render this EXACT same scene, subject, wardrobe, lighting, and moment as a single image containing a 3x3 grid of 9 panels — 3 rows, 3 columns, each panel a full 9:16 vertical frame with a thin visible divider between panels.",
        "Each of the 9 panels must show the SAME moment from a DIFFERENT camera angle/framing — for example: wide establishing shot, medium shot, close-up, over-the-shoulder, low angle, high angle, dutch angle, extreme close-up, three-quarter profile.",
        "Keep character identity, wardrobe, and lighting perfectly consistent across all 9 panels — only the camera position/framing changes.",
      ].join(" ");

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: gridPrompt,
            negativePrompt: frame.negativePrompt,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaEpisodes.generateStartFrameAngleVariations",
              stage: "submission",
            },
          },
          userToken
        );
        return { taskId: task.id };
      } catch (err) {
        await refundCredits({
          userId,
          amount: gridCreditCost,
          description: `Refund: multi-angle grid render failed to submit (episode #${episodeId}, shot ${input.shotNumber})`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_series",
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            error: err instanceof Error ? err.message : "Unknown error",
          },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Multi-angle grid generation failed to submit",
        });
      }
    }),
});

export type VerticalDramaEpisodesRouter = typeof verticalDramaEpisodesRouter;

// Re-export for symmetry with the memory row mapper used by callers/tests.
export { memoryRowToEvent };
