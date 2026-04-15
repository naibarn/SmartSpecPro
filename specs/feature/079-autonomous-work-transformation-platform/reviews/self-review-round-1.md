# Self Review Round 1

Date: 2026-04-10
Mode: adversarial self-review
Artifact reviewed: `claude-plan.md`

## Findings

### 1. Persistence strategy was too ambiguous

The plan described a staged persistence idea, but an implementer would still have to guess whether workpacks should be first-class persisted entities or temporary projections over existing workflow/template records.

Applied fix:

- locked the first implementation toward dedicated persistence for core workpack lifecycle entities
- kept references to existing workflow/template/skill assets instead of duplicating runtime internals
- allowed connector/compiler details to remain version-scoped JSON where churn is expected

### 2. Router ownership was underspecified

The original draft referenced router extensions without clearly describing whether the feature should live inside `workflow.ts`, a new workpack router, or both.

Applied fix:

- clarified that `workflow.ts` keeps workflow-native responsibilities
- recommended a dedicated workpack lifecycle router for workpack-specific operations

### 3. Replay depth was not explicit enough

The plan called for replay and simulation but did not define what run data must exist to make replay useful in production.

Applied fix:

- added a replay-grade `workpack_run` ledger requirement
- specified planned steps, actual steps, side effects, approvals, artifact references, and connector response summaries as required replay evidence

## Regression check

Checked the modified sections against:

- `claude-spec.md`
- `claude-interview.md`
- `claude-research.md`
- `claude-plan-tdd.md`

Result:

- no contradiction with the Feature 080 boundary
- no contradiction with research-backed codebase fit
- TDD plan updated to mirror the stronger persistence, router, and replay decisions
