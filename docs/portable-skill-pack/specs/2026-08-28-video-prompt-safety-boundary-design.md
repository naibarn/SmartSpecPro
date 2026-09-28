# Video Prompt Safety Boundary Design

## Goal

After a Vertical Drama start-frame image has passed the image-generation safety
pipeline and is approved, video-prompt authoring must not be hard-blocked by a
second text-marker policy scan. Normal scenes such as a caregiver comforting a
crying child must produce a prompt. Policy signals remain observable as
warnings, while genuine runtime failures remain actionable hard failures.

## Evidence and boundary

Episode 232, shot 1, is the regression fixture. Its approved image audit has
`blocked: false`, `rewritten: false`, and provider success. The video LLM also
returned HTTP 200 with valid JSON, but the generated prose included
`the child's sudden cry` and `restrained tension`. The current marker scanner
interprets these as minor plus coercion and throws
`Generated video prompt requires a policy-safe rewrite before video generation`.
The prompt is discarded before persistence.

The approved start frame is the content-safety authority for video-prompt
authoring. Video rendering remains a separate provider boundary: a provider may
reject a rendered video for its own model policy, but that rejection must not
erase the already-created prompt.

## Design principles

1. Video-prompt policy analysis is advisory-only after an approved start frame.
2. No video-prompt code path throws solely because the story safety analyzer
   finds a policy marker.
3. The analyzer may still produce structured warnings and audit events.
4. Hard failures are reserved for missing/invalid approved media, ownership,
   queue, credits, malformed LLM output, vision requirements, provider outage,
   and other operational preconditions.
5. Negative prompts, policy instructions, metadata, audio direction, and
   cinematic modifiers must not be interpreted as authored harmful events.
6. Any future render-time provider rejection is handled by the render job and
   must preserve the prompt and its audit trail.

## Runtime flow

1. Resolve and authorize the approved start-frame asset.
2. Run the existing image-safety result check as telemetry only; do not repeat
   it as a blocking video authoring gate.
3. Generate the grounded video prompt through the existing vision/JSON path.
4. Run the story analyzer in advisory mode and attach warning codes to the job
   result and audit record.
5. Persist the prompt and charge credits according to the existing successful
   path. Policy warnings must not change persistence or billing behavior.
6. If a later video render fails at the provider, mark the render job failed,
   retain the prompt, and show a render-specific warning.

## Error and observability contract

The job record must distinguish `succeeded` with warnings from `failed` with an
operational error. Safety telemetry should include stage, finding codes, job
id, prompt hash, and whether an approved frame existed. It must not expose raw
prompt text unnecessarily. The UI may show a concise Thai warning, but must not
replace a successfully persisted prompt with a policy error.

## Testing contract

- The exact episode-232 shot-1 LLM output is a regression fixture and must
  persist successfully.
- `child` plus `restrained tension` is not a coercion block.
- `a child is restrained by an adult` and real minor threat/surveillance remain
  detectable as warnings.
- Negative prompts and safety instructions do not create findings.
- Missing approved media and operational/provider failures remain hard failures.
- Warning-bearing success preserves prompt persistence, idempotency, queue
  advancement, and one successful user charge.
- Render-time policy rejection preserves the prompt and does not present as a
  prompt-authoring failure.

## Rollout

Implement the service boundary first, then queue/result/audit handling, then UI
warning presentation. Run focused tests, the exact local data regression, and
browser/runtime verification before deployment. Do not deploy the current
uncommitted hard-block safety patch as-is.
