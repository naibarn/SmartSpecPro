# Implementation Plan

## Objective

Close the Work Request / Auto Team stabilization effort with a verifiable, shippable flow rather than continuing the repeated audit/fix loop.

The result is complete when the code supports the target flow, targeted regressions pass, and any remaining risks are explicitly documented as environment/manual-E2E limitations rather than unhandled code blockers.

## Current-Codebase Fit

The codebase already has the needed subsystems:

- Work OS request/case persistence
- Team room/run lifecycle
- Auto Team planning artifacts
- Runtime dispatch policy
- Skill registry and skill execution
- Agency runtime bridge
- Document management and RAG surfaces
- Media generation and internal media jobs
- Video composition/probe/final evidence pipeline
- Managed media access tokens

Therefore this plan does not add a new subsystem. It stabilizes the glue between them.

## Workstreams

1. **Plan and Evidence Contract**
   - Ensure plan/do/check semantics remain visible through runtime policy, validation state, evidence refs, and final review.
   - Confirm missing runtime policy and budget blockers are diagnosable.

2. **Launch and Team Room Integrity**
   - Ensure create/start is idempotent.
   - Ensure stale/missing/failed kickoff states recover or block clearly.
   - Ensure My Requests can find linked room/run/work item and final media evidence.

3. **Capability Execution**
   - Prefer selected capability over surface default.
   - Route skill, agency, document, media, video, and skill-creation fallback safely.
   - Keep explicit human approval gates.

4. **Media and Finalization**
   - Queue video clips from storyboard images.
   - Wait/retry on capacity.
   - Compose final video.
   - Probe duration/validity.
   - Final review and canonical evidence registration.
   - Automated dry-run covers this control flow without external media providers.

5. **Safety and Verification**
   - Enforce user-bound managed media tokens.
   - Keep budget reservations idempotent.
   - Provide a repeatable production readiness preflight for runtime config, media provider/model availability, and stuck async pipeline blockers.
   - Run typecheck and targeted regression tests.
   - Run full test suite if feasible; record blockers if unrelated failures appear.

## Acceptance Criteria

Functional:

- User can create/start a Work Request from one simple form.
- Request can auto-select or explicitly select a Team.
- Linked Team room/run is visible from My Requests.
- Existing launched automation is reused only when the Team run is active enough to continue.
- Failed/stopped kickoff does not masquerade as launched.
- Plan steps route through selected capability where available.
- Surface capability IDs with action suffixes, such as `video_editor:compose`, route through the intended surface instead of being treated as missing skills.
- Media/video steps wait on async work and resume.
- Paused async media pipelines resume through recovery even if an in-memory poll timer was lost.
- Final evidence is persisted and safely linkable.
- The final video control flow is covered by automated dry-run regression before manual provider E2E.
- Production readiness is machine-checkable with `npm --prefix apps/web run verify:auto-team-work-request`.

Safety:

- Tenant isolation is preserved.
- Managed media token subject must match session user.
- Media artifact registration must match the linked run, room, team, execution mode, and initiating user before mutating pipeline state.
- Budget reservation counters do not double count the same step/attempt.
- Explicit human approval requirements are not bypassed.
- Capacity/retry loops have limits.
- Duplicate active automation runs are guarded and audited.

Verification:

- `npm --prefix apps/web run check` passes.
- Targeted Work Request / Auto Team regression tests pass.
- Production readiness preflight exists and reports config/environment blockers with a non-zero exit code.
- Full `npm --prefix apps/web test` is attempted; if it fails, failures are classified as in-scope or unrelated.
- Final verification is recorded in `verification-results.md`.

## Stop Rule

After targeted verification passes and full-suite status is recorded, stop adding features. Only fix:

- in-scope test failures
- type errors
- security blockers
- blockers that prevent the target flow from completing
