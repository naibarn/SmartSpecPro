/**
 * Vertical Drama Series — dialogue / audio / subtitle router (spec §14, §6.8,
 * §7.4 / section-07).
 *
 * Two protected, feature-flag-gated procedures:
 *  - `planDialogueAudio` — plan dialogue lines, voice continuity, audio strategy,
 *    subtitle cues and timing for an owned episode (dry-run; NO paid TTS/video).
 *  - `repairAudio` — apply a repair action (assign voice id, shorten overlong
 *    line, disable native audio, fix timing / safe area) to the latest plan.
 *
 * Every procedure is authenticated, gated on `verticalDramaSeries`, and scoped to
 * the caller's tenant + user by the service (which throws NOT_FOUND-style errors
 * for anything the caller does not own). The conductor wires this router into
 * `server/routers.ts` — do NOT edit that file here.
 */

import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import { verticalDramaCharacters } from "../../drizzle/schema";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import type { VerticalDramaCharacterVoiceConfigMapEntry } from "@shared/verticalDramaSeries/voiceCasting";
import {
  VerticalDramaOwnershipError,
  audioRepairInputSchema,
  planDialogueAudioInputSchema,
  verticalDramaDialogueAudioService,
  type PlanDialogueAudioInput,
} from "../services/verticalDramaDialogueAudio";

/** Authenticated AND gated on the canonical `verticalDramaSeries` flag (fail-closed). */
const verticalDramaProcedure = protectedProcedure.use(requireFeatureFlag("verticalDramaSeries"));

/** Resolve a non-null tenant id or fail closed. */
function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

/** Map service ownership errors to a non-disclosing NOT_FOUND. */
function toTrpcError(err: unknown): never {
  if (err instanceof VerticalDramaOwnershipError) {
    throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  }
  throw err;
}

/**
 * Sweep the series' character roster for locked voice castings (W12-A voice
 * chain wave) and flatten into the `characterId -> config` array shape
 * `planDialogueAudioInputSchema.characterVoiceConfigs` accepts. Tenant + user
 * + series scoped (same ownership triple as every other query in this
 * feature); an invalid/unparsable `seriesId` or a series with no cast
 * characters both resolve to an empty array rather than throwing — the
 * service's own `planDialogueAudio` ownership check is the single source of
 * truth for "series not found" errors, so this helper never preempts it.
 */
async function loadCharacterVoiceConfigsForSeries(
  tenantId: string,
  userId: number,
  seriesId: string,
): Promise<VerticalDramaCharacterVoiceConfigMapEntry[]> {
  const numericSeriesId = Number(seriesId);
  if (!Number.isFinite(numericSeriesId) || numericSeriesId <= 0) return [];

  const rows = await db
    .select({ id: verticalDramaCharacters.id, voiceConfig: verticalDramaCharacters.voiceConfig })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.userId, userId),
        eq(verticalDramaCharacters.seriesId, numericSeriesId),
        isNotNull(verticalDramaCharacters.voiceConfig),
      ),
    );

  type CharacterVoiceConfigRow = { id: number; voiceConfig: unknown };
  return (rows as CharacterVoiceConfigRow[])
    .filter((row) => row.voiceConfig && typeof row.voiceConfig === "object")
    .map((row) => ({
      characterId: String(row.id),
      ...(row.voiceConfig as Record<string, unknown>),
    })) as VerticalDramaCharacterVoiceConfigMapEntry[];
}

/**
 * Thread server-authoritative voice casting into a `planDialogueAudio` call
 * when the tenant has `verticalDramaSeriesVoiceChain` enabled — flag OFF (the
 * default) returns `input` completely unchanged (byte-identical to
 * pre-W12-A behavior). When ON, ALWAYS overwrites `characterVoiceConfigs`
 * with a fresh DB read (never trusts a client-supplied value for this field)
 * so casting can never be spoofed/stale from the caller.
 */
async function withCharacterVoiceConfigs(
  tenantId: string,
  userId: number,
  input: PlanDialogueAudioInput,
): Promise<PlanDialogueAudioInput> {
  const flags = await getTenantFeatureFlags(tenantId);
  if (flags?.verticalDramaSeriesVoiceChain !== true) return input;

  const characterVoiceConfigs = await loadCharacterVoiceConfigsForSeries(tenantId, userId, input.seriesId);
  return { ...input, characterVoiceConfigs };
}

export const verticalDramaDialogueAudioRouter = router({
  /**
   * Plan dialogue/audio/subtitles for an owned episode and persist the plan into
   * the run artifact ledger. Dry-run only — this MUST NOT trigger paid TTS or
   * video generation.
   */
  planDialogueAudio: verticalDramaProcedure
    .input(planDialogueAudioInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      try {
        // W12-A voice chain — flag-gated; see `withCharacterVoiceConfigs`'s
        // own doc comment. No-op (returns `input` unchanged) when the
        // tenant's `verticalDramaSeriesVoiceChain` flag is off.
        const effectiveInput = await withCharacterVoiceConfigs(tenantId, ctx.user.id, input);
        return await verticalDramaDialogueAudioService.planDialogueAudio(
          { tenantId, userId: ctx.user.id },
          effectiveInput,
        );
      } catch (err) {
        toTrpcError(err);
      }
    }),

  /**
   * Apply a repair action to the latest persisted plan for an owned episode and
   * persist the repaired revision. Also dry-run — no paid generation.
   */
  repairAudio: verticalDramaProcedure
    .input(audioRepairInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      try {
        return await verticalDramaDialogueAudioService.repairAudio(
          { tenantId, userId: ctx.user.id },
          input,
        );
      } catch (err) {
        toTrpcError(err);
      }
    }),
});

export type VerticalDramaDialogueAudioRouter = typeof verticalDramaDialogueAudioRouter;
