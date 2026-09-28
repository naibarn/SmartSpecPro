import {
  resolveVerticalDramaLlmQualityProfile,
  type VerticalDramaEpisodeGenerationSettings,
  type VerticalDramaLlmQualityProfile,
  type VerticalDramaLlmTaskClass,
  type VerticalDramaReasoningEffort,
} from "@shared/verticalDramaSeries/generationSettings";
import { and, eq } from "drizzle-orm";
import { verticalDramaEpisodes, verticalDramaSeries } from "../../drizzle/schema";
import { getDb } from "../db";

/** Internal transport key. It is removed before a provider request is sent. */
export const VERTICAL_DRAMA_REASONING_POLICY_KEY =
  "__verticalDramaReasoningPolicy";

export type VerticalDramaReasoningPolicy = {
  effort: VerticalDramaReasoningEffort;
  exclude: true;
  profile: VerticalDramaLlmQualityProfile;
  taskClass: VerticalDramaLlmTaskClass;
};

export type VerticalDramaLlmContext = {
  taskClass: VerticalDramaLlmTaskClass;
  seriesId?: number;
  episodeId?: number;
  settings?: unknown;
  /** Optional ownership scope; supplied by shared wrappers for DB-backed lookup. */
  userId?: number;
  tenantId?: string;
};

export async function loadVerticalDramaGenerationSettings(
  context: VerticalDramaLlmContext,
): Promise<unknown> {
  if (context.settings !== undefined) return context.settings;
  const db = await getDb();
  if (!db) return {};

  if (context.episodeId != null) {
    const predicates = [eq(verticalDramaEpisodes.id, context.episodeId)];
    if (context.userId != null) predicates.push(eq(verticalDramaEpisodes.userId, context.userId));
    if (context.tenantId != null) predicates.push(eq(verticalDramaEpisodes.tenantId, context.tenantId));
    const [episode] = await db
      .select({ generationSettings: verticalDramaEpisodes.generationSettings })
      .from(verticalDramaEpisodes)
      .where(predicates.length === 1 ? predicates[0] : and(...predicates))
      .limit(1);
    return episode?.generationSettings ?? {};
  }
  if (context.seriesId != null) {
    const predicates = [eq(verticalDramaSeries.id, context.seriesId)];
    if (context.userId != null) predicates.push(eq(verticalDramaSeries.userId, context.userId));
    if (context.tenantId != null) predicates.push(eq(verticalDramaSeries.tenantId, context.tenantId));
    const [series] = await db
      .select({ generationSettings: verticalDramaSeries.generationSettings })
      .from(verticalDramaSeries)
      .where(predicates.length === 1 ? predicates[0] : and(...predicates))
      .limit(1);
    return series?.generationSettings ?? {};
  }
  return {};
}

const TASK_EFFORTS: Record<
  VerticalDramaLlmTaskClass,
  Record<VerticalDramaLlmQualityProfile, VerticalDramaReasoningEffort | null>
> = {
  story_architecture: { balanced: "high", high: "xhigh", maximum: "max" },
  script_generation: { balanced: "high", high: "xhigh", maximum: "max" },
  character_design: { balanced: "high", high: "xhigh", maximum: "max" },
  storyboard_planning: { balanced: "high", high: "xhigh", maximum: "max" },
  semantic_quality_review: { balanced: "high", high: "xhigh", maximum: "max" },
  visual_bible: { balanced: "medium", high: "high", maximum: "xhigh" },
  start_frame_prompt: { balanced: "medium", high: "high", maximum: "xhigh" },
  dialogue_audio: { balanced: "medium", high: "high", maximum: "xhigh" },
  video_motion: { balanced: "medium", high: "high", maximum: "xhigh" },
  location_design: { balanced: "medium", high: "high", maximum: "xhigh" },
  clip_dialogue: { balanced: "low", high: "medium", maximum: "high" },
  ad_banner: { balanced: "low", high: "medium", maximum: "high" },
  data_extraction: { balanced: "minimal", high: "low", maximum: "medium" },
};

export function resolveVerticalDramaTaskReasoningEffort(input: {
  settings: unknown;
  taskClass: VerticalDramaLlmTaskClass;
}): VerticalDramaReasoningEffort | null {
  const profile = resolveVerticalDramaLlmQualityProfile(input.settings);
  return TASK_EFFORTS[input.taskClass][profile];
}

export function resolveVerticalDramaReasoningPolicy(input: {
  settings: unknown;
  taskClass: VerticalDramaLlmTaskClass;
}): VerticalDramaReasoningPolicy | null {
  const profile = resolveVerticalDramaLlmQualityProfile(input.settings);
  const effort = TASK_EFFORTS[input.taskClass][profile];
  if (!effort) return null;
  return { effort, exclude: true, profile, taskClass: input.taskClass };
}

export function resolveVerticalDramaLlmExtraBodyParams(input: {
  settings: unknown;
  taskClass: VerticalDramaLlmTaskClass;
  extraBodyParams?: Record<string, unknown>;
}): Record<string, unknown> {
  const policy = resolveVerticalDramaReasoningPolicy(input);
  const extraBodyParams = { ...(input.extraBodyParams ?? {}) };
  if (!policy) return extraBodyParams;
  return {
    ...extraBodyParams,
    [VERTICAL_DRAMA_REASONING_POLICY_KEY]: policy,
  };
}

export function adaptVerticalDramaReasoningForProvider(input: {
  extraBodyParams?: Record<string, unknown>;
  providerName: string;
  supportsThinking?: boolean | null;
}): Record<string, unknown> {
  const extraBodyParams = { ...(input.extraBodyParams ?? {}) };
  const candidate = extraBodyParams[VERTICAL_DRAMA_REASONING_POLICY_KEY];
  delete extraBodyParams[VERTICAL_DRAMA_REASONING_POLICY_KEY];

  if (
    !candidate ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    input.providerName.toLowerCase() !== "openrouter" ||
    input.supportsThinking !== true
  ) {
    return extraBodyParams;
  }

  const policy = candidate as Partial<VerticalDramaReasoningPolicy>;
  if (typeof policy.effort !== "string") return extraBodyParams;
  return {
    ...extraBodyParams,
    reasoning: {
      effort: policy.effort,
      exclude: true,
    },
  };
}

/**
 * Compatibility bridge for legacy callers that still persist a direct
 * reasoning effort. New call sites should use the task-aware policy above.
 */
export function resolveLegacyVerticalDramaReasoningSettings(
  settings: VerticalDramaEpisodeGenerationSettings,
): { effort: VerticalDramaReasoningEffort; modelId?: string | null } | null {
  const reasoning = settings.llm?.reasoning;
  if (reasoning?.mode !== "effort" || !reasoning.effort) return null;
  return { effort: reasoning.effort, modelId: reasoning.modelId };
}
