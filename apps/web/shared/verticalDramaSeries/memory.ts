/**
 * Vertical Drama Series — Long-series memory contracts (spec §7.6, §7.3).
 *
 * Memory writes are append-only events plus a refreshed compacted summary.
 * Retcons are explicit proposals; approved retcons append NEW events and never
 * mutate prior events in place. Pure field-only types + pinned defaults.
 */

/**
 * Append-only memory event kinds. The full enum must be represented verbatim,
 * including `retcon_proposal` (spec §7.6).
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
  | "retcon_proposal";

/** All nine memory kinds, ordered, for validation and UI enumeration. */
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
