# Implementation plan

## Objective

Make the existing Vertical Drama character reference/casting workflow one
discoverable disclosure: open by default for a character with no primary
portrait, collapsed by default for a character with one, and manually
reopenable without changing any server contract.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  - add/export a small default-state helper;
  - replace or bridge the right-panel-only collapse state with a master state;
  - add one accessible disclosure trigger;
  - conditionally show the existing reference picker/casting content and right
    reference column as one group;
  - preserve polling and mutation lifecycle.
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.characterCrud.test.ts`
  - add pure helper coverage for no-primary/open and primary/closed defaults.

## Approach

1. Identify the selected character's owned primary portrait through the existing
   `resolveCharacterCardPortraitAsset(assets, characterId)` resolver.
2. Add a pure helper such as
   `resolveCharacterReferenceDisclosureDefault({ hasPrimaryPortrait })` so the
   default rule is deterministic and testable.
3. Track explicit expanded state by character id (or equivalent selected-id
   reset). Avoid treating a transient query refresh as a user action.
4. Render a compact trigger near the selected-character detail. It should show
   the group label/status and `aria-expanded`.
5. When closed, hide the reference picker, candidate-count/generation controls,
   candidate batch results, asset list, and importer; retain only the trigger.
   When open, preserve the current JSX and mutation handlers.
6. Make the existing right panel consume the same master state so it cannot
   appear expanded while the detail controls are hidden. Avoid changing
   `setPrimaryPortrait`, candidate payloads, credit guards, or polling setup.
7. Run focused tests, diff checks, and changed-file diagnostics. Treat any
   unrelated baseline errors separately.

## Acceptance criteria

- Character with no owned primary portrait opens the reference/casting group on
  selection.
- Character with an existing primary portrait shows only the compact trigger on
  selection.
- Clicking the trigger reveals the existing asset list, promotion action,
  importer, and 1–5 casting controls.
- Selecting another owned reference still calls the existing promotion flow.
- Candidate generation still supports 1, 2, 3, 4, and 5 and existing polling
  continues while the group is collapsed.
- Read-only mode does not gain mutation affordances.
- Trigger exposes `aria-expanded` and stable test ids.
- Existing focused Vertical Drama tests pass; `git diff --check` passes.

## Risks and mitigations

- Large component: keep the patch localized and avoid refactoring unrelated
  JSX.
- Query refresh/default race: explicit user state is separate from derived
  primary status and only the selected-character transition applies defaults.
- Hidden polling: do not move or conditionally mount the polling effects; only
  conditionally render the visual result sections.
- Layout regression: retain existing responsive classes and make the collapsed
  right column reclaim its width.
