# Section 01 — Disclosure state and UI

## Ownership

Own the single target component only:
`apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`.

## Work

- Add a pure, exported default-state helper.
- Use the existing primary-portrait resolver.
- Add a master expanded/collapsed state keyed to the selected character.
- Add an accessible trigger and stable test ids.
- Coordinate the selected-character detail content and persistent right
  reference panel with the master state.
- Keep candidate polling/effects mounted and preserve all existing mutation
  payloads and read-only guards.

## UI/UX contract

- Target user: creator replacing a disliked character face.
- Surface: selected character detail in Vertical Drama character stock.
- State matrix: no primary → expanded; primary exists → collapsed; explicit
  toggle → user choice for the current character; read-only → visible but
  non-mutating.
- Responsive: trigger remains usable on mobile; expanded content retains the
  current responsive grid/sidebar behavior.
- Accessibility: button trigger, `aria-expanded`, descriptive Thai/English
  labels, keyboard activation, visible focus.
- Copy: use existing `t(lang, thai, english)` convention; label the group as
  “อ้างอิงตัวละคร” / “Character references”.
- Browser evidence: not available in this local run; report authenticated
  browser verification as unperformed unless a browser harness is already
  present.

## Acceptance

The complete reference/casting group is hidden when collapsed, expands with one
click, and uses the existing server/API behavior unchanged.
