# Section 3 — Storyboard Review focused panel

## Ownership

Files: `apps/extension/src/panel/App.tsx`, `apps/extension/src/panel/style.css`.

Reuse Drama Series list/detail navigation and shared media/prompt components.
Make the project list and detail mutually exclusive, add Back, and render both
compact prompt types with full Copy.

## UI/UX Contract

### Target User / JTBD
- Role: creator using the extension side panel.
- Goal: choose one Storyboard project, inspect clips, drag any image, and copy prompts.
- Entry point: Storyboard Review tab.
- Success outcome: detail uses the full panel width and is easy to exit.

### Existing Pattern Reference
- Searched: `rg "selectedDramaProject|← Projects|productionPromptBox|productionMediaCard" apps/extension/src/panel/App.tsx`.
- Found: Drama Series mutually exclusive project/episode/shot flow and shared prompt/media cards.
- Decision: reuse.

### Surface Inventory
| Surface | File | Change |
|---|---|---|
| Storyboard project list/detail | `apps/extension/src/panel/App.tsx` | mutually exclusive states |
| Clip prompts | `apps/extension/src/panel/App.tsx` | image + video compact boxes |
| Panel layout | `apps/extension/src/panel/style.css` | one-column detail |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | loading project/clip copy | focused render inspection |
| empty | explicit no project/no clip copy | existing branches |
| detail | only selected project and clips | list/detail test/manual |
| back | clears selection and returns to list | button interaction |
| prompt | 4-5 line preview, full Copy | DOM/value assertion |

### Responsive Matrix
| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | one column, no horizontal overflow |
| tablet 768x1024 | one column detail, readable prompt controls |
| desktop 1440x900 | detail uses full available panel width |

### Accessibility Acceptance
- Project cards, Back, Copy, and draggable media remain keyboard reachable.
- Prompt fields have labels and visible focus; button semantics remain native.

### Copy Contract
- Keep existing concise English UI labels and empty/loading messages.
- `Copy` copies the untruncated stored prompt.

### Browser Evidence Required
- Manual/screenshot check at mobile, tablet, and desktop when browser access is available.

