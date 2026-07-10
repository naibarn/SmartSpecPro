/**
 * Vertical Drama Series — Long-series memory contracts (spec §7.6, §7.3).
 *
 * Memory writes are append-only events plus a refreshed compacted summary.
 * Retcons are explicit proposals; approved retcons append NEW events and never
 * mutate prior events in place. Pure field-only types + pinned defaults.
 */

/**
 * Append-only memory event kinds. The full enum must be represented verbatim,
 * including `retcon_proposal` (spec §7.6). `arc_replan_proposal` /
 * `arc_replan_applied` (added 2026-07-07, spec §7.7.3/section-13) are the
 * FORWARD-facing mirror of `retcon_proposal`: a retcon corrects the recorded
 * past, an arc re-plan proposes changing the planned future (future,
 * non-produced `episodeBreakdown` entries only). See
 * `server/services/verticalDramaArcReplan.ts` for the deterministic drift
 * detector + proposal builder that produces these events' payload shape
 * (`VerticalDramaArcReplanProposal`, `@shared/verticalDramaSeries/contentBudget`).
 */
export type VerticalDramaMemoryKind =
  | "canonical_fact"
  | "episode_summary"
  | "character_delta"
  | "relationship_delta"
  | "hook_opened"
  | "hook_resolved"
  | "product_tie_in_usage"
  | "continuity_warning"
  | "retcon_proposal"
  | "arc_replan_proposal"
  | "arc_replan_applied"
  /**
   * Feature 132 §5.3 (F132B, ledgers-and-story-state, added 2026-07-09) —
   * a typed per-episode story-state snapshot (spec §5.3), gated by the
   * `verticalDramaQualityLedgers` tenant flag. TypeScript-level addition
   * only — `vertical_drama_memory_events.memoryKind` is a free-form
   * `varchar(40)`, not a DB enum, so this requires zero migration (see
   * `server/services/verticalDramaSeriesMemoryPlanning.ts`'s doc comment).
   */
  | "story_state";

/** All twelve memory kinds, ordered, for validation and UI enumeration. */
export const VERTICAL_DRAMA_MEMORY_KINDS: readonly VerticalDramaMemoryKind[] = [
  "canonical_fact",
  "episode_summary",
  "character_delta",
  "relationship_delta",
  "hook_opened",
  "hook_resolved",
  "product_tie_in_usage",
  "continuity_warning",
  "retcon_proposal",
  "arc_replan_proposal",
  "arc_replan_applied",
  "story_state",
] as const;

/**
 * Controls how compact series memory is assembled into episode prompts (spec §7.3).
 * Defaults are pinned so retrieval is deterministic and token-bounded.
 */
export type VerticalDramaMemoryRetrievalPolicy = {
  includeCanonicalFacts: true;
  includeLastEpisodeCount: number; // default 3
  includeOpenHooks: true;
  includeResolvedHookLookbackCount: number; // default 10
  includeCharacterState: true;
  includeProductTieInHistory: true;
  maxPromptTokens: number;
  compactionStrategy: "rolling_summary_plus_events";
};

/** Pinned default retrieval policy (spec §7.3 / §7.6). */
export const VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT: VerticalDramaMemoryRetrievalPolicy = {
  includeCanonicalFacts: true,
  includeLastEpisodeCount: 3,
  includeOpenHooks: true,
  includeResolvedHookLookbackCount: 10,
  includeCharacterState: true,
  includeProductTieInHistory: true,
  maxPromptTokens: 4000,
  compactionStrategy: "rolling_summary_plus_events",
};

/**
 * A single append-only memory event row (durable, never mutated in place).
 * `retcon_proposal` events require user approval; approval appends new events.
 */
export type VerticalDramaMemoryEvent = {
  memoryEventId: string;
  seriesId: string;
  episodeId?: string;
  runId?: string;
  memoryKind: VerticalDramaMemoryKind;
  /** Guide-compatible payload; snake_case-preserving unknown fields round-trip. */
  payload: Record<string, unknown>;
  summaryText?: string;
  /** For retcons: the prior event(s) this proposal supersedes (never overwrites). */
  supersedesEventIds?: string[];
  approved?: boolean;
  approvedByUserId?: string;
  createdAt: string;
};
