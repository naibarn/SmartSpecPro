# Character Look Name and Details Display

## Goal

Make every character look easy to identify from the character roster. The full
look name must remain readable, and the user should see the look description
without opening an editor or guessing from the thumbnail.

## Scope and acceptance criteria

- Update the look item inside `VerticalDramaCharacterStockPanel`.
- Render the complete `variantLabel` with wrapping instead of ellipsis.
- Render the most useful available description below the name:
  `data.description`, then `data.lookImageBrief` as a fallback.
- Preserve selection, image preview, drag/drop, generate, edit, delete, and
  keyboard behavior.
- Keep the card bounded: the name may wrap; the description is limited to a
  readable multi-line preview and exposes the full text through `title`.
- Do not change persisted data, API contracts, or look-selection behavior.
- Cover long Thai/English names, descriptions, missing descriptions, and the
  existing action/selection affordances with focused tests.

## Approach

Reuse the existing look-chip structure and semantic controls. Replace the
single-line `truncate` label with a small vertical content region using
`whitespace-normal break-words`, and add a muted description preview. The
description is derived in the client from the already-returned look `data`
payload, so the change is display-only and does not add a query or migration.

An alternative tooltip-only treatment was rejected because it hides important
information and is poor for touch and keyboard users. A modal/details panel was
also rejected because it adds an extra interaction for a frequent roster task.

## UI/UX Contract

### Target User / JTBD

- Role: series creator/editor.
- Goal: understand which outfit or age-stage look to select.
- Entry point: Series → Characters tab, within a character card's look list.
- Success outcome: the user can distinguish looks from the visible full name and
  description without opening another dialog.

### Existing Pattern Reference

- Searched with targeted `rg` in `VerticalDramaCharacterStockPanel.tsx`,
  `VerticalDramaStoryboardPanel.tsx`, and
  `VerticalDramaCharacterReferencePanel.tsx`.
- Found: storyboard/location rows already use `whitespace-normal` for readable
  button content and `line-clamp-2` for bounded descriptions.
- Decision: reuse those patterns and the roster's existing Tailwind/shadcn
  primitives; diverge only by allowing the look name itself to wrap fully.

### Surface Inventory

| Surface             | File/route                                                                        | Change                              |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| Character look item | `VerticalDramaCharacterStockPanel.tsx`, Characters tab                            | Full name and description preview   |
| Look item tests     | `VerticalDramaCharacterStockPanel.characterCrud.test.ts` or adjacent focused test | Display-data and long-text coverage |

### Component Map

| Component             | File                                                                                      | Owns                                  | Consumes                                                  |
| --------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| Character stock panel | `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx` | Look item layout and display fallback | `variantLabel`, `data.description`, `data.lookImageBrief` |

### State Matrix

| State                 | Expected UI                                                      | Verification                                 |
| --------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| loading               | Existing image/action loading states remain unchanged            | Existing focused panel tests                 |
| empty description     | Name remains visible; no empty placeholder row                   | Display helper test                          |
| long name/description | Name wraps fully; description is bounded but available via title | Long text test/manual inspection             |
| success               | Full label and useful description are visible                    | Focused test                                 |
| disabled/focus/hover  | Existing action disabled states and visible focus rings remain   | Existing interaction tests/manual inspection |
| selected              | Existing selected border/background remains                      | Existing interaction tests                   |

### Responsive Matrix

| Viewport              | Expected behavior                                        | Evidence                          |
| --------------------- | -------------------------------------------------------- | --------------------------------- |
| mobile 390x844        | Look item may grow vertically; no horizontal clipping    | Manual/browser check if available |
| tablet 768x1024       | Wrapped name/description stays inside character card     | Manual/browser check if available |
| desktop 1440x900      | Full names remain readable without disturbing action row | Manual/browser check if available |
| small-mobile 360x800  | Same wrapping strategy; no forced minimum width          | Manual inspection if available    |
| laptop 1024x768       | Existing grid/card behavior retained                     | Manual inspection if available    |
| wide-desktop 1280x800 | Description does not create excessive card height        | Manual inspection if available    |

### Accessibility Acceptance

- Keep the existing real buttons for image preview, selection, generate, edit,
  and delete.
- Preserve accessible names using the full look label.
- Use visible text rather than tooltip as the primary information source;
  `title` is only a supplementary full-description affordance.
- Preserve keyboard focus rings and selected state semantics.
- Use existing semantic color tokens and no new motion.

### Copy Contract

- Thai and English labels remain unchanged.
- No new user-facing error or validation copy.
- Description is user-authored/generated content and is displayed verbatim
  after trimming; missing content remains silent.

### Browser Evidence Required

Follow `orchestra/references/ui-browser-verification.md`. If authenticated
browser tooling or a running route is unavailable, record the blocker and
provide focused test plus manual code inspection evidence rather than calling
browser verification a pass.

## Data and failure handling

The UI must tolerate `data` being null, malformed, or missing either field. It
must never throw while rendering a look. `description` is preferred because it
is the human-facing look description; `lookImageBrief` is a useful fallback for
older/generated records that have no `description`.

## Verification plan

1. Add a pure display helper test for description precedence and empty values.
2. Add/extend focused component logic tests for long labels and descriptions.
3. Run the affected Vitest files, `git diff --check`, and a focused typecheck or
   equivalent compile check if available.
4. Review the final diff for unchanged action handlers and unrelated files.
