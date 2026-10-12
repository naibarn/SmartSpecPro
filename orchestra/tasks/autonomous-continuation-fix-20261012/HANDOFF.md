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

- Policy fix commit `cc468980fc41c29ba7ee107e25af56e34e2a231b` merged through PR #872 at canonical SHA `bf4e30cfd6868c47ab7d9f8a3edacc0ab28f1899`; fetched `origin/main` equals that SHA and the merge is an ancestor. `progressive_integration_gate` passed; PR Preview `build-preview` was `SKIPPED`.
- Confirmed PR #852 is merged at `f78fdf70a2153338c00b08faeb81ac4ce3d9eb3e`; canonical Main has since advanced to `c9adedbe3d543e4872635cfa17af653871a9256d`.
- Confirmed policy previously required a valid `completion_predicate` and fresh per-unit evidence before a READY unit could start. Resume additionally required the entire capsule SHA and global evidence freshness to match.
- Focused regression suite passes for READY-without-final-proof, waiting external authority with independent READY work, Main SHA change, retained completed history, and pending PR checks.
- SPEC-308 exact-Main build is currently resource-blocked by the fresh user-slice observation: `memory.current=17,559,109,632`, `memory.high=19,327,352,832`, `memory.max=21,474,836,480`; only about 1.65 GiB remains below `memory.high`, below the build script's 6 GiB admission requirement. Do not retry until a fresh observation changes.
- SPEC-224 M6/M7 remains waiting on its exact authorized non-production Runner/grant predicate in the existing canonical HandOff. No production-bound Runner or production database was used.

## Next executable action

Reconcile current Main and the SPEC-308 / SPEC-224 canonical handoffs against the verified `bf4e30cfd6868c47ab7d9f8a3edacc0ab28f1899`. Retry the SPEC-308 canonical build only after a fresh resource observation meets admission; meanwhile resume the next independent P1 implementation WorkUnit and update its existing owner HandOff. Keep PR #872 as merged; do not replay it.

## Remaining scope

- Policy regression fix is complete and integrated at `bf4e30cfd6868c47ab7d9f8a3edacc0ab28f1899`.
- Reconcile SPEC-308's existing manifest against the merged Main SHA, then build after resource admission and continue only through an authorized development tenant/runtime path.
- Continue SPEC-224 work that does not require the protected Runner; leave M6/M7 waiting for real external authority.
- Preserve completed WorkUnit evidence and do not replay merged work.
