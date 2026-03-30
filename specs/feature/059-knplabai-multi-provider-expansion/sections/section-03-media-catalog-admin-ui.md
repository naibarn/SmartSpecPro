# Section 03: Media Catalog, Provider Seeds, and Admin UI

## Purpose

Add KNPLabs to the media provider catalog, seed its media models, and expose the new provider in the media admin UI.

This section is the database/UI face of the media expansion.

## Files

- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/seed-media-models-knplabai.ts`
- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaModels.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/client/src/pages/AdminMediaProviders.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`

## Implementation Notes

1. Add a KNPLabs media provider entry to the provider seed data.
2. Seed KNPLabs image, video, TTS, and embeddings models into `media_models`.
3. Keep all KNPLabs media models disabled by default.
4. Put the provider and model metadata in `configJson` so the gateway can infer endpoint style, supported inputs, and pricing behavior.
5. Extend the media provider templates and admin provider cards so KNPLabs is visible and editable.
6. Add KNPLabs metadata to the static fallback registry in `modelRegistry.ts` for DB-unavailable scenarios.
7. Reuse the existing provider readiness and test-connection patterns rather than inventing a new admin path.

## Acceptance Criteria

- KNPLabs shows up in the media provider admin page.
- The seeded media models are visible but disabled until an admin enables them.
- The app still has KNPLabs metadata if the database cannot be read.

