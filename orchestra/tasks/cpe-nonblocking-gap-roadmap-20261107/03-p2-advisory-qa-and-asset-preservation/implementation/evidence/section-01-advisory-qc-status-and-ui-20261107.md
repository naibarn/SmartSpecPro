# P2 Section 01 — Advisory QC State and UI Evidence

- Roadmap: CPE gap closure P2, section `section-01-advisory-qc-status-and-ui`.
- Profile: `quick` (focused API, UI, and QC service suites).
- Verified: 2026-11-07, Asia/Bangkok.

## Reconciled behavior

- Identity/continuity findings remain report semantics. `stageBlocksPaidGeneration` blocks only `blocking` findings; identity/wardrobe errors and relationship/cut-rhythm findings do not turn into paid-render gates. Provider-policy and asset ownership/technical checks remain hard controls.
- Clip identity QC attaches metadata only in a transaction that verifies the current clip still has the analyzed media asset ID (or expected URL). A replaced clip is left untouched.
- Sampling failure creates `samples_unavailable`; report persistence failure is caught; the QC run is marked succeeded with a warning. Neither path clears or rewrites the existing completed `videoTask` media pointer.
- `getEpisodeDetail` returns the completed clip with its QC verdict. The storyboard shows `warn`, `fail`, and `samples_unavailable` badges while keeping open-full and download controls enabled.

## Verification

- `pnpm test server/services/__tests__/verticalDramaQc.test.ts --reporter=dot` — **13 tests passed**.
- `pnpm test server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts --reporter=dot -t 'completed video and its advisory identity warning|sampling and report persistence fail|delayed QC result'` — **3 targeted tests passed**.
- `pnpm test client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx --reporter=dot` — **14 tests passed**.
- `git diff --check` — passed.

The full `shotReferencesAndQualityReview.test.ts` file was also attempted; it failed **70/180 tests** in existing unrelated route/DTO assertions (including `deleteShotReference` receiving no deleted role and stale `episodeLocations`/flags expectations). The CPE-specific API cases above pass independently. The full file was not treated as acceptance evidence.

## Limits

- No live vision/provider call or browser session was run; failure behavior was exercised with a mocked HTTP 503 and mocked QC persistence failure.
- Stale identity QC, persistence failure, warning/fail/unavailable media access are directly covered. No subjective quality score was promoted into a media readiness gate.
