# Section 02 — Server adapter, persistence, and API

## Ownership

- Durable run/card storage and migration.
- Authorized product/character context assembly.
- Skill runtime adapter and protected tRPC procedures.

## Targets

- `apps/web/drizzle/schema.ts` and additive migration.
- `apps/web/server/services/marketplaceReviewIdeaService.ts`.
- `apps/web/server/services/verticalDramaMarketplaceReviewSkillAdapter.ts`.
- `apps/web/server/routers/verticalDramaEpisodes.ts` or the narrow existing
  Vertical Drama router boundary.

## TDD and acceptance

Test tenant/series ownership, managed references, idempotent retry, persisted
three-card runs, selection hydration payload, safe skill failures, and additive
look/scene request upsert. Never render paid media or overwrite DNA/assets.
