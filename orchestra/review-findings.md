# Review findings

- Review round 1 (implementation + focused verification):
  - Confirmed the motion-prompt service compares every explicit speaker position
    anchor against `frame_analysis.people[].position`.
  - Confirmed an explicit contradiction is retried once with an authoritative
    position lock, then rejected before credit deduction/persistence if it remains.
  - Confirmed the quality judge receives the start frame plus the same labeled
    character portraits used by generation.
  - Verification: motion-prompt service 96/96; focused router suites 53/53;
    labeled-portrait judge regression passed; `git diff --check` passed.
  - Fixed during review: optional speaker access in the new position-map helper.
  - Remaining repository-wide typecheck/prettier noise is pre-existing or
    outside this focused change and is deferred without widening scope.
## Review round — Vertical Drama bulk prompt + image submission (2026-08-08)

- status: clean targeted conductor review
- scope: `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` plus focused flow test
- finding fixed: the client used a concurrent stale episode refetch as the prompt-ready gate; it now uses the prompt mutation response
- finding fixed: bulk image submission was fire-and-forget; it now awaits task admission and bounds non-scene bulk chains to three workers
- impact closure: server response contract already returns `prompt`; render route still reads the committed episode row; existing invalidation/polling paths remain intact
- verification: focused client flow test 4/4; scoped `git diff --check` passed
- residual baseline: full web typecheck and one existing server test remain nonzero outside this change

## Review round — shot summary sync + unrequested third-person fix (2026-08-08)

- status: clean targeted conductor review
- root cause: scene continuity included spatial layout, staging axis, and wardrobe from other shots at the same location, contradicting the shot's two-person reference manifest
- fix: preserve environment continuity, remove cast-bearing scene-wide fields, and emit an exact physical-cast lock for deterministic policy-safe prompts
- sync proof: episode edit calls the same canonical `updateEpisodeDraftShot` mutation as Overview and invalidates both episode-detail and series queries before closing the editor
- verification: focused UI/router/prompt suites 122/122; `git diff --check` passed; no touched-file TypeScript errors
- residual baseline: repo-wide typecheck and broader pre-existing prompt/P1 suites remain nonzero in unrelated dirty-worktree changes

## Review round — unselected roster character mentioned in synopsis (2026-08-08)

- status: clean targeted conductor review
- root cause: the exact-cast lock was present, but the positive synopsis still named an unselected roster character, giving the image model conflicting semantic evidence
- fix: query the tenant-series roster in the existing selected-identity lookup, subtract physical and screen-caller selections, redact excluded names/containing parentheticals, and fail before persistence if any excluded name remains
- safety: selected names are protected before redaction, including overlapping shorter names; negative-prompt storage remains unchanged
- verification: focused service/router suites 99/99; full web TypeScript passed; scoped `git diff --check` passed

## Review rounds — Dual View video-prompt readiness (2026-08-09)

- round 1 finding: validation used raw canonical display names, while view-side mapping and portraits use stable roster keys; fixed with fail-closed name/key resolution.
- round 1 finding: resolved keys were initially used only for validation; fixed so motion generation, speaker-to-face binding, and timed-cut planning use the same resolved keys.
- impact closure: single-frame shots retain their original requiredCharacterRefs path; Dual View now unions both view casts and includes both frame images.
- round 2 status: clean targeted conductor review; no material contract, persistence, auth, tenant, or schema issue found.
- fresh gates: focused Vitest 75/75, full web TypeScript pass, targeted diff check pass.
- residual: authenticated production browser smoke and deployment were not run; existing Radix dialog-description warnings remain unrelated.
## Round - 2026-08-09 - Dual View frame-scoped anchors

- changed surfaces reviewed: prompt schema/normalization, image manifest, single and speaker-switch generation, corrective retry, judged candidates, shared persisted contract, three paired skill families, focused regressions
- evidence reviewed: episode 135 clip 4 row, audit trace, red test, focused test output, repository-wide TypeScript diagnostics
- findings discovered: one in-scope nullable character-name type mismatch; one overly strict real-skill assertion; both fixed
- stale gates rerun: prompt service tests, real skill-file tests, shared Dual View tests, router video-prompt tests, judged generation tests, TypeScript diagnostic
- impact closure: no schema migration, auth, tenant isolation, render-provider, or paid generation changes; old clips remain readable because `viewRole` is optional
- deferred baseline: unrelated dashboard/chat/marketplace/Media History/worker TypeScript failures in the 429-file dirty worktree
- clean status: one clean targeted conductor review after final fixes; standard-light implementation-ready medium convergence criterion met
- stop reason: criteria passed

## Round - 2026-08-09 - Image 1/Image 2 prompt labels

- round 1 finding: the broader judge regression still expected the obsolete reference-frame label; updated the assertion to `Image 2`.
- round 2 status: clean; no obsolete prompt-facing View labels remain outside negative assertions.
- verification: focused seven-file suite 226/226, convergence suite 122/122, paired skill files byte-identical, scoped diff check clean.
- impact closure: internal `view_role` metadata and old persisted clips remain compatible; no migration or production mutation.
