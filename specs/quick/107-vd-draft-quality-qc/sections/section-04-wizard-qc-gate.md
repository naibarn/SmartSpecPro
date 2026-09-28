# Section 04 — Create Series wizard Draft QC UX

## Objective

Show the QC decision transparently and make Apply/Next impossible until the
current best draft is both quality-approved and explicitly applied.

## Files

- Add `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDraftQualityQcPanel.tsx`.
- Modify `CreateSeriesWizard.tsx` with small state/mutation/payload integration.
- Extend `verticalDramaCopy.ts` for Thai/English copy.
- Add focused component tests.

## UI/UX Contract

### Target User / JTBD

- Role: series creator.
- Goal: decide whether a transient AI draft is safe to commit before spending
  downstream story/video credits.
- Entry point: Create Series wizard after an AI draft is synthesized.
- Success outcome: user sees a defensible scorecard, applies the same best draft,
  and proceeds with a server-verifiable receipt.

### Existing Pattern Reference

- Searched with bounded `rg`: `CreateSeriesWizard.tsx` draft review panel,
  `VerticalDramaCreditConfirmDialog.tsx`, existing story-job status panels, and
  `VerticalDramaBlendReportPanel.tsx`.
- Found patterns: existing transient draft card/action panel, async mutation
  toast/error conventions, and credit confirmation hook.
- Decision: reuse structure and semantic tokens; diverge only by adding a
  dedicated panel because the wizard file is already large and QC needs a
  richer state/history surface.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Create Series dialog | `CreateSeriesWizard.tsx` | Poll QC, gate actions, send receipt |
| Draft review card | `VerticalDramaDraftQualityQcPanel.tsx` | New score/history/status panel |
| Localized copy | `verticalDramaCopy.ts` | Thai/English labels and errors |

### Component Map

| Component | File | Owns | Consumes |
| --- | --- | --- | --- |
| `VerticalDramaDraftQualityQcPanel` | new file | scorecard, progress, history, actions | public QC status, callbacks |
| `CreateSeriesWizard` | existing | current draft signature, polling, apply/next gate | tRPC mutations, panel |
| copy helpers | existing copy file | localized text | `lang` |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | skeleton/status and disabled Apply/Next | component test |
| empty/idle | purpose, threshold, round selector, estimate, Start QC | component test |
| running | phase, round/call progress, live status, Cancel | component test |
| error | actionable error and Retry, no false pass | component test |
| success | numeric 9+/10, breakdown, best round, Apply enabled | component test |
| strong-but-blocked | score/reasons and regenerate/continue, Apply disabled | component test |
| exhausted | history and explicit eligible override warning | component test |
| disabled/focus/hover | visible focus and text status, disabled labels | accessibility assertions |
| stale | source-change message and new QC required | wizard test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | one-column panel and sticky/visible bottom action | browser/manual or skipped |
| tablet 768x1024 | stacked header, two-column criteria where safe | browser/manual or skipped |
| desktop 1440x900 | panel above/beside draft without burying CTA | browser/manual or skipped |
| small-mobile 360x800 | no horizontal overflow; compact history | browser/manual or skipped |
| laptop 1024x768 | preserve wizard scroll and action visibility | browser/manual or skipped |
| wide-desktop 1280x800 | readable dense scorecard | browser/manual or skipped |

### Accessibility Acceptance

- Keyboard path reaches round selector, Start, Cancel, Retry, Apply, and Next in
  logical order.
- Every status and score has visible text and an accessible label/live region.
- Focus rings use existing semantic tokens; no color-only pass/fail meaning.
- Motion is restrained and respects reduced-motion preferences.

### Copy Contract

- Tone: calm, factual, confidence-building; never promise that AI quality is
  objectively guaranteed.
- Primary languages: Thai and English, selected by current UI language.
- Required labels: QC, score, pass threshold 9.0/10, round, best draft,
  strengths, weaknesses, recommendations, estimated/max/used credits.
- Error copy: explain retry/cancel and that no pass was recorded.
- Loading/success copy: explain what is happening and what action is next.
- Fallback: use English when a new key is missing, matching existing copy
  conventions.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`; if no
authenticated browser is available, record the skip and rely on focused tests.

## TDD

Test each state, localized labels, polling interval/stop behavior, stale
invalidation, Apply/Next gates, receipt payload, and keyboard-visible status.

## Completion evidence

Focused wizard/panel tests pass and no unrelated wizard behavior changes.

## Implementation notes (2026-08-12)

- Implemented `VerticalDramaDraftQualityQcPanel.tsx` with bilingual scorecard,
  criteria, progress, history, credit estimate, cancellation, retry, and
  exhausted-round override states.
- `CreateSeriesWizard.tsx` now uses the server-returned best candidate for the
  review/apply/receipt path. Editing approved story fields invalidates the QC
  receipt and requires a fresh check; title selection remains an explicit user
  choice.
- Component and wizard regression tests pass. Authenticated browser/responsive
  evidence was skipped because no browser session was available in this run.
