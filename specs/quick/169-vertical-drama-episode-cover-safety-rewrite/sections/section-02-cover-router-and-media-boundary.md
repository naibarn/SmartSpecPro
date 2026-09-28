# Section 02 — Cover Router and Media Boundary

## Ownership

Own final-prompt preparation and propagation through the episode-cover router,
cover state, Hermes branch, and normal media boundary. Preserve all tenant,
credit, idempotency, and reference-selection contracts.

## Targets

- `apps/web/shared/verticalDramaSeries/episodeCover.ts`
- `apps/web/server/services/verticalDramaEpisodeCover.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/mediaGenerationService.ts`

## TDD and acceptance

- Prepare once after final prompt assembly and before credit reservation.
- Persist the safe prompt and bounded safety summary in the existing JSONB
  state.
- Pass identical safe prompt/reference inputs to Hermes and normal media.
- Prevent normal-media double rewrite only with a matching safe hash.
- Block/unavailable safety outcomes before charge or enqueue.

## Risks

Hermes bypasses the normal media service, so the router is the authoritative
preparation boundary. Keep internal marker fields stripped from provider input.
Do not introduce a migration or alter retry/idempotency semantics.

## Result

Implemented preparation after snapshot/reference preconditions and before
credit reservation. The same prepared prompt is sent to Hermes and normal
media, with the existing media boundary skipping only an exact-hash prepared
cover marker. Safety metadata is stored additively in the existing JSONB state.
