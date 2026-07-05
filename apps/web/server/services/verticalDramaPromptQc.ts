/**
 * Vertical Drama Series — final-prompt quality control (hard length caps).
 *
 * Enforces `VD_IMAGE_PROMPT_MAX` (3500 chars) / `VD_VIDEO_PROMPT_MAX` (2000
 * chars) on any FINAL prompt string BEFORE it is used for real generation or
 * persisted/displayed in the UI. When a prompt is already within its cap this
 * is a zero-cost, zero-LLM-call no-op (`refined: false`, `creditsUsed: 0`) —
 * every enforcement point below must stay free for the common case.
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
 * There is no pre-existing "optimizer"/"refiner" skill used anywhere in the
 * Vertical Drama flow today (verified by search across
 * `verticalDrama*.ts`/`verticalDramaEpisodes.ts` router) — this module is a
 * NEW QC layer, not a replacement of an older skill usage.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { debugLog, debugError } from "../_core/logger";
import { VD_IMAGE_PROMPT_MAX, VD_VIDEO_PROMPT_MAX } from "@shared/verticalDramaSeries";

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

/** Output schema — mirrors `schemas/output.schema.json` (only the fields this module reads are strictly typed; rest passthrough). */
const refinerOutputSchema = z
  .object({
    target_type: z.enum(["image", "video"]),
    optimized_prompt: z.string().min(1),
    character_count: z.number().optional(),
    within_limit: z.boolean().optional(),
    preserved_intent_summary: z.string().optional(),
    changes_made: z.array(z.string()).optional().default([]),
    risk_flags: z.array(z.string()).optional().default([]),
    notes: z.string().optional().default(""),
  })
  .passthrough();

export type RefinerOutput = z.infer<typeof refinerOutputSchema>;

export type VerticalDramaPromptKind = "image" | "video";

export function promptCapForKind(kind: VerticalDramaPromptKind): number {
  return kind === "image" ? VD_IMAGE_PROMPT_MAX : VD_VIDEO_PROMPT_MAX;
}

export interface EnsurePromptWithinLimitParams {
  kind: VerticalDramaPromptKind;
  prompt: string;
  /** Optional extra context folded into the refiner's user prompt (e.g. shot description, dialogue directive summary) to help it preserve intent. */
  context?: string;
  userId: number;
  tenantId?: string;
  idempotencyKey?: string;
  /** Human-readable label used only in log lines / credit transaction descriptions, e.g. "start-frame prompt (shot 3)". */
  label?: string;
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
}): string {
  const { kind, prompt, context, maxChars, strict } = params;
  return [
    `Source prompt (${kind} generation, currently ${prompt.length} characters, target type = ${kind}):`,
    prompt,
    context ? `Additional context to preserve (do not drop): ${context}` : null,
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
  userId: number;
  tenantId?: string;
  idempotencyKey?: string;
  label: string;
}): Promise<{ optimizedPrompt: string; creditsUsed: number }> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new Error("Insufficient credits for prompt QC refinement");
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadRefinerSystemPrompt();
  const userPrompt = buildRefinerUserPrompt({
    kind: params.kind,
    prompt: params.prompt,
    context: params.context,
    maxChars: params.maxChars,
    strict: params.strict,
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
    description: `Vertical Drama — prompt QC refine (${params.label})`,
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
 * used for real generation or persisted/displayed. Zero-cost fast path: a
 * prompt already within the cap is returned as-is with `refined: false` and
 * `creditsUsed: 0` — no LLM call, no credit deduction.
 *
 * Over-cap path: refine via `cinematic-prompt-refiner-pro` (1 call). If the
 * refined result is STILL over the cap, retry once more with a stricter
 * compression instruction (2nd call). If that also fails, fall back to a
 * hard sentence-boundary truncation at the cap with a logged warning — this
 * function never throws for a length-cap reason and never blocks the user.
 */
export async function ensurePromptWithinLimit(
  params: EnsurePromptWithinLimitParams,
): Promise<EnsurePromptWithinLimitResult> {
  const { kind, prompt, context, userId, tenantId, idempotencyKey } = params;
  const maxChars = promptCapForKind(kind);
  const label = params.label ?? `${kind} prompt`;

  if (prompt.length <= maxChars) {
    return { prompt, refined: false, creditsUsed: 0, truncated: false };
  }

  let creditsUsed = 0;

  try {
    const first = await refineOnce({
      kind,
      prompt,
      context,
      maxChars,
      strict: false,
      userId,
      tenantId,
      idempotencyKey,
      label,
    });
    creditsUsed += first.creditsUsed;
    if (first.optimizedPrompt.length <= maxChars) {
      return { prompt: first.optimizedPrompt, refined: true, creditsUsed, truncated: false };
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
      userId,
      tenantId,
      idempotencyKey,
      label,
    });
    creditsUsed += second.creditsUsed;
    if (second.optimizedPrompt.length <= maxChars) {
      return { prompt: second.optimizedPrompt, refined: true, creditsUsed, truncated: false };
    }

    debugError(
      "vd_prompt_qc",
      `${label}: refiner still over cap after strict retry (${second.optimizedPrompt.length} > ${maxChars}) — falling back to hard truncation`,
      { kind, maxChars },
    );
    return {
      prompt: truncateAtSentenceBoundary(second.optimizedPrompt, maxChars),
      refined: true,
      creditsUsed,
      truncated: true,
    };
  } catch (error) {
    // Refinement failing entirely (rate limit, insufficient credits, LLM
    // error) must never block the user's generation — fall back to hard
    // truncation of the ORIGINAL prompt, logged as a warning.
    debugError(
      "vd_prompt_qc",
      `${label}: refinement failed, falling back to hard truncation`,
      { kind, maxChars, message: error instanceof Error ? error.message : String(error) },
    );
    return {
      prompt: truncateAtSentenceBoundary(prompt, maxChars),
      refined: creditsUsed > 0,
      creditsUsed,
      truncated: true,
    };
  }
}
