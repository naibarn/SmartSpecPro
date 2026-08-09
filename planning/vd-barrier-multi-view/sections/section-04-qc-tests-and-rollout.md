# Section 04 — QC, Tests, and Rollout

## Ownership boundary

Own deterministic barrier readiness/QC, migration evidence, focused regression suite, feature flag/rollout proof, and final diff hygiene.

## Target areas

- frame/video safety QC contracts and router gates
- migration/status helpers
- shared/server/client tests
- paired skill files

## Acceptance

- Start view contains only inside characters/location.
- Reference view contains only outside characters/location.
- Pair is not ready when either asset is missing, stale, duplicate, or unlinked.
- Video generation is blocked with actionable errors for missing map/reference/capability.
- `cmp -s` passes for paired skills.

## Verification

Run focused Vitest, changed-file diagnostics/typecheck where possible, `git diff --check`, and record known repository-wide baseline failures separately. Preserve unrelated dirty worktree changes.
