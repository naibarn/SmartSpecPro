# Feature 141 — staged Marketplace Auto Review implementation plan

Status: implementation planning ready; implementation not started
Source: `spec.md` v1.3.0 plus the mandatory per-stage human-approval decision
Review mode: self-review

## 1. Outcome and non-negotiable product rule

Build a new `staged_two_skill_v2` branch for new Marketplace Auto Review
sequential runs. It replaces the Feature 136 monolithic authoring path with:

1. Story Arc Planner → user reviews/approves the story.
2. Deterministic per-shot image prompt compilation → user reviews/approves each
   exact image prompt.
3. Image generation and QA → user accepts/rejects each generated image.
4. Shot Video Director → user reviews/approves each exact video prompt.
5. Separate TTS/audio plan, when selected → user approves before audio spend.
6. Final ordered assembly → user approves before paid render/library-finalize work.

No image, video, audio, or render provider reservation/submission may occur unless
the immediately preceding checkpoint is durably approved for the exact content
hash, revision, model, ordered references, safety verdict, and estimated cost.
Approval of one shot never approves another. Browser state and an old approval
boolean are not sufficient evidence; the worker must re-check the checkpoint just
before provider submission.

Text LLM calls that produce the story or a reviewable video prompt may consume text
credits before the user sees their output. The hard spend boundary applies to the
next media stage, not to the authoring call that creates the reviewable artifact.

## 2. Current baseline and compatibility boundary

The current checkout has a working legacy plan-review gate, verified by the focused
baseline of four test files and 130 passing tests. It holds the existing run at
`image_generation` using `statusDetail.state=awaiting_plan_review`,
`metadataJson.planReview`, and a blocked stage while the run remains `running`.

The checkout does not yet contain the v2 architecture flag, v2 skill bundles,
`StoryArcPlanV1`, v2 checkpoint mutations, or v2 dispatch. The current legacy path
still uses `buildGatewayCreativeAutoReviewPlan`,
`rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`, and
`runSequentialPromptPlanStage`.

Compatibility rules:

- Apply v2 only to new sequential runs selected by a new feature flag.
- Freeze `planningArchitecture=staged_two_skill_v2` and its version in run metadata
  at creation. Resume/retry/redraft dispatches from persisted architecture, never
  the current flag.
- Keep Feature 136 runs, 3x3/start-stop runs, and the existing legacy gate on their
  current path. No silent fallback from v2 to Feature 136 and no silent conversion
  of legacy runs.
- Preserve the current render, library-finalize, Storyboard Review, Video Editor,
  lease, outbox, attempt, provider-event, and artifact infrastructure.

## 3. Target architecture and state contract

### 3.1 Existing persistence surfaces to reuse

Use the existing tables in `apps/web/drizzle/schema.ts`:

- `marketplaceAutoReviewRuns`: owner/tenant, lifecycle, stage, idempotency, and
  architecture metadata;
- `marketplaceAutoReviewStages`: unique stage rows and durable stage status/output;
- `marketplaceAutoReviewRunLeases`: worker ownership, heartbeat, expiry, and
  recovery;
- `marketplaceAutoReviewStageAttempts`: attempt key/number, reason code, credit,
  provider, artifact, and evidence refs;
- `marketplaceAutoReviewOutboxJobs`: durable operations with unique idempotency;
- `marketplaceAutoReviewProviderEvents`: callback replay and reconciliation;
- `marketplaceAutoReviewArtifacts`: trace/prompt/manifest/projection artifacts with
  content hashes and per-run uniqueness.

Do not add a parallel operation/checkpoint table in the first implementation. Store
the compact checkpoint state in staged metadata and link full evidence through stage
attempts/outbox/artifacts. Add an additive migration only if a concrete query or
concurrency requirement cannot be represented safely in existing JSON/table fields.

### 3.2 Canonical v2 metadata

The implementation must establish one authoritative shape with:

- `planningArchitecture: "staged_two_skill_v2"`;
- `planningArchitectureVersion: 1`;
- `humanApprovalPolicy: "all_checkpoints_required"`;
- `planReview` compatibility envelope containing status, plan revision,
  approved revision, redraft count, and last operation ID;
- `stagedSequentialStoryboard` containing the authoritative story plan, state,
  reference manifest, per-shot records, hashes, media task IDs, and checkpoints.

`stagedSequentialStoryboard.storyPlanStatus` is the v2 plan-state authority.
`statusDetail.state=awaiting_plan_review` and `metadataJson.planReview` remain the
legacy API-compatible gate projection where existing consumers require it; they
must not become a second v2 state machine.

### 3.3 Checkpoint record

Each `HumanApprovalCheckpointV1` record contains:

- stable checkpoint ID and kind: `story_plan`, `image_prompt`, `image_result`,
  `video_prompt`, `audio_plan`, or `final_assembly`;
- run/shot scope and shot ID;
- state: `not_ready`, `awaiting`, `approved`, `rejected`, or `superseded`;
- revision and content hash;
- approved hash, approving user, timestamp, rejection reason;
- one-use consumption evidence (`consumedAt`, `consumedByOperationId`) while the
  checkpoint remains `approved`; consumed evidence blocks reuse;
- estimated credits;
- approved model, provider, safety verdict, and ordered reference-manifest hash
  in the associated evidence/artifact record.

Approval is consumed once by immutable consumption evidence, not by adding a
second checkpoint state. A prompt edit, model change, reference change, cost
change, safety recheck, retry, or downstream invalidation creates a new revision
and supersedes the previous approval.

### 3.4 Operation and API contract

Implement the following architecture-aware procedures in
`apps/web/server/routers/marketplaceCapture.ts`, backed by transaction helpers in
`apps/web/server/services/marketplaceAutoReviewService.ts`. The exact names may
follow the repository's router convention, but the input/output and server
guards are part of this plan:

| Procedure | Required input | Server result |
|---|---|---|
| `getStagedAutoReviewCheckpointState` | `runId`, authorized caller | Safe summary/heavy projection with current `stateDigest`; never raw artifacts. |
| `editStagedShot` | `runId`, `shotId`, editable fields, expected `planRevision`/`stateDigest`, idempotency key | New revision plus invalidated downstream checkpoints; no provider task. |
| `approveStagedCheckpoint` | `runId`, checkpoint ID, expected revision/hash/model/reference/cost/safety, idempotency key | One immutable approval operation and the next gated transition only. |
| `rejectStagedCheckpoint` | `runId`, checkpoint ID, reason code, expected revision/digest, idempotency key | Rejection/invalidation scope and a pollable correction state; no provider task. |
| `acceptStagedImage` | `runId`, `shotId`, image artifact ID/hash, expected revision/digest, idempotency key | Shot-local `image_result` approval evidence and video-prompt eligibility. |
| `retryStagedShot` | `runId`, `shotId`, retry reason, expected revision/digest, idempotency key | New shot attempt with downstream state reset only for that shot. |

Each mutation returns `{ operationId, runId, stateDigest, planRevision, status }`
and returns before provider completion. Authorization, tenant ownership,
architecture version, cancellation, revision/hash matching, and idempotency are
checked in one database transaction. Worker code must call the same checkpoint
guard after claiming the outbox job and immediately before creating a provider
task; router-side approval alone is not a spend authorization.

## 4. End-to-end gated workflow

| Stage/substate | Work performed | Mandatory user gate | What the gate releases |
|---|---|---|---|
| `concept_story` / `awaiting_story_plan_review` | Story Arc Planner call, strict validation, safe projection, text diagnostics. | Review nine-shot story, dialogue, claims, references, duration, warnings. | Prompt compilation for this plan revision. |
| `prompt_plan` / `awaiting_image_prompt_review` | Deterministic synopsis-direct prompt and reference manifest per shot. | Review exact prompt, reference mapping, product clause, model/attachment summary, estimated image cost. | Image reservation/submission for that shot only. |
| `image_generation` / `awaiting_image_result_review` | Generate and QA one approved shot image. | Inspect image, hard product-fidelity findings, continuity, warnings, downstream cost. | Shot Video Director invocation. |
| `video_generation` / `awaiting_video_prompt_review` | Invoke Skill B against the accepted image and validate bounded prompt. | Review exact video prompt, dialogue, duration, motion, cost. | Video reservation/submission for that shot only. |
| `audio_generation` / `awaiting_audio_plan_review` | Resolve dialogue, voice, timing, and TTS parameters when separate audio is selected. | Review transcript/voice/model/timing/cost. | Separate audio provider request. |
| `video_edit`/`render`/`library_finalize` / `awaiting_final_assembly_review` | Build ordered media/timeline/package summary and final QA evidence. | Review shots, clips, audio, subtitles/overlays, warnings, render/publish cost. | Paid render and library-finalize work. |

The worker may process independently approved shots, but each shot checkpoint is
independent and persisted. An explicit “approve all visible” action is allowed
only if it writes one approval record per item and atomically fails when any item
has a stale revision/hash.

Rejection behavior:

- Story: edit source text or request bounded text-only redraft; no media spend.
- Image prompt: edit the source shot summary or request recompile/redraft; never
  submit a stale or arbitrary prompt override by default.
- Image result: accept only a valid image or an explicit allowed-warning override;
  hard product mismatch cannot be overridden. Otherwise regenerate that shot.
- Video prompt: edit/revalidate bounded prompt or rerun Skill B; no video provider
  call while rejected.
- Audio/final assembly: return only the affected downstream stage to review; do
  not silently render a different revision.

## 5. Implementation waves (TDD-first)

### Wave 0 — contract fixtures and regression harness

Files:

- `apps/web/shared/marketplaceAutoReview/contracts.ts`;
- `apps/web/shared/marketplaceAutoReview/stagedContracts.ts`;
- `apps/web/shared/marketplaceAutoReview/stagedFixtures.ts`;
- `apps/web/shared/__tests__/marketplaceAutoReviewStagedContracts.test.ts`;
- `specs/feature/141-marketplace-auto-review-staged-storyboard-pipeline/fixtures/`
  (versioned corpus manifest and safe fixture metadata);
- existing legacy gate test files as regression targets.

Tests first:

- validate checkpoint schema, state transitions, required fields, hash/revision
  matching, and no implicit bulk approval;
- validate exactly nine shots, ten seconds each, 90 seconds total;
- validate safe reason-code serialization and forbidden-marker rejection;
- keep the existing four-file legacy gate command green.

Deliverable: shared types/validators and fixture contracts with no runtime routing
change.

### Wave 1 — flags, architecture dispatch, and durable operation boundary

Files:

- `apps/web/shared/featureFlags.ts`;
- `apps/web/server/services/marketplaceAutoReviewService.ts`;
- `apps/web/server/routers/marketplaceCapture.ts`;
- outbox/lease/attempt helpers in `apps/web/server/services/marketplaceAutoReviewService.ts`;
- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedArchitecture.test.ts`;
- `apps/web/server/routers/__tests__/marketplaceCapture.stagedCheckpoint.test.ts`;

Implement:

- add `marketplaceStagedSequentialStoryboardV2` and gated live-smoke flag,
  defaulting both off;
- snapshot the architecture flag at start and persist the version before any
  worker authoring;
- dispatch all start, resume, redraft, retry, worker, and recovery paths by the
  persisted architecture;
- introduce durable operation inputs: run ID, checkpoint/shot scope, expected
  revision, state digest, idempotency key;
- return an operation ID before provider execution for start/redraft/approval/
  rejection/retry mutations;
- add server-side ownership/tenant/product authorization and fail-closed wrong-
  architecture handling;
- preserve the legacy `awaiting_plan_review` implementation unchanged for v1.

Tests first:

- flag allowlist/default tests;
- start snapshots flag/architecture once;
- v2 negative-call tests prove no Feature 136 authoring function is called;
- legacy resume tests prove the old path remains selected;
- duplicate request returns the same operation and does not enqueue twice;
- stale revision, wrong owner, cancelled run, and wrong architecture fail without
  partial writes.

### Wave 2 — checkpoint state machine and provider spend guard

Files:

- `apps/web/server/services/marketplaceAutoReviewService.ts`;
- `apps/web/shared/marketplaceAutoReview/contracts.ts`;
- `apps/web/server/routers/marketplaceCapture.ts`;
- `apps/web/drizzle/schema.ts` only if additive indexes/fields are proven needed;
- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedCheckpointGuard.test.ts`;
- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedSpendInvariant.test.ts`;

Implement:

- persist and project checkpoint state for all required checkpoint kinds;
- expose architecture-aware query plus checkpoint approve/reject/edit operations;
- require matching content hash, plan/shot revision, model, ordered references,
  safety verdict, and estimated credits;
- re-check checkpoint immediately before reservation/submission in image, video,
  audio, and render paths;
- record one-use consumption evidence once and supersede the approval on any
  downstream revision;
- persist approval operation, actor, time, checkpoint artifact, and attempt refs;
- add safe reason codes for missing, stale, consumed, or invalidated approval;
- prevent pre-approval image/media ledger rows, tasks, and provider submissions.

Tests first:

- one test per checkpoint kind for approve/reject/edit/one-use consumption evidence;
- missing/stale/hash/model/reference/cost mismatch blocks before provider;
- repeated worker advancement creates zero media reservations before approval;
- approval is per shot; approving shot 1 cannot release shot 2;
- one-use consumption evidence is written once and retry requires a new approval;
- credit ledger/provider-task assertions prove the no-spend invariant.

### Wave 3 — Story Arc Planner skill bundle

Files:

- new `apps/web/skills/marketplace-auto-review-story-arc/skill.md` and byte-
  identical `SKILL.md`;
- new input/output/UI schemas, manifest/lock file, references, fixtures, and
  verification script following the existing skill bundle conventions;
- runner integration in `marketplaceAutoReviewService.ts`;
- `apps/web/server/services/marketplaceAutoReviewStoryArcPlanner.ts`;
- skill bundle and service tests.

Implement:

- bounded input envelope with product evidence, claims, selected references,
  creative settings, audio strategy, and exact 9×10-second contract;
- strict output with story summary, continuity, product presence, claims,
  reference roles, motion intent, and continuous Thai dialogue;
- deterministic validation for claims, references, safety, speech fit, continuity,
  forbidden internal markers, and exact shot count/duration;
- one targeted repair maximum, distinct finish-reason/error/credit trace;
- safe display projection without internal directives or raw provider errors;
- route only v2 `concept_story` to Skill A; legacy route remains untouched.

Tests first:

- skill bundle parity/manifest/schema tests;
- valid, malformed, oversized, missing-shot, blocked-claim, speech-overrun,
  continuity, and forbidden-marker fixtures;
- provider structured-output capability fallback tests;
- one-repair limit and text-credit/idempotency tests;
- story checkpoint enters `awaiting` and no prompt/image work advances until
  approved.

### Wave 4 — deterministic image compiler and per-shot prompt review

Files:

- `apps/web/server/services/marketplaceAutoReviewStagedPromptCompiler.ts`;
- `apps/web/server/services/__tests__/marketplaceAutoReviewStagedPromptCompiler.test.ts`;
- shared Vertical Drama prompt helper parity tests;
- `marketplaceAutoReviewService.ts` prompt-plan branch;
- artifact trace helper and image submission boundary;
- prompt review router/UI contracts.

Implement:

- compile reference mapping + approved `storySummary` verbatim + compact product
  preservation clause only when needed;
- freeze canonical ordered reference manifest and prompt/hash at compile, enqueue,
  and submission;
- create one `image_prompt` checkpoint per shot after compile;
- show exact prompt, reference roles, provider/model, attachment list, estimated
  image cost, and safety warnings;
- approve only the selected shot's checkpoint; on approval enqueue image work;
- if source story/model/reference/cost/safety changes, supersede checkpoint and
  block submission;
- reject arbitrary prompt enhancers and unvalidated hidden mutations.

Tests first:

- golden prompt snapshots for GPT Image 2 and Nano Banana 2 adapters;
- byte-for-byte story-summary preservation and no prohibited prose;
- ordered reference/hash mismatch fails before provider;
- prompt review visible for all nine shots and no shot is auto-approved;
- approve shot 1 releases only shot 1 image work;
- model/attachment/cost changes invalidate approval.

### Wave 5 — image generation, QA, and per-shot image-result approval

Files:

- image scheduling/QA branches in `marketplaceAutoReviewService.ts`;
- existing sequential image attempt/acceptance helpers in
  `marketplaceAutoReviewService.ts`;
- `StoryboardReviewPage.tsx`, `SequentialShotReviewSection.tsx`,
  `SequentialShotEditorCard.tsx`, and
  `AutoReviewPlanReviewPanel.tsx` for Marketplace integration;
- image result/checkpoint tests.

Implement:

- schedule only prompt-approved shots through existing media tasks/leases;
- keep continuity dependencies and bounded concurrency explicit: one run may
  have at most the configured number of image attempts in flight, a shot may
  have only one active attempt, and queued work must respect the existing outbox
  retry/backoff and lease-expiry rules rather than creating parallel provider
  calls;
- persist accepted image artifact/hash, QA hard fields, warnings, and cost;
- create `image_result` checkpoint after automated QA;
- allow user acceptance for valid images and explicitly allowed warnings;
- hard product mismatch remains non-overridable;
- rejected images invalidate only that shot and create a new regeneration attempt;
- do not call Skill B or spend video credits before image-result approval.

Tests first:

- provider task absent before image-prompt approval;
- QA hard mismatch cannot be manually accepted;
- allowed-warning acceptance writes evidence and releases only that shot;
- image rejection/regeneration is shot-local;
- accepted image hash is the exact source for Skill B;
- continuity dependency waits for the approved/accepted source image.

### Wave 6 — Shot Video Director and video-prompt approval

Files:

- new `apps/web/skills/marketplace-auto-review-shot-video-director/` bundle;
- `marketplaceAutoReviewService.ts` video-generation branch;
- `apps/web/server/services/marketplaceAutoReviewShotVideoDirector.ts`;
- existing video prompt/media submission helpers in
  `marketplaceAutoReviewService.ts`, `apps/web/server/services/mediaGenerationService.ts`,
  and provider capability checks in `apps/web/server/services/mediaProviderUtils.ts`;
- video prompt checkpoint router/UI and tests.

Implement:

- invoke Skill B only after image-result approval;
- input the accepted image artifact/hash, shot brief, exact dialogue, duration,
  safety/claim context, and bounded continuity context;
- validate one-shot output and allow at most one targeted repair;
- create `video_prompt` checkpoint showing exact prompt, image source, dialogue,
  duration, model, estimated video cost, and warnings;
- submit only after matching approval; write one-use consumption evidence once;
- a video prompt edit/retry creates a new revision and cannot mutate an approved
  submitted attempt.

Tests first:

- no Skill B before image-result approval;
- prompt sees accepted image hash and preserves dialogue/duration;
- bounded schema/repair/finish-reason tests;
- no video provider task before video-prompt approval;
- stale or changed video prompt approval fails before reservation;
- one shot's prompt retry does not re-run other shots.

### Wave 7 — audio/TTS and final assembly approval gates

Files:

- audio/render/finalize branches in `marketplaceAutoReviewService.ts`;
- `apps/web/server/services/ttsService.ts`;
- `apps/web/server/services/hyperframesRenderService.ts` and the existing
  video-project/render router handoff used by Marketplace Auto Review;
- existing video-edit and library-finalize helpers inside
  `apps/web/server/services/marketplaceAutoReviewService.ts`;
- `MarketplaceCaptureProductDetail.tsx` and existing Storyboard/Video Editor
  handoff surfaces;
- audio/final-assembly checkpoint tests.

Implement:

- for `separate_tts_voiceover`, build a reviewable audio plan with transcript,
  voice/model, timing, language, and estimate; hold before TTS provider spend;
- for native video audio, avoid a duplicate audio checkpoint/charge and rely on
  approved video prompt plus existing native-audio capability;
- create final assembly projection containing ordered shot selections, clips,
  dialogue/audio, subtitles/overlays, warnings, and render/publish estimate;
- hold at `awaiting_final_assembly_review` before paid render/library-finalize;
- re-check all per-shot approvals and final assembly hash at render submission;
- preserve existing render probe, media QA, package manifest, credit refs, and
  library linkage completion evidence.

Tests first:

- no separate TTS task before audio-plan approval;
- no paid render task before final-assembly approval;
- final assembly hash drift blocks render;
- missing shot/video/audio/final QA evidence prevents `completed`;
- legacy finalization tests remain green.

### Wave 8 — UI, safe projections, and responsive checkpoint workflow

Files:

- `apps/web/client/src/components/marketplaceCapture/AutoReviewPlanReviewPanel.tsx`;
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`;
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`;
- `apps/web/client/src/components/marketplaceCapture/SequentialShotReviewSection.tsx`;
- `apps/web/client/src/components/marketplaceCapture/SequentialShotEditorCard.tsx`;
- safe projection/serializer code in `marketplaceAutoReviewService.ts` and shared
  contracts;
- page/panel/Storyboard Review browser and component tests.

Implement:

- expose typed summary/heavy projections; sanitize legacy product metadata before
  display and keep raw artifacts inaccessible from standard UI;
- show one checkpoint card per shot with status, exact review artifact, cost,
  approve/reject/edit action, pending state, stale state, and last approved revision;
- separate story-level review from per-shot image prompt/result/video prompt review;
- disable only the relevant action while an operation is pending; reload from
  persisted status after timeout/reconnect; never auto-approve;
- show clear Thai-first copy for waiting, approval required, stale data, rejection,
  safe errors, credit estimate, and completed approval;
- reuse existing sequential review/editor patterns rather than inventing a separate
  visual language;
- preserve 3x3/start-stop legacy display behavior.

Tests first:

- safe markers absent in summary and heavy payloads;
- loading/empty/error/success/partial/disabled/selected/focus states;
- one-shot approval and bulk-approval atomic behavior;
- stale revision after another browser edits the same shot;
- browser timeout/reload resumes without duplicate operations;
- mobile/tablet/desktop layout and keyboard/focus behavior.

### Wave 9 — diagnostics, credits, observability, and operational runbook

Files:

- artifact/trace helpers in `marketplaceAutoReviewService.ts`;
- stage-attempt/credit reconciliation helpers;
- `apps/web/server/services/marketplaceAutoReviewObservability.ts`;
- `specs/feature/141-marketplace-auto-review-staged-storyboard-pipeline/runbook.md`;
- `specs/feature/141-marketplace-auto-review-staged-storyboard-pipeline/evidence/`;

Implement:

- trace every Story Arc/Video Director call with model/provider/tokens/finish
  reason/validation/hash/credits and sanitized snapshots;
- trace every image submission with compiled/enqueued/submitted prompt/reference
  hashes and checkpoint ID;
- record checkpoint approval/rejection/consumption and provider operation refs;
- add critical alerts for any pre-approval media spend, v2 legacy-call fallback,
  forbidden UI marker, architecture switch, unresolved credit reconciliation,
  lease expiry, or provider-event replay mismatch;
- document queued-job age thresholds, owner, dashboard, and recovery commands;
- keep live smoke and rollback flags disabled by default.

Tests first:

- artifacts are hash-unique and contain no secrets/signed URLs in projections;
- every paid call has credit and checkpoint refs;
- pre-approval spend invariant pages/fails the test;
- alerts include run/shot/checkpoint IDs and recoverable reason codes;
- raw provider errors remain restricted.

### Cross-cutting external dependency failure and backpressure contract

Every external boundary must fail into a durable safe state with a typed reason,
without consuming the next stage's credits:

| Boundary | Failure examples | Required behavior |
|---|---|---|
| Story Arc / OpenRouter | unsupported structured output, timeout, malformed JSON, safety rejection | Persist sanitized attempt diagnostics, apply the one-repair limit, then stop at a text retry/error state; do not create image checkpoints from invalid output. |
| Image provider | capability/attachment mismatch, timeout, provider rejection, callback replay | Keep the prompt approval unconsumed until a task is durably created, reconcile callback/provider event idempotently, and expose shot-local retry; never start video work. |
| Image QA | product mismatch, missing artifact, unsafe result, corrupted media | Create rejected `image_result` state with reason code; hard product mismatch cannot be overridden and no Skill B/video task is created. |
| Shot Video Director / video provider | accepted-image hash missing, prompt schema failure, provider timeout/rejection | Keep video prompt at awaiting/error with bounded repair/retry; no video reservation without a newly approved prompt checkpoint. |
| TTS/audio provider | voice unavailable, transcript timing overrun, timeout, callback mismatch | Stop at audio correction/retry; preserve approved shot/video state and do not render. |
| Render/library finalize | final assembly drift, missing media, render probe failure, publish linkage failure | Block paid render/finalize, retain artifacts and approval history, and return only the affected assembly/downstream state to review. |

Backpressure is enforced by the existing outbox/lease system plus explicit per-run
and per-shot active-attempt limits. Provider retries use bounded exponential
backoff, never exceed the configured attempt budget, and are idempotent by
`runId + stage + shotId + checkpointRevision + attempt`. A queued operation whose
approval becomes stale is cancelled before provider submission and is recorded as
`checkpoint_invalidated`, not retried blindly. Queue age, lease expiry, and retry
exhaustion are observable in the Marketplace Auto Review diagnostics surface.

### Wave 10 — rollout, live smoke, and rollback proof

Deliver:

- at least 16 immutable evaluation fixtures covering product categories, reference
  conflict, multi-view sheets, product-only/hands/presenter, audio strategies,
  and safety edge cases;
- offline contract and cost regression results;
- capped live smoke using GPT Image 2 and Nano Banana 2 capability routes,
  including every approval checkpoint and no-spend evidence;
- internal tenant rollout, then 5%/25%/50% eligible sequential new runs;
- rollback evidence: new legacy run works, v2 run resumes on frozen architecture,
  flags disable new v2 routing without deleting metadata/artifacts, and credits/
  provider events reconcile.

## 6. UI/UX contract

### Target User / JTBD

- Role: Marketplace seller/operator creating an automated product-review video.
- Goal: inspect and correct the story and every expensive downstream prompt before
  paying for the next provider stage.
- Entry point: Marketplace product detail Auto Review run card and existing
  Storyboard Review surface.
- Success outcome: the user can see exactly what will be sent/created, approve one
  shot at a time, reject/regenerate safely, and know which credits are released.

### Existing Pattern Reference

- Search performed with targeted `rg` because SocratiCode was unavailable:
  `AutoReviewPlanReviewPanel`, `SequentialShotReviewSection`,
  `SequentialShotEditorCard`, `StoryboardReviewPage`, and
  `StoryboardBatchReviewDialog`.
- Decision: reuse the existing Marketplace plan-review panel, sequential shot
  review cards, Storyboard Review acceptance/regeneration patterns, and existing
  page polling/cache behavior. Diverge only to add durable checkpoint state and
  exact prompt/cost/hash presentation, which the legacy surface does not provide.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Product run card | `MarketplaceCaptureProductDetail.tsx` | Mount checkpoint-aware run state and polling; preserve legacy gate behavior. |
| Story plan panel | `AutoReviewPlanReviewPanel.tsx` | Story approval, per-shot prompt/result/video prompt checkpoints and actions. |
| Sequential review | `SequentialShotReviewSection.tsx`, `SequentialShotEditorCard.tsx` | Reuse image acceptance/regeneration and add checkpoint status. |
| Storyboard Review page | `StoryboardReviewPage.tsx` | Expose accepted-image checkpoint and downstream readiness. |
| Final assembly handoff | existing Video Editor/render surfaces | Show final approval summary before render/publish. |

### Component Map

| Component/owner | Owns | Consumes |
|---|---|---|
| Server checkpoint service | transitions, hash/revision guard, spend guard, idempotency | run/stage metadata, attempts, outbox, artifacts |
| Router procedures | auth/input boundary and operation response | checkpoint service |
| `AutoReviewPlanReviewPanel` | story/prompt checkpoint presentation and per-shot actions | typed safe projection, mutation status |
| Sequential review components | image result acceptance/rejection and shot-local retries | image QA/projection/checkpoint state |
| Product detail page | polling/cache/mount lifecycle | summary/heavy run queries |
| Worker stage handlers | recheck approval and enqueue provider task | durable checkpoint + attempt evidence |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | Skeleton/placeholder with no provider action enabled. | Component test and browser screenshot. |
| awaiting story | Story cards, warnings, cost estimate, approve/redraft/cancel. | Story checkpoint integration/UI test. |
| awaiting shot prompt | Exact prompt/reference/model/cost card; image button disabled until approval. | Per-shot checkpoint test. |
| awaiting image result | Image/QA/warnings/cost; video action disabled until acceptance. | Image result test. |
| awaiting video prompt | Exact video prompt/image/dialogue/cost; submit disabled. | Video checkpoint test. |
| awaiting audio/final assembly | Transcript or final sequence summary; paid action disabled. | Audio/render gate tests. |
| partial success | Approved shots continue; pending/rejected shots remain individually actionable. | Shot-local integration test. |
| stale/error | Safe reason, refresh/review action, no spend action. | Stale/error UI tests. |
| disabled/pending | Only current operation action disabled; persisted status survives reload. | Mutation pending/reload test. |
| selected/focus/hover | Clear selected checkpoint and visible focus ring; no approval by hover. | Keyboard/browser evidence. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | One shot/checkpoint card per row; prompt uses scrollable bounded text region; primary action remains visible. | Screenshot/manual/browser check. |
| tablet 768x1024 | Two-column story/settings or prompt/reference layout where space permits; no horizontal overflow. | Screenshot/manual/browser check. |
| desktop 1440x900 | Side-by-side plan/reference/cost and dense per-shot table; sticky checkpoint action area. | Screenshot/manual/browser check. |
| small-mobile 360x800 | Extended risk viewport for long Thai copy and prompt controls. | Screenshot if browser tooling available. |
| laptop 1024x768 | Extended risk viewport for panel/table transition. | Screenshot if browser tooling available. |
| wide-desktop 1280x800 | Extended risk viewport for dense review table. | Screenshot if browser tooling available. |

### Accessibility Acceptance

- Keyboard can move from story/shot content to approve, reject, edit, and refresh
  controls in logical order.
- Every checkpoint action has an accessible Thai label and exposes shot number,
  checkpoint kind, current state, and cost.
- Focus remains visible; modal/drawer focus is trapped and returns to the invoking
  control after close.
- Tables/cards use semantic headings, live status announcements for queued/stale/
  approved transitions, and no color-only status meaning.
- Contrast and readable Thai text remain valid in existing light/dark surfaces.
- Reduced-motion preference disables nonessential polling/transition animation.

### Visual Direction and Design Token Extraction

Sources: existing `AutoReviewPlanReviewPanel.tsx`, sequential review components,
`StoryboardReviewPage.tsx`, and the repository's existing Tailwind/shadcn-like
primitives.

- Color: reuse existing semantic success/warning/error/neutral tokens; no new raw
  hex colors.
- Typography: preserve existing Thai-first heading/body/caption hierarchy and
  monospace treatment only for bounded prompt/hash indicators.
- Spacing/radius/elevation: reuse existing panel/card/button/input tokens and
  density; avoid a new visual system for checkpoint cards.
- Motion: restrained status transition only; honor reduced motion.
- Components: reuse existing buttons, badges, cards, alerts, dialogs, and table
  patterns already used by the Marketplace/Storyboard surfaces.
- Density: balanced for story review, dense but readable for prompt evidence.

Do not change: the legacy 3x3/start-stop layout, existing plan-review gate copy
without a scoped compatibility reason, product-fidelity warning semantics, or
the safe projection boundary.

### Copy Contract

- Tone: Thai-first, direct, reassuring about spend boundaries; English safe reason
  detail may remain for operations.
- Required labels: `ตรวจเนื้อเรื่อง`, `ตรวจ Prompt ช็อตที่ N`,
  `ยืนยันสร้างภาพ`, `ตรวจผลภาพ`, `ยืนยัน Prompt วิดีโอ`, `ยืนยันเสียง`,
  `ตรวจและยืนยันการประกอบ`, `ยังไม่ใช้เครดิตขั้นถัดไป`.
- Validation/error copy must use safe reason codes for missing/stale/consumed/
  invalidated checkpoints and never raw provider HTML/error bodies.
- Loading copy must say the system is preparing a reviewable artifact, not that a
  provider task has already been approved.
- Localization fallback: Thai is primary; English reason-code fallback is allowed
  for operations or missing translation keys.

### Browser Evidence Required

Record evidence under the deep-implement UI evidence path using the canonical
viewports 390x844, 768x1024, and 1440x900, with extended 360x800, 1024x768, and
1280x800 because the prompt table/checkpoint cards are dense. Verify no console
errors, no unintended overflow, keyboard/focus path, accessible names, and all
loading/error/disabled/checkpoint states. If browser tooling is unavailable,
record skipped checks and the blocker; never mark them as pass.

## 7. Acceptance and verification matrix

Before implementation wave completion, verify:

| Requirement | Proof |
|---|---|
| Story approval before downstream prompt work | Stage integration test with no prompt/image enqueue before approval. |
| Per-shot image prompt approval | Nine-shot fixture test; only approved shot gets an image attempt. |
| Image result approval before video | Accepted-image hash/checkpoint test and no Skill B/video task before acceptance. |
| Video prompt approval before video spend | Exact prompt hash/revision/cost guard test. |
| Audio/final approval | TTS/render task absence before respective checkpoint. |
| Architecture isolation | Negative calls for three legacy authoring functions plus frozen legacy resume test. |
| Safe UI | Summary/heavy projection marker tests and browser evidence. |
| Idempotency/concurrency | Duplicate, timeout, stale revision, and changed-hash tests. |
| Cost integrity | Actual usage ledger plus zero preapproval media reservation assertion. |
| End-to-end completion | Nine-shot QA, audio/transcript, render probe, package manifest, and library linkage evidence. |

Required focused baseline command from `/home/dev/projects/SmartSpecPro/apps/web`:

```text
pnpm exec vitest run \
  server/services/__tests__/marketplaceAutoReview.planReviewGate.test.ts \
  server/routers/__tests__/marketplaceCapture.planReviewGate.test.ts \
  client/src/components/marketplaceCapture/__tests__/AutoReviewPlanReviewPanel.test.tsx \
  client/src/pages/__tests__/MarketplaceCaptureProductDetail.planReviewGate.test.ts
```

Expected legacy baseline: 4 files and 130 tests passing. New v2 suites must be
green before enabling the architecture flag. Full-repository tests should be run
separately and interpreted with the known dirty-worktree scope.

## 8. Rollout and rollback

1. Offline contracts/fixtures, flags off.
2. Capped live smoke with every checkpoint and provider/hash/credit evidence.
3. Internal/admin tenant only.
4. 5%, 25%, 50% of eligible new sequential runs.
5. Default for new sequential runs only after all GA gates.

Rollback disables v2 for new runs, leaves existing v2 architecture frozen, resumes
or safely fails v2 runs without switching them to v1, preserves artifacts/credit
refs/provider events, and verifies one new legacy run plus one resumable v2 run.

## 9. File inventory and dependency order

Create/modify in this order:

1. shared contracts, checkpoint fixtures, and feature flags;
2. server checkpoint state/guards/router operation contracts;
3. Story Arc skill and v2 start dispatch;
4. deterministic image compiler and prompt checkpoints;
5. image result acceptance and shot-local scheduling;
6. Shot Video Director and video prompt checkpoints;
7. audio/final assembly gates;
8. safe serializers and UI surfaces;
9. diagnostics/alerts/runbook/live smoke;
10. rollout flag enablement only after proof.

No implementation wave may weaken or bypass the checkpoint guard to make a test
pass. If a provider cannot support the required capability or approval evidence,
the run stops safely before that provider spend.
