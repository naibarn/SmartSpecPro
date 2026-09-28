# Section 04 — Story Arc Planner and story approval gate

## Purpose and scope

This section replaces the unbounded Feature 136 monolithic authoring call for
new v2 runs with a bounded Story Arc Planner. It produces one reviewable story
artifact: exactly nine ten-second Thai shot briefs for a 90-second product-review
video. The user must approve the story plan before prompt compilation is
released. Story approval does not approve any image, video, audio, or render
provider task.

Dependencies: Sections 01–03.

## Tests first

Write these before the skill or runner changes:

- skill bundle parity tests confirm `skill.md` and `SKILL.md` are byte-identical
  and required schemas/references are present;
- valid, malformed, oversized, missing-shot, duplicate-shot, unsafe-claim,
  speech-overrun, reference-conflict, continuity, and forbidden-marker fixtures;
- strict structured-output capability tests prove unsupported routes fail closed
  or use the approved bounded fallback, with `require_parameters` behavior
  represented in provider-contract fixtures;
- one targeted repair maximum, distinct finish-reason/error/credit trace, and
  idempotent operation fixtures;
- output validation creates a story artifact and `story_plan` checkpoint in
  `awaiting` state;
- worker advancement, prompt compilation, image task creation, and media ledger
  assertions remain absent until the story checkpoint is approved;
- story edit and text-only redraft supersede the old plan revision and preserve
  immutable history.

Suggested test locations:

- `apps/web/server/services/__tests__/marketplaceAutoReviewStoryArcPlanner.test.ts`;
- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedStoryGate.test.ts`;
- `apps/web/skills/marketplace-auto-review-story-arc/verify.py` or the repository
  skill verification convention, if a verification script is required by the
  skill registry.

## Implementation contract

### Files

- create `apps/web/skills/marketplace-auto-review-story-arc/skill.md` and
  byte-identical `SKILL.md`;
- add `input.schema.json`, `output.schema.json`, and `ui.schema.json` using the
  conventions of `apps/web/skills/product-review-sequential-storyboard/`;
- add bounded references/fixtures and the required manifest/lock metadata used by
  the repository skill registry;
- add `apps/web/server/services/marketplaceAutoReviewStoryArcPlanner.ts` as the
  typed runner/validator boundary;
- add the two focused service tests above;
- route the v2 `concept_story` branch from
  `apps/web/server/services/marketplaceAutoReviewService.ts`.

### Input and output

Input is a bounded envelope containing normalized product evidence, selected
claims, reference roles, creative settings, safety/age policy, audio strategy,
and the exact nine-by-ten-second contract. Product facts and references are
system-controlled; the model may propose story structure and motion intent but
cannot invent product claims or replace evidence roles.

Output contains a story summary, continuity, product-presence decisions, claim
trace, reference roles, motion intent, exact duration, continuous Thai dialogue,
warnings, and a safe finish reason. It must be strict, schema-valid, bounded,
and free of internal directives/provider error bodies.

Validate claim support, reference mapping, safety, speech fit, continuity,
forbidden markers, shot count, and duration deterministically. Allow at most one
targeted repair. Persist raw diagnostics only in restricted artifacts and expose
typed safe projections to the UI.

### Gate transition

On valid completion, persist the Story Arc response, normalized evidence, and
safe plan projection, create/update `story_plan` as `awaiting`, and set the
v2 run at `concept_story/awaiting_story_plan_review`. The legacy API-compatible
projection may use `awaiting_plan_review`, but the v2 story checkpoint is the
authoritative state.

`approveStagedCheckpoint` for `story_plan` must validate the current plan
revision/hash/actor/state digest in one transaction. On approval, release only
deterministic prompt compilation for that plan revision. Do not enqueue image,
video, audio, render, or library-finalize work in the approval mutation.

Story edits may change only approved editable story fields such as story summary,
motion intent, and dialogue. Product facts, selected claims, shot count,
duration, product presence policy, and reference roles require redraft/revalidation.
Every edit creates a revision and supersedes all unstarted downstream state.

## Acceptance criteria

- A valid v2 run always pauses at story review before image-prompt work.
- Invalid or unsafe output cannot produce a prompt checkpoint or media task.
- Text-credit use is traced separately from downstream media credit release.
- Story approval is durable, idempotent, revision-bound, and survives reload.
- Legacy Feature 136 authoring and plan-review behavior remain untouched.

## Handoff

Section 05 consumes the immutable approved story summary and plan revision to
compile exact per-shot image prompts. It must block if this section's story
checkpoint is not approved or has been superseded.

## Implementation record

Added the bounded deterministic Story Arc Planner fallback with exact nine-shot,
ten-second validation, product/reference grounding, continuous Thai dialogue,
safe plan projection, revisioned redraft, and the dedicated
`marketplace-auto-review-story-arc` skill bundle (mirrored `skill.md`/`SKILL.md`,
schemas, lock, and verifier). The runtime pauses at `story_plan=awaiting` before
any image prompt or media provider work. The fallback is deliberate while the
provider-backed structured Story Arc invocation remains an operational follow-up;
its output still has the same mandatory human checkpoint.

Proof: planner/pipeline focused tests and `bash
apps/web/skills/marketplace-auto-review-story-arc/scripts/verify.sh`.
