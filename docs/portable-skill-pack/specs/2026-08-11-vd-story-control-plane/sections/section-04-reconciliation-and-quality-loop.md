# Section 04 — Evidence Reconciliation and Quality Loop

## Scope

เชื่อม script/storyboard, memory planner, deterministic ledgers และ semantic quality review ให้เป็น post-draft gate เดียว โดยแยก structural facts ออกจาก narrative judgment

## Owned files/modules

- `apps/web/server/services/verticalDramaQualityLedgerReconcile.ts`
- `apps/web/server/services/verticalDramaSeriesMemoryPlanning.ts`
- `apps/web/server/services/verticalDramaEpisodeQualityReview.ts`
- `apps/web/skills/vertical-drama-series-memory-planner/SKILL.md`
- `apps/web/skills/vertical-drama-episode-quality-review/SKILL.md`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` at the gate/persist boundary

## Reconciliation rules

The reconciler accepts only explicit action + registered ID + source episode/beat evidence. `resolve` without proof becomes `unproven_resolution`/`needs_repair`, never `resolved`. Missing opening, episode-specific fallback ID, or free-text hook becomes `legacy_unknown` observation unless a user-approved migration maps it. It separately validates the 9-shot duration vector, provider-supported values and derived render runtime; a duration mismatch is structural and must not be “repaired” by changing story meaning.

The reconciler detects unknown ID, silent drop, budget exceeded, overdue payoff, character role mismatch, romance phase gap and advantage streak without cost. It must preserve `parked`, `sequel_hook` and `legacy_unknown` statuses across passes. `open_threads` is projected from canonical state after reconciliation.

The memory planner observes actual episode facts, knowledge, trust, emotions and evidence. It may propose observations but does not create future plan or directly close a thread. Existing planner output remains compatible through an adapter that cannot promote fallback IDs.

## Semantic review

Extend the existing episode quality review with premise adherence, arc coherence, payoff quality, romance phase fit/chemistry, power-shift quality and canonical character consistency. The LLM decides whether a payoff or romantic beat is meaningful; deterministic facts are supplied as evidence and are not replaced by score arithmetic.

Allow at most one targeted repair using findings relevant to the current episode. A failed second review produces user review/arc proposal. Cross-episode changes use existing `arc_replan_proposal` and never mutate produced episodes.

## Boundary failures

Reuse existing auth/tenant ownership, model resolver, credits and rate limiter. On LLM/schema/credit/rate-limit failure, retain the prior state and expose retry/needs-review. At write time compare `sourceBreakdownVersionId`/active version and reject stale writes as conflicts, never last-write-wins. Add negative authorization tests.

## TDD stubs

- explicit action/evidence resolves correctly
- resolve without evidence is not resolved
- silent drop and unknown/fallback ID findings appear
- parked/sequel/legacy statuses survive reconciliation
- semantic reviewer does not directly mutate status
- one repair then user review
- stale-version, locked-episode and cross-tenant writes fail closed
- invalid duration profile, incomplete logical-shot vector and shot/render runtime mismatch produce focused structural findings
- provider, credit and rate-limit failures retain prior state

## Acceptance

No post-draft stage can silently manufacture a closure or silently drop a durable thread, while semantic review still has freedom to preserve the story's tone, chemistry and surprises.
