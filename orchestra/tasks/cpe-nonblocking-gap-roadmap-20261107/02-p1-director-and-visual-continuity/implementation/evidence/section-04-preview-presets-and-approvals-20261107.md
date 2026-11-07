# Section 04 — Preview, Presets and Existing Approvals Evidence

- Roadmap: CPE gap closure P1, section `section-04-preview-presets-and-approvals`.
- Profile: `quick` (focused component suites and patch validation).
- Verified: 2026-11-07, Asia/Bangkok.

## Changes

- Storyboard now previews the effective series look and its visual-canon revision/fingerprint when present.
- Each shot can preview director scene intent, suggested review state, confidence, composition/communication mode, presence references, source storyboard revision, and advisory reason codes.
- Preview metadata is read-only and does not add a new approval state or gate generation. Existing storyboard actions remain the authority for edits and approval; image/video render controls remain enabled while a shot has a low-confidence/review-suggested intent.
- Corrected a stale Thai text assertion in the existing scene-continuity UI suite to match the current displayed translation (`พรอมต์`).

## Verification

- `pnpm test client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx --reporter=dot` — **11 tests passed**.
- `pnpm test client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.stopFrameGeneration.test.tsx --reporter=dot` — **7 tests passed**, preserving existing cancellation behavior.
- `git diff --check` — passed.

## Limits / follow-up

- Authenticated browser/provider E2E was not run; no live image/video generation was triggered.
- Applying the look to old episodes remains governed by the existing snapshot/version flow; this UI change only surfaces the current snapshot source.
