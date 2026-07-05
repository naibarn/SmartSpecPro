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
import { debugLog, debugError } from "../_core/logger";

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

/**
 * Appended to the user message on the single automatic retry below — asks
 * the model to keep its answer complete and compact so a longer, enriched
 * multi-shot payload (Phase 3B per-shot prompt upgrades: micro-expressions,
 * mood lighting, power-dynamic composition, etc.) is less likely to be cut
 * off by the output-token ceiling. Compact (no pretty-printing) JSON is
 * meaningfully shorter than indented JSON for the same content, which is why
 * this is appended to every planning call's user prompt up front, not only
 * on retry — see each generation module's `buildUserPrompt`.
 */
export const VD_COMPACT_JSON_INSTRUCTION =
  "Return ONLY a single JSON object. Do not pretty-print or indent — emit compact JSON (no unnecessary whitespace/newlines) to keep the response as short as possible.";

const VD_RETRY_STRICT_INSTRUCTION =
  "Your previous response was truncated or was not valid JSON. Return ONLY complete, valid, compact JSON (no markdown fences, no commentary, no trailing text). Do not truncate — if needed, shorten prose fields to fit, but every object/array must be properly closed.";

/**
 * Shared one-retry wrapper for the `executeWithFallback` -> `extractJson` ->
 * zod-`safeParse` pattern used by every vertical-drama LLM *planning* call
 * (`generateStoryBible`, `generateEpisodeScript`, `generateStoryboardShotgrid`,
 * `generateStartFrameRenderPlan`, `generateVideoMotionPromptPack`).
 *
 * On the first attempt's JSON-parse/schema-validation failure, retries
 * EXACTLY ONCE against the SAME model (never switches models — vertical
 * drama and the wider app never auto-switch a model chosen for a call) with
 * (a) the same system+user prompt plus one appended strict-JSON instruction
 * message, and (b) a higher `maxTokens` ceiling (`retryMaxTokens`, defaults
 * to `Math.max(params.maxTokens * 2, 16000)` when omitted) so a
 * previously-truncated multi-shot payload has more room to complete. Logs
 * both the failure that triggered the retry and the retry's own outcome via
 * the shared file/console `debugLog`/`debugError` logger (never logs prompt
 * or response bodies — only lengths/codes/messages, per the secret/PII
 * logging rules).
 *
 * Returns the successfully-parsed+validated data. Throws the retry's own
 * error (or the original error, if the retry attempt itself never reached a
 * successful provider response) when both attempts fail — callers keep their
 * existing catch/failed-run handling unchanged.
 */
export async function executeJsonPlanningCallWithRetry<T>(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  userId: number;
  maxTokens: number;
  retryMaxTokens?: number;
  /** zod schema (or any object exposing `safeParse`) validating the parsed JSON. */
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } };
  /** Human-readable label used only in log lines, e.g. "start-frame render plan". */
  label: string;
}): Promise<{
  data: T;
  response: Awaited<ReturnType<typeof executeWithFallback>> extends infer R
    ? R extends { type: "success"; response: infer Resp }
      ? Resp
      : never
    : never;
  retried: boolean;
}> {
  const attempt = async (userPrompt: string, maxTokens: number) => {
    const result = await executeWithFallback({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      userId: params.userId,
      maxTokens,
      temperature: params.temperature,
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
    const validation = params.schema.safeParse(parsed);
    if (!validation.success) {
      throw new VdSchemaValidationError(
        `${params.label} response failed schema validation`,
        validation.error,
      );
    }
    return { data: validation.data as T, response: result.response };
  };

  try {
    const first = await attempt(params.userPrompt, params.maxTokens);
    return { ...first, retried: false } as never;
  } catch (firstError) {
    if (!(firstError instanceof VdSchemaValidationError)) {
      // Provider/network/rate-limit errors are not retried here — only
      // malformed-JSON/schema failures, which is the class of failure a
      // stricter-instruction + bigger-ceiling retry can actually fix.
      throw firstError;
    }

    debugError(
      "vd_planning_retry",
      `${params.label}: first attempt failed schema validation for model ${params.model}, retrying once with stricter instruction + higher token ceiling`,
      { message: firstError.message },
    );

    const retryMaxTokens = params.retryMaxTokens ?? Math.max(params.maxTokens * 2, 16000);
    const retryUserPrompt = `${params.userPrompt}\n\n${VD_RETRY_STRICT_INSTRUCTION}`;

    try {
      const second = await attempt(retryUserPrompt, retryMaxTokens);
      debugLog(
        "vd_planning_retry",
        `${params.label}: retry succeeded for model ${params.model}`,
        { retryMaxTokens },
      );
      return { ...second, retried: true } as never;
    } catch (secondError) {
      debugError(
        "vd_planning_retry",
        `${params.label}: retry ALSO failed for model ${params.model} — failing the stage`,
        {
          message:
            secondError instanceof Error ? secondError.message : String(secondError),
        },
      );
      throw secondError;
    }
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
    VD_COMPACT_JSON_INSTRUCTION,
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

  // Base ceiling raised from 3500 to 6000 — `episodeBreakdown` grows with
  // `targetEpisodeCount` (each entry has a workingTitle/logline/3-5
  // keyBeats), so a series with a larger target episode count is a
  // plausible truncation risk of the same class already hit in the sibling
  // generators. Shares the same one-retry-on-truncated/invalid-JSON safety
  // net (`executeJsonPlanningCallWithRetry`, defined just above in this
  // file) as every other Vertical Drama planning call site.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    userId: params.userId,
    maxTokens: 6000,
    schema: expandedStoryBibleSchema,
    label: "Story bible",
  });

  const usage = response.usage;
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

  return { expanded: validatedData, creditsUsed, model };
}
