# Vertical Drama deep-generate continuity recovery

## Objective

Prevent Premium deep story generation from losing canonical thread IDs between chunks, detect overdue continuity threads before the season-boundary failure, and recover a failed full-season job without fabricating story resolutions.

## Design

The Premium pipeline will carry a structured set of currently open canonical thread IDs through fan-out, judge, revise, and missing-episode recovery calls. The set is updated only from accepted episode-memory output and is persisted in the existing job checkpoint.

Continuity validation will remain fail-closed. A thread whose `expectedResolutionEpisode` is at or before the current episode must either be resolved by its exact ID or be explicitly classified as a season carry-over. No deterministic code will invent a resolution. A bounded repair pass may ask the model to return complete episode-memory corrections using the canonical IDs; the result is accepted only after the pure validator passes.

Failed jobs retain their checkpoint and become repairable. Recovery validates the complete candidate in memory before writing the bible or series memory. Existing episode summaries and media artifacts are not overwritten during a failed repair.

## Recovery of series #25

The existing Redis checkpoint contains all 15 drafted episodes. The recovery flow will use that checkpoint as input, repair only continuity metadata, validate the complete season, and then persist the bible/memory atomically. If validation remains unsatisfied, no production data is changed and the remaining exact thread IDs are reported.

## Non-goals

- Do not auto-resolve a thread based only on its expected episode.
- Do not retry Premium generation without a bounded attempt limit.
- Do not mutate unrelated dirty-worktree files or existing media artifacts.

## Acceptance criteria

1. Premium chunk N+1 receives canonical IDs opened by chunk N.
2. An overdue unresolved thread is reported before the final season boundary.
3. A repair that cannot pass validation leaves the original persisted data unchanged.
4. Series #25 is either recovered from its checkpoint or left unchanged with an exact actionable report.
5. Focused continuity, deep-draft, recovery, and diff checks pass.
