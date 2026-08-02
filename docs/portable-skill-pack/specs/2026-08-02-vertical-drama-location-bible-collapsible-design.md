# Vertical Drama Location Bible Collapsible

## Goal

Reduce the vertical space consumed by the episode-level location/scene visual
bible so that storyboard shots remain fast to reach. The location/scene section
must be collapsed by default and expandable on demand.

## Scope

- Change `VerticalDramaLocationsBibleCard` in
  `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`.
- Keep the existing location rows, image generation flow, coverage controls,
  and scene-lock controls unchanged inside the disclosure content.
- Add focused UI regression coverage for the default collapsed state and the
  expanded state.

## Interaction design

- Use the repository's existing Radix `Collapsible` primitive.
- Keep a visible trigger containing the location/scene title, the location
  count, and a chevron that rotates when expanded.
- Start with `open=false` on every mount; do not persist the state in
  `localStorage` so the requested default remains deterministic.
- The trigger is a keyboard-accessible button and exposes `aria-expanded`.
- Collapsing only hides the presentation content. It does not mutate the
  storyboard, location roster, scene state, or any server data.

## State and failure behavior

- Existing tRPC queries and local mutation state remain owned by the card, so
  reopening the section does not lose an in-progress preview/candidate state.
- An empty `distinctLocations` list continues to render nothing.
- No API, schema, migration, feature flag, or deployment change is required.

## Validation

- Assert the trigger is collapsed by default and exposes `aria-expanded=false`.
- Click the trigger and assert `aria-expanded=true` plus the existing location
  row test id is available.
- Keep the existing focused storyboard and scene-continuity tests green.
- Run `git diff --check` and the focused Vitest file(s).
