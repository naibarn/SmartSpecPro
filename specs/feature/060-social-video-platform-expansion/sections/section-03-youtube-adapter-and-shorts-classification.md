# Section 03 - YouTube Adapter and Shorts Classification

## Goal

Implement YouTube upload/publish/schedule as a background provider and classify Shorts on top of the same path.

## Scope

- YouTube OAuth connection and channel metadata storage
- `videos.insert` upload flow
- Publish now and schedule via `status.publishAt`
- Status polling
- Shorts classification rules

## Shorts Rules

- Treat Shorts as a classifier, not a separate API
- Mark items as Shorts candidates when vertical or square and duration <= 3 minutes
- Surface the Shorts label in job metadata and downstream UI

## Files Likely Touched

- `apps/web/server/services/social/providers/youtube.ts`
- `apps/web/server/services/socialBackgroundFacade.ts`
- `python-backend/app/services/social/*`
- `python-backend/app/tasks/*`

## Acceptance Criteria

- Upload works without a UI session
- Scheduling persists the target publish time
- Shorts classification is deterministic
- Unsupported privacy / audit states fail predictably
