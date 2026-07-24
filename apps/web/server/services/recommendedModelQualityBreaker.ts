/**
 * Quality circuit breaker for the admin-curated recommended model set
 * (model_provider_map.isRecommended — see 1c9ff2e79/e190f5963).
 *
 * User requirement (2026-07-24): "หากล้มเหลวมาก ๆ หลุดออกจากคุณภาพ ให้ไปปลด
 * recommend ออกทันที เพื่อลดความเสียหาย" — when a recommended model keeps
 * producing bad OUTPUT, auto-revoke its recommended flag to stop the bleed.
 *
 * ATTRIBUTION IS THE WHOLE DESIGN. The 2026-07-23 degraded-run saga proved
 * that most failures are NOT the model's fault (relative-URL 400s, credit
 * idempotency collisions, provider-account balance). Counting those would
 * unfairly demote good models, so a strike is recorded ONLY for
 * model-attributable OUTPUT quality failures:
 *   - `contract_violation` (structural: wrong shape, missing shots/finalQc)
 *   - `disqualified` (completed round rejected by retention disqualifiers:
 *     hollow shots, missing dialogue, budget/claim violations)
 * `invocation_failed` (transport/ledger/balance) NEVER counts.
 *
 * Policy: >= STRIKE_THRESHOLD strikes inside a sliding WINDOW ⇒ revoke
 * isRecommended (plus an audit trail on the row), EXCEPT when the model is
 * the last member of the recommended set — an empty set would hard-fail
 * every recommendedOnly skill (fallbackPolicy: error), which is worse than
 * a weak member. Re-recommendation is a deliberate human action in
 * /admin/llm-models; the breaker never re-promotes.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { modelProviderMap } from "../../drizzle/schema";

export const RECOMMENDED_MODEL_STRIKE_THRESHOLD = 6;
export const RECOMMENDED_MODEL_STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Never revoke when the recommended set would drop below this size. */
export const RECOMMENDED_MODEL_MIN_POOL = 1;

export type RecommendedModelStrikeReason =
  | "contract_violation"
  | "disqualified";

/**
 * Pure classifier: which loop-round outcomes are the MODEL's fault.
 * `invocation_failed` is explicitly excluded (transport/ledger/balance).
 */
export function isRecommendedModelQualityStrikeStatus(
  status: string
): status is RecommendedModelStrikeReason {
  return status === "contract_violation" || status === "disqualified";
}

/** Pure window/threshold math — unit-tested separately from the DB writes. */
export function computeNextRecommendedStrikeState(input: {
  currentCount: number;
  windowStartedAt: Date | null;
  now: Date;
}): { nextCount: number; nextWindowStartedAt: Date; thresholdCrossed: boolean } {
  const windowExpired =
    !input.windowStartedAt ||
    input.now.getTime() - input.windowStartedAt.getTime() >
      RECOMMENDED_MODEL_STRIKE_WINDOW_MS;
  const nextCount = windowExpired ? 1 : input.currentCount + 1;
  return {
    nextCount,
    nextWindowStartedAt: windowExpired ? input.now : input.windowStartedAt!,
    thresholdCrossed: nextCount >= RECOMMENDED_MODEL_STRIKE_THRESHOLD,
  };
}

/**
 * Record one model-attributable quality strike. Never throws — the breaker
 * must never break the authoring loop it observes. Returns what happened
 * for logging/tests.
 */
export async function recordRecommendedModelQualityStrike(input: {
  modelId: string | null | undefined;
  runId?: string | null;
  reason: RecommendedModelStrikeReason;
  detail?: string;
  now?: Date;
}): Promise<{ recorded: boolean; revoked: boolean; strikeCount: number }> {
  const modelId = String(input.modelId ?? "").trim();
  if (!modelId) return { recorded: false, revoked: false, strikeCount: 0 };
  try {
    const db = await getDb();
    if (!db) return { recorded: false, revoked: false, strikeCount: 0 };

    const rows = await db
      .select({
        id: modelProviderMap.id,
        isRecommended: modelProviderMap.isRecommended,
        strikeCount: modelProviderMap.recommendedStrikeCount,
        windowStartedAt: modelProviderMap.recommendedStrikeWindowStartedAt,
      })
      .from(modelProviderMap)
      .where(eq(modelProviderMap.modelId, modelId));

    const recommendedRows = rows.filter(row => row.isRecommended === true);
    if (recommendedRows.length === 0) {
      // Not in the curated set (or already revoked) — nothing to protect.
      return { recorded: false, revoked: false, strikeCount: 0 };
    }

    const now = input.now ?? new Date();
    let revokedAny = false;
    let lastCount = 0;

    for (const row of recommendedRows) {
      const next = computeNextRecommendedStrikeState({
        currentCount: row.strikeCount ?? 0,
        windowStartedAt: row.windowStartedAt ?? null,
        now,
      });
      lastCount = next.nextCount;

      if (next.thresholdCrossed) {
        const poolRows = await db
          .select({ id: modelProviderMap.id })
          .from(modelProviderMap)
          .where(
            and(
              eq(modelProviderMap.isRecommended, true),
              eq(modelProviderMap.isEnabled, true)
            )
          );
        if (poolRows.length > RECOMMENDED_MODEL_MIN_POOL) {
          const reasonText = `auto_revoked: ${next.nextCount} model-quality strikes within 24h (last: ${input.reason}${input.detail ? ` — ${input.detail}` : ""}${input.runId ? `, run ${input.runId}` : ""})`;
          await db
            .update(modelProviderMap)
            .set({
              isRecommended: false,
              recommendedAutoRevokedAt: now,
              recommendedAutoRevokedReason: reasonText,
              recommendedStrikeCount: 0,
              recommendedStrikeWindowStartedAt: null,
            })
            .where(eq(modelProviderMap.id, row.id));
          revokedAny = true;
          console.error(
            `[recommendedModelQualityBreaker] REVOKED isRecommended for ${modelId} — ${reasonText}. Re-recommend manually in /admin/llm-models after review.`
          );
        } else {
          // Last member: revoking would empty the set and hard-fail every
          // recommendedOnly skill. Keep it, keep counting, scream loudly.
          await db
            .update(modelProviderMap)
            .set({
              recommendedStrikeCount: next.nextCount,
              recommendedStrikeWindowStartedAt: next.nextWindowStartedAt,
            })
            .where(eq(modelProviderMap.id, row.id));
          console.error(
            `[recommendedModelQualityBreaker] ${modelId} crossed the quality-strike threshold (${next.nextCount}) but is the LAST recommended model — NOT revoking. Admin attention required: enable/recommend a replacement in /admin/llm-models.`
          );
        }
      } else {
        await db
          .update(modelProviderMap)
          .set({
            recommendedStrikeCount: next.nextCount,
            recommendedStrikeWindowStartedAt: next.nextWindowStartedAt,
          })
          .where(eq(modelProviderMap.id, row.id));
        console.warn(
          `[recommendedModelQualityBreaker] quality strike ${next.nextCount}/${RECOMMENDED_MODEL_STRIKE_THRESHOLD} for ${modelId} (${input.reason}${input.runId ? `, run ${input.runId}` : ""})`
        );
      }
    }

    return { recorded: true, revoked: revokedAny, strikeCount: lastCount };
  } catch (error) {
    console.warn(
      "[recommendedModelQualityBreaker] strike recording failed (never blocks authoring)",
      error instanceof Error ? error.message : error
    );
    return { recorded: false, revoked: false, strikeCount: 0 };
  }
}
