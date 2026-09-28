/**
 * Self-healing capability-flag breaker for `model_provider_map.supportsVision`
 * (2026-07-24 field incident: run mar_76cb03fe0f29a20ec6422480f5a6840b,
 * redraft #8 — all 3 sequential-storyboard authoring rounds died identically
 * on `No endpoints found that support image input` because two admin-curated
 * `isRecommended`/priority-0 rows (`deepseek/deepseek-v4-flash`,
 * `deepseek/deepseek-v4-pro`) had `supportsVision=true` while OpenRouter's
 * live catalog listed them as text-only. That specific data drift was
 * corrected by hand; this module makes the SYSTEM survive the next
 * occurrence, since any future admin edit or upstream provider change can
 * reintroduce a stale flag at any time).
 *
 * Same self-healing spirit as `recommendedModelQualityBreaker.ts`.
 * Attribution is the whole design: only a PROVIDER-CONFIRMED, DEFINITIVE
 * "this model cannot accept image input" error may clear the flag. An
 * ambiguous, transient, timeout, rate-limit, or balance error says NOTHING
 * about capability and must never disable a perfectly good model over a
 * blip — see `isDefinitiveVisionCapabilityError`.
 *
 * Policy: never clears the LAST enabled vision-capable row across the whole
 * `model_provider_map` table — an empty vision pool would hard-fail every
 * vision-required skill (`fallbackPolicy: error`), which is worse than one
 * stale flag. Re-enabling `supportsVision` is a deliberate human action in
 * /admin/llm-models after verifying the provider's real capability; this
 * breaker never re-sets a flag to true.
 *
 * Never throws, never blocks the request path, no-ops when there is no db.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { modelProviderMap } from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";

/** Never clear supportsVision when doing so would drop the platform-wide
 *  enabled vision-capable pool below this size. */
export const MODEL_VISION_CAPABILITY_MIN_POOL = 1;

/**
 * The ONE confirmed definitive-capability error string (2026-07-24
 * incident, OpenRouter). Matched case-insensitively as a substring so
 * prefix-wrapping by callers (e.g. "<skill> LLM call failed: <this>") still
 * matches.
 */
const DEFINITIVE_VISION_CAPABILITY_ERROR_PATTERN =
  /no endpoints found that support image input/i;

/**
 * Conservative exclusion list: if the error text ALSO smells transient or
 * ambiguous (timeout, rate limit, balance, network blip, upstream 5xx),
 * NEVER treat it as definitive — even if it happens to also contain the
 * capability phrase above. A model having one bad minute must never lose a
 * capability flag; only a provider's unqualified, standalone statement that
 * the model lacks the capability may clear it.
 */
const AMBIGUOUS_OR_TRANSIENT_ERROR_PATTERN =
  /time(d)?[\s-]?out|rate[\s-]?limit|too many requests|\b429\b|\b502\b|\b503\b|\b504\b|balance|insufficient[\s_-]?(credit|quota|fund)|quota[\s_-]?exceeded|overloaded|temporarily unavailable|try again|network|econnreset|econnrefused|etimedout|socket hang up|gateway/i;

/**
 * Pure classifier — no I/O, no DB. Unit-tested directly. Callers should gate
 * on this BEFORE invoking `recordModelVisionCapabilityFailure` (which also
 * re-checks it defensively, so calling it directly is safe too).
 */
export function isDefinitiveVisionCapabilityError(
  errorMessage: string | null | undefined
): boolean {
  const text = String(errorMessage ?? "").trim();
  if (!text) return false;
  if (AMBIGUOUS_OR_TRANSIENT_ERROR_PATTERN.test(text)) return false;
  return DEFINITIVE_VISION_CAPABILITY_ERROR_PATTERN.test(text);
}

export type ModelVisionCapabilityCorrectionResult = {
  recorded: boolean;
  cleared: boolean;
};

/**
 * Records one provider-confirmed "this model cannot accept image input"
 * occurrence and, unless doing so would empty the platform-wide enabled
 * vision-capable pool, clears `supportsVision` on every row for that
 * modelId (a single modelId can be mapped through more than one provider).
 * Never throws, no-ops without a db, no-ops for a non-definitive error, and
 * no-ops when the modelId has no `supportsVision=true` row to correct.
 */
export async function recordModelVisionCapabilityFailure(input: {
  modelId: string | null | undefined;
  errorMessage: string | null | undefined;
  runId?: string | null;
  now?: Date;
}): Promise<ModelVisionCapabilityCorrectionResult> {
  const modelId = String(input.modelId ?? "").trim();
  if (!modelId) return { recorded: false, cleared: false };
  if (!isDefinitiveVisionCapabilityError(input.errorMessage)) {
    return { recorded: false, cleared: false };
  }

  try {
    const db = await getDb();
    if (!db) return { recorded: false, cleared: false };

    const rows = await db
      .select({
        id: modelProviderMap.id,
        supportsVision: modelProviderMap.supportsVision,
      })
      .from(modelProviderMap)
      .where(eq(modelProviderMap.modelId, modelId));

    const visionRows = rows.filter(row => row.supportsVision === true);
    if (visionRows.length === 0) {
      // Already false (or never tracked under this modelId) — nothing to correct.
      return { recorded: false, cleared: false };
    }

    const now = input.now ?? new Date();
    let clearedAny = false;

    // Per-row, live-requeried guard (mirrors recommendedModelQualityBreaker's
    // own loop shape): a single modelId can itself account for more than one
    // pool member (e.g. mapped through two providers), so the pool size is
    // re-checked fresh before EACH clear rather than computed once up front —
    // otherwise clearing this modelId's own rows in one shot could empty the
    // pool even though the guard "passed" against a stale count.
    for (const row of visionRows) {
      const poolRows = await db
        .select({ id: modelProviderMap.id })
        .from(modelProviderMap)
        .where(
          and(
            eq(modelProviderMap.supportsVision, true),
            eq(modelProviderMap.isEnabled, true)
          )
        );

      if (poolRows.length <= MODEL_VISION_CAPABILITY_MIN_POOL) {
        const message = `[modelVisionCapabilityBreaker] ${modelId} reported a definitive vision-capability failure ("${input.errorMessage}") but is the LAST enabled vision-capable model in model_provider_map — NOT clearing supportsVision (an empty vision pool would hard-fail every vision-required skill). Admin attention required: verify or add a replacement vision-capable model in /admin/llm-models.`;
        console.error(message);
        auditLogger.log({
          eventType: "error",
          model: modelId,
          errorType: "model_vision_capability_flag_guarded_last_pool_member",
          errorMessage: String(input.errorMessage ?? ""),
          metadata: {
            modelId,
            rowId: row.id,
            runId: input.runId ?? null,
            poolSize: poolRows.length,
          },
        });
        continue;
      }

      await db
        .update(modelProviderMap)
        .set({ supportsVision: false })
        .where(eq(modelProviderMap.id, row.id));
      clearedAny = true;

      const reasonText = `auto_cleared_supportsVision: provider confirmed no image-input support ("${input.errorMessage}")${input.runId ? `, run ${input.runId}` : ""}, at ${now.toISOString()}`;
      console.error(
        `[modelVisionCapabilityBreaker] CLEARED supportsVision for ${modelId} (row ${row.id}) — ${reasonText}. Re-enable manually in /admin/llm-models only after confirming the provider actually supports image input.`
      );
      auditLogger.log({
        eventType: "error",
        model: modelId,
        errorType: "model_vision_capability_auto_corrected",
        errorMessage: String(input.errorMessage ?? ""),
        metadata: {
          modelId,
          rowId: row.id,
          runId: input.runId ?? null,
          reason: reasonText,
        },
      });
    }

    return { recorded: true, cleared: clearedAny };
  } catch (error) {
    console.warn(
      "[modelVisionCapabilityBreaker] capability-flag correction failed (never blocks authoring)",
      error instanceof Error ? error.message : error
    );
    return { recorded: false, cleared: false };
  }
}
