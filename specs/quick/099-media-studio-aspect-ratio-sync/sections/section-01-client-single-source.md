# Section 01 - Client Single Source

## Ownership

- `apps/web/client/src/pages/MediaStudio.tsx`
- focused helpers under `apps/web/client/src/lib/`
- `apps/web/client/src/components/media/DynamicSkillForm.tsx`
- matching Vitest files

## TDD Expectations

- Prove canonical state wins over stale hidden values.
- Prove initial and retry resolution match.
- Prove excluded defaults do not enter form state.
- Preserve Veo storyboard resolution.

## UI/UX Contract

- Target: Media Studio users selecting an output ratio.
- Surface: existing ratio selector and read-only synchronized model field.
- States: selection, skill change, model change, first generation, retry.
- Responsive/a11y/copy: no rendered layout, label, focus, or copy change.
- Browser evidence: not required if pure state/payload tests prove the unchanged
  rendered selector contract; manually inspect the rendered binding.
