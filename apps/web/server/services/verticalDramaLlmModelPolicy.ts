/**
 * Vertical Drama — centralized LLM model policy resolver
 * (`planning/vertical-drama-centralized-model-policy/plan.md`, Phase 1).
 *
 * THE single choke point every LLM call site in the Vertical Drama chain
 * (story bible, script generation, character analysis/variants, storyboard,
 * start-frame render plan, video motion prompts, dialogue audio, ad banners,
 * quality review, etc) must route through BEFORE falling back to its own
 * auto-selector. Previously (2026-07-11, first cut of the manual-override
 * feature) this was scoped to just 2 fields
 * (`startFramePlanModelId`/`storyboardModelId`) on `llmModelPolicy`, each
 * wired into its own call site individually. That was widened the same day
 * per user request into ONE series-wide `defaultModelId` field that overrides
 * EVERY stage equally — see `VerticalDramaSeriesLlmModelPolicy` in
 * `@shared/verticalDramaSeries/contracts` for the schema-level rationale.
 *
 * Design principle (do not narrow this): the override applies to every tier
 * identically, regardless of whether that stage's own auto-selector normally
 * uses a SOFT filter (`resolveStoryBibleModel`'s
 * `supportsStructuredOutputs: true` only) or a STRICT filter
 * (`resolveQualityLargeContextModelId`'s context-length/thinking/price
 * filter). The user's intent when they set a series-wide override is "use
 * this model for everything about this drama", not "use this model only for
 * stages that would have picked a similarly-tiered model automatically". So
 * this resolver deliberately checks only "is the pinned model still
 * ENABLED" (`loadEnabledLlmModelRows({ autoSelectionOnly: true })`), NOT
 * whether it passes any one stage's stricter eligibility filter — a stage's
 * own filter is only consulted for the AUTOMATIC fallback path, never to
 * reject an explicit user override.
 *
 * Contract — resolves a currently routable model or fails closed with an
 * actionable error; it must never revive a retired hardcoded model:
 *  1. Read the series' `llmModelPolicy.defaultModelId`.
 *  2. If set (non-null) and still an enabled/eligible-for-auto-selection
 *     model, return it as-is — this wins over every tier's own auto logic.
 *  3. Otherwise (unset, DB error, or the pinned model was disabled/removed
 *     since being pinned) fall through to the caller-supplied `autoFallback`
 *     — normally that call site's PRE-EXISTING auto-selector
 *     (`resolveStoryBibleModel` or `resolveQualityLargeContextModelId`,
 *     depending on the stage's tier), so behavior for series with no
 *     override is completely unchanged.
 *  4. If no active model remains after the automatic and story-bible
 *     selectors, `resolveStoryBibleModel()` throws an actionable admission
 *     error. There is intentionally no static legacy-model last resort.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaSeries } from "../../drizzle/schema";
import type { VerticalDramaSeriesLlmModelPolicy } from "@shared/verticalDramaSeries/contracts";
import {
  resolveRoutableLlmModelIdFromRows,
  loadEnabledLlmModelRows,
  type EnabledLlmModelRow,
} from "./enabledLlmModels";
import { isAvailable } from "./providerHealth";
import { resolveStoryBibleModel } from "./verticalDramaStoryBible";

const VERTICAL_DRAMA_DRAFT_MIN_CONTEXT_LENGTH = 1_000_000;

function isRecommendedVerticalDramaDraftModel(
  row: EnabledLlmModelRow,
): boolean {
  return (
    row.isRecommended === true &&
    (row.contextLength ?? 0) >= VERTICAL_DRAMA_DRAFT_MIN_CONTEXT_LENGTH &&
    row.isFree !== true &&
    row.supportsThinking === true &&
    row.supportsStructuredOutputs === true
  );
}

/**
 * Resolves the model for the pre-QC Draft pipeline.
 *
 * This is intentionally stricter than `resolveStoryBibleModel()`. Draft
 * foundation, synthesis, completion, and Draft QC are quality-critical and
 * must only use an admin-recommended large-context thinking model. There is
 * deliberately no legacy/default-model fallback here: using a non-recommended
 * model is worse than failing admission because it produces a misleading
 * quality/credit record and can send the wizard into avoidable QC loops.
 */
export async function resolveVerticalDramaRecommendedDraftModel(): Promise<string> {
  const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
  const recommended = rows
    .filter((row) => isAvailable(row.providerId) && isRecommendedVerticalDramaDraftModel(row))
    .sort((a, b) => a.priority - b.priority || a.modelId.localeCompare(b.modelId));
  const model = recommended[0]?.modelId;
  if (!model) {
    throw new Error(
      "No admin-recommended Vertical Drama Draft LLM is available; configure an enabled recommended large-context thinking model before generating a Draft.",
    );
  }
  return model;
}

/** Fails closed when a queued job references a model that is no longer recommended. */
export async function assertVerticalDramaRecommendedDraftModel(
  modelId: string,
): Promise<void> {
  const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
  if (!rows.some(row => row.modelId === modelId && isRecommendedVerticalDramaDraftModel(row))) {
    throw new Error(
      `Vertical Drama Draft model is not in the active LLM Recommend set: ${modelId}`,
    );
  }
}

export async function resolveVerticalDramaSeriesModel(
  seriesId: number,
  autoFallback: () => Promise<string | null>,
): Promise<string> {
  let enabledRows: EnabledLlmModelRow[] | null = null;
  const getEnabledRows = async (): Promise<EnabledLlmModelRow[]> => {
    if (enabledRows) return enabledRows;
    try {
      enabledRows = (await loadEnabledLlmModelRows({ autoSelectionOnly: true })) ?? [];
    } catch {
      enabledRows = [];
    }
    return enabledRows;
  };

  try {
    const [row] = await db
      .select({ llmModelPolicy: verticalDramaSeries.llmModelPolicy })
      .from(verticalDramaSeries)
      .where(eq(verticalDramaSeries.id, seriesId))
      .limit(1);
    const overrideId = (row?.llmModelPolicy as VerticalDramaSeriesLlmModelPolicy | null)
      ?.defaultModelId;
    if (overrideId) {
      const routableOverride = resolveRoutableLlmModelIdFromRows({
        rows: await getEnabledRows(),
        preferredModelIds: [overrideId],
      });
      if (routableOverride) {
        return routableOverride;
      }
      // Override was set but the pinned model has since been disabled/removed
      // or all of its providers are in health cooldown — fall through to
      // automatic selection rather than sending an unroutable request.
    }
  } catch {
    // Best-effort, same as every other resolver in this codebase — never throw.
  }
  const autoModel = await autoFallback();
  if (autoModel) {
    const routableAutoModel = resolveRoutableLlmModelIdFromRows({
      rows: await getEnabledRows(),
      preferredModelIds: [autoModel],
    });
    if (routableAutoModel) return routableAutoModel;
  }

  const activeStoryBibleModel = await resolveStoryBibleModel();
  const routableStoryBibleModel = resolveRoutableLlmModelIdFromRows({
    rows: await getEnabledRows(),
    preferredModelIds: [activeStoryBibleModel],
  });
  return routableStoryBibleModel ?? activeStoryBibleModel;
}
