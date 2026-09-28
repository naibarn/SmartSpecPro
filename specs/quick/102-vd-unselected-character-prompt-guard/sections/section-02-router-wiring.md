# Section 02 — Router Wiring

## Ownership

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- relevant focused router/source tests

## Work

- Resolve all roster names under the existing tenant + series ownership
  boundary.
- Subtract selected physical and explicit screen-caller keys.
- Pass excluded names into start-frame prompt generation.

## TDD acceptance

- Selected physical/screen-caller names are never excluded.
- Unselected roster names are forwarded as exclusions.
- No schema, route input, auth, credit, or persistence contract changes.
