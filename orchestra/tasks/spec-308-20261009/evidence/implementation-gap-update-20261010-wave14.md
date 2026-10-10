# SPEC-308 continuation wave 14 — responsive collision safety

## Implemented

- `FeedbackButton.tsx` now measures visible fixed/sticky semantic controls around the hint placement and tries a safe position above or below the mascot. If both placements overlap a control, it hides the optional balloon while retaining the Bell and launcher.
- The placement effect rechecks relevant DOM additions/removals and style/visibility changes through a scoped `MutationObserver`, and rechecks obstacle size changes with `ResizeObserver`. It excludes the launcher and hint subtree to avoid self-collision and observation loops.
- Unit cases cover moving below a fixed obstacle and suppressing when both placements are blocked. A mocked Chromium route fixture inserts/removes blockers without emitting a synthetic resize, checks that the hint yields, and verifies it returns when space is clear.
- A read-only route audit found no contract basis for blanket suppression on `/media-studio` or `/storyboard-review`; those pages keep valid hints when space permits. Existing modal/focus suspension remains in effect.
- Tightened earlier browser fixtures: the side-effect page mock strips Google Fonts links before asserting no external requests, and the 390px route fixture now rejects any horizontal overflow above 390px.

## Evidence boundary

- This is implementation and test-fixture work only. The new unit/browser cases have not been run; execution is deferred to one consolidated test wave as requested.
- No requirement ledger row was changed to PASS. `REQ-C1D12FE65B73` and `AC-308-021` remain OPEN until exact-candidate tests, responsive screenshots, and device/runtime evidence are reviewed.
- Static route review does not substitute for physical safe-area, zoom, rotation, split-screen or keyboard acceptance. The local API mocks are not live authenticated acceptance.
- The final candidate has not yet been committed or integrated; all evidence remains tied to the future exact SHA that will run the consolidated verification.

## Review

- An independent route audit recommended collision-aware placement instead of blanket route suppression.
- A separate collision-guard review identified dynamic-control changes, semantic selector coverage, and layering as risks. The implementation now handles dynamic control insertion/removal and size updates, checks fixed/sticky ancestors of semantic controls, and observes navigational/toolbar surfaces as well as actionable controls. Overlap remains deliberately conservative: it does not reason about stacking contexts, so it may suppress a hint in a marginal case rather than risk covering a critical control.
- Fast gate: `git diff --check` passed, and TypeScript 5.9.3 `transpileModule` syntax-only parsing passed on the six changed TS/TSX files. This is not semantic typecheck. No unit, browser, audit, or build command has been run for this wave; execute the consolidated suite on the final exact candidate SHA.
