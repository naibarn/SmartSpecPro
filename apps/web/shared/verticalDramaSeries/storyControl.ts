import { z } from "zod";
import {
  VERTICAL_DRAMA_LOGICAL_SHOT_COUNT,
  verticalDramaDurationPlanSchema,
  type VerticalDramaDurationPlan,
} from "./durationProfiles";

/**
 * Story Control Plane contracts.
 *
 * This module is deliberately pure and bounded. The writer skill owns
 * meaning (whether a payoff is satisfying or a romantic beat feels earned),
 * while these contracts own identity, episode range, evidence references and
 * duration arithmetic. Legacy bibles can omit the field completely.
 */

export const VERTICAL_DRAMA_STORY_CONTROL_CONTRACT_VERSION = 1 as const;

export const VD_STORY_THREAD_SCOPES = [
  "moment_hook",
  "episode_thread",
  "arc_thread",
  "season_thread",
] as const;
export type VerticalDramaStoryThreadScope = (typeof VD_STORY_THREAD_SCOPES)[number];

export const VD_STORY_THREAD_STATUSES = [
  "active",
  "advanced",
  "stalled",
  "resolved",
  "deferred",
  "parked",
  "sequel_hook",
  "legacy_unknown",
  "needs_review",
] as const;
export type VerticalDramaStoryThreadStatus = (typeof VD_STORY_THREAD_STATUSES)[number];

export const VD_ROMANCE_PHASES = [
  "none",
  "friction",
  "flirt",
  "vulnerability",
  "trust_shift",
  "sweet",
  "rupture",
  "reconciliation",
  "confession",
  "commitment",
  "pause",
] as const;
export type VerticalDramaRomancePhase = (typeof VD_ROMANCE_PHASES)[number];

export const VD_ADVANTAGE_SIDES = [
  "protagonist",
  "antagonist",
  "shared",
  "unclear",
] as const;
export type VerticalDramaAdvantageSide = (typeof VD_ADVANTAGE_SIDES)[number];

const episodeWindowSchema = z
  .object({
    startEpisode: z.number().int().positive(),
    endEpisode: z.number().int().positive(),
  })
  .passthrough()
  .refine(value => value.endEpisode >= value.startEpisode, {
    message: "endEpisode must be greater than or equal to startEpisode",
  });

export const storyControlEvidenceRefSchema = z
  .object({
    episodeNumber: z.number().int().positive(),
    shotNumber: z.number().int().min(1).max(VERTICAL_DRAMA_LOGICAL_SHOT_COUNT).optional(),
    beatId: z.string().min(1).optional(),
    kind: z.enum(["plant", "advance", "reframe", "payoff", "cost"]).default("advance"),
    note: z.string().min(1).optional(),
  })
  .passthrough();
export type VerticalDramaStoryControlEvidenceRef = z.infer<
  typeof storyControlEvidenceRefSchema
>;

export const storyControlThreadSchema = z
  .object({
    threadId: z.string().min(1),
    label: z.string().min(1),
    scope: z.enum(VD_STORY_THREAD_SCOPES),
    ownerCharacters: z.array(z.string().min(1)).min(1),
    plantEpisode: z.number().int().positive(),
    payoffWindow: episodeWindowSchema,
    expectedEvidence: z.array(z.string().min(1)).min(1),
    resolutionCost: z.string().min(1),
    status: z.enum(VD_STORY_THREAD_STATUSES).default("active"),
    openingEvidence: z.array(storyControlEvidenceRefSchema).default([]),
  })
  .passthrough();
export type VerticalDramaStoryControlThread = z.infer<typeof storyControlThreadSchema>;

export const romancePhasePlanSchema = z
  .object({
    phase: z.enum(VD_ROMANCE_PHASES),
    episodeWindow: episodeWindowSchema,
    pair: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
    purpose: z.string().min(1),
    allowPause: z.boolean().default(true),
  })
  .passthrough();
export type VerticalDramaRomancePhasePlan = z.infer<typeof romancePhasePlanSchema>;

export const advantageBeatPlanSchema = z
  .object({
    episodeNumber: z.number().int().positive(),
    advantagedSide: z.enum(VD_ADVANTAGE_SIDES),
    cost: z.string().min(1),
    opponentResponse: z.string().min(1),
    purpose: z.string().min(1).optional(),
  })
  .passthrough();
export type VerticalDramaAdvantageBeatPlan = z.infer<typeof advantageBeatPlanSchema>;

export const storyControlSeedSchema = z
  .object({
    contractVersion: z.literal(VERTICAL_DRAMA_STORY_CONTROL_CONTRACT_VERSION),
    premiseAnchor: z.string().min(1),
    canonicalCharacterKeys: z.array(z.string().min(1)).min(1),
    threadCandidates: z.array(storyControlThreadSchema).default([]),
    romancePhaseSkeleton: z.array(romancePhasePlanSchema).default([]),
    advantageIntent: z.array(advantageBeatPlanSchema).default([]),
  })
  .passthrough();
export type VerticalDramaStoryControlSeed = z.infer<typeof storyControlSeedSchema>;

export const storyControlThreadActionSchema = z
  .object({
    action: z.enum(["open", "advance", "reframe", "resolve", "defer", "park"]),
    threadId: z.string().min(1).optional(),
    proposedThreadId: z.string().min(1).optional(),
    evidenceRefs: z.array(storyControlEvidenceRefSchema).default([]),
    note: z.string().min(1).optional(),
  })
  .passthrough();
export type VerticalDramaStoryControlThreadAction = z.infer<
  typeof storyControlThreadActionSchema
>;

/** Episode-level annotations returned by the script skill. These are facts
 * the writer declares for reconciliation; they are not persisted as a second
 * ledger and do not replace the seed/ledger source of truth. */
export const storyControlScriptOutputSchema = z
  .object({
    thread_actions: z.array(storyControlThreadActionSchema).optional(),
    romance_beat: z
      .object({
        phase: z.enum(VD_ROMANCE_PHASES),
        pair: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
        purpose: z.string().min(1),
        evidence_refs: z.array(storyControlEvidenceRefSchema).default([]),
      })
      .passthrough()
      .optional(),
    advantage_beat: z
      .object({
        advantaged_side: z.enum(VD_ADVANTAGE_SIDES),
        cost: z.string().min(1),
        opponent_response: z.string().min(1),
        purpose: z.string().min(1).optional(),
        evidence_refs: z.array(storyControlEvidenceRefSchema).default([]),
      })
      .passthrough()
      .optional(),
    character_role_bindings: z
      .array(
        z
          .object({
            character_key: z.string().min(1),
            role: z.string().min(1),
          })
          .passthrough(),
      )
      .optional(),
    evidence_refs: z.array(storyControlEvidenceRefSchema).optional(),
  })
  .passthrough();
export type VerticalDramaStoryControlScriptOutput = z.infer<
  typeof storyControlScriptOutputSchema
>;

export const storyControlEpisodeSlotSchema = z
  .object({
    episodeNumber: z.number().int().positive(),
    purpose: z.string().min(1),
    threadActions: z.array(storyControlThreadActionSchema).default([]),
    allowedNewThreadCount: z.number().int().min(0).max(3).default(0),
    romanceBeat: romancePhasePlanSchema.optional(),
    advantageBeat: advantageBeatPlanSchema.optional(),
    requiredCharacterKeys: z.array(z.string().min(1)).default([]),
    canonFacts: z.array(z.string().min(1)).default([]),
    forbiddenContradictions: z.array(z.string().min(1)).default([]),
    durationPlan: verticalDramaDurationPlanSchema.optional(),
  })
  .passthrough();
export type VerticalDramaStoryControlEpisodeSlot = z.infer<
  typeof storyControlEpisodeSlotSchema
>;

export const storyControlPlanSchema = z
  .object({
    contractVersion: z.literal(VERTICAL_DRAMA_STORY_CONTROL_CONTRACT_VERSION),
    planId: z.string().min(1),
    status: z.enum(["draft", "approved", "audit_only", "enforced"]),
    seed: storyControlSeedSchema,
    episodeSlots: z.array(storyControlEpisodeSlotSchema).min(1),
    durationPlan: verticalDramaDurationPlanSchema.optional(),
  })
  .passthrough();
export type VerticalDramaStoryControlPlan = z.infer<typeof storyControlPlanSchema>;

export type VerticalDramaStoryControlIssue = {
  code:
    | "invalid_contract"
    | "duplicate_id"
    | "unknown_character"
    | "invalid_episode_window"
    | "unknown_thread"
    | "open_without_id"
    | "resolution_without_evidence"
    | "duration_vector_invalid"
    | "duplicate_episode_slot"
    | "new_thread_budget_exceeded";
  path: string;
  message: string;
};

export type VerticalDramaStoryControlValidation = {
  ok: boolean;
  value: VerticalDramaStoryControlPlan | null;
  issues: VerticalDramaStoryControlIssue[];
};

export function validateVerticalDramaStoryControlEpisodeOutput(
  raw: unknown,
  options: {
    seed: VerticalDramaStoryControlSeed;
    episodeNumber: number;
  },
): VerticalDramaStoryControlIssue[] {
  const parsed = storyControlScriptOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return [issue("invalid_contract", "script.storyControl", "Episode story-control annotations are malformed.")];
  }

  const issues: VerticalDramaStoryControlIssue[] = [];
  const threadIds = new Set(options.seed.threadCandidates.map(thread => thread.threadId));
  const proposedThreadIds = new Set(threadIds);
  const characterKeys = new Set(options.seed.canonicalCharacterKeys);
  for (const [index, action] of (parsed.data.thread_actions ?? []).entries()) {
    const path = `script.thread_actions[${index}]`;
    if (action.action === "open" && !action.proposedThreadId) {
      issues.push(issue("open_without_id", `${path}.proposedThreadId`, "An opened thread must declare a stable proposedThreadId."));
    } else if (action.action === "open" && action.proposedThreadId) {
      if (proposedThreadIds.has(action.proposedThreadId)) {
        issues.push(issue("duplicate_id", `${path}.proposedThreadId`, `Duplicate thread id: ${action.proposedThreadId}`));
      }
      proposedThreadIds.add(action.proposedThreadId);
    }
    if (action.action !== "open" && (!action.threadId || !threadIds.has(action.threadId))) {
      issues.push(issue("unknown_thread", `${path}.threadId`, "Thread action must reference a registered thread id."));
    }
    if (action.action === "resolve" && action.evidenceRefs.length === 0) {
      issues.push(issue("resolution_without_evidence", `${path}.evidenceRefs`, "A resolution requires episode/beat evidence."));
    }
    for (const evidence of action.evidenceRefs) {
      if (evidence.episodeNumber !== options.episodeNumber) {
        issues.push(issue("invalid_episode_window", `${path}.evidenceRefs`, "Evidence must point to the current episode."));
      }
    }
  }
  for (const [index, binding] of (parsed.data.character_role_bindings ?? []).entries()) {
    if (!characterKeys.has(binding.character_key)) {
      issues.push(issue("unknown_character", `script.character_role_bindings[${index}].character_key`, `Unknown canonical character: ${binding.character_key}`));
    }
  }
  for (const [path, refs] of [
    ["script.evidence_refs", parsed.data.evidence_refs ?? []] as const,
    ["script.romance_beat.evidence_refs", parsed.data.romance_beat?.evidence_refs ?? []] as const,
    ["script.advantage_beat.evidence_refs", parsed.data.advantage_beat?.evidence_refs ?? []] as const,
  ]) {
    for (const evidence of refs) {
      if (evidence.episodeNumber !== options.episodeNumber) {
        issues.push(issue("invalid_episode_window", path, "Evidence must point to the current episode."));
      }
    }
  }
  return issues;
}

export type VerticalDramaStoryControlSeedValidation = {
  ok: boolean;
  value: VerticalDramaStoryControlSeed | null;
  issues: VerticalDramaStoryControlIssue[];
};

export function validateVerticalDramaStoryControlSeed(
  raw: unknown,
  options: { totalEpisodeCount?: number } = {},
): VerticalDramaStoryControlSeedValidation {
  const parsed = storyControlSeedSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      value: null,
      issues: [issue("invalid_contract", "seed", "Story Control Seed does not match the versioned contract.")],
    };
  }
  const issues = collectSeedIssues(parsed.data, options.totalEpisodeCount);
  return { ok: issues.length === 0, value: issues.length === 0 ? parsed.data : null, issues };
}

export function readVerticalDramaStoryControlSeed(
  raw: unknown,
  options: { totalEpisodeCount?: number } = {},
): VerticalDramaStoryControlSeed | null {
  return validateVerticalDramaStoryControlSeed(raw, options).value;
}

function issue(
  code: VerticalDramaStoryControlIssue["code"],
  path: string,
  message: string
): VerticalDramaStoryControlIssue {
  return { code, path, message };
}

function collectSeedIssues(
  seed: VerticalDramaStoryControlSeed,
  totalEpisodeCount?: number
): VerticalDramaStoryControlIssue[] {
  const issues: VerticalDramaStoryControlIssue[] = [];
  const characters = new Set(seed.canonicalCharacterKeys);
  if (characters.size !== seed.canonicalCharacterKeys.length) {
    issues.push(issue("duplicate_id", "seed.canonicalCharacterKeys", "Canonical character keys must be unique."));
  }

  const threadIds = new Set<string>();
  for (const [index, thread] of seed.threadCandidates.entries()) {
    const path = `seed.threadCandidates[${index}]`;
    if (threadIds.has(thread.threadId)) {
      issues.push(issue("duplicate_id", `${path}.threadId`, `Duplicate thread id: ${thread.threadId}`));
    }
    threadIds.add(thread.threadId);
    for (const character of thread.ownerCharacters) {
      if (!characters.has(character)) {
        issues.push(issue("unknown_character", `${path}.ownerCharacters`, `Unknown canonical character: ${character}`));
      }
    }
    if (thread.plantEpisode > thread.payoffWindow.endEpisode) {
      issues.push(issue("invalid_episode_window", path, "Thread plant episode is after its payoff window."));
    }
    if (totalEpisodeCount != null && thread.payoffWindow.endEpisode > totalEpisodeCount) {
      issues.push(issue("invalid_episode_window", path, "Thread payoff window exceeds the planned season."));
    }
  }

  for (const [index, beat] of seed.romancePhaseSkeleton.entries()) {
    if (beat.pair) {
      for (const character of beat.pair) {
        if (!characters.has(character)) {
          issues.push(issue("unknown_character", `seed.romancePhaseSkeleton[${index}].pair`, `Unknown canonical character: ${character}`));
        }
      }
    }
    if (totalEpisodeCount != null && beat.episodeWindow.endEpisode > totalEpisodeCount) {
      issues.push(issue("invalid_episode_window", `seed.romancePhaseSkeleton[${index}]`, "Romance phase exceeds the planned season."));
    }
  }
  for (const [index, beat] of seed.advantageIntent.entries()) {
    if (totalEpisodeCount != null && beat.episodeNumber > totalEpisodeCount) {
      issues.push(issue("invalid_episode_window", `seed.advantageIntent[${index}]`, "Advantage beat exceeds the planned season."));
    }
  }
  return issues;
}

export function validateVerticalDramaStoryControlPlan(
  raw: unknown,
  options: { totalEpisodeCount?: number } = {}
): VerticalDramaStoryControlValidation {
  const parsed = storyControlPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      value: null,
      issues: [issue("invalid_contract", "plan", "Story Control Plan does not match the versioned contract.")],
    };
  }

  const plan = parsed.data;
  const issues = collectSeedIssues(plan.seed, options.totalEpisodeCount);
  const threadIds = new Set(plan.seed.threadCandidates.map(thread => thread.threadId));
  const proposedThreadIds = new Set(threadIds);
  const slotNumbers = new Set<number>();

  for (const [slotIndex, slot] of plan.episodeSlots.entries()) {
    const path = `episodeSlots[${slotIndex}]`;
    if (slotNumbers.has(slot.episodeNumber)) {
      issues.push(issue("duplicate_episode_slot", `${path}.episodeNumber`, `Duplicate episode slot: ${slot.episodeNumber}`));
    }
    slotNumbers.add(slot.episodeNumber);
    if (options.totalEpisodeCount != null && slot.episodeNumber > options.totalEpisodeCount) {
      issues.push(issue("invalid_episode_window", path, "Episode slot exceeds the planned season."));
    }
    for (const character of slot.requiredCharacterKeys) {
      if (!plan.seed.canonicalCharacterKeys.includes(character)) {
        issues.push(issue("unknown_character", `${path}.requiredCharacterKeys`, `Unknown canonical character: ${character}`));
      }
    }
    if (slot.advantageBeat && slot.advantageBeat.episodeNumber !== slot.episodeNumber) {
      issues.push(issue("invalid_episode_window", `${path}.advantageBeat.episodeNumber`, "Advantage beat must belong to its episode slot."));
    }
    if (options.totalEpisodeCount != null && slot.advantageBeat && slot.advantageBeat.episodeNumber > options.totalEpisodeCount) {
      issues.push(issue("invalid_episode_window", `${path}.advantageBeat.episodeNumber`, "Advantage beat exceeds the planned season."));
    }
    const proposedCount = slot.threadActions.filter(action => action.action === "open").length;
    if (proposedCount > slot.allowedNewThreadCount) {
      issues.push(issue("new_thread_budget_exceeded", `${path}.threadActions`, "New thread actions exceed the slot budget."));
    }
    for (const [actionIndex, action] of slot.threadActions.entries()) {
      const actionPath = `${path}.threadActions[${actionIndex}]`;
      if (action.action !== "open" && (!action.threadId || !threadIds.has(action.threadId))) {
        issues.push(issue("unknown_thread", `${actionPath}.threadId`, "Thread action must reference a registered thread id."));
      }
      if (action.action === "open" && !action.proposedThreadId) {
        issues.push(issue("open_without_id", `${actionPath}.proposedThreadId`, "An opened thread must declare a stable proposedThreadId."));
      } else if (action.action === "open" && action.proposedThreadId) {
        if (proposedThreadIds.has(action.proposedThreadId)) {
          issues.push(issue("duplicate_id", `${actionPath}.proposedThreadId`, `Duplicate thread id: ${action.proposedThreadId}`));
        }
        proposedThreadIds.add(action.proposedThreadId);
      }
      if (action.action === "resolve" && action.evidenceRefs.length === 0) {
        issues.push(issue("resolution_without_evidence", `${actionPath}.evidenceRefs`, "A resolution requires episode/beat evidence."));
      }
      for (const evidence of action.evidenceRefs) {
        if (evidence.episodeNumber !== slot.episodeNumber) {
          issues.push(issue("invalid_episode_window", `${actionPath}.evidenceRefs`, "Evidence must point to the current episode slot."));
        }
      }
    }
    if (slot.durationPlan?.status === "active" && slot.durationPlan.shotDurationsSeconds.length !== VERTICAL_DRAMA_LOGICAL_SHOT_COUNT) {
      issues.push(issue("duration_vector_invalid", `${path}.durationPlan`, "Active duration plans must contain exactly 9 logical shot durations."));
    }
  }

  if (plan.durationPlan?.status === "active" && plan.durationPlan.shotDurationsSeconds.length !== VERTICAL_DRAMA_LOGICAL_SHOT_COUNT) {
    issues.push(issue("duration_vector_invalid", "durationPlan", "Active duration plans must contain exactly 9 logical shot durations."));
  }

  return { ok: issues.length === 0, value: issues.length === 0 ? plan : null, issues };
}

export function getStoryControlThreadIds(
  seed: VerticalDramaStoryControlSeed | null | undefined
): string[] {
  return seed?.threadCandidates.map(thread => thread.threadId) ?? [];
}

export function getStoryControlDurationPlan(
  plan: VerticalDramaStoryControlPlan | null | undefined
): VerticalDramaDurationPlan | null {
  return plan?.durationPlan ?? null;
}
