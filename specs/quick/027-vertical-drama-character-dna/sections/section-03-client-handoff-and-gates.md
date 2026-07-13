# Section 03: Client Handoff and Integration Gates

## Objective

Carry the portrait preview DNA through unchanged confirmation, omit it safely on prompt
editing, preserve direct Character Sheet behavior, and close all integration gaps.

## Ownership

Primary files:

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.characterDna.test.ts` (new)
- implementation evidence under this planning directory

Do not alter layout, component hierarchy, or sheet interaction design.

## Implementation contract

1. Add the validated snapshot to pending portrait-preview state.
2. Extract a small pure helper that builds the confirm payload/result from original prompt,
   edited prompt, negative prompt, snapshot, and existing model/reference facts.
3. Treat trim-equivalent prompt text as unchanged.
4. Send approved DNA only when unchanged.
5. On edit, send the edited prompt without DNA and show a Thai/English notice that the
   image will render but Character DNA was not locked.
6. Cancel clears prompt and snapshot together.
7. Keep Character Sheet direct; no preview call or extra client state.
8. Run combined tests, typecheck, diff checks, and inline convergence review.

## TDD expectations

Test the pure helper first for unchanged, whitespace-only, edited, missing-snapshot, and
cancel/reset behavior. Use focused component rendering only if the notice wiring cannot be
proven through exported helper/state tests.

## UI/UX Contract

### Target User / JTBD
- Role: Vertical Drama creator designing a character portrait.
- Goal: approve a story-grounded prompt and lock matching Character DNA.
- Entry point: Characters tab > Generate character image > prompt preview.
- Success outcome: unchanged approval locks DNA; edited approval renders without silently
  storing stale DNA.

### Existing Pattern Reference
- Searched: current `VerticalDramaCharacterStockPanel` preview/confirm flow and
  `MediaPromptPreview` usage.
- Found pattern: the existing inline portrait prompt preview in the same component.
- Decision: reuse.
- Reason: this is a data-handoff extension, not a new interaction.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Portrait prompt preview | `VerticalDramaCharacterStockPanel.tsx` | carry snapshot and show edit notice |
| Character Sheet action | same | no behavior change |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaCharacterStockPanel` | existing file | pending preview and confirm mutation | preview snapshot + existing tRPC mutations |
| `MediaPromptPreview` | existing component | prompt edit/confirm UI | unchanged props |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | existing preview spinner | regression inspection/test |
| empty | no preview card | existing behavior |
| error | existing mutation error | existing behavior |
| success unchanged | render submits with DNA | helper/mutation test |
| success edited | render submits; DNA-not-locked notice | helper/copy test |
| cancel | preview and DNA cleared | helper/state test |
| disabled/focus/hover | unchanged | source inspection |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | no layout change; existing preview remains reachable | manual/browser if route available |
| tablet 768x1024 | no layout change | manual/browser if route available |
| desktop 1440x900 | no layout change | manual/browser if route available |
| extended viewports | N/A: no layout/CSS change | source inspection |

### Accessibility Acceptance
- Keyboard path: unchanged existing preview confirm/cancel controls.
- Focus visibility: unchanged.
- Labels/semantics: notice is announced through existing toast semantics.
- Contrast: no new custom colors.
- Reduced motion: no new motion.

### Copy Contract
- Tone: clear, non-alarming, actionable.
- Languages: Thai and English through existing `t(lang, th, en)` pattern.
- Required notice: edited image will render, but Character DNA was not locked; request a
  fresh preview to lock the edited identity.
- Localization fallback: existing helper behavior.

### Browser Evidence Required
- Record mobile/tablet/desktop checks if the authenticated route can run locally.
- If unavailable, mark skipped with reason; do not claim pass.

## Acceptance checks

- No new visual component, modal, breakpoint, or dependency.
- Unchanged confirmation carries the correct target snapshot.
- Edited confirmation cannot persist stale DNA.
- Character Sheet behavior stays direct.
- All focused and cross-section tests pass.
- No new relevant typecheck error after final changes.

## Implementation result

Status: complete.

- Pending portrait preview carries the strict approved snapshot.
- A pure payload helper sends DNA for unchanged/trim-equivalent confirmation only.
- Edited prompts render without the snapshot and show the required bilingual notice.
- Cancel clears prompt and DNA together through the existing single preview-state reset.
- Character Sheet remains a direct action; no new modal, layout, breakpoint, dependency,
  or animation was introduced.
- Focused and cross-section regression results are recorded in
  `../implementation/test-evidence.md`.
