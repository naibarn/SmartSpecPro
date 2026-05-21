# Section 07: Generation, QA, and Learning Orchestration

## Goal

Connect the Gemini Omni suite UX, skills, credit validation, provider generation, QA, retry, and learning loops.

## What This Section Must Change

- Run Gemini Omni Video Director before generation when Auto Prompt is active.
- Run Prompt QA before credit reservation.
- Validate selected references and provider assets server-side.
- Reserve credits only after validation and accepted prompt QA.
- Generate one task per clip in storyboard mode.
- Run Video Quality QA after generated result is available.
- Store learning signals.
- Create pending `media-studio-auto-learning` recommendations for recurring issues.
- Track durable per-clip state for storyboard runs.
- Void/refund credit reservations when provider submission fails before durable task/asset creation.
- Re-host provider result URLs into platform storage before final durable completion where existing media policy expects platform-hosted media.
- Emit sanitized audit/log events for lifecycle transitions.
- Enforce per-user/per-tenant rate limits, concurrency caps, and budget checks before provider submission.
- Track skill/QA credit costs separately from provider generation credits unless tenant policy marks them included.
- Block character/voice asset creation when required policy/consent acknowledgment is missing.

## Files Likely Touched

- `apps/web/client/src/pages/MediaStudio.tsx`
- media generation router/service
- skill execution/orchestration services
- skill upgrade/recommendation services
- media task metadata handling
- tests around generation and learning

## Flow

1. Build prompt package.
2. Prompt QA reviews package.
3. Validation computes reference units and asset validity.
4. Pricing computes source-video branch.
5. Credits are reserved.
6. Provider task is created.
7. Video QA reviews result.
8. User feedback and QA result are stored.
9. Learning recommendations are aggregated.

Durable states should cover:

- prompt QA pending/pass/fail/revised
- credit reserved/refunded/voided
- provider submission pending/created/failed
- per-clip storyboard success/failure
- video QA pending/pass/fail
- human review required
- result re-hosting pending/succeeded/failed
- callback/polling terminal deduplicated
- rate limited/deferred
- budget blocked
- consent/policy blocked

## Tests

- prompt QA fail prevents charge and provider call
- prompt QA pass allows validation and charge
- storyboard mode creates per-clip tasks
- storyboard partial failure preserves completed clips and retries only failed clips
- provider failure after reservation voids/refunds according to existing credit ledger rules
- provider-hosted result URLs are not final user-visible durable URLs unless existing policy explicitly allows it
- repeated callback/polling terminal handlers do not double-refund or duplicate completion
- audit/log events redact provider tokens, signed URL queries, and private media payloads
- preflight blocks provider submission when total planned storyboard cost exceeds balance or tenant budget
- per-user/per-tenant concurrency limits prevent runaway multi-clip submissions
- skill/QA costs are reserved/accounted for or explicitly included by policy
- missing consent/policy acknowledgment blocks reusable character/voice asset creation
- video QA failure records learning signal
- recurring issue creates pending recommendation
- auto skill patching remains disabled by default

## Completion Criteria

- Gemini Omni generation behaves as a guided loop, not a one-shot raw API submission.
- Failed clips and failed provider submissions have deterministic recovery paths.
- Expensive multi-clip runs cannot start unless cost, budget, and concurrency checks pass.
