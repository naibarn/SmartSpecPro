# section-07-media-async-enforcement

## Goal

Enforce age-aware safety policy for all image, video, and audio generation before prompt dispatch, before credit reservation, during async job processing, and on provider callback/output handling.

## Depends On

- `section-01-policy-foundation`
- `section-03-security-pin-tokens`
- `section-04-admin-policy-audit-flags`

## Files In Scope

- Media router such as `apps/web/server/routers/media.ts`.
- Media job/storage services.
- Python or external worker integration points if media generation crosses service boundaries.
- Credit reservation/refund tests.
- New media safety enforcer service and tests.

## Test First

Add tests for:

- Blocked media prompt does not reserve credits and does not call provider.
- Allowed prompt records policy version, age band, actor, and surface on the job.
- Async job revalidates policy before dispatch if job was queued before policy/profile changes.
- Provider callback/output is quarantined or blocked if it conflicts with viewer or creator policy.
- Credit refund/release behavior is deterministic on safety block, review, provider rejection, and cancellation.
- Image, video, and audio paths all use the same central policy adapter.

## Implementation Requirements

- Put media safety preflight before abuse checks that cost credits and before provider selection.
- Store a compact policy snapshot on jobs so delayed processing can explain decisions and compare versions.
- Revalidate with current active policy for queued jobs when required by rollout mode.
- Add internal-only policy envelope for worker calls. Do not trust client-supplied age band or country.
- Return structured block/review responses that the frontend can render without changing unrelated media flows.
- Preserve existing provider adapters and credit accounting semantics as much as possible.

## Integration Notes

- This section prepares asset metadata required by section 08.
- If existing abuse/moderation guard already checks prompts, wrap it as a provider signal under the central age-safety decision.
- Temporary PIN unlock may allow adult media only where central policy explicitly permits it.

## Verification

- `cd apps/web && pnpm test -- mediaSafety`
- `cd apps/web && pnpm test -- media`
- `cd apps/web && pnpm check`
- Python worker tests if media jobs run through Python.

## Handoff

Generated media jobs should now include creator policy metadata and output safety status for viewer-time enforcement.
