# Section 03 — UI compatibility

## Ownership

Own only the client types and display assumptions affected by optional prompt
fields. Keep existing portrait approval and direct-confirm sheet behavior.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- client/router contract tests if present

## UI/UX Contract

- **Target user/job:** creator generates one character portrait or one chosen
  design-bible sheet and approves/render it without seeing irrelevant prompt
  variants.
- **Surface inventory:** portrait preview card, portrait approval action,
  unified sheet type selector, sheet generation status, and generated asset
  history.
- **Component map:** retain existing `MediaPromptPreview`, sheet selector,
  loading state, polling, and asset cards; change only optional response typing.
- **State matrix:** loading shows current action; success shows the single
  approved/rendered result; cancellation clears preview; schema/credit errors
  use existing toast/error path; absent sibling prompts render nothing.
- **Responsive/accessibility:** preserve current responsive layout, keyboard
  operation, labels, disabled states, and ARIA names. No new controls are
  required for deliverable selection beyond the existing sheet selector.
- **Copy/localization:** retain existing Thai/English labels for portrait,
  turnaround, and sheet types. Do not expose internal skill names or token
  details in creator-facing copy.
- **Browser evidence:** focused browser smoke should verify portrait preview
  approval and sheet selection do not show empty prompt panels or trigger a
  second prompt request.

## TDD expectations

Update types/mocks only where the router response becomes optional. Verify the
UI does not substitute empty strings for missing deliverables.

## Risks

The current client stores `turnaroundPrompt` although it no longer reads it.
Keep the field optional during compatibility transition and remove it only in a
separate cleanup after all consumers are proven absent.

## Implementation evidence

- The preview state and response union now treat `turnaroundPrompt` as
  optional.
- Existing prompt approval, cancellation, polling, and sheet selector flows
  remain unchanged; no unused prompt card was added.
