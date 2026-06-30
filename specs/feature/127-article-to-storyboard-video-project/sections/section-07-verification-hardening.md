# section-07-verification-hardening

## Goal

Close gaps after implementation, run focused gates, verify UI evidence, and ensure Feature 127 does not regress existing Presentation or Storyboard Review flows.

## Depends On

- section-01-contracts-flags
- section-02-builder-preview
- section-03-references-prompts-scripts
- section-04-storyboard-handoff
- section-05-storyboard-ui-overlay-audio
- section-06-tts-native-render

## Files

- changed test files from prior sections
- `orchestra/review-findings.md`
- optional UI evidence artifact, for example `specs/feature/127-article-to-storyboard-video-project/implementation/ui-browser-evidence.md`

## Test First

This section is verification-focused. Before final fixes, list every acceptance criterion and map it to a test, typecheck, browser evidence item, or documented skip.

## Implementation Tasks

1. Run targeted tests for shared helpers.
2. Run Presentation Builder tests.
3. Run Storyboard Review workspace tests.
4. Run feature flag tests.
5. Run skill fixture tests if available.
6. Run `cd apps/web && pnpm check`.
7. Capture Builder preview browser evidence for mobile/tablet/desktop.
8. Capture Storyboard Review browser evidence for mobile/tablet/desktop.
9. Confirm no existing modes changed.
10. Confirm no paid provider call occurs during preview/handoff unless explicitly requested by user action.
11. Confirm MVP decisions from the source spec are implemented: 5-second default timing, lower-third/center-title presets, brand-theme fallback, auto-selected references with adjustment, immediate Storyboard Review open, explicit TTS fallback, estimated-then-measured timing, single narrator default, distinct dialogue voices, and separate TTS default.
12. Confirm access/credit preview blocks all required failure cases and shows the required breakdown categories.
13. Confirm preview contract fields are stable: `accessDecision`, `audioEstimate`, per-page `warningCodes`, `nativeSpeechLineCount`, `speakerSegmentCount`, and `missingFeatureFlags`.
14. Confirm static slide images remain fallback/reference-only and Presentation Note remains optional/non-canonical.
15. Confirm old drafts/projects load without destructive migration, missing voice IDs are recoverable, and existing generated video/audio assets are not rewritten unless explicitly regenerated.
16. Review metadata for credentials, provider session references, signed provider upload URLs, or other credential leakage.
17. Update backlog with optional deferred improvements only after all must-do gaps are closed.

## Acceptance

- All required gates pass or are explicitly skipped with blocker and residual risk.
- No safe in-scope must-do-now gaps remain.
- Browser evidence exists for UI surfaces or skip is documented.
- Final summary can truthfully state what was verified.

## UI/UX Contract

### Target User / JTBD

Implementation verifier. Confirm the user-facing workflow is usable, accessible, and not confusing before ship.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Builder preview | Presentation Builder dialog | verify output mode and preview |
| Storyboard Review | Storyboard Review route/panel | verify metadata display/edit |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Verification artifact | implementation evidence file | records results | all UI sections |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | covered for Builder and Storyboard Review | browser evidence |
| empty | covered for no pages/no metadata | tests/evidence |
| error | blocked references/voice/model states covered | tests/evidence |
| success | project creation and review open covered | tests/evidence |
| disabled/focus/hover | primary controls covered | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | pass/fail/skipped recorded | evidence artifact |
| tablet 768x1024 | pass/fail/skipped recorded | evidence artifact |
| desktop 1440x900 | pass/fail/skipped recorded | evidence artifact |
| small-mobile 360x800 | recorded when dense UI risk exists | evidence artifact |
| laptop 1024x768 | recorded when panel boundary risk exists | evidence artifact |
| wide-desktop 1280x800 | recorded when wide layout risk exists | evidence artifact |

### Accessibility Acceptance

Verify labels, focus order, keyboard path, warning semantics, and no obvious contrast/overflow failures.

### Copy Contract

Verify Thai and English labels exist for all new user-facing strings.

### Browser Evidence Required

Create or update an evidence artifact following `skills/orchestra/references/ui-browser-verification.md`.

## Verification Commands

- `cd apps/web && pnpm check`
- `cd apps/web && pnpm test -- PresentationArticleGeneratorDialog`
- `cd apps/web && pnpm test -- storyboardReviewWorkspace`
- focused tests for `apps/web/shared/articleStoryboardVideo`
- focused feature flag tests

## Gap Closure Checklist

- Existing Presentation modes unchanged.
- Storyboard Review old projects still load.
- Character references separate from scene references.
- Voice IDs required for separate TTS.
- Two-speaker mode requires distinct voice IDs by default.
- UVoice premium fallback requires explicit selection.
- Storyboard Review timing recomputes after measured audio exists.
- Handoff opens Storyboard Review immediately.
- Native audio never silently falls back.
- Overlay text never mutates video prompt.
- Duplicate handoff guarded.
- Provider credentials never appear in persisted metadata.
- Provider session references and signed provider upload URLs never appear in persisted metadata or UI preview.
- Static slide images are fallback/reference-only.
- Presentation Note is optional and non-canonical.
- Credit breakdown includes reference generation, character reference processing, video generation, native video audio, TTS, audio merge, and render where available.
- Preview exposes stable `accessDecision`, `audioEstimate`, `warningCodes`, and `missingFeatureFlags` fields without showing raw technical field names to users.
- Old projects without Feature 127 metadata remain viewable with recoverable warnings.
- Missing voice IDs in old separate-TTS drafts block only new TTS generation, not viewing existing audio.
- Migration/normalization does not rewrite existing generated video/audio assets.

## Implementation Notes

- Focused combined test suite passed: 7 files / 43 tests.
- `npm run check -- --pretty false` was rerun after fixing Feature 127 type issues and is blocked only by the pre-existing `server/test_db.ts` missing `./db/index.js` import.
- Browser evidence was not captured in this pass; recorded as residual release gate in `implementation/verification-evidence.md`.
- No paid provider calls were introduced in preview/handoff/shared helper tests.
