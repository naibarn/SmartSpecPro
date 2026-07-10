/**
 * Vertical Drama Series — Feature 132 quality ledgers + story state (F132B,
 * spec §5.2/§5.3; plan `sections/section-03-ledgers-and-story-state.md`).
 *
 * Pure, provider-free zod schemas + TS types for the seven versioned
 * "quality ledgers" (evidence, character activation, threat ladder,
 * consequence, thread, world-rule, causal-chain) plus the typed per-episode
 * "story state" object. Every schema is `.passthrough()` to match this
 * codebase's tolerant-storage convention (see `verticalDramaBreakdownVersionSchema`,
 * `worldRuleSchema` in `server/services/verticalDramaStoryBible.ts`).
 *
 * NOTE (coordination): this file is scaffolded minimally here (Section 03's
 * hot-file-adjacent prerequisite, created by the coordinated Section
 * 02/03/04 pass because `contentBudget.ts` needs to import
 * `verticalDramaQualityLedgersSchema`). Section 03's own dedicated
 * implementation pass (`verticalDramaQualityLedgerReconcile.ts`,
 * `vertical-drama-ledger-planner` skill, etc.) should EXTEND this file
 * in-place rather than recreate it — see the Backend Agent's report for the
 * "already exists" confirmation.
 *
 * `VD_QUALITY_LEDGER_KINDS` mirrors the exact §8.1 finding-kind ->
 * source-ledger mapping pinned by Section 03's plan, so Section 06's
 * finding-array-append and Section 07's `affectedLedgers[]` derivation never
 * drift.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Evidence ledger                                                            */
/* -------------------------------------------------------------------------- */

export const VD_EVIDENCE_LEDGER_STATUSES = [
  "open",
  "orphaned",
  "payoff_confirmed",
  "convenience",
] as const;

export const evidenceLedgerRowSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    introducedEpisode: z.number().int().positive(),
    mustPayoffByEpisode: z.number().int().positive().optional(),
    usedEpisodes: z.array(z.number().int().positive()).default([]),
    changesDecisionEpisodes: z.array(z.number().int().positive()).default([]),
    payoffEpisode: z.number().int().positive().optional(),
    status: z.enum(VD_EVIDENCE_LEDGER_STATUSES).default("open"),
  })
  .passthrough();

export type VerticalDramaEvidenceLedgerRow = z.infer<
  typeof evidenceLedgerRowSchema
>;

/* -------------------------------------------------------------------------- */
/* Character activation ledger                                               */
/* -------------------------------------------------------------------------- */

export const VD_CHARACTER_ACTIVATION_STATUSES = [
  "active",
  "weak",
  "dormant",
] as const;

export const characterActivationLedgerRowSchema = z
  .object({
    character: z.string().min(1),
    firstAppearanceEpisode: z.number().int().positive().optional(),
    firstActionEpisode: z.number().int().positive().optional(),
    requiredActivationByEpisode: z.number().int().positive(),
    status: z.enum(VD_CHARACTER_ACTIVATION_STATUSES).default("dormant"),
  })
  .passthrough();

export type VerticalDramaCharacterActivationLedgerRow = z.infer<
  typeof characterActivationLedgerRowSchema
>;

/* -------------------------------------------------------------------------- */
/* Threat ladder                                                             */
/* -------------------------------------------------------------------------- */

export const threatLadderRowSchema = z
  .object({
    episode: z.number().int().positive(),
    threatLevel: z.number().min(1).max(5),
    costToProtagonist: z.string().min(1).optional(),
    causedByAntagonist: z.boolean().optional(),
  })
  .passthrough();

export type VerticalDramaThreatLadderRow = z.infer<
  typeof threatLadderRowSchema
>;

/* -------------------------------------------------------------------------- */
/* Consequence ledger                                                        */
/* -------------------------------------------------------------------------- */

export const VD_CONSEQUENCE_LEDGER_STATUSES = [
  "pending",
  "followed",
  "dropped",
] as const;

export const consequenceLedgerRowSchema = z
  .object({
    id: z.string().min(1),
    decisionEpisode: z.number().int().positive(),
    character: z.string().min(1),
    decision: z.string().min(1).optional(),
    mustBeFollowedInEpisode: z.number().int().positive().optional(),
    followedInEpisode: z.number().int().positive().optional(),
    status: z.enum(VD_CONSEQUENCE_LEDGER_STATUSES).default("pending"),
  })
  .passthrough();

export type VerticalDramaConsequenceLedgerRow = z.infer<
  typeof consequenceLedgerRowSchema
>;

/* -------------------------------------------------------------------------- */
/* Thread ledger                                                             */
/* -------------------------------------------------------------------------- */

export const VD_THREAD_LEDGER_STATUSES = [
  "active",
  "stalled",
  "resolved",
] as const;

export const threadLedgerRowSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    lastMovedEpisode: z.number().int().positive().optional(),
    mustMoveAgainByEpisode: z.number().int().positive().optional(),
    status: z.enum(VD_THREAD_LEDGER_STATUSES).default("active"),
  })
  .passthrough();

export type VerticalDramaThreadLedgerRow = z.infer<typeof threadLedgerRowSchema>;

/* -------------------------------------------------------------------------- */
/* World rule ledger (spec §5.2 richer shape)                                */
/* -------------------------------------------------------------------------- */

export const VD_WORLD_RULE_VERDICTS = ["keep", "revise"] as const;

export const worldRuleLedgerRowSchema = z
  .object({
    id: z.string().min(1),
    rule: z.string().min(1),
    introducedEpisode: z.number().int().positive(),
    usedAgainEpisodes: z.array(z.number().int().positive()).default([]),
    createsChoice: z.boolean().default(false),
    payoffEpisode: z.number().int().positive().optional(),
    verdict: z.enum(VD_WORLD_RULE_VERDICTS).default("keep"),
  })
  .passthrough();

export type VerticalDramaWorldRuleLedgerRow = z.infer<
  typeof worldRuleLedgerRowSchema
>;

/* -------------------------------------------------------------------------- */
/* Causal chain map                                                          */
/* -------------------------------------------------------------------------- */

export const causalChainMapEntrySchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    episodes: z.array(z.number().int().positive()).default([]),
  })
  .passthrough();

export type VerticalDramaCausalChainMapEntry = z.infer<
  typeof causalChainMapEntrySchema
>;

/* -------------------------------------------------------------------------- */
/* Container schema                                                          */
/* -------------------------------------------------------------------------- */

export const verticalDramaQualityLedgersSchema = z
  .object({
    evidenceLedger: z.array(evidenceLedgerRowSchema).default([]),
    characterActivationLedger: z
      .array(characterActivationLedgerRowSchema)
      .default([]),
    threatLadder: z.array(threatLadderRowSchema).default([]),
    consequenceLedger: z.array(consequenceLedgerRowSchema).default([]),
    threadLedger: z.array(threadLedgerRowSchema).default([]),
    worldRuleLedger: z.array(worldRuleLedgerRowSchema).default([]),
    causalChainMap: z.array(causalChainMapEntrySchema).default([]),
  })
  .passthrough();

export type VerticalDramaQualityLedgers = z.infer<
  typeof verticalDramaQualityLedgersSchema
>;

/** Default/empty ledger set — the zero-value used before a `ledger_plan` step has ever run for a series. */
export function emptyQualityLedgers(): VerticalDramaQualityLedgers {
  return {
    evidenceLedger: [],
    characterActivationLedger: [],
    threatLadder: [],
    consequenceLedger: [],
    threadLedger: [],
    worldRuleLedger: [],
    causalChainMap: [],
  };
}

/**
 * Stable, documented finding-kind -> source-ledger mapping (spec §8.1,
 * pinned by Section 03's plan so Section 06's array-append and Section 07's
 * `affectedLedgers[]` derivation never drift). Character-activation's weak/
 * dormant signal feeds the EXISTING `character_agency_zero_decisions` kind
 * (not a new activation-specific kind name); world-rule `verdict: "revise"`
 * feeds the EXISTING `world_rules_undefined` kind.
 */
export const VD_QUALITY_LEDGER_KINDS: Record<
  string,
  | "evidenceLedger"
  | "characterActivationLedger"
  | "threatLadder"
  | "consequenceLedger"
  | "threadLedger"
  | "worldRuleLedger"
> = {
  evidence_orphaned: "evidenceLedger",
  evidence_no_resistance: "evidenceLedger",
  evidence_no_payoff: "evidenceLedger",
  character_agency_zero_decisions: "characterActivationLedger",
  threat_not_escalating: "threatLadder",
  antagonist_idle: "threatLadder",
  decision_without_consequence: "consequenceLedger",
  thread_stalled: "threadLedger",
  world_rules_undefined: "worldRuleLedger",
};

/* -------------------------------------------------------------------------- */
/* Story state (spec §5.3, 11 fields)                                        */
/* -------------------------------------------------------------------------- */

export const trustChangeSchema = z
  .object({
    characterA: z.string().min(1),
    characterB: z.string().min(1),
    change: z.string().min(1),
  })
  .passthrough();

export type VerticalDramaTrustChange = z.infer<typeof trustChangeSchema>;

export const emotionalResidueSchema = z
  .object({
    character: z.string().min(1),
    residue: z.string().min(1),
  })
  .passthrough();

export type VerticalDramaEmotionalResidue = z.infer<
  typeof emotionalResidueSchema
>;

export const verticalDramaStoryStateSchema = z
  .object({
    episode: z.number().int().positive(),
    knownByProtagonist: z.array(z.string().min(1)).default([]),
    knownByAudience: z.array(z.string().min(1)).default([]),
    knownOnlyByAntagonist: z.array(z.string().min(1)).default([]),
    evidenceGained: z.array(z.string().min(1)).default([]),
    evidenceLostOrDamaged: z.array(z.string().min(1)).default([]),
    trustChanges: z.array(trustChangeSchema).default([]),
    emotionalResidue: z.array(emotionalResidueSchema).default([]),
    threatLevel: z.number().min(1).max(5),
    unresolvedThreadIds: z.array(z.string().min(1)).default([]),
    requiredNextEpisodeResponse: z.string().min(1),
  })
  .passthrough();

export type VerticalDramaStoryState = z.infer<
  typeof verticalDramaStoryStateSchema
>;
