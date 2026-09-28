# Decision log

## Depth: standard quick-plan

The behavior is a medium UI/state change in one large component with existing
server contracts. Quick-plan is sufficient because no new backend contract,
schema, or cross-service integration is required.

## Decisions

1. Use one master disclosure state for the complete reference/casting group.
2. Derive the first default from `resolveCharacterCardPortraitAsset` rather
   than introducing a second primary-image resolver.
3. Keep explicit user state per character while the panel is mounted, and
   reset/evaluate the default when the selected character changes.
4. Keep candidate generation/polling/mutations unchanged.
5. Add a pure helper test for the default-open rule; preserve existing pure
   reference/candidate tests.

## Self-review rounds

- Round 1: verified the design covers existing-reference promotion and 1–5
  casting; no backend work was accidentally included.
- Round 2: checked the dirty checkout boundary; limited writes to the target
  component, focused test, and planning artifacts.
- Round 3: checked async behavior; collapsing is visual-only and must not stop
  candidate polling or cancel mutations.
- Round 4: checked accessibility; trigger requires `aria-expanded` and stable
  test ids, and remains visible when collapsed.
- Round 5: checked responsive behavior and read-only handling; no new
  dependency or browser-only assumption was added.

No `[AUTO-FIX]` items remain.
