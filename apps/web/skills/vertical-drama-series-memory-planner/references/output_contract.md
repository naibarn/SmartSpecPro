# Output Contract — Vertical Drama Series Memory Planner

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: canonical_facts, prior_episode_summaries, unresolved_hooks, resolved_hooks, relationship_state_changes, character_emotional_state, product_tie_in_history, continuity_risks, episode_recap, memory_compaction_summary, contract_version.

All outputs are structured JSON; free-form prose only inside named string fields.
