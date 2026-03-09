# Section 02: Editor Note Authoring UX

## Goal

Expose both note types in Presentation Editor as hidden-on-demand authoring tools with edit/save/copy support.

## Scope

- Presentation Editor state additions for deck note draft and slide note draft
- hidden note triggers in desktop/mobile header or contextual controls
- note dialogs/drawers/panels
- copy-to-clipboard handlers
- wiring note values into the correct mutation payloads
- client tests for UX and persistence calls

## Key Design Decisions

- Presentation Note opens from a deck-level control
- Slide Note opens from a slide-level control tied to the selected slide
- notes are closed by default and do not occupy permanent canvas space
- slide notes participate in slide save semantics; deck notes use deck mutation semantics

## Implementation Steps

1. Add UI triggers for opening Presentation Note and Slide Note
2. Add local state for:
   - current deck note draft
   - current slide note draft
   - open/closed state per note surface
3. Implement copy actions with clipboard + toast feedback
4. Update slide save paths so `notes` is always included where appropriate:
   - main `performSave()`
   - dirty cached slide save path before auto-layout
   - any other direct `updateSlideMutation` call site
5. Implement deck note save using `updateDeckMutation` with expected-version handling
6. Add tests covering hidden/open state, save payloads, and copy interactions

## Constraints

- do not create an always-visible sidebar for notes
- do not bypass existing conflict/version mechanisms
- keep mobile behavior functional with the editor's current drawer-based layout

## Done When

- users can open either note only when needed
- users can edit/save/copy either note
- slide note persists with slide changes
- deck note persists independently of slide changes
