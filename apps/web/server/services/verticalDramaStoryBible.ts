/**
 * Vertical Drama Series — "Generate story" (spec feature 131 UI addendum).
 *
 * The FIRST real, credit-consuming LLM call in the vertical-drama surface —
 * every other series-level procedure (`create`/`updateSeries`) is explicitly
 * metadata-only/dry-run. Takes the wizard-gathered bible fields and expands
 * them into a fuller season arc + episode-by-episode breakdown + refined
 * character profiles, following the same credit-check -> call -> deduct
 * convention used by `enhancePrompt` in `server/routers/skills.ts`.
 */

import { z } from "zod";
import { executeWithFallback } from "./llmRouter";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";

const LAST_RESORT_MODEL = "gpt-4o-mini";

export async function resolveStoryBibleModel(): Promise<string> {
  try {
    const rows = await loadEnabledLlmModelRows();
    if (rows.length === 0) return LAST_RESORT_MODEL;
    const best = selectBestLlmModel({ supportsStructuredOutputs: true }, rows);
    return best ?? rows.sort((a, b) => a.priority - b.priority)[0]?.modelId ?? LAST_RESORT_MODEL;
  } catch {
    return LAST_RESORT_MODEL;
  }
}

export const episodeBreakdownItemSchema = z.object({
  episodeNumber: z.number().int().positive(),
  workingTitle: z.string().min(1),
  logline: z.string().min(1),
  keyBeats: z.array(z.string().min(1)).min(1),
});

const expandedStoryBibleSchema = z.object({
  expandedSeasonArc: z.string().min(1),
  refinedCharacters: z
    .array(z.object({ name: z.string().min(1), role: z.string().min(1), description: z.string().min(1) }))
    .min(1),
  episodeBreakdown: z.array(episodeBreakdownItemSchema).min(1),
});

export type ExpandedVerticalDramaStoryBible = z.infer<typeof expandedStoryBibleSchema>;

/** Mirrors the pipeline's own `VD_SCHEMA_VALIDATION_FAILED` convention for LLM-output parse failures. */
export class VdSchemaValidationError extends Error {
  code = "VD_SCHEMA_VALIDATION_FAILED" as const;
  constructor(message: string, public issues: unknown) {
    super(message);
    this.name = "VdSchemaValidationError";
  }
}

export class InsufficientCreditsError extends Error {
  code = "INSUFFICIENT_CREDITS" as const;
  constructor() {
    super("Insufficient credits to generate the story bible");
    this.name = "InsufficientCreditsError";
  }
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const jsonSlice = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  try {
    return JSON.parse(jsonSlice);
  } catch (error) {
    throw new VdSchemaValidationError(
      `LLM response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { rawResponse: text },
    );
  }
}

interface GenerateStoryBibleParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  title: string;
  locale: "th" | "en";
  genre?: string | null;
  tone?: string | null;
  targetEpisodeCount: number;
  bible: Record<string, unknown>;
}

function buildPrompts(params: GenerateStoryBibleParams): { systemPrompt: string; userPrompt: string } {
  const langInstruction =
    params.locale === "th"
      ? "Write ALL string values in natural Thai."
      : "Write all string values in English.";

  const systemPrompt = [
    "You are a vertical-drama (short-form mobile drama series) story bible writer.",
    "Given a series' basic setup, expand it into a fuller production-ready story bible.",
    langInstruction,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    '{"expandedSeasonArc": string, "refinedCharacters": [{"name": string, "role": string, "description": string}], "episodeBreakdown": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[]}]}',
    `"episodeBreakdown" must contain exactly ${params.targetEpisodeCount} entries, numbered 1..${params.targetEpisodeCount} in order, each with 3-5 short keyBeats.`,
  ].join("\n");

  const userPrompt = [
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    `Target episode count: ${params.targetEpisodeCount}`,
    `Existing bible (from the creator's wizard input): ${JSON.stringify(params.bible)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

/**
 * Expand a series' wizard-gathered bible into a full season/episode story
 * bible via a real LLM call. Credit-gated (throws `InsufficientCreditsError`
 * before calling out) and schema-validated (throws `VdSchemaValidationError`
 * on a malformed LLM response) — mirrors `enhancePrompt`'s
 * check-credits -> call -> deduct-credits convention.
 */
export async function generateStoryBible(
  params: GenerateStoryBibleParams,
): Promise<{ expanded: ExpandedVerticalDramaStoryBible; creditsUsed: number; model: string }> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const { systemPrompt, userPrompt } = buildPrompts(params);

  const result = await executeWithFallback({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    userId: params.userId,
    maxTokens: 3500,
    temperature: 0.8,
  });

  if (result.type !== "success") {
    throw new Error(
      result.type === "error"
        ? `LLM request failed: ${result.error}`
        : "LLM request did not reach a successful provider response",
    );
  }

  const content = result.response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  const validation = expandedStoryBibleSchema.safeParse(parsed);
  if (!validation.success) {
    throw new VdSchemaValidationError(
      "Story bible response failed schema validation",
      validation.error.issues,
    );
  }

  const usage = result.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate story bible (series #${params.seriesId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { expanded: validation.data, creditsUsed, model };
}
