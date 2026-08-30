# Section 04 — Idea cards, special dialog, and additive slots

## UI/UX Contract

- Target user: Vertical Drama creator embedding an authorized marketplace
  product/place into a believable series side-story.
- Surface inventory: Special Tie-in dialog, Marketplace image picker, idea-card
  panel, Character tab pending-look section, Scene tab pending-scene section.
- States: idle, loading, three-card success, regenerate, selected, empty,
  validation error, authorization error, runtime failure, pending slot request.
- Responsive: compact stacked layout on mobile; two-column dialog/card layout on
  desktop; scrollable modal body; no hidden action behind icon-only controls.
- Accessibility: labels, keyboard-selectable cards, `aria-pressed`, live status,
  focus-safe dialog/lightbox, Escape close, Thai/English copy.
- Browser evidence: authenticated Marketplace selection, fullscreen preview,
  three-card regeneration, selection hydration, and pending slot visibility.

## Ownership

Add the idea panel and hydration callbacks to the existing dialog, then surface
pending requests in existing character/location tabs without copying the tabs or
changing normal episode behavior.

## TDD and acceptance

Tests cover card regeneration/history, selected-card hydration, preview/lightbox,
model states, and slot-request links/status. Missing look/scene requests are
additive and visibly marked pending.
