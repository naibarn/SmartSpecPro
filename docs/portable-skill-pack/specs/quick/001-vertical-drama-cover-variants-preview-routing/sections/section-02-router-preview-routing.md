# Section 02 — Router and Preview Routing

## Ownership

Own `apps/web/server/routers/verticalDramaEpisodes.ts`,
`apps/web/shared/verticalDramaSeries/episodePreview.ts`,
`apps/web/server/services/verticalDramaEpisodePreview.ts`, and focused router/service tests.

## Tasks

- Add optional `coverSlotId` to generation/status/upload inputs with slot 1 compatibility defaults.
- Read and update only the requested variant state; allow other slots to generate concurrently.
- Select reference strategy per slot/idempotency key and store selected source shots.
- Add optional `coverSlotId` to preview state.
- During preview creation, select an unused ready cover if possible, otherwise choose from ready covers and persist the selected slot before queueing.
- Use the selected cover asset URL for `submitVdEpisodePreview`.

## Acceptance

- A failed slot does not clear ready slots.
- A missing/legacy cover slot remains usable for existing preview callers.
- Four previews with four ready covers use four distinct slots.
- Four previews with one or two ready covers reuse only those ready slots.
- Preview state keeps the chosen `coverSlotId` through reconciliation.

## Security/data risks

Every asset query remains scoped by tenant/user/series/episode ownership. Never accept a client-provided storage URL or cover asset ID without the existing ownership check.
