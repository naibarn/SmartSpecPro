# Section 08 — Central UI and Drag/Drop

## Goal

Deliver one understandable, spacious Object Reference workspace and the same
reference workflow in shot cards.

## Implementation

- Use `VerticalDramaObjectReferenceTab.tsx` as the central wide workspace;
  `tab=product` is a compatibility alias.
- Keep header actions for add object/product/import/prompt/generation and use
  progressive disclosure for metadata, commercial policy, history, and usage.
- Extend `ImageSourcePicker.tsx` for local file drop and draggable Library/
  History tile payloads; import to managed media and preserve source.
- Add one unified shot Object Reference card that contains Product tie-in and
  story-prop variants, with evidence, canonical selection, accept/reject,
  add/remove/replace/lock/reset, and drag/drop without rendering a second
  narrow prop strip.

## UI/UX contract

| State    | Required behavior                             |
| -------- | --------------------------------------------- |
| Loading  | skeleton/disabled actions, stable layout      |
| Empty    | explain optional objects and offer add/import |
| Success  | canonical/source/usage visible                |
| Warning  | non-blocking message with retry/review        |
| Conflict | preserve draft and offer reload/merge         |
| Archived | explicit history/restore only                 |
| Disabled | capability reason; no hidden request          |

Desktop uses the central Product Tie-in-style wide layout; tablet/mobile stack
cards and retain primary actions. All actions have labels, keyboard focus,
escape behavior, contrast, reduced-motion compatibility, and a file-picker
alternative to drag/drop. Thai-first copy has English fallback.

## Tests first

Use jsdom for state, copy, keyboard, drop, picker, upload failure/retry, and
no-duplicate-editor tests. Browser proof must exercise the owner-scoped flow.

## Ownership and acceptance

Own catalog UI, picker presentation, shot UI additions, and UI tests. Keep
server persistence in sections 3–7.

## UI/UX Contract

### Target User / JTBD

Series creator can define one story object and reuse its visual identity across
shots with minimal navigation.

### Surface Inventory

Central catalog header/editor/list, asset drop zones, Library/History picker,
shot object controls, warnings, and history.

### Component Map

`VerticalDramaObjectReferenceTab` owns catalog; `ImageSourcePicker` owns source
selection; storyboard panel owns shot usage; legacy Product editor is adapter-only.

### State Matrix

Loading, empty, success, warning, conflict, archived, and disabled states are
implemented exactly as the table above and are non-blocking where optional.

### Responsive Matrix

Desktop: wide central two-column workspace. Tablet: stacked editor/list. Mobile:
stacked cards with primary actions first and no side-rail dependency.

### Accessibility Acceptance

Keyboard focus, labelled controls, escape-close, visible focus, contrast,
reduced-motion support, aria-live warnings, and file-picker fallback are
required. Drag/drop is never the only input.

### Copy Contract

Thai-first labels include “วัตถุประกอบฉาก” and “เพิ่มภาพอ้างอิง”; English
fallback says “Object Reference” and “Add reference image”. Empty/error/retry
copy explains that object work is optional.

### Browser Evidence Required

Prove create/import, hard-disk drop, Library/History drop, canonical selection,
shot link/remove/reset, Special mode in one surface, keyboard flow, and mobile
layout.

## Implementation Record

Implemented in `VerticalDramaObjectReferenceTab.tsx`, `ImageSourcePicker.tsx`,
`VerticalDramaStoryboardPanel.tsx`, and `VerticalDramaEpisodePage.tsx` using the
wide Product tie-in layout and managed upload/import flow.
