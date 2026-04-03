# Section 02 Diff Summary

Files touched:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/__tests__/mediaModels.persistence.test.ts`
- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/scripts/seed-media-models-wavespeed.ts`
- `apps/web/package.json`

Summary:

- Added WaveSpeed admin provider template and provider-specific `/balance` connection test.
- Enforced relative-only endpoint persistence for model config updates.
- Added model-aware Media Studio and server-side validation for the four-image cap.
- Added a dedicated idempotent seed script and package command for the launch model.
