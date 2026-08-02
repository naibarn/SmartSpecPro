/**
 * Feature 142 — section-06: the repair rewriter, the ONE LLM seam the
 * applier consumes. Split out of `videoProjectRepairApplier.ts` (a
 * deliberate refinement of `claude-plan.md` §3.2) so the applier stays free
 * of every LLM/DB import and its own test needs zero `vi.mock` — same split
 * as section-03's `videoProjectReviewAdapter.ts`.
 *
 * TypeScript supplies FACTS only — the target ids, their current text, and
 * their `maxChars` cap — and relays the skill-authored `instruction`
 * verbatim; the model writes the words. Nothing about tone, style, or what
 * "better" means lives here (skill-first rule,
 * `memory/feedback_skill_first_authoring.md`).
 *
 * ONE call per stage per round — never one per scene (section-06 §1.1).
 *
 * 🔴 This file MUST NEVER charge credits — the credit-charging call this
 * module invokes already deducts internally, per attempt; the
 * `creditsUsed` it returns is a REPORT of money already spent, handed to
 * `onUsage` for the ledger and the UI only. This rule is locked twice: once
 * by a spy assertion at the caller level, and once by an fs source guard in
 * this file's own test that reads this file's raw text and asserts it never
 * contains the name of that charging function — literally anywhere,
 * including comments, which is why this file's comments describe it only by
 * role, never by name.
 */
import { z } from "zod";

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "./callLLMStructured";
import { reportStructuredOutputViolation } from "./videoIntelligenceModelResolver";
import type { RepairEffects, RepairRewrite } from "./videoProjectRepairApplier";

/** Bound on the joined zodIssuePaths list carried in the strike report and
 *  the rethrown error message (mirrors `videoProjectReviewAdapter.ts`). */
const MAX_STRIKE_ISSUE_PATHS = 8;
const MAX_ERROR_MESSAGE_LENGTH = 1000;

function formatZodIssuePathForStrike(path: Array<string | number>): string {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number") return `${accumulator}[${segment}]`;
    return accumulator ? `${accumulator}.${segment}` : String(segment);
  }, "");
}

const repairRewriteSchema: z.ZodType<RepairRewrite[], any, unknown> = z.array(
  z.object({ id: z.string(), text: z.string() }),
);

/** Thin platform framing ONLY: the reply is a JSON array of `{ id, text }`;
 *  ids must be echoed unchanged; respect each target's `maxChars`; no
 *  markdown fences. Nothing about tone, style, or what "better" means — that
 *  is the skill's instruction. Kept under ~600 characters. */
export const VIDEO_PROJECT_REPAIR_SYSTEM_FRAMING =
  "This is the Video Intelligence platform's automated repair-rewrite call. " +
  "The user message is one JSON object with keys stage, instruction, and " +
  "targets (an array of { id, text, maxChars }). Rewrite each target's text " +
  "per the instruction, respecting maxChars. Respond with ONLY a single " +
  "valid JSON array of { id, text } objects, echoing each id unchanged — no " +
  "markdown code fences, no commentary outside the JSON. Omit an id to " +
  "leave its text unchanged.";

/**
 * Build the `RepairEffects` the applier consumes. ONE `callLLMStructured`
 * call per stage.
 */
export function makeRepairEffects(deps: {
  tenantId: string;
  userId: number;
  /** Joins this repair call to its `provider_usage_log` row. */
  traceId: string;
  /** Resolved ONCE at dispatch, carried in the job payload — never
   *  re-resolved here. */
  modelId: string;
  projectId: number;
  /** Reports spend that ALREADY happened — on success and on schema failure
   *  alike. Never a charge. */
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): RepairEffects {
  const reportUsage = (usage: { creditsUsed: number; modelId: string | null }): void => {
    try {
      deps.onUsage(usage);
    } catch {
      // Reporting must never be able to break the repair applier.
    }
  };

  return {
    rewriteForStage: async ({ stage, instruction, targets }) => {
      try {
        const result = await callLLMStructured({
          systemPrompt: VIDEO_PROJECT_REPAIR_SYSTEM_FRAMING,
          userMessage: JSON.stringify({ stage, instruction, targets }),
          zodSchema: repairRewriteSchema,
          maxRetries: 2,
          model: deps.modelId,
          userId: deps.userId,
          tenantId: deps.tenantId,
          runtimeOptions: {
            skillSlugs: ["video-project-quality-review"],
            originSurface: "video_edit",
            entryPoint: "system",
            requestLabel: "video-project-quality-repair",
          },
          billingDescription: "video-project quality repair",
          billingMetadata: {
            skillSlug: "video-project-quality-review",
            traceId: deps.traceId,
            projectId: deps.projectId,
            stage,
          },
        });

        reportUsage({ creditsUsed: result.creditsUsed, modelId: result.modelId });
        return result.data;
      } catch (error) {
        if (error instanceof LLMStructuredOutputError) {
          // A provider call that succeeded and then failed validation has
          // already been billed — report the spend before anything else.
          reportUsage({ creditsUsed: error.creditsUsed ?? 0, modelId: deps.modelId });

          const issuePaths = error.zodErrors
            ? Array.from(
                new Set(error.zodErrors.issues.map(issue => formatZodIssuePathForStrike(issue.path))),
              ).slice(0, MAX_STRIKE_ISSUE_PATHS)
            : [];

          reportStructuredOutputViolation({
            modelId: deps.modelId,
            traceId: deps.traceId,
            zodIssuePaths: issuePaths,
            stage: `quality_repair:${stage}`,
          });

          const message =
            "VI_REPAIR_OUTPUT_INVALID: video-project quality-repair rewrite output " +
            `failed its schema after 2 retries (stage: ${stage}, paths: ${issuePaths.join(", ") || "none"})`;
          throw new Error(message.slice(0, MAX_ERROR_MESSAGE_LENGTH), { cause: error });
        }

        // Transport/provider/timeout errors are not the model's fault: no
        // strike, rethrow unchanged.
        throw error;
      }
    },
  };
}
