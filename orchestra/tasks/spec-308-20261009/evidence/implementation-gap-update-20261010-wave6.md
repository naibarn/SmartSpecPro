# SPEC-308 implementation continuation — 2026-10-10, wave 6

## Refreshed state

- Canonical `origin/main`: `6dcd7934332db7929904f8da642915751a6bb79`.
- PR #399 source commits: implementation `f4f3733f13f06f7fe9568f1012cbd75bf6895dfd`; exact test-fixture repair `c8be83e7ed86dc43ea1cd3a1ec4e2a7987800503`.
- PR #403 remains `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; PR #405 remains `868a5600ff770be91885666b7f584835e03fc690`. Their branches/worktrees were not modified.
- PR #399 remains open. Run `37985921704` is the exact-SHA `c8be83e7` SPEC-308 workflow; MCP compatibility run `37985921716` is queued at the same SHA.

## Implementation additions

- Bell action controls and notification-detail labels now use EN/TH translations, including the existing details, chat/schedule/media/feedback actions, retry/source/error labels, and empty/list controls. Notification content and action routing remain owned by the existing notification implementation.
- Assistant hint geometry now uses the visual viewport's size and offsets, repositions on its resize and scroll events, and suppresses the hint when its complete bounds cannot fit inside the safe visible area. Existing launcher and notification actions remain available.
- Appearance Settings observes `prefers-reduced-motion` and tells the user when that device setting temporarily suppresses decorative motion; the saved preference is not overwritten.
- Browser simulation source now checks all five mascot styles against the same three-tab dialog, proves a hint is suppressed while a feedback draft is open without submitting or marking notifications read, and checks that the balloon CTA routes to the Bell without Chat/Feedback/read side effects.

## CI log-based repairs

- Exact run `37985593546` on `f4f3733` reported 141/144 focused tests passing; browser stage was skipped. Two Bell tests selected the same empty-state copy in both the bell accessible label and popover content. Their assertions now scope to the dialog.
- The same run showed the visual-viewport clamp correctly bounded the balloon at `204px`; the test had expected `234px`, outside the visible right edge. The test now expects the safe clamped position.
- Those repairs were pushed normally in `c8be83e7`. No local tests or full typecheck were run; this isolated worktree has no `node_modules`, and the consolidated CI run is the verification path.
- Follow-up run `37985921704` on `c8be83e7` passed 143/144 focused tests; the remaining failure confirmed the Bell's no-history status copy was duplicated inside its empty popover. The UI now uses a distinct localized `Your notification list is empty.` body message, and test `within(dialog)` asserts that specific copy. This correction is commit `7325a117b2f342ef54af82fdb9b52235ae81adbe`.
- Current exact-head PR #399 workflow is `37986151623` on `7325a117` (queued at refresh); MCP workflow is `37986151602` (queued). Await these exact logs before claiming the Bell fix is verified.
- MCP workflow `37985593526` failed 44/120 focused tests on PR #399. Logs show the known MCP baseline/test-fixture failure, including missing `DATABASE_URL`-dependent session state and a removed `agencyMcpService` import, plus the separate live gate's missing `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN`. This is owned by PR #403; it is not modified here and no gate was bypassed.
- An unrelated vertical-drama migration workflow also failed on `c8be83e7` (`37985913664`); no SPEC-308 source dependency was identified.

## Requirement and verification state

- Canonical ledger was updated row by row through `tools.spec_handoff`: 66/66 rows are `APPLICABLE` and `OPEN`; 63 have `PARTIAL` implementation evidence and 3 remain `UNVERIFIED` due absent implementation/measurement or integration evidence. Verification evidence remains empty for all 66, and no requirement is marked PASS.
- All implementation evidence is bound to the source review SHA, with exact-head freshness pending. The requirement map was refreshed to the current PR candidate and notes the current test gaps.
- Browser simulations are deterministic mocks and do not establish live authenticated acceptance.

## Remaining external authority and next action

- Feature-049 owner must provide active-tenant authorization and a monotonic grouped-occurrence revision contract before live Bell/mascot attention can animate. Current fail-closed static behavior is intentional.
- Project/runtime owner must provide an approved non-production URL and authorized persistent test identity for authenticated acceptance. No production secrets were read or used.
- PR #403 live MCP smoke requires an authorized endpoint/token configuration. PR #405 mandatory production audit remains blocked on Security/Runtime Owner disposition for residual `sprintf-js` Moderate and any approved ONNX/WSL2 compatibility test.
- Next WorkUnit: inspect all jobs and artifacts from run `37985921704` and `37985921716` on exact `c8be83e7`; repair only log-proven SPEC-308 defects, then schedule the final consolidated acceptance round. Keep all feature flags OFF and lifecycle PARTIAL.
