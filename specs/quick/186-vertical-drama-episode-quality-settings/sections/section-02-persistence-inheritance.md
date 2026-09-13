# Section 02 — Persistence and Inheritance

## Ownership

Schema migration, episode detail projection, settings mutation, and all new-episode insertion paths.

## Target files

- `apps/web/drizzle/schema.ts`
- new manual migration under `apps/web/drizzle/`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/routers/verticalDramaSeries.ts` only if series projection needs a dedicated field
- router/schema tests

## Requirements

- Nullable columns only; no backfill.
- Use existing tenant/user/series ownership helpers.
- Update current episode and series default in one transaction.
- Snapshot series defaults in `insertEpisodeWithSafeNumber`.
- Null old episode settings resolve to Auto, not the current series default.

## Security/data integrity

Cross-tenant and cross-user IDs must return the established not-found behavior. Setting save must not trigger generation, credits, or artifact mutation.
