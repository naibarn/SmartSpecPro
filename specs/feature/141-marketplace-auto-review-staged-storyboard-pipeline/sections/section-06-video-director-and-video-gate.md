# Section 06 — Shot Video Director and per-shot video-prompt gate

## Purpose and scope

This section creates the second bounded skill. It authors exactly one video prompt
for one shot from the accepted image and approved story context, pauses for user
inspection, and submits video work only after the exact prompt checkpoint is
approved. A prompt retry never mutates an already submitted attempt and never
reruns unrelated shots.

Dependencies: Sections 01–03 and 05.

## Tests first

Write tests before implementation:

- skill bundle parity, schemas, references, manifest/lock, and verification tests;
- no Skill B invocation before `image_result` approval;
- Skill B input fixture contains the exact accepted image artifact/hash, shot
  brief, approved dialogue, ten-second duration, safety/claim context, and
  bounded continuity context;
- output fixtures cover valid one-shot prompt, malformed output, forbidden
  markers, dialogue rewrite, duration drift, safety failure, timeout, and one
  targeted repair maximum;
- a `video_prompt` checkpoint is created in `awaiting` with exact prompt, image
  source, dialogue, duration, model/provider, estimated cost, warnings, revision,
  and hash;
- no video provider task/reservation exists before matching prompt approval;
- stale revision, changed accepted-image hash, changed model/reference/cost/
  safety, duplicate approval, and prompt retry fail closed;
- retrying one shot does not rerun Skill B or provider work for other shots.

Suggested test locations:

- `apps/web/server/services/__tests__/marketplaceAutoReviewShotVideoDirector.test.ts`;
- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedVideoGate.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts`
  as a relevant existing prompt-contract regression suite.

## Implementation contract

### Files

- create `apps/web/skills/marketplace-auto-review-shot-video-director/` with
  `skill.md`, byte-identical `SKILL.md`, schemas, bounded references, and the
  skill-registry metadata required by the repository;
- create `apps/web/server/services/marketplaceAutoReviewShotVideoDirector.ts`;
- modify the `video_generation` branch in
  `apps/web/server/services/marketplaceAutoReviewService.ts`;
- reuse video prompt/media submission helpers in
  `apps/web/server/services/mediaGenerationService.ts` and provider capability
  checks in `apps/web/server/services/mediaProviderUtils.ts`;
- add the focused service tests above and router/UI contracts in Sections 02/08.

### Skill input/output

Input is one shot only: accepted image artifact/hash, approved shot brief and
dialogue, exact duration, safety/claim context, and bounded continuity facts.
Skill B must embed the approved dialogue and duration rather than rewrite them.
It must return one bounded prompt plus motion intent, warnings, and safe finish
reason. It may perform at most one targeted repair; raw provider diagnostics stay
restricted.

The output is reviewable text and does not authorize video provider work. Persist
the prompt artifact and compute its content hash against the accepted image hash,
shot revision, model/provider, ordered references, safety verdict, and estimated
video cost.

### Video prompt checkpoint and provider boundary

Create `video_prompt` in `awaiting` after validation. The UI projection shows the
exact prompt, accepted image, dialogue, duration, motion constraints, model,
estimated cost, warnings, revision, and hash indicator. `approveStagedCheckpoint`
rechecks all values and releases only that shot's video reservation/submission.

The worker invokes the Section 03 guard immediately before provider task creation.
If a prompt edit/retry occurs after approval, supersede the approval and prevent
mutation of an already submitted attempt. Provider callbacks are reconciled by
existing provider-event idempotency; timeout/rejection keeps the shot in a safe
retry/error state and never advances final assembly.

## Acceptance criteria

- Every shot's video prompt is independently inspectable and approvable.
- No video reservation/task exists without matching image-result and video-prompt
  evidence.
- Approved dialogue, duration, accepted image hash, and safety context are exact.
- Prompt retries and provider failures are shot-local, bounded, and idempotent.
- A provider capability mismatch stops safely before video spend.

## Handoff

Section 07 consumes only completed/accepted shot video evidence and determines
whether separate TTS/audio and final assembly checkpoints are required. Section 08
displays this checkpoint state without adding client-side authority.

## Implementation record

Added the per-shot `marketplace-auto-review-shot-video-director` skill bundle and
the typed Shot Video Director/compiler boundary. Video prompt content hashes
include the accepted image artifact hash, so an image change invalidates the
prompt approval. The staged worker creates the video prompt only after image
acceptance, requires a separate per-shot approval before video spend, submits
ten-second 9:16 video tasks with the accepted image reference, and persists
shot-local correction/retry state on provider failure.

Proof: prompt compiler/director tests and staged pipeline/guard suites; skill
bundle verification runs with `bash .../scripts/verify.sh`.
