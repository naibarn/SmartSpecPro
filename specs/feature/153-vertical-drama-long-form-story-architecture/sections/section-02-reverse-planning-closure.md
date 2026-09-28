# Section 02 — Reverse planning, arcs, threads, and finale dependencies

## Scope

Build blueprint planning over the existing story design/control and quality
ledgers. Reverse-plan the terminal episode, central mystery evidence chain,
thread/consequence windows, and protagonist/antagonist advantage schedule.

## Owned paths

- `apps/web/shared/verticalDramaSeries/draftStoryDesign.ts`
- `apps/web/shared/verticalDramaSeries/storyControl.ts`
- `apps/web/shared/verticalDramaSeries/qualityLedgers.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- new planner/closure service under `apps/web/server/services/`

## Design

Reverse planning must allocate relationship reveals and family/faction
consequences alongside mystery evidence and payoff windows. Every planned
relationship edge has a stable ID, evidence, disclosure window, and dependent
episode/block; a late guest or presumed-dead return is admitted only when this
schedule explains its causal role.

The planner can ask the existing architecture skill for proposals, but Node
normalizes IDs, intervals, evidence refs, ownership, costs, and closure policy.
No thread enters a strict plan without a payoff/closure decision. A late guest
is planned as a lifecycle row and cannot be invented by the episode author.

Reverse planning also emits an engagement-health schedule: expected hook type,
reversal shape, antagonist tactic, dominant location, and agency owners per
episode/block. Repetition and low-novelty thresholds are checked across the
whole horizon so long-form expansion does not become a loop of locally valid
episodes.

## TDD acceptance

- An episode-1 clue can be traced to a terminal reveal and consequence.
- A new orphan thread, idle thread, duplicate payoff, or missing cost blocks.
- Advantage beats alternate sides with explicit costs/responses.
- Each arc has entry/exit state and a valid block partition.

## Dependencies and proof

Depends on Section 01. Add pure planner/closure fixtures before invoking paid
LLM calls. Reuse existing `reconcileLedgers` findings rather than duplicate
local checks.

## UI/UX Contract

### Target User / JTBD

N/A — planner/closure service; diagnostics are Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — findings are consumed by the server status contract.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — pure/service proof is sufficient for this section.

## Implementation notes

`verticalDramaLongFormPlanner.ts` now builds deterministic 120–1000 episode
chunks, arc/block intervals, mystery evidence dependencies, thread payoff
windows, and advantage/cost beats before authoring.
