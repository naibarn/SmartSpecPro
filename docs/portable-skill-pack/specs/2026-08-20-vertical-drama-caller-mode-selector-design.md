# Vertical Drama Caller Mode Selector

## Goal

Make the per-shot caller mode unambiguous. Users must see the current mode and
the available conversion choice as two visible options instead of mistaking an
action button for the current state.

## UI/UX Contract

### Target User / JTBD

- Role: Vertical Drama storyboard author.
- Goal: Confirm whether a remote character is shown through a phone or speaks
  from behind a closed door.
- Entry point: Per-shot storyboard card with a physical scene character and a
  screen caller.
- Success outcome: The selected option clearly communicates the persisted/current
  interpretation before the user changes it.

### Existing Pattern Reference

- Searched: `RadioGroup`, `RadioGroupItem`, and existing select usage under
  `apps/web/client/src/components/verticalDramaSeries`.
- Found: `VerticalDramaSeriesShareDialog.tsx` and `SkillAgencySelector.tsx` use
  visible mutually-exclusive options with the shared radio-group component.
- Decision: reuse the radio-group interaction pattern.

### Surface and Component Map

- `VerticalDramaStoryboardPanel.tsx`: replace the ambiguous closed-door action
  button with a two-option radio group.
- `VerticalDramaStoryboardPanel.referenceFrames.test.tsx`: verify phone is
  selected by default and closed-door selection calls the existing callback.
- No backend contract changes.

### State and Accessibility

- Phone mode: selected by default when `barrierDialogue` and `barrierMultiView`
  are absent; remains the authoritative controlled value.
- Closed-door mode: selecting it calls the existing conversion callback; the
  server response/refetch remains the source of truth for the resulting state.
- Use a labelled `radiogroup`, two keyboard-focusable radio items, visible
  labels, and existing design tokens/classes.
- Keep Dual View / two-location configuration in its existing separate section.

### Copy Contract

- Thai: `รูปแบบการสื่อสาร`, `ผ่านโทรศัพท์ — แสดง Caller บนหน้าจอเท่านั้น`,
  `ผ่านประตู — อีกฝั่งอยู่นอกเฟรม`.
- English: `Communication mode`, `Phone — show the caller on screen only`,
  `Closed door — the other actor stays offscreen`.

### Verification

- Focused jsdom component test for selected state and conversion callback.
- Existing Vertical Drama barrier-multi-view tests remain unchanged and must
  continue to pass.
- Browser screenshot/manual route verification is not available in this local
  session; record it as skipped unless a browser runner is explicitly run.
