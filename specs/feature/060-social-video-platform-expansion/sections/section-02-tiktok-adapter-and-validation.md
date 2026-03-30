# Section 02 - TikTok Adapter and Validation

## Goal

Implement TikTok as a background provider with the correct preflight, media validation, and publish semantics.

## Scope

- OAuth connection and token storage
- Creator info preflight before publish
- Direct post and draft upload
- File upload and verified URL upload
- Status polling and cancellation where supported
- Private-only fallback for unaudited app state

## Rules

- Require `video.publish` / `video.upload` scope based on the operation
- Enforce supported codec, size, duration, and dimension limits before enqueue
- Reject URL transfers unless the domain/prefix is verified
- Do not auto-publish without explicit creator consent

## Files Likely Touched

- `apps/web/server/services/social/providers/tiktok.ts`
- `apps/web/server/services/socialBackgroundFacade.ts`
- `apps/web/server/routes/internalSocialActions.ts`
- `python-backend/app/services/social/*`
- `python-backend/app/tasks/*`

## Acceptance Criteria

- Direct post works when access is approved
- Draft upload works for creator-completed flow
- Invalid media is rejected before job creation
- Status and cancellation flows are idempotent
