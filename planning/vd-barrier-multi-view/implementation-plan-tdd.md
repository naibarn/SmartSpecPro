# TDD Guidance

## Shared-first tests

1. Normalizer/validator accepts the inside/outside pair, rejects overlap, missing location, missing speaker side, and Caller conflict.
2. Legacy `barrierDialogue` projects to an incomplete multi-view configuration with the expected inside/outside refs.
3. Status derivation returns configured/start_ready/reference_ready/ready/stale deterministically.
4. Cut-plan builder maps dialogue windows to the explicit side map and preserves durations/line indexes.

## Server tests

1. Start-frame prompt receives only start-view refs/location and emits the stable inside label.
2. Reference-frame prompt receives only outside refs/location and emits the stable outside label.
3. `barrier_reference` links enforce tenant/user/episode ownership and idempotent uniqueness.
4. Video payload ordering is `[startFrame, barrierReference, genericRefs..., portraits..., locations...]` and fails closed when the first two cannot fit.
5. Consolidated speaker-switch prompt contains a complete timed barrier cut plan; unmapped speakers are rejected.
6. Regeneration preserves explicit view assignments but invalidates stale assets/prompts/QC.

## Client tests

1. Barrier section renders two labeled slots and does not render them as Caller.
2. Empty/configured/start-ready/reference-ready/ready/stale/loading/error states are visible and actionable.
3. A failed reference render leaves the successful Start frame and retries only the missing view.
4. Changing outside character/location marks the pair stale and prevents video generation until refreshed.

## Regression

- Existing generic supplementary reference-frame tests remain unchanged.
- Existing phone Caller tests remain unchanged and reject Barrier Multi-View role mixing.
- Existing speaker-switch/sub-shot tests continue to pass for non-barrier shots.
- `cmp -s` verifies paired skill files.
- Run `git diff --check` on focused files and a changed-file typecheck/targeted test set.
