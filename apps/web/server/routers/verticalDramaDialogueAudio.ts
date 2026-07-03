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
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import {
  VerticalDramaOwnershipError,
  audioRepairInputSchema,
  planDialogueAudioInputSchema,
  verticalDramaDialogueAudioService,
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
        return await verticalDramaDialogueAudioService.planDialogueAudio(
          { tenantId, userId: ctx.user.id },
          input,
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
