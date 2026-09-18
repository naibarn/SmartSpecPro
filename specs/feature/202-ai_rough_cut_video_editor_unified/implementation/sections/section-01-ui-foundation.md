# Section 01 — UI foundation, state model, and accessibility primitives

## Goal

Create the shared editor UI/state layer that all later sections consume. Remove
semantic and focus ambiguity from custom Phase3 overlays without changing the
timeline or preview behavior.

## Ownership paths

- Add: `apps/web/client/src/components/videoeditor/ui/editorUiState.ts`
- Add: `apps/web/client/src/components/videoeditor/ui/editorCopy.ts`
- Add: `apps/web/client/src/components/videoeditor/ui/EditorStatusBanner.tsx`
- Add: `apps/web/client/src/components/videoeditor/ui/EditorDialog.tsx`
- Add: `apps/web/client/src/components/videoeditor/ui/EditorMobileSheet.tsx`
- Modify: `VideoEditorPhase3.tsx`, `ConfirmDialog.tsx`, `ExportDialog.tsx`,
  `RenderProgressDialog.tsx`, `KeyboardShortcutsOverlay.tsx`
- Tests: `client/src/components/videoeditor/__tests__/` focused state and
  accessibility tests

## Design

Define stable UI-only discriminated unions for save/sync/conflict/execution/
capability/review/QC. Each state stores display-safe reason, severity,
available actions, and optional revision/job/artifact identifiers; it must not
become a second source of truth.

Use the existing `components/ui/dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`,
`tabs.tsx`, `alert.tsx`, `badge.tsx`, and `progress.tsx`. The editor wrapper
owns only editor copy, action naming, and focus return. It must preserve Radix
controlled open/onOpenChange behavior.

Define an error mapper keyed by server error code and known safe metadata. Raw
exception text may be retained in developer logs, not rendered as the only
user-facing message. Use Thai-first copy with short English fallback.

The live-region component must support polite progress and assertive blocking
messages with deduplication. Status changes caused by polling must not announce
the same message repeatedly.

Replace editor-local custom overlays one surface at a time. Preserve existing
callbacks and visual intent while adding title/description, labelled close,
focus containment, Escape, focus restoration, pending/disabled state, and
explicit backdrop policy. Convert project/sidebar controls to semantic Tabs;
non-navigation actions remain buttons.

## TDD checklist

- State mapper covers loading, empty, error, success, disabled, selected,
  conflict, waiting-agent, capability-blocked, degraded, and QC-blocked.
- Dialog/AlertDialog accessible roles/names, focus order, Escape, close label,
  focus restoration, and action pending state.
- Sheet open/backdrop/Escape/close/focus return at mobile width.
- Tabs keyboard navigation and selected/controls association.
- Live-region deduplication and polite/assertive behavior.
- Existing Preview/Timeline tests remain green.

## UI/UX Contract

### Target User / JTBD

- Role: Web video editor user.
- Goal: open panels/dialogs, understand state, and act without losing focus.
- Entry point: `/video-editor` active Phase3 shell.
- Success: every overlay and panel is keyboard reachable and screen-reader
  understandable.

### Existing Pattern Reference

- Searched: `apps/web/client/src/components/ui`, videoeditor components, and
  existing Dialog/Sheet/Tabs/focus-visible usages.
- Found: Radix UI primitives and `WorkerWebEditor` focus-visible controls.
- Decision: reuse. Diverge only for timeline-specific dense layout.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Confirm/project/export/render dialogs | Phase3 and local dialog files | Radix semantics/focus/copy |
| Keyboard overlay | `KeyboardShortcutsOverlay.tsx` | Dialog semantics and truthful shortcuts |

## Implementation result

Implemented the shared UI state/copy layer, safe nested-error mapping, live
status banner, Radix dialog/sheet wrappers, and `useEditorFocusScope` for
legacy editor overlays. Confirm, keyboard help, export, render progress, saved
projects, and the active mobile panel now expose names, Escape handling, Tab
containment, pending-safe actions, and focus restoration.

Focused proof: `editorUiState.test.ts`, `editorUiSurfaces.test.tsx`, the full
videoeditor regression matrix, and targeted esbuild checks passed.
| Mobile sidebar | Phase3 | Managed Sheet |
| Sidebar navigation | Phase3 | Tabs semantics |
| Status/live region | New UI primitives | Shared projection |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Editor UI state types | `ui/editorUiState.ts` | UI-only state unions | server-safe projections |
| Copy/error mapper | `ui/editorCopy.ts` | Thai/fallback safe copy | error/status codes |
| EditorDialog | `ui/EditorDialog.tsx` | dialog semantics/focus | Radix Dialog |
| EditorMobileSheet | `ui/EditorMobileSheet.tsx` | mobile panel/focus | Radix Sheet |
| EditorStatusBanner | `ui/EditorStatusBanner.tsx` | status/live region | UI state + actions |
| Phase3 shell adapters | `VideoEditorPhase3.tsx` | composition and callbacks | shared primitives |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | labelled progress | role/name test |
| empty | explanation + primary action | empty fixture |
| error | safe copy + retry | error mapper test |
| success | confirmation + next action | status test |
| disabled | disabled action + reason | button test |
| focus/selected | focus ring/selected semantics | keyboard test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Sheet fits viewport and traps focus | Playwright |
| tablet 768x1024 | Tabs remain reachable | Playwright |
| desktop 1440x900 | Dialog centered, no clipping | Playwright |
| small-mobile 360x800 | Compact copy and actions remain reachable | Playwright |
| laptop 1024x768 | Dialog content scrolls internally | Playwright |
| wide-desktop 1280x800 | No overlay overlap | Playwright |

### Accessibility Acceptance

- All dialogs have title/description, `aria-modal`, labelled close, Escape,
  focus trap, and focus return.
- Tabs expose selected and controlled panel state.
- Icon-only controls have accessible names and visible focus rings.
- Status/live regions are not color-only and respect reduced motion.

### Copy Contract

- Thai-first; English fallback.
- Error copy explains what happened, data safety, and next action.
- No raw exception, provider URL, or stack text as sole message.

### Browser Evidence Required

Follow `ui-browser-verification.md`; capture dialog/sheet/tab keyboard paths,
focus, labels, reduced-motion, and overflow at required/extended viewports.

## Exit criteria

Shared primitives and tests are complete; later sections can import the state,
copy, dialog, sheet, tabs, and live-region contracts without redefining them.
