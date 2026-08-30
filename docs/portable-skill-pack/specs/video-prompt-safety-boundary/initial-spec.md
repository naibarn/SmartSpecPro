# Video Prompt Safety Boundary — Approved Image, Warning-Only Authoring

## Goal

When a Vertical Drama shot has an approved start-frame image that passed the
existing image safety/provider pipeline, video-prompt authoring must never be
hard-blocked by the separate story-marker analyzer. Ordinary scenes must always
produce and persist a video prompt. Suspicious signals may be shown as warnings
and recorded for audit.

## Product rule

The approved image is the safety authority for video-prompt authoring. The video
prompt stage is motion direction and continuity authoring, not a second media
policy gate. Hard failures remain only for operational/precondition errors such
as missing approved media, authorization, malformed model output, queue failure,
provider outage, or insufficient credits.

Provider policy rejection during actual video rendering is a separate boundary:
it may fail the render job, but must preserve the already-created prompt and
must not appear as a prompt-authoring failure.

## Known regression fixture

Episode 232, shot 1 has an approved image with image safety `blocked: false`,
`rewritten: false`, and provider success. The video LLM returned HTTP 200 and
valid JSON containing `the child's sudden cry` and `restrained tension`. The
current video output scanner classified `child + restrained` as coercion and
discarded the prompt before persistence. This must become a successful prompt
with, at most, an advisory warning.

## Required changes

1. Remove policy-only throws from whole-pack, single-shot, and speaker-switch
   video-prompt generation paths.
2. Keep the analyzer as structured advisory telemetry: stage, level, findings,
   and prompt hash; do not expose unnecessary raw prompt text.
3. Ensure warning-bearing jobs are `succeeded`, persist the prompt, advance the
   queue, and follow the existing successful billing/idempotency behavior.
4. Keep operational errors hard and actionable.
5. Update UI/job contracts so warnings do not replace a successful prompt with
   a red policy error.
6. Add regression and integration tests for the exact fixture, benign
   child-care/cinematic wording, real policy markers as warnings, operational
   failures, billing, queue progression, and render-time rejection preservation.

## Acceptance

- Episode 232 shot 1 generates and persists a video prompt.
- `child + restrained tension` never blocks video-prompt authoring.
- No video-prompt policy analyzer result can produce a failed authoring job.
- Missing frame, auth, queue, LLM, provider, and billing failures remain hard
  failures with no false success.
- Render rejection retains the prompt and is labeled as render failure.
- Focused tests, runtime local-data replay, and browser verification pass.
