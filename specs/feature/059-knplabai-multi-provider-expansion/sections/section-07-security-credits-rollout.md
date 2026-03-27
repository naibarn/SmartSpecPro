# Section 07: Security, Credits, and Rollout

## Purpose

Finish the feature with the security, pricing, and rollout guardrails that make a large provider expansion safe to ship.

## Files

- `python-backend/app/core/credits.py`
- `python-backend/app/services/credit_service.py`
- `python-backend/app/core/media_job_validators.py`
- `python-backend/app/llm_proxy/providers/knplabai_provider.py`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/multiProvider.ts`

## Implementation Notes

1. Keep user credit conversion rules unchanged.
2. Convert KNPLabs pricing into the app’s internal credit format using Decimal-safe math.
3. Perform pre-flight affordability checks before expensive requests are dispatched.
4. Preserve `follow_redirects=False` on KNPLabs outbound traffic.
5. Reuse the repo’s URL validation utilities for any reference media.
6. Make sure the multi-provider router has a sane default `apiStyle` for `knplabai`.
7. Keep rollout conservative by seeding KNPLabs provider and models disabled first.

## Acceptance Criteria

- KNPLabs pricing does not change the app’s core credit math.
- Security checks remain fail-closed.
- New models are not user-selectable until an admin enables them.

