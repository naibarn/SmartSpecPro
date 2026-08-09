# Section 01: Contracts and Migration

## Depends on

None.

## Owns

- `apps/web/shared/verticalDramaSeries/episodeCover.ts`
- `apps/web/shared/verticalDramaSeries/episodeCover.test.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/manual_vertical_drama_episode_cover_image.sql`

## Implementation

1. Define the internal nullable `VerticalDramaEpisodeCoverState`, including `status`, task/asset/model fields, selected shot numbers, prompt snapshot, source, error, and internal idempotency/supersession bookkeeping. Defensive readers must treat malformed JSONB as empty/no cover.
2. Define the display-safe projection type. It must not contain prompt, raw media asset id, provider task payload, or internal idempotency data.
3. Implement the exact prompt formatter from current normalized series/episode values. Keep the approved Thai headings and omit empty sections; add no creative instructions.
4. Implement deterministic approved-frame selection: approved asset ids only, narrative overlap scoring, distinct shot numbers, visual diversity, story-order output, and evenly spaced fallback, capped at four.
5. Add pure tests for exact prompt bytes/sections, malformed legacy shapes, relevance/cap/order/fallback, and projection field stripping.
6. Add the nullable `coverImage` JSONB column to `verticalDramaEpisodes` and document the manual migration convention.
7. Add the idempotent manual `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration. Do not run it against production or alter existing data during local verification.

## Contracts for later sections

- Server lifecycle imports the shared state, prompt, selector, and safe parsing helpers.
- The list projection accepts an internal state plus an optional resolved URL and returns only the display DTO.
- UI treats null/malformed state as the no-cover state.

## Tests first

Write the pure tests before implementing the helper bodies. Keep this section free of provider/router imports.

## Completion proof

- Shared tests pass.
- Schema TypeScript remains valid.
- Migration is idempotent and additive by inspection.
- `git diff --check` passes for section files.

## UI/UX Contract

This section owns no visual UI; the contract below records the boundary that later UI work consumes.

### Target User / JTBD

Series owner needs a stable cover state and exact story context so the Episodes tab can show the correct action.

### Surface Inventory

Shared state/prompt/reference contracts and the episode JSONB field; no rendered surface.

### Component Map

Section 04 owns the model picker, cover card surface, and upload drop zone. This section supplies their data contract.

### State Matrix

Null/malformed state maps to no-cover; generating, ready, and failed are explicit states; internal fields are not rendered.

### Responsive Matrix

No layout changes in this section. Consumers must remain compatible with the existing one/two-column Episodes grid.

### Accessibility Acceptance

No direct controls. Later UI must expose state text and keyboard upload independently of drag/drop.

### Copy Contract

The prompt headings and content are the approved Thai copy; no extra creative text is permitted.

### Browser Evidence Required

No browser evidence for pure contracts; section 04/05 records the visual evidence.
