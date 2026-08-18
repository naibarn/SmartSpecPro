# Decision Log

## Depth

- Chosen depth: `standard` quick-plan.
- Reason: medium scope across shared contracts, server routers/services, worker asset boundary, UI, and tests, but no new database table/migration and no new external service.
- Promotion trigger: promote to full deep-plan only if the existing JSONB envelope cannot preserve current consumers or if preview worker ownership requires a new cross-service contract.

## Decisions

1. Store four cover slots inside the existing `coverImage` JSONB envelope; keep legacy single-state rows readable as slot 1.
2. Add optional slot IDs to generation/status/upload paths, defaulting legacy callers to slot 1.
3. Use a deterministic seeded selection derived from episode, slot, and idempotency key. This gives varied retries while preserving duplicate-submit stability.
4. Persist `coverSlotId` in each preview state so render retries and reloads remain reproducible.
5. Resolve protected clip and cover URLs to signed broker URLs in the preview render input used by the worker. Continue using direct server-side storage reads for initial staging/probing.
6. Prefer an unused ready cover for a preview slot; when fewer ready covers exist, choose a ready cover from the available set and allow reuse.

## Review notes

- Security: broker references remain tenant/user scoped and retain file extensions.
- Data safety: no destructive rewrite; failed slots and old cover states remain recoverable.
- Cost: cover generation remains one paid task per explicit slot click; preview routing adds no image-generation cost.
- UI: only the selected slot is disabled while generating; other slots remain actionable.
