# Section 05 — Responsive, visual, copy, and motion consistency

## Goal

Make the active editor coherent at mobile/tablet/desktop while preserving
intentional timeline scrolling and existing editing behavior.

## Ownership paths

- Modify Phase3 shell/layout and affected editor panels after Sections 01–04
  state contracts are stable.
- Reuse `components/ui` tokens/primitives and `WorkerWebEditor` control sizing.
- Add focused responsive/copy/reduced-motion tests; do not rewrite legacy
  rollback UI unless a shared primitive requires compatibility.

## Design

At tablet width use Preview plus navigable tabs for Timeline, Transcript/Review,
AI, Assets, and Inspector. Do not compress the desktop sidebar and every tool
row into 768px. At mobile use the managed Sheet from Section 01 with explicit
close, Escape, backdrop, focus return, and reachable primary action.

Keep timeline content horizontally scrollable by design. Header/actions and
primary controls must not be accidentally clipped or pushed outside the
viewport. Every intentional scroll container is documented.

Normalize buttons, tabs, badges, banners, inputs, modal surfaces, spacing,
colors, and focus states to existing product tokens/components. Preserve dense
timeline geometry where necessary. Add reduced-motion handling for sheet/dialog
transitions, status spinners, and preview animations.

Use Thai-first copy and safe English fallback. Copy must distinguish queued,
waiting, blocked, degraded, review, QC, and completed. Do not render raw
exception/provider/URL text as the only explanation.

## TDD checklist

- Breakpoint mode and primary action visibility at 360/390/768/1024/1280/1440.
- Mobile Sheet focus and close behavior.
- Tablet navigation does not expose inaccessible squeezed desktop controls.
- Intentional timeline scrolling remains; accidental header overflow fails.
- Icon-only names, focus rings, and touch target checks.
- Thai/fallback copy equivalence and raw error suppression.
- Reduced-motion transitions/spinners.

## UI/UX Contract

### Target User / JTBD

- Role: creator working on laptop, tablet, or mobile review flow.
- Goal: reach editing, save, submit, and review actions without clipping or
  losing context.
- Entry point: active `/video-editor` route.
- Success: viewport-specific layout is readable and primary actions remain
  reachable.

### Existing Pattern Reference

- Searched: `WorkerWebEditor.tsx`, shared Sheet/Tabs/Button, existing responsive
  pages, and historical route evidence.
- Found: accessible Worker controls and shared responsive primitives.
- Decision: reuse; diverge only for timeline canvas scroll behavior.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Editor header/toolbars | Phase3 | Hierarchy, overflow, touch/focus |
| Sidebar/tablet navigation | Phase3 + Tabs/Sheet | Responsive mode |
| Timeline/preview | Phase3 child components | Preserve intentional scroll |
| Dialog/status surfaces | Section 01 components | Tokens, motion, copy |
| Job/review cards | Sections 03/04 surfaces | Reason-first mobile layout |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Responsive editor shell | `VideoEditorPhase3.tsx` | breakpoint composition | editor state + primitives |
| Tablet navigation | Phase3 + `components/ui/tabs.tsx` | mode-specific panel navigation | sidebar/review panels |
| Mobile editor panel | `ui/EditorMobileSheet.tsx` | managed mobile panel | active panel + focus policy |

## Implementation result

Implemented responsive Phase3 shell improvements without touching the legacy
rollback route: 44px header/tab/action targets, keyboard focus rings, a tablet
640–1023px bottom-panel mode, mobile backdrop visibility, intentional timeline
scrolling, reduced-motion-safe status/sidebar behavior, and Thai-first status
copy with safe fallback. The existing dense sidebar remains the source of panel
content; its active mobile surface now has explicit dialog semantics and shared
focus containment/restoration so panel behavior does not fork editor state.

Focused proof: `responsiveEditorUi.test.ts`, UI surface tests, and targeted
Phase3 esbuild passed.
| Visual/status primitives | Section 01 UI files | tokens, motion, copy | shared UI states |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading/empty/error | readable full-width state | responsive/browser |
| success/progress | status and action remain visible | responsive/browser |
| disabled/focus/hover | visible and touch reachable | a11y/browser |
| selected/active | semantic selected state plus text/icon | keyboard/browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Sheet/editor primary action reachable | Playwright screenshot |
| tablet 768x1024 | Preview + tabs, no desktop squeeze | Playwright screenshot |
| desktop 1440x900 | Full editor hierarchy stable | Playwright screenshot |
| small-mobile 360x800 | Compact copy, no clipped actions | Playwright screenshot |
| laptop 1024x768 | Multi-panel density readable | Playwright screenshot |
| wide-desktop 1280x800 | Details/timeline/sidebar do not overlap | Playwright screenshot |

### Accessibility Acceptance

- Primary actions have visible focus and remain in keyboard order.
- No state relies on color alone; labels/icons/text agree.
- Intentional scroll containers are keyboard/assistive-technology discoverable.
- Motion respects reduced-motion preference.
- Touch targets are approximately 44px where practical.

### Copy Contract

- Thai-first, short, reason-first, with English fallback.
- Status actions use explicit verbs: save, reload, retry, review, cancel,
  inspect, apply, reject.
- Do not mix raw provider error text into the primary status line.

### Browser Evidence Required

Current screenshots/traces at all required and extended viewports, with focus,
overflow, console, reduced-motion, dark-surface readability, and primary-action
checks.

## Exit criteria

Responsive and visual changes preserve editor behavior, remove accidental
overflow/clipping, and provide current evidence rather than relying on stale
June 2026 screenshots.
