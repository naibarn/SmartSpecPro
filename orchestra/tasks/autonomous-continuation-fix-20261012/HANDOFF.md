# Autonomous continuation regression fix — 2026-10-12

## Current operation

Repair existing WorkUnit selection and resume policy so execution readiness is not gated by completion evidence or a stale capsule-wide SHA flag. Continue independent development while SPEC-224 M6/M7 and SPEC-308 hosted acceptance wait on their exact external/resource predicates.

## Ownership and source

- WorkUnit: `WU-AUTONOMOUS-CONTINUATION-ELIGIBILITY`
- Owner: `/root` (current Codex task)
- Workspace: `/mnt/SmartSpecDev/worktrees/autonomous-continuation`
- Branch: `codex/autonomous-continuation-20261012`
- Source Main SHA at start: `c9adedbe3d543e4872635cfa17af653871a9256d`
- Current section: execution eligibility / resume reconciliation

## Last completed checkpoint

- Confirmed PR #852 is merged at `f78fdf70a2153338c00b08faeb81ac4ce3d9eb3e`; canonical Main has since advanced to `c9adedbe3d543e4872635cfa17af653871a9256d`.
- Confirmed policy previously required a valid `completion_predicate` and fresh per-unit evidence before a READY unit could start. Resume additionally required the entire capsule SHA and global evidence freshness to match.
- Focused regression suite passes for READY-without-final-proof, waiting external authority with independent READY work, Main SHA change, retained completed history, and pending PR checks.
- SPEC-308 exact-Main build is currently resource-blocked by the fresh user-slice observation: `memory.current=17,559,109,632`, `memory.high=19,327,352,832`, `memory.max=21,474,836,480`; only about 1.65 GiB remains below `memory.high`, below the build script's 6 GiB admission requirement. Do not retry until a fresh observation changes.
- SPEC-224 M6/M7 remains waiting on its exact authorized non-production Runner/grant predicate in the existing canonical HandOff. No production-bound Runner or production database was used.

## Next executable action

Run the fast gate on the owned diff, commit and open a normal non-force PR. Track exact-head checks and merge outcome; continue any independent ready WorkUnit while checks run. After merge, record the actual canonical SHA. Retry SPEC-308 canonical build only after a fresh resource observation meets admission; meanwhile resume an independently ready implementation WorkUnit not requiring the protected Runner and update its existing owner HandOff.

## Remaining scope

- Merge this policy fix through the normal PR path and verify the merge SHA on `origin/main`.
- Reconcile SPEC-308's existing manifest against the merged Main SHA, then build after resource admission and continue only through an authorized development tenant/runtime path.
- Continue SPEC-224 work that does not require the protected Runner; leave M6/M7 waiting for real external authority.
- Preserve completed WorkUnit evidence and do not replay merged work.
