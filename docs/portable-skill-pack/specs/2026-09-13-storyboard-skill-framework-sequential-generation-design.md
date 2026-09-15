# Storyboard Skill Framework Sequential Generation

## Decision

Use a sequential background run with pause/resume for the Skill Framework
storyboard flow. The system creates the project, run, and all nine shot slots
up front, but releases image generation one shot at a time. Shot `N + 1` is
not dispatched until shot `N` has a valid, continuity-approved image.

The run is resumable. `หยุด` fences the active work and prevents any further
shot from being dispatched. `ทำต่อ` resumes the same project, run, canonical
job history, prompt history, and credit ledger from the first shot that still
lacks a valid continuity-approved image. It never creates a duplicate
storyboard or silently regenerates completed valid shots.

This design extends Feature 186. PostgreSQL `worker_jobs`,
`worker_job_events`, the transactional outbox, leases, fencing, and settlement
markers remain authoritative. It does not introduce a second generic jobs
table or treat a provider task ID as job identity.

## Goals

- Show a complete draft review on the same page before final confirmation.
- Expand the user's rough idea into a structured storyboard candidate and a
  reviewable nine-shot plan.
- Generate images immediately after confirmation in a durable background run.
- Preserve visual continuity by using the previous successful shot as the
  primary reference for the next shot, with bounded character references.
- Expose clear run and shot states, including the active shot and the reason
  later shots are waiting.
- Provide `หยุด` and `ทำต่อ` with deterministic behavior around queued work,
  provider-submitted work, late results, and credit settlement.
- Reuse an approved prompt when it is valid; optimize again only when the
  failure proves the prompt, policy, or provider constraint is the cause.
- Ensure every paid Skill/LLM/provider operation is idempotent, auditable, and
  settled exactly once.

## Non-goals

- Parallel image generation for the first release.
- Automatic regeneration of completed images when the model preference changes.
- Per-shot image/video model selection in the default flow.
- Treating a late provider result after a user stop as valid continuity input.
- Deleting a paused run or creating a replacement run on resume.
- Making a mock provider or local health check production provider evidence.

## User flow

### Draft and review

1. The user enters the rough idea, title, language, references, characters,
   image model, video model, and Skill inputs.
2. Save Draft calls the paid idea-expansion Skill once for the requested
   candidate and persists the original idea, candidate, nine-shot plan,
   continuity bible, model pair, and candidate fingerprint.
3. The same page changes to Review mode. It shows the global summary and all
   nine planned shots, including each shot's beat, intended action, prompt
   inputs, references, continuity requirements, and expected status.
4. `ขอเปลี่ยนไอเดีย` creates another paid candidate while retaining the
   original and previous candidates. A variation directive and semantic
   fingerprint prevent accidental repetition.
5. Final confirmation freezes the selected candidate, model pair, prompt
   inputs, and run contract. It creates the background run immediately.

### Structured idea expansion contract

The idea-expansion action is a separate structured planning call from the
selected image skill's per-shot prompt call. It must return exactly these five
non-empty fields before the UI can apply the result:

```json
{
  "projectTitle": "...",
  "videoIdea": "...",
  "sceneDetail": "...",
  "customActivity": "...",
  "customNotes": "..."
}
```

`projectTitle` maps to the parent project title and is used only when the user
has not supplied one. `videoIdea` maps to the parent idea. For the current
`cute_child_image_generator` v3 skill, `sceneDetail`, `customActivity`, and
`customNotes` map exactly to `scene_detail`, `custom_activity`, and
`custom_notes`. The UI shows an editable five-section preview and applies the
values only after explicit confirmation; a combined prompt string is not a
valid substitute for these fields.

The global scene detail and notes are retained for every shot. The orchestrator
adds a deterministic beat-specific activity direction to each shot, so the
nine-shot loop changes only the action/continuity details needed to progress
the story while preserving identity, setting, and the selected skill inputs.

### Sequential generation

1. The run creates all nine shot slots before dispatching any image operation.
2. Shot 1 is released with the user's approved references and bounded
   character references.
3. The worker optimizes the shot prompt only when the generation contract
   requires optimization, then submits the image operation with a stable
   operation key.
4. When the image is durably stored and passes validation, the shot becomes
   continuity-approved and the next shot is released.
5. Shot `N + 1` uses shot `N`'s approved image as its primary continuity
   reference. It may also use a bounded subset of the global character
   references. It must not use unbounded history.
6. A failed shot blocks later shots. The UI continues to show all nine slots,
   but later slots remain `รอภาพอ้างอิง` and have no provider dispatch.
7. The run completes only after shot 9 has a valid image and its video prompt
   has been persisted.

### Stop and continue

`หยุด` is a resumable pause, not destructive cancellation of the storyboard.
The command is idempotent and is processed through the Feature 186 guarded
action path.

- If the current shot is still queued in the unpublished outbox, the outbox
  intent is marked cancelled before it can publish. The shot is not charged
  for a provider call that never occurred.
- If the current shot has been sent to the provider, the adapter requests
  provider cancellation when supported. If cancellation is unavailable or
  ambiguous, the system continues the minimum background polling/settlement
  required to close the provider operation and credit ledger correctly.
- A provider result that arrives after `หยุด` is stored as evidence for the old
  attempt. It is not displayed as a usable result, is not approved as the
  next continuity reference, and cannot release the next shot.
- No later shot is dispatched after the pause request, even if a late result
  arrives. Completed valid shots before the stop remain visible.
- The active and remaining slots show `หยุดโดยผู้ใช้` or `ไม่ได้สร้างต่อ`.
- The canonical job remains recoverable through its existing control-plane
  record. Pause intent is execution-control metadata, not a second generic
  job status.

`ทำต่อ` uses the same project, run, candidate, model snapshot, canonical job
binding, and event history. It finds the first shot without a valid
continuity-approved image, clears the pause intent through a guarded command,
and releases only that shot. If the old provider operation later produced an
image, that image remains evidence and does not change the resume point. The
resumed shot receives a new fenced attempt/operation boundary while retaining
the same canonical storyboard/run identity.

## State model

The storyboard run has a control projection for UI purposes, while the
Feature 186 job remains the lifecycle authority. The projection must not add
an independent retry counter, lease, or terminal truth.

```text
awaiting_confirmation
  -> queued
  -> running_shot
  -> waiting_for_reference
  -> completed

running_shot -> paused_by_user
paused_by_user -> running_shot       (ทำต่อ)
running_shot -> failed_shot
failed_shot -> repairing
repairing -> running_shot

queued/running_shot/failed_shot/paused_by_user -> cancelled (explicit cancel)
```

`paused_by_user`, `waiting_for_reference`, `repairing`, and
`provider_result_suppressed` are bounded storyboard projections/control
intents. They must map to the canonical Feature 186 state and events rather
than becoming a second generic `worker_jobs.status` vocabulary.

Each shot has a generation readiness state separate from the canonical job:

| Shot state | Meaning |
|---|---|
| `planned` | Slot exists but has not been released. |
| `waiting_for_reference` | Blocked until the previous shot has a valid image. |
| `queued` | An outbox intent exists but provider submission has not occurred. |
| `submitted` | Provider operation reference is durable. |
| `succeeded` | Valid image asset is durable and approved for continuity. |
| `failed` | Current attempt ended without a usable image. |
| `paused` | User pause prevents dispatch or continuation. |
| `repairing` | A bounded repair attempt is being prepared or executed. |
| `suppressed_result` | A late result was settled as evidence but is not usable. |

## Prompt and repair policy

Every shot stores the original prompt input, approved prompt version, any
optimized prompt version, and the exact generation request used. Prompt text
is never silently rewritten after approval; a new version and audit record are
created for every optimization or manual edit.

The optimizer decision is explicit:

| Failure classification | Prompt action | Paid optimizer call |
|---|---|---|
| Policy violation or unsafe wording | Rewrite while preserving intent, then regenerate. | Yes |
| Provider prompt/constraint error, such as length or unsupported format | Normalize or compress, then regenerate. | Yes |
| Invalid reference input | Repair the reference set and reuse the approved prompt. | No |
| Timeout, connection reset, provider 429/5xx | Reuse the approved prompt with bounded retry. | No |
| Ambiguous provider result | Inspect operation evidence; quarantine if unresolved. | No |
| User manually edits the prompt | Create a new prompt version and optimize before use. | Yes |
| Prompt is valid and no prompt-related error exists | Reuse the approved prompt unchanged. | No |

The system must not call the optimizer merely because image generation failed.
The provider error classifier and stored evidence must identify a
prompt/policy/constraint cause before a new optimization call is allowed.
Unknown errors fail closed to operator review or a user-visible repair action;
they do not trigger an unbounded optimize-regenerate loop.

The repair actions are:

- `ซ่อมเฉพาะช็อต`: repair one failed shot and keep later shots blocked.
- `ซ่อมทุกช็อตที่ล้มเหลว`: repair failed shots in shot order, stopping at the
  first unresolved failure.
- After a repaired image succeeds, rebuild that shot's video prompt from the
  new image reference before allowing the next shot to continue.

## Models and reproducibility

The selected image model and video model are stored in the immutable run
snapshot and reused by every shot in that run. A changed user preference
affects only future runs and is never applied implicitly to existing shots.

The last selected model pair is stored as a preference for the authenticated
user only. It is not a tenant-wide or shared-workspace default. A run may
record the preference source and the effective model pair for audit.

## Persistence additions

Extend the existing Skill Framework tables and Feature 186 companions only as
needed. The logical additions are:

### Project/run

- original rough idea and normalized input snapshot;
- candidate history with candidate version, variation directive, semantic
  fingerprint, paid expansion call ID, and selected timestamp;
- selected candidate version and immutable continuity-bible snapshot;
- immutable image/video model pair snapshot;
- run control intent (`none` or `pause_requested`), pause actor/reason/time,
  and resume count;
- first incomplete shot pointer as a derived/reconciled optimization, never
  as independent job truth.

### Shot

- planned beat/action/emotional turn/camera/continuity requirements;
- prompt version history and approved/optimized prompt hashes;
- optimization reason and source error classification;
- generation request snapshot including bounded reference chain;
- primary continuity reference, character-reference IDs, and reference
  validation outcome;
- provider operation key/reference and provider submission state;
- valid image asset ID, continuity approval timestamp, and suppressed-result
  marker when applicable;
- video prompt version, source image asset ID, and rebuild reason;
- repair count and last safe error classification.

### Paid-call ledger

Use the existing credit/usage ledger and settlement architecture, linked to
the canonical job/run/shot. Every paid operation records:

- logical operation type (`idea_expansion`, `prompt_generation`,
  `prompt_optimization`, `image_generation`, `video_prompt_generation`, or
  `repair`);
- canonical job ID, run ID, shot number, business attempt, and operation key;
- request/definition hash, model/provider, estimated and final cost;
- reservation, charge, refund/void, or operator-review disposition;
- provider reference and result digest where available.

The operation key is deterministic for the same logical operation and attempt.
Duplicate requests return the original result/ledger record. A database
serialization retry reuses the same key and must not repeat an external call
unless provider evidence proves that no submission occurred.

## API and background contract

The existing router remains the public entry boundary, with additions for
review and control actions:

- `createDraft`: creates the candidate and review projection; it does not
  start image generation.
- `listCandidates` / `selectCandidate`: reads candidate history and selects
  one immutable candidate before confirmation.
- `confirmAndStart`: freezes the selected definition, creates nine slots,
  commits the run intent/outbox, and returns immediately with run status.
- `getRun` / `getProject`: returns global progress, active shot, all nine slot
  states, prompt/reference projections, model snapshot, and suppressed-result
  indicators separately from transport observations.
- `pauseRun`: idempotently records the user pause, fences the active attempt,
  cancels unpublished dispatches, and requests provider cancellation when
  possible.
- `resumeRun`: idempotently clears the pause intent and releases the first
  incomplete shot on the same run.
- `repairShot` / `repairFailedShots`: uses the classifier-driven optimization
  policy and preserves shot/run identity.

Each mutation requires authenticated server context, tenant authorization,
action idempotency, expected run/shot state, expected attempt/fencing target,
and a bounded reason. Raw lease tokens, credentials, provider responses,
signed URLs, and unrestricted prompt payloads are not returned to the client.

The sequential worker follows this contract:

```text
load run and shot
  -> verify pause intent and canonical job state
  -> claim fenced attempt
  -> resolve prompt version and reference chain
  -> optimize only when classifier permits
  -> reserve/charge operation idempotently
  -> submit provider operation with stable operation key
  -> persist provider reference before polling
  -> poll/receive callback until success, failure, or bounded ambiguity
  -> if paused: settle evidence and suppress result
  -> if active and valid: persist image, approve continuity, build video prompt
  -> release exactly the next shot
```

No transaction spans provider submission, polling, callbacks, or transport
publication. Every result/release step is guarded by run ID, shot number,
attempt ID, lease token, and fencing version.

## UI contract

### Review mode

- The saved draft remains on the current page.
- A global card shows title, idea candidate, nine shots, models, references,
  estimated paid operations, and the final confirmation action.
- Each shot shows its planned beat and whether it is ready for sequential
  generation.
- Candidate history includes the original idea, selected candidate, and
  `ขอเปลี่ยนไอเดีย`.

### Run mode

- Show progress such as `สร้างภาพ 3/9` and the current stage.
- Show all nine cards immediately.
- The active shot shows provider/generation progress and its current prompt
  version.
- Later cards show `รอภาพอ้างอิง` and are visibly not dispatched.
- Failed cards show a safe error explanation, `ซ่อมเฉพาะช็อต`, and the global
  repair action when applicable.
- While active, show `หยุด`.
- When paused, show `ทำต่อ` prominently and explain whether the current
  provider operation is still settling.
- Suppressed late results are not displayed as generated output; the UI may
  show only a safe status such as `ผลลัพธ์จากงานก่อนหยุดถูกปิดการใช้งาน`.
- Completed valid shots remain visible after pause and resume.

## Feature 186 alignment and invariants

- One canonical `worker_jobs.id` identifies the run/control-plane execution.
- Shot generation dispatches use child/linked canonical bindings according to
  the existing Feature 186 job binding pattern; they do not create an
  unrelated jobs ledger.
- PostgreSQL current state and append-only events are authoritative.
- Outbox publication is durable and idempotent.
- Provider IDs are references attached to a shot attempt, never identity.
- Broker redelivery and provider polling do not increment business attempts.
- A resume creates a new fenced execution boundary on the same run; it does
  not clone the storyboard or reuse an unresolved old provider operation.
- A stale worker cannot save an image, settle credits, approve continuity,
  rebuild a video prompt, or release the next shot.
- A late callback may record bounded diagnostic evidence but cannot mutate a
  newer paused/resumed state without a guarded lease-bearing command.
- Tenant, actor, model routing, billing scope, and references are validated
  server-side.

## Rollout and recovery

1. Add additive schema and ledger links; keep existing draft creation
   compatible.
2. Enable same-page review without starting generation until confirmation.
3. Enable sequential generation for a low-risk canary with fake providers and
   side-effect-free fixtures.
4. Enable real provider execution only after operation-key, credit-settlement,
   pause/resume, duplicate-delivery, and late-result evidence passes.
5. Keep the previous confirm path behind a rollback flag for new work. Never
   rollback committed canonical history or create replacement jobs.

Recovery must cover PostgreSQL outage, outbox publication loss, duplicate
delivery, worker crash, provider timeout, provider cancellation unsupported,
late callback after pause, resume during settlement, prompt policy failure,
and credit-ledger contention. Ambiguous provider outcomes are quarantined or
resolved from durable evidence; they are never blindly regenerated.

## Acceptance criteria

- Draft save shows the full candidate and nine-shot review on the same page.
- Candidate changes preserve history and do not repeat the same semantic
  candidate.
- Confirmation creates nine slots and starts background work immediately.
- Only one shot is provider-active at a time.
- Shot `N + 1` is not dispatched before shot `N` has a valid continuity-approved
  image.
- The previous approved image is the primary reference for the next shot.
- `หยุด` prevents unpublished work from dispatching and prevents later shots
  from starting.
- A submitted provider operation is settled in the background when needed,
  but its late result is hidden, not continuity-approved, and cannot release
  another shot.
- `ทำต่อ` resumes the same run from the first incomplete valid shot and does
  not regenerate completed valid shots.
- Prompt optimization occurs for policy/constraint errors or manual edits,
  and not for valid prompts that fail transiently.
- Every paid call has an idempotent ledger record and duplicate requests do
  not double-charge.
- Repaired image success rebuilds the shot video prompt from the new image.
- Stale attempts cannot mutate image visibility, continuity, video prompts,
  credits, or next-shot release.
- The UI distinguishes canonical state, shot projection, and provider
  observations.

## Verification plan

- Unit tests for candidate fingerprinting, prompt classifier decisions,
  reference-chain limits, operation-key determinism, and state mapping.
- Repository tests for transactional draft/create, duplicate candidate request,
  nine-slot creation, outbox cancellation, pause/resume action idempotency,
  and credit-ledger uniqueness.
- Worker tests for sequential release, previous-image dependency, failed-shot
  blocking, stale-fence rejection, and resume from the first incomplete shot.
- Adapter tests for queued cancellation, provider-submitted cancellation,
  unsupported cancellation, late result suppression, duplicate provider
  callbacks, and ambiguous publication.
- Failure-injection tests for provider policy errors, prompt-valid transient
  errors, 429/5xx, timeout, worker loss, PostgreSQL contention, and resume
  during settlement.
- Browser tests for review mode, nine cards, `หยุด`, `ทำต่อ`, repair actions,
  candidate history, and truthful suppressed-result messaging.
- Structural checks confirm the page and domain services do not directly call
  BullMQ/Celery/provider APIs; all side effects cross the registered adapter
  and Feature 186 control-plane boundaries.

## Open implementation gates

- Confirm the exact existing credit ledger and settlement APIs before wiring
  the new paid operation types.
- Confirm whether shot generation should use one linked Feature 186 child job
  per shot or one run job with attempt metadata, without adding a second jobs
  table.
- Confirm provider-specific cancellation and callback capabilities for each
  enabled image provider.
- Record numeric lease, heartbeat, provider deadline, payload, concurrency,
  outbox-age, and event-rate budgets in the rollout manifest before enabling a
  paid job class.
