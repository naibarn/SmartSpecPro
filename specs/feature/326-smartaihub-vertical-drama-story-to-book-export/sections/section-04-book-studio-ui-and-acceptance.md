# Section 04 — Book Studio UI and acceptance closeout

## Requirement IDs

Remaining ledger requirements: book selection/review/editor, output choice and partial success UX, downloads, accessibility/responsiveness, representative Thai layout proof, end-to-end integration and exact runtime acceptance. Reconcile IDs with ledger at start.

## Objective and deliverable

Add Book Studio to existing series detail, complete review/edit/approve and independent EPUB/PDF progress/download/retry, expose stale source and artwork coverage, and verify all sections end to end. Perform and record at least ten substantive gap-review rounds, fixing each concrete issue immediately.

## Owned scope

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` and focused new `VerticalDramaBookStudio` components/tests.
- Focused integration/UAT evidence and `handoff` writer updates.
- One `gap-review-10-rounds.md` artifact under this planning directory.

## Prerequisites

Sections 01–03 integrated; migrations current in authorized development database.

## UI/UX Contract

### Target User / JTBD
- Role: authorized series owner/author.
- Goal: approve a book revision and download EPUB, PDF, or both.
- Entry point: Book Studio tab inside Vertical Drama series workspace.
- Success outcome: clear export state, format-specific validation and secure artifact access.

### Existing Pattern Reference
- Searched: existing series tabs, asset library, episode workspace, cover surface and generation job state.
- Found: `VerticalDramaSeriesDetailPage.tsx`, `VerticalDramaAssetsTab`, episode workspace and existing cover UI.
- Decision: reuse the established shell, tab navigation, selection, query and job patterns.
- Reason: retain series context and familiar authoring flow.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Book Studio tab | `VerticalDramaSeriesDetailPage.tsx` | add navigation and panel |
| Book editor/export | `VerticalDramaBookStudio.tsx` | review revision, approve, export formats and downloads |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Book Studio panel | `VerticalDramaBookStudio.tsx` | editor, approval, progress, artifacts | Book queries/mutations |
| Detail tab entry | `VerticalDramaSeriesDetailPage.tsx` | series-scoped mount | series ID |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | loading skeleton and disabled mutations | query test |
| empty | create first book and source guidance | component test |
| error | sanitized per-operation retry | component test |
| success | approved revision and download actions | component test |
| partial | each format shows independent state/artifact | integration test |
| disabled/focus/hover | missing image/alt/approval reasons and visible focus | accessibility check |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked editor and action footer; no horizontal scroll | screenshot |
| tablet 768x1024 | compact split or stacked layout | screenshot |
| desktop 1440x900 | readable editor plus source/progress context | screenshot |
| small-mobile 360x800 | controls wrap without clipping | screenshot if risk |
| laptop 1024x768 | responsive editor panels | screenshot if risk |
| wide-desktop 1280x800 | bounded text measure | screenshot if risk |

### Accessibility Acceptance
- Keyboard: all editing/export actions usable, predictable focus order.
- Focus: visible focus and focus return after dialogs.
- Semantics: associated form labels, heading hierarchy, live progress and format-specific status.
- Contrast: existing design tokens.
- Reduced motion: honor system preference.

### Visual Direction
Use established Vertical Drama tabs and controls, restrained reading-preview surface, existing spacing/color tokens.

### Copy Contract
Thai-first controls/status; format names EPUB/PDF remain literal; distinguish queued, validating, ready, failed and partial success.

### Browser Evidence Required
Follow `skills/orchestra/references/ui-browser-verification.md`; mobile, tablet, desktop and keyboard flow.

## Ten-round gap review protocol

Review integrated behavior in ten distinct passes: (1) spec/acceptance coverage, (2) tenant/auth boundaries, (3) snapshot/freshness, (4) source/shot image completeness, (5) revision/edit/regeneration safety, (6) job idempotency/retry/cancel/cost, (7) EPUB structure/accessibility, (8) PDF Thai text/layout, (9) artifact storage/download/privacy/resource bounds, (10) UI states/responsive/accessibility/operational readiness. For each pass record scope, evidence, concrete findings, repairs and focused recheck. Fix findings before the next pass; a clean pass must cite what was inspected.

## Completion predicate and evidence

Focused UI and integration tests, dev migration evidence, available browser evidence and ten recorded reviews. Canonical HandOff requirements are updated only from fresh evidence at integrated SHA. Anything dependent on missing production-like runtime remains OPEN with exact capability and next action.
