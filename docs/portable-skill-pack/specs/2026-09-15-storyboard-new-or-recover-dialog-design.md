# Storyboard New-or-Recover Entry Guard

**Date:** 2026-09-15  
**Status:** Approved and implemented locally  
**Scope:** Skill Framework storyboard entry and recovery projection

## Goal

When a user opens `/storyboard-review/new/skill-framework`, do not silently
hydrate a previous run from browser storage. The user must clearly choose
whether to create a new storyboard or load an unfinished run. A cancelled run
is terminal user-declined work and must not be offered as repairable work.

## Design

- The page starts with no selected run. The previous local-storage value is
  only a stale locator and is never enough to render a review panel.
- The server recovery list remains authoritative. It excludes terminal domain
  runs and canonical jobs in `succeeded`, `cancelled`, or `expired` states.
- If recoverable runs exist, an entry dialog lists them and offers explicit
  `Create new storyboard` and per-run `Load` actions.
- Choosing a new storyboard clears the locator and selected-run state. The
  review panel is rendered only when the returned run ID matches the current
  active run ID, preventing React Query data from an older run appearing while
  the new query is loading.
- Choosing an existing run sets that run as the active locator. Cancellation
  remains idempotent and removes the run from the recovery list; its completed
  artifacts can still be opened from Storyboard history.

## Verification

- Pure client recovery helpers cover cancelled domain runs, cancelled
  canonical jobs, expired jobs, and active runs.
- Focused Storyboard Skill Framework contract tests remain green.
- The full TypeScript check is intentionally not run because of the repository
  RAM constraint.
