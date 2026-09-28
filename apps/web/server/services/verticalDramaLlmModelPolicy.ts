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
 * uses a SOFT filter (a story-bible resolver's
 * `supportsStructuredOutputs: true` only) or a STRICT filter
 * (`resolveQualityLargeContextModelId`'s context-length/thinking/price
 * filter). The user's intent when they set a series-wide override is "use
 * this model for everything about this drama", not "use this model only for
 * stages that would have picked a similarly-tiered model automatically". So
 * this resolver deliberately checks only "is the pinned model still
 * ENABLED" (`loadEnabledLlmModelRows()`), NOT
 * whether it passes any one stage's stricter eligibility filter — a stage's
 * own filter is only consulted for the AUTOMATIC fallback path, never to
 * reject an explicit user override.
 *
 * Contract — resolves a currently routable model or fails closed with an
 * actionable error; it must never revive a retired hardcoded model:
 *  1. Read the series' `llmModelPolicy.defaultModelId`.
 *  2. If set (non-null) and still enabled/routable, return it as-is — this
 *     wins over every tier's own auto logic, even when it is not in the
 *     automatic recommendation set.
 *  3. If the pin is unavailable, fail closed. Never silently switch to a
 *     different model after the user selected one.
 *  4. If no pin exists, use the caller-supplied automatic resolver and fail
 *     closed when it returns no routable model. There is intentionally no
 *     static legacy-model last resort.
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
  let overrideId: string | null = null;
  let enabledRows: EnabledLlmModelRow[] | null = null;
  const getEnabledRows = async (): Promise<EnabledLlmModelRow[]> => {
    if (enabledRows) return enabledRows;
    try {
      // A persisted/user-selected model is authoritative even when it is not
      // in the automatic recommendation set. Recommendation filtering is
      // applied by the fallback resolver, never to an explicit pin.
      enabledRows = (await loadEnabledLlmModelRows()) ?? [];
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
    overrideId = (row?.llmModelPolicy as VerticalDramaSeriesLlmModelPolicy | null)
      ?.defaultModelId ?? null;
    if (overrideId) {
      const routableOverride = resolveRoutableLlmModelIdFromRows({
        rows: await getEnabledRows(),
        preferredModelIds: [overrideId],
      });
      if (routableOverride) {
        return routableOverride;
      }
      throw new Error(
        "Selected Vertical Drama model is unavailable: " + overrideId,
      );
    }
  } catch (error) {
    if (overrideId) throw error;
    // A database read failure without an explicit pin may continue through
    // automatic resolution, but must still fail closed if no model is found.
  }
  const autoModel = await autoFallback();
  if (autoModel) {
    const routableAutoModel = resolveRoutableLlmModelIdFromRows({
      rows: await getEnabledRows(),
      preferredModelIds: [autoModel],
    });
    if (routableAutoModel) return routableAutoModel;
  }

  throw new Error(
    overrideId
      ? "Selected Vertical Drama model is unavailable: " + overrideId
      : "No active Vertical Drama LLM model is currently routable",
  );
}

/**
 * Resolve the model used by the prompt-expansion skill.
 *
 * This is intentionally stricter than the legacy story-bible resolver:
 * prompt expansion is exposed beside the admin-curated planning-model picker,
 * so automatic selection must use that same recommended quality set. An
 * explicit series pin (or a pre-create wizard selection) is authoritative and
 * never falls through to another model when it is unavailable.
 */
export async function resolveVerticalDramaPromptExpansionModel(input: {
  seriesId?: number;
  requestedModelId?: string | null;
}): Promise<string> {
  // Load all enabled rows so an explicit user choice is never discarded just
  // because it is not eligible for automatic selection. Automatic selection
  // is filtered separately below.
  const rows = await loadEnabledLlmModelRows();

  let persistedModelId: string | null = null;
  if (input.seriesId != null) {
    try {
      const [row] = await db
        .select({ llmModelPolicy: verticalDramaSeries.llmModelPolicy })
        .from(verticalDramaSeries)
        .where(eq(verticalDramaSeries.id, input.seriesId))
        .limit(1);
      persistedModelId = (
        (row?.llmModelPolicy as VerticalDramaSeriesLlmModelPolicy | null)
          ?.defaultModelId ?? null
      );
    } catch (error) {
      throw new Error(
        `Could not read the selected Vertical Drama model for series ${input.seriesId}`,
        { cause: error },
      );
    }
  }

  const requestedModelId = persistedModelId ?? input.requestedModelId?.trim() ?? null;
  if (requestedModelId) {
    const resolved = resolveRoutableLlmModelIdFromRows({
      rows,
      preferredModelIds: [requestedModelId],
    });
    if (!resolved) {
      throw new Error(
        `Selected Vertical Drama Prompt Expansion model is unavailable: ${requestedModelId}`,
      );
    }
    return resolved;
  }

  const { selectRecommendedQualityLargeContextEligibleModels } =
    await import("./verticalDramaImproveScript");
  const recommended = selectRecommendedQualityLargeContextEligibleModels(
    rows.filter(
      row =>
        isAvailable(row.providerId) &&
        (row.catalogEligibility == null || row.catalogEligibility === "public-chat"),
    ),
  ).filter(row => row.isRecommended === true);
  const automaticModel = recommended[0]?.modelId;
  if (!automaticModel) {
    throw new Error(
      "No admin-recommended Vertical Drama Prompt Expansion model is available; choose an enabled recommended model before retrying.",
    );
  }
  return automaticModel;
}
