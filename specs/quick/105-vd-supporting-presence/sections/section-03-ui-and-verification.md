# Section 03 — UI and verification

## Ownership

Own the shot card supporting-presence section and page mutation wiring.

## UI/UX contract

- Target user: episode author reviewing whether the generated shot contains the
  right generic people.
- Surface: existing storyboard shot card, below identity-locked character refs.
- States: absent, auto-confirmed, suggestion, customized, saving, error.
- Actions: add, edit role/count/action/visibility, remove, suppress all,
  restore auto suggestions.
- Copy: always say `เฉพาะช็อตนี้` / `This shot only`; never imply roster creation.
- Accessibility: labeled controls, keyboard-usable popover/dialog, visible
  pending/error state, no icon-only unlabeled action.

## TDD

Test rendering and callback payloads for auto entries, manual edits, empty
suppression, and local-scope copy. Run focused UI tests and changed-file checks.

## Acceptance

The user can correct a false detection without editing a prompt manually, and a
correction does not alter any other shot.
