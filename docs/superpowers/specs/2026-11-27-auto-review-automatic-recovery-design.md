# Auto Review Automatic Recovery Design

## Intent

Auto Review should recover from provider and worker failures without making the
user inspect failed jobs or manually create missing video prompts. Preserve
completed outputs and resume from the first incomplete, safe checkpoint.

## Findings

- Worker job `19e701dc-aab3-4c47-84b5-c37b338be18a` failed during
  `staged_person_detection` for shot 4. OpenRouter returned HTTP 400
  `reference_unavailable`: it could not download the attached image (404).
- The worker policy persisted `maxAttempts: 1`, so the job received no worker
  retry. Vision code already resolves managed images to provider URLs and has
  an inline-image recovery path, but this run still exhausted that call; safe
  recovery-path telemetry is needed to identify why that path did not complete.
- The run retained all five approved image results, detections for shots 1, 2,
  3 and 5, and no video prompts. `video_edit` remained queued. Video prompts are
  currently created through an explicit bulk-generation action; a failed
  detection does not trigger a missing-stage reconciler.

## Goals and constraints

- Retry transient provider/transport failures with bounded exponential backoff
  and jitter; refresh or inline tenant-owned vision references before retrying
  a provider 404. Never retry a stale URL unchanged.
- Persist each successful shot checkpoint and reconcile only missing work.
  Use deterministic idempotency keys so duplicate events cannot double-enqueue
  or overwrite approved outputs.
- After the required image result is approved, automatically enqueue video
  prompt generation for eligible shots that have no current prompt. Account for
  normal LLM credits and existing budget checks.
- Stop before actual video generation; keep the existing explicit confirmation
  and media-credit gate. Preserve story/image approval gates and the minor
  dialogue safety rules.
- Ask the user only when bounded recovery cannot continue safely, such as a
  missing source artifact, insufficient credits, or required content decision.

## Approaches

1. Retry only the failed worker job. Small change, but does not create missing
   downstream prompts or recover a run that has no continuation event.
2. Restart the whole Auto Review run. Easy to reason about, but repeats paid
   work and can replace artifacts the user already approved.
3. Event-driven checkpoint recovery (selected). Retry recoverable failures,
   repair provider-facing references, then reconcile and enqueue only missing
   prompt work. This meets the no-manual-repair goal while preserving approvals,
   outputs, idempotency, and the existing video-generation confirmation.

## Recovery behavior

1. Classify the failure and record a safe structured reason, attempt number,
   stage, and recovery action. Never persist signed URLs or credentials in
   user-visible diagnostics.
2. For reference 404s, verify the tenant-owned stored object, mint a fresh
   provider download reference, and use bounded inline-image recovery when the
   provider cannot fetch the broker. If the source object is missing, stop and
   surface a clear source-repair action rather than inventing a detection.
3. Retry transient failures within a small fixed attempt and time budget. Charge
   actual accepted LLM usage through existing idempotent billing; do not charge
   a second time for an already persisted result.
4. On success or terminal failure, reconcile the run's approved outputs and
   enqueue only eligible missing video prompts. Existing prompts, approved
   images, and video artifacts remain untouched.
5. Mark prompt preparation complete only when every eligible shot has a valid
   video prompt. Report unrecoverable blockers directly in the run state instead
   of leaving a generic queued stage or requiring Worker Jobs inspection.

## Acceptance criteria

- A provider 404 for a tenant-owned image recovers through a refreshed/inline
  reference or terminates with an actionable source-specific reason; it never
  resends the same stale URL in a blind retry loop.
- Transient 429/5xx/timeout failures retry within the configured cap and then
  resume from saved checkpoints.
- Approved images with missing video prompts enqueue prompt-only jobs
  automatically and idempotently. Existing prompts are skipped.
- No video media job is dispatched without the existing explicit confirmation.
- Recovery never assigns dialogue to a minor and never bypasses approval gates.
- UI status distinguishes recovering, recovered, and blocked; users do not need
  to inspect Worker Jobs or manually fill missing prompts after recoverable
  failures.

## Follow-up: speaker matching visibility

- Solo narration intentionally does not require multi-speaker face mapping.
  The shot panel now explains that decision whenever a non-empty transcript has
  no speaker labels, instead of making the speaker-matching section disappear.
- When there is exactly one eligible adult lead, infer that lead even if the
  selected roster also contains silent adult/minor supporting characters. A
  child remains ineligible to speak or become a speaker fallback.
