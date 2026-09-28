# Section 07 — UI and Browser Flow

## Objective

Integrate the three user-facing workflows—prompt expansion/source slots, news evidence, and episode footage/B-roll—using existing Vertical Drama patterns and prove them with browser evidence.

## Dependencies

- Sections 03, 05, and 06 server contracts.
- Existing planning, source-pack, storyboard, media history/upload, and episode workspace components.

## Ownership and sequencing

Use one frontend behavior owner for each surface, then a later visual/accessibility pass; do not have parallel writers edit the same file. Prefer new focused child components over more logic in the large page components.

Primary surfaces:

- planning premise and prompt expansion dialog;
- source-slot cards and media actions;
- news profile claim/evidence panel;
- shot visual-source picker, footage segment editor, and B-roll timeline.

## Implementation requirements

Connect tRPC queries/mutations with explicit loading/error/stale states. Keep original prompt and user edits in local draft state until apply succeeds. Show research source metadata and uncertain/illustrative labels. Show source modality/origin/evidence/rights/disclosure in every card. For video, wait for loaded metadata before enabling in/out; reflect exact segment and audio policy in the preview/timeline.

Group shot candidates by scene_anchor, reference, b_roll_still, and b_roll_footage. Never make a video look like an image reference. Make stale/blocked findings actionable and preserve the current editor state across retry.

## UI/UX Contract

### Target User / JTBD

- Role: creator/editor and episode editor using the existing Vertical Drama planning and episode routes.
- Goal: complete prompt expansion, source selection, news evidence review, and footage/B-roll binding without semantic ambiguity.
- Entry point: existing planning and episode surfaces.
- Success outcome: all primary actions are understandable, keyboard reachable, responsive, and backed by browser evidence.

### Existing Pattern Reference

- Reuse AIDraftModal, CreateSeriesWizard/source-pack cards, VerticalDramaStoryboardPanel reference picker, VerticalDramaEpisodeWorkspace continuity controls, and existing media history/upload cards.
- Decision: reuse existing interaction model and tokens; add only the missing research/claim/timeline controls.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| prompt expansion | existing series planning route | dialog and source-slot flow |
| news evidence | series planning/review route | claim/evidence/correction panel |
| footage/B-roll | episode shot route | role picker, segment editor, timeline |

### Component Map

| Component | Ownership |
|---|---|
| prompt expansion dialog | section 03 components and planning integration |
| news evidence panel | section 05 component and review integration |
| shot source picker/segment editor/timeline | section 06 components and episode integration |

### State Matrix

Loading, empty, success, partial, error, stale, blocked, disabled, selected, focus, hover, upload retry, and assembly-ready states are required for each surface; section-specific acceptance is recorded below.

### Responsive Matrix

Use mobile 390x844, tablet 768x1024, desktop 1440x900, and extended 360x800, 1024x768, 1280x800. Stack dialogs/claim details/player controls on mobile; preserve primary actions and avoid horizontal overflow.

### Accessibility Acceptance

Use labelled dialogs/inputs/media players, keyboard focus and focus restoration, accessible icon names, keyboard alternatives for scrubber/reorder, non-color status text, visible focus, and reduced-motion behavior.

### Visual Direction

Reuse existing semantic tokens, primitives, typography, card density, status badges, and motion conventions; no raw hex or global reset.

### Copy Contract

Thai-first with English fallback. Reuse the labels/error copy in sections 03, 05, and 06; preserve clear uncertainty, stale, blocked, and retry language.

### Browser Evidence Required

Run the scenarios and viewport checks listed below and record pass/fail/skipped honestly in implementation/ui-browser-evidence.md.

### Prompt expansion

Reuse AIDraftModal and CreateSeriesWizard dialog/card primitives. Required states: idle, loading, success, partial research, empty, error, stale CAS, disabled apply, selected slot, upload/generation progress, success. Required viewports: 390x844, 768x1024, 1440x900, plus 360x800, 1024x768, 1280x800. Keyboard focus trap/restoration, Escape cancel, labels, accessible icon names, contrast, reduced motion. Thai-first copy with English fallback.

### News Evidence

Reuse source/QC cards and status badges. Show claim, source, publisher, accessed/published/as-of, freshness, attribution, visual scope, correction/stale state. Required states: empty, needs verification, verified, partial, contradictory, stale, archive disclosure, blocked readiness. Use stacked disclosure on mobile and non-overflow claim/evidence layout on desktop.

### Footage/B-roll

Reuse storyboard reference picker and media history cards; add a distinct footage editor with poster/player, metadata, scrubber, in/out, audio policy, fit, disclosure, reorder, duration budget, and assembly readiness. Keyboard alternatives must exist for scrubber/reorder. Show exact source segment boundaries and reject invalid/stale bindings.

## Browser evidence

Add or extend a Playwright suite under apps/web/tests/e2e for:

1. prompt expansion preview/edit/cancel/apply and stale conflict;
2. source slot prompt generation and AI/upload source states;
3. news_report Nan claim ledger with needs-verification/verified/correction/blocking states;
4. real photo still B-roll;
5. real video footage exact segment B-roll through readiness/assembly;
6. scene-anchor/reference/B-roll conflict and overflow/audio errors.

Record evidence in implementation/ui-browser-evidence.md using required and extended viewports. Check console errors, keyboard path, focus, overflow, loading/empty/error/disabled states, accessible names, and light/dark readability where supported. If a browser/dev server cannot run, mark skipped with the blocker; never call skipped a pass.

## Tests-first requirements

Write component tests for all state matrices and mutation wiring before UI implementation. Use mocked tRPC responses and managed-media fixtures. Verify original prompt preservation, source labels, exact timecodes, role separation, news disclosure, and actionable errors.

## Acceptance

- Existing planning flow remains understandable and returns normally after apply.
- UI is usable in Thai and English and at required viewports.
- Browser evidence covers both AI/generated and creator-uploaded media plus news.
- No new console errors, horizontal overflow, or inaccessible primary action in the verified surfaces.

## Implementation record

- Added dialog-first premise expansion UI and news/footage support components using existing shadcn primitives and Thai-first copy.
- The integration is cancel-safe and apply-only; source warnings, evidence status, role labels, and exact timecodes are text-visible rather than color-only.
- Browser evidence is recorded separately; no browser pass is claimed until a feature-flagged dev server and managed-media fixtures are available.
