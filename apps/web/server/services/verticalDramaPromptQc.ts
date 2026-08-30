/**
 * Vertical Drama Series — final-prompt quality control (hard length caps).
 *
 * Enforces the legacy `VD_IMAGE_PROMPT_MAX` (3800 chars) / `VD_VIDEO_PROMPT_MAX`
 * (2000 chars) defaults, widened only by a selected provider's explicit
 * allowance (currently 390000 for Kie.ai image and 4096 for Kie.ai video), on any FINAL prompt string
 * BEFORE it is used for real generation or
 * persisted/displayed in the UI. When a prompt is already within its cap this
 * is a zero-cost, zero-LLM-call no-op (`refined: false`, `creditsUsed: 0`) —
 * unless the caller explicitly opts into the image finalizer. Provider-ready
 * Vertical Drama image paths use that opt-in so the prompt optimizer is always
 * the last prompt-authoring step.
 *
 * When a prompt is over its cap, refines it (never dumb-truncates first) via
 * the already-installed `cinematic-prompt-refiner-pro` skill
 * (`apps/web/skills/cinematic-prompt-refiner-pro/`), using the exact same
 * check-credits -> resolve-model -> call (with one same-model retry via
 * `executeJsonPlanningCallWithRetry`) -> validate -> deduct-credits
 * convention every other Vertical Drama LLM planning call in this codebase
 * follows (see `verticalDramaStartFrameGeneration.ts`,
 * `verticalDramaVideoMotionPromptGeneration.ts`). If the refined prompt is
 * STILL over the cap, one stricter retry is attempted; if that also fails,
 * falls back to a hard sentence-boundary truncation at the cap with a logged
 * warning — this fallback NEVER throws / never blocks the user, since prompt
 * QC must not turn into a hard failure of the surrounding generation flow.
 *
 * The image finalizer also canonicalizes the single prompt contract: image
 * transports do not receive a separate negative field, so legacy embedded
 * negative sections and newly supplied negative constraints are merged into
 * one deduplicated block before the optimizer runs.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  executeJsonPlanningCallWithRetry,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import { debugLog, debugError } from "../_core/logger";
import { VD_IMAGE_PROMPT_MAX, VD_VIDEO_PROMPT_MAX } from "@shared/verticalDramaSeries";
import { VD_IMAGE_PROMPT_ABSOLUTE_MAX } from "./modelPromptBudget";
import { VD_VIDEO_PROMPT_ABSOLUTE_MAX } from "@shared/verticalDramaSeries/videoPromptBudget";

export { VD_IMAGE_PROMPT_MAX, VD_VIDEO_PROMPT_MAX };

const SKILL_FOLDER_PATH = path.join("skills", "cinematic-prompt-refiner-pro");

let cachedSystemPrompt: string | null = null;

/**
 * Read the `cinematic-prompt-refiner-pro` skill's markdown body (everything
 * after the YAML frontmatter) verbatim, to use as the LLM system prompt.
 * Resolves the skill folder the same way `skillRegistry.ts` does — mirrors
 * `verticalDramaStartFrameGeneration.ts`'s `loadSkillSystemPrompt`.
 */
function loadRefinerSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedSystemPrompt = content;
        return cachedSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "cinematic-prompt-refiner-pro" under any known skills directory`,
  );
}

/**
 * Weak-model-tolerant `string[]` — accepts the array the schema wants, OR the
 * bare string weaker QC models (e.g. `google/gemini-3.1-flash-lite`) routinely
 * emit for these fields instead, coercing it to a single-element array. Before
 * this, `changes_made`/`risk_flags` returned as a string failed schema
 * validation on every attempt (`Expected array, received string`), exhausting
 * the retry budget and forcing the QC refine to fall back to hard truncation
 * for whole episodes. This is a purely structural tolerance at the extraction
 * layer (see the VD weak-model-JSON failure class) — it never changes the
 * refined prompt itself, only how the advisory changes/risk notes are parsed.
 */
const coercedStringArray = z
  .preprocess(v => {
    if (v == null) return undefined; // let .default([]) apply
    if (Array.isArray(v)) return v.map(item => String(item));
    if (typeof v === "string") {
      const trimmed = v.trim();
      return trimmed ? [trimmed] : [];
    }
    return v; // any other shape falls through to array validation below
  }, z.array(z.string()))
  .optional()
  .default([]);

/** Output schema — mirrors `schemas/output.schema.json` (only the fields this module reads are strictly typed; rest passthrough). */
const refinerOutputSchema = z
  .object({
    target_type: z.enum(["image", "video"]),
    optimized_prompt: z.string().min(1),
    character_count: z.number().optional(),
    within_limit: z.boolean().optional(),
    preserved_intent_summary: z.string().optional(),
    changes_made: coercedStringArray,
    risk_flags: coercedStringArray,
    notes: z.string().optional().default(""),
  })
  .passthrough();

export type RefinerOutput = z.infer<typeof refinerOutputSchema>;

export type VerticalDramaPromptKind = "image" | "video";

export function promptCapForKind(kind: VerticalDramaPromptKind): number {
  return kind === "image" ? VD_IMAGE_PROMPT_MAX : VD_VIDEO_PROMPT_MAX;
}

const IMAGE_NEGATIVE_SECTION_RE =
  /^\s*(?:NEGATIVE PROMPT|IMAGE NEGATIVE CONSTRAINTS(?:\s*\([^)]*\))?)\s*:\s*(.*)$/i;
const IMAGE_NEGATIVE_SECTION_LABEL =
  "IMAGE NEGATIVE CONSTRAINTS (MANDATORY — do not render):";

function collectImageNegativeConstraints(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const markedValue = value.match(IMAGE_NEGATIVE_SECTION_RE)?.[1] ?? value;
  return markedValue
    .split(/[,;\n]+/)
    .map(item => item.replace(/\s+/g, " ").trim().replace(/[.!]+$/, ""))
    .filter(Boolean);
}

/**
 * Merge an image prompt's positive and negative parts into the one prompt
 * string accepted by the image transports. Existing legacy negative sections
 * are removed from the positive body, their comma/semicolon-delimited
 * constraints are preserved, and exact constraints are deduplicated
 * case-insensitively while retaining their first-seen wording/order.
 *
 * This is intentionally conservative: it only treats a line beginning with a
 * known negative-section marker as negative content. Ordinary positive prose
 * containing words such as "negative" is never moved or rewritten.
 */
export function mergeImageNegativePromptIntoPrompt(
  prompt: string,
  negativePrompt?: string,
): string {
  const negativeConstraints: string[] = [];
  const positiveLines = prompt.split(/\r?\n/).filter(line => {
    const match = line.match(IMAGE_NEGATIVE_SECTION_RE);
    if (!match) return true;
    negativeConstraints.push(...collectImageNegativeConstraints(match[1]));
    return false;
  });
  negativeConstraints.push(...collectImageNegativeConstraints(negativePrompt));

  const seen = new Set<string>();
  const uniqueNegativeConstraints = negativeConstraints.filter(constraint => {
    const key = constraint.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const positive = positiveLines.join("\n").trim();
  if (uniqueNegativeConstraints.length === 0) return positive;
  const negativeSection = `${IMAGE_NEGATIVE_SECTION_LABEL} ${uniqueNegativeConstraints.join(", ")}`;
  return positive ? `${positive}\n\n${negativeSection}` : negativeSection;
}

function countExactOccurrences(text: string, fragment: string): number {
  if (!fragment) return 0;
  let count = 0;
  let fromIndex = 0;
  while (fromIndex <= text.length) {
    const index = text.indexOf(fragment, fromIndex);
    if (index < 0) break;
    count += 1;
    fromIndex = index + Math.max(1, fragment.length);
  }
  return count;
}

function imageNegativeSectionFragments(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith(IMAGE_NEGATIVE_SECTION_LABEL));
}

function isValidFinalImagePrompt(
  prompt: string,
  protectedFragments: string[] | undefined,
  maxChars: number,
): boolean {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length > maxChars) return false;
  if (
    protectedFragments?.some(
      fragment => countExactOccurrences(trimmed, fragment) !== 1,
    )
  ) {
    return false;
  }
  // The optimizer must return the canonical one-prompt representation itself;
  // no post-optimizer cleanup or negative-block append is allowed.
  return mergeImageNegativePromptIntoPrompt(trimmed) === trimmed;
}

/** Resolve one call's cap while preserving the legacy floor and provider limit. */
export function resolveEffectivePromptCap(
  kind: VerticalDramaPromptKind,
  override?: number,
): number {
  const defaultCap = promptCapForKind(kind);
  if (override === undefined || !Number.isFinite(override)) {
    return defaultCap;
  }
  const absoluteCap =
    kind === "video" ? VD_VIDEO_PROMPT_ABSOLUTE_MAX : VD_IMAGE_PROMPT_ABSOLUTE_MAX;
  return Math.min(
    absoluteCap,
    Math.max(defaultCap, Math.floor(override)),
  );
}

export interface EnsurePromptWithinLimitParams {
  kind: VerticalDramaPromptKind;
  prompt: string;
  /** Optional extra context folded into the refiner's user prompt (e.g. shot description, dialogue directive summary) to help it preserve intent. */
  context?: string;
  /** Exact fragments (normally native-audio dialogue) that must survive every refinement/truncation pass. */
  protectedFragments?: string[];
  /** Optional selected-provider cap for this call; widening-only. */
  maxChars?: number;
  /** Provider-ready paths must never silently truncate semantic clauses. */
  failClosed?: boolean;
  /**
   * Run `cinematic-prompt-refiner-pro` even when the prompt fits the selected
   * provider cap. Provider-ready image paths use this so optimization is the
   * final prompt-authoring step rather than a length-only fallback.
   */
  finalizeWithRefiner?: boolean;
  userId: number;
  tenantId?: string;
  seriesId: number;
  idempotencyKey?: string;
  /** Human-readable label used only in log lines / credit transaction descriptions, e.g. "start-frame prompt (shot 3)". */
  label?: string;
}

/**
 * Extract user-authored character identity locks already present in a
 * persisted prompt.  Provider refiner passes are allowed to compress prose,
 * but they must never erase the only unambiguous identity description the
 * user supplied for a crowded/ambiguous frame.
 */
export function extractCustomCharacterIdentityLockFragments(
  prompt: string,
): string[] {
  return prompt
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line =>
      /CUSTOM CHARACTER IDENTITY LOCK|CUSTOM CHARACTER IDENTIFICATION OVERRIDES/i.test(
        line,
      ),
    );
}

export class PromptProtectedFragmentsOverflowError extends Error {
  code = "VD_PROMPT_PROTECTED_FRAGMENTS_OVERFLOW" as const;
  constructor(maxChars: number) {
    super(`Mandatory prompt fragments exceed the ${maxChars}-character hard limit`);
    this.name = "PromptProtectedFragmentsOverflowError";
  }
}

/** Raised when a provider-ready prompt cannot be losslessly compressed. */
export class PromptBudgetExceededError extends Error {
  readonly code = "provider_budget_exceeded" as const;
  constructor(
    readonly kind: VerticalDramaPromptKind,
    readonly maxChars: number,
    readonly originalLength: number,
    readonly creditsUsed: number,
  ) {
    super(
      `${kind} prompt exceeds the provider limit (${originalLength}/${maxChars}) and could not be losslessly compressed`,
    );
    this.name = "PromptBudgetExceededError";
  }
}

export function assertProtectedFragmentsFit(
  kind: VerticalDramaPromptKind,
  protectedFragments: string[] | undefined,
  maxCharsOverride?: number,
): void {
  const protectedLength = (protectedFragments ?? [])
    .map(value => value.trim())
    .filter(Boolean)
    .join("\n").length;
  const maxChars = resolveEffectivePromptCap(kind, maxCharsOverride);
  if (protectedLength > maxChars) {
    throw new PromptProtectedFragmentsOverflowError(maxChars);
  }
}

function finalizeProtectedFragments(
  prompt: string,
  protectedFragments: string[] | undefined,
  maxChars: number,
): { prompt: string; truncated: boolean } {
  const fragments = (protectedFragments ?? []).map(value => value.trim()).filter(Boolean);
  const missing: string[] = [];
  const seenCount = new Map<string, number>();
  for (const fragment of fragments) {
    const requiredOccurrence = (seenCount.get(fragment) ?? 0) + 1;
    seenCount.set(fragment, requiredOccurrence);
    let foundOccurrence = 0;
    let fromIndex = 0;
    while (fromIndex <= prompt.length) {
      const index = prompt.indexOf(fragment, fromIndex);
      if (index < 0) break;
      foundOccurrence += 1;
      fromIndex = index + Math.max(1, fragment.length);
    }
    if (foundOccurrence < requiredOccurrence) missing.push(fragment);
  }
  if (missing.length === 0) {
    return {
      prompt: prompt.length <= maxChars ? prompt : truncateAtSentenceBoundary(prompt, maxChars),
      truncated: prompt.length > maxChars,
    };
  }

  const protectedBlock = missing.join("\n");
  if (protectedBlock.length > maxChars) {
    throw new PromptProtectedFragmentsOverflowError(maxChars);
  }
  if (protectedBlock.length === maxChars) {
    return { prompt: protectedBlock, truncated: prompt !== protectedBlock };
  }
  const separator = prompt.trim().length > 0 ? "\n" : "";
  const availableForBase = maxChars - separator.length - protectedBlock.length;
  const base =
    prompt.length <= availableForBase
      ? prompt.trim()
      : truncateAtSentenceBoundary(prompt, availableForBase);
  return {
    prompt: `${base}${base ? separator : ""}${protectedBlock}`,
    truncated: prompt.length > availableForBase,
  };
}

export interface EnsurePromptWithinLimitResult {
  prompt: string;
  refined: boolean;
  creditsUsed: number;
  /** True only when the final fallback (hard truncation) had to be used because the refiner could not get under the cap in two attempts. */
  truncated: boolean;
}

/** Hard sentence-boundary truncation at `maxChars` — final fallback only, never the first move. */
export function truncateAtSentenceBoundary(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastBoundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf(". \n"),
    slice.lastIndexOf(".\n"),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  // Only trust the boundary if it keeps a reasonably substantial prefix —
  // otherwise (e.g. one giant run-on sentence) fall back to a hard cut plus
  // an ellipsis so the string is still unambiguously not a full sentence.
  if (lastBoundary >= Math.floor(maxChars * 0.4)) {
    return slice.slice(0, lastBoundary + 1).trim();
  }
  return `${slice.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function buildRefinerUserPrompt(params: {
  kind: VerticalDramaPromptKind;
  prompt: string;
  context?: string;
  maxChars: number;
  strict: boolean;
  protectedFragments?: string[];
}): string {
  const { kind, prompt, context, maxChars, strict, protectedFragments } = params;
  return [
    `Source prompt (${kind} generation, currently ${prompt.length} characters, target type = ${kind}):`,
    prompt,
    context ? `Additional context to preserve (do not drop): ${context}` : null,
    protectedFragments?.length
      ? [
          "MANDATORY PROTECTED FRAGMENTS: preserve each fragment exactly in the optimized_prompt. Do not omit, paraphrase, duplicate, or move these fragments into a separate field:",
          ...protectedFragments.map((fragment, index) => `${index + 1}. ${fragment}`),
        ].join("\n")
      : null,
    `HARD LIMIT: the "optimized_prompt" you return MUST be ${maxChars} characters or fewer (this is a hard cap enforced by the caller, not a soft target).`,
    "Preserve subject, emotion, lighting, and composition/camera direction; preserve any dialogue or spoken-line directives verbatim in meaning even while compressing.",
    "Achieve full cinematic quality within the limit — do not sacrifice clarity just to hit a shorter length than necessary, but never exceed the hard limit.",
    strict
      ? `Your previous attempt exceeded ${maxChars} characters. Compress more aggressively this time: remove redundant adjectives, keep only the single strongest camera/lighting instruction, and keep negative constraints only if essential. The result MUST be ${maxChars} characters or fewer.`
      : null,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Call `cinematic-prompt-refiner-pro` once to compress `prompt` under
 * `maxChars`. Credit-gated (throws if insufficient credits) and
 * schema-validated via `executeJsonPlanningCallWithRetry` (one same-model
 * retry on malformed/truncated JSON is already built into that helper —
 * distinct from this module's OWN over-cap retry loop in
 * `ensurePromptWithinLimit`, which re-calls this function a second time with
 * `strict: true` if the first refined result is still over the cap).
 */
async function refineOnce(params: {
  kind: VerticalDramaPromptKind;
  prompt: string;
  context?: string;
  maxChars: number;
  strict: boolean;
  protectedFragments?: string[];
  userId: number;
  tenantId?: string;
  seriesId: number;
  idempotencyKey?: string;
  label: string;
}): Promise<{ optimizedPrompt: string; creditsUsed: number }> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new Error("Insufficient credits for prompt QC refinement");
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId,
  );
  const systemPrompt = loadRefinerSystemPrompt();
  const userPrompt = buildRefinerUserPrompt({
    kind: params.kind,
    prompt: params.prompt,
    context: params.context,
    maxChars: params.maxChars,
    strict: params.strict,
    protectedFragments: params.protectedFragments,
  });

  const { data, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    userId: params.userId,
    maxTokens: 3000,
    schema: refinerOutputSchema,
    label: `Vertical Drama prompt QC refine (${params.label})`,
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
    contextRef: params.tenantId ? { contextType: "series", sourceType: "vertical_drama_series", sourceId: String(params.seriesId) } : undefined,
    description: `Vertical Drama — prompt QC refine (${params.label})`,
    skillSlug: "vertical-drama-start-frame-video-safety-qa",
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey
      ? `${params.idempotencyKey}:${params.strict ? "qc-retry" : "qc"}`
      : undefined,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      qcKind: params.kind,
      strict: params.strict,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { optimizedPrompt: data.optimized_prompt, creditsUsed };
}

/**
 * Ensure a final prompt string is within its hard character cap BEFORE it is
 * used for real generation or persisted/displayed. By default a prompt already
 * within the cap is returned with `refined: false` and no LLM call. Image
 * provider paths opt into `finalizeWithRefiner`, which deliberately runs the
 * optimizer even under the cap and accepts only its validated output.
 *
 * Over-cap path: refine via `cinematic-prompt-refiner-pro` (1 call). If the
 * refined result is STILL over the cap, retry once more with a stricter
 * compression instruction (2nd call). Provider-ready paths then throw
 * `PromptBudgetExceededError`; they never truncate or drop required clauses.
 * Legacy image callers retain the advisory truncation fallback unless they
 * explicitly opt into `failClosed`.
 */
export async function ensurePromptWithinLimit(
  params: EnsurePromptWithinLimitParams,
): Promise<EnsurePromptWithinLimitResult> {
  const { kind, context, userId, tenantId, seriesId, idempotencyKey } = params;
  const prompt =
    kind === "image"
      ? mergeImageNegativePromptIntoPrompt(params.prompt)
      : params.prompt;
  const maxChars = resolveEffectivePromptCap(kind, params.maxChars);
  const failClosed =
    params.failClosed ?? (kind === "video" || params.finalizeWithRefiner === true);
  const label = params.label ?? `${kind} prompt`;
  assertProtectedFragmentsFit(kind, params.protectedFragments, params.maxChars);

  const finalProtectedFragments =
    params.finalizeWithRefiner && kind === "image"
      ? Array.from(
          new Set([
            ...(params.protectedFragments ?? []),
            ...imageNegativeSectionFragments(prompt),
          ]),
        )
      : params.protectedFragments;

  if (prompt.length <= maxChars && !params.finalizeWithRefiner) {
    const finalized = finalizeProtectedFragments(prompt, params.protectedFragments, maxChars);
    return { prompt: finalized.prompt, refined: false, creditsUsed: 0, truncated: finalized.truncated };
  }

  let creditsUsed = 0;

  try {
    const first = await refineOnce({
      kind,
      prompt,
      context,
      maxChars,
      strict: false,
      protectedFragments: finalProtectedFragments,
      userId,
      tenantId,
      seriesId,
      idempotencyKey,
      label,
    });
    creditsUsed += first.creditsUsed;
    if (
      params.finalizeWithRefiner
        ? isValidFinalImagePrompt(
            first.optimizedPrompt,
            finalProtectedFragments,
            maxChars,
          )
        : first.optimizedPrompt.length <= maxChars
    ) {
      if (params.finalizeWithRefiner) {
        return {
          prompt: first.optimizedPrompt.trim(),
          refined: true,
          creditsUsed,
          truncated: false,
        };
      }
      const finalized = finalizeProtectedFragments(
        first.optimizedPrompt,
        params.protectedFragments,
        maxChars,
      );
      return { prompt: finalized.prompt, refined: true, creditsUsed, truncated: finalized.truncated };
    }

    debugLog(
      "vd_prompt_qc",
      `${label}: refined prompt still over cap (${first.optimizedPrompt.length} > ${maxChars}), retrying with stricter instruction`,
      { kind, maxChars },
    );

    const second = await refineOnce({
      kind,
      prompt: first.optimizedPrompt,
      context,
      maxChars,
      strict: true,
      protectedFragments: finalProtectedFragments,
      userId,
      tenantId,
      seriesId,
      idempotencyKey,
      label,
    });
    creditsUsed += second.creditsUsed;
    if (
      params.finalizeWithRefiner
        ? isValidFinalImagePrompt(
            second.optimizedPrompt,
            finalProtectedFragments,
            maxChars,
          )
        : second.optimizedPrompt.length <= maxChars
    ) {
      if (params.finalizeWithRefiner) {
        return {
          prompt: second.optimizedPrompt.trim(),
          refined: true,
          creditsUsed,
          truncated: false,
        };
      }
      const finalized = finalizeProtectedFragments(
        second.optimizedPrompt,
        params.protectedFragments,
        maxChars,
      );
      return { prompt: finalized.prompt, refined: true, creditsUsed, truncated: finalized.truncated };
    }

    debugError(
      "vd_prompt_qc",
      `${label}: refiner still over cap after strict retry (${second.optimizedPrompt.length} > ${maxChars})`,
      { kind, maxChars },
    );
    if (failClosed) {
      throw new PromptBudgetExceededError(
        kind,
        maxChars,
        second.optimizedPrompt.length,
        creditsUsed,
      );
    }
    const finalized = finalizeProtectedFragments(
      truncateAtSentenceBoundary(second.optimizedPrompt, maxChars),
      params.protectedFragments,
      maxChars,
    );
    return {
      prompt: finalized.prompt,
      refined: true,
      creditsUsed,
      truncated: true,
    };
  } catch (error) {
    if (error instanceof PromptProtectedFragmentsOverflowError) throw error;
    if (error instanceof PromptBudgetExceededError) throw error;
    if (failClosed) {
      debugError(
        "vd_prompt_qc",
        `${label}: provider-ready refinement failed; blocking instead of truncating`,
        { kind, maxChars, message: error instanceof Error ? error.message : String(error) },
      );
      throw new PromptBudgetExceededError(kind, maxChars, prompt.length, creditsUsed);
    }
    // Refinement failing entirely (rate limit, insufficient credits, LLM
    // error) must never block the user's generation — fall back to hard
    // truncation of the ORIGINAL prompt, logged as a warning.
    debugError(
      "vd_prompt_qc",
      `${label}: refinement failed, falling back to hard truncation`,
      { kind, maxChars, message: error instanceof Error ? error.message : String(error) },
    );
    const finalized = finalizeProtectedFragments(
      truncateAtSentenceBoundary(prompt, maxChars),
      params.protectedFragments,
      maxChars,
    );
    return {
      prompt: finalized.prompt,
      refined: creditsUsed > 0,
      creditsUsed,
      truncated: true,
    };
  }
}
