# Request

Improve Vertical Drama story generation so users do not need to understand or
manually restart repair steps. Plan/deep/script generation must automatically
repair continuity, dialogue, character knowledge, contradictory premise facts,
and repeated events; support 50-120 episode stories; preserve accepted work;
and finish with the best structurally complete story even when minor quality
warnings remain.

## Repository assumptions

- Existing durable story-generation jobs, checkpoints, completion contracts,
  long-form block planner, episode-memory ledger, and continuity repair loop
  are the integration points.
- Existing `needs_repair` states are useful diagnostics but must not be the
  normal terminal state for repairable story-quality findings.
- Security, tenant ownership, billing, corrupted state, and provider outages
  remain hard operational boundaries and must not be bypassed with invented
  content.

## Non-goals

- Do not rewrite unrelated dirty-worktree changes.
- Do not mutate existing series 53 or other persisted stories automatically.
- Do not deploy or run real provider/browser production smoke as part of this
  change.
